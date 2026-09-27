import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// Minimal hand-rolled PNG encoder (no external dependency).
// Produces a flat-colored raster box so the PDF embeds a real raster image
// (not vector/SVG), which matters for the `pdfimages -list` structural check.
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function buildPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);

  // Fictitious "colored box": a blue field with a darker border stripe, so
  // the rendered image is visibly distinguishable from a blank rectangle.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    const isBorder = y < 6 || y >= height - 6;
    for (let x = 0; x < width; x++) {
      const borderCol = x < 6 || x >= width - 6;
      if (isBorder || borderCol) {
        raw[offset++] = 0x1e; // R
        raw[offset++] = 0x40; // G
        raw[offset++] = 0x8a; // B
      } else {
        raw[offset++] = 0x4a; // R
        raw[offset++] = 0x7f; // G
        raw[offset++] = 0xd6; // B
      }
    }
  }

  const compressed = deflateSync(raw);
  const idat = chunk("IDAT", compressed);
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ---------------------------------------------------------------------------
// Fictitious report content
// ---------------------------------------------------------------------------

const ACTIVITY_NAMES = [
  "Revisión de conciliación bancaria",
  "Validación de facturación electrónica",
  "Auditoría de inventario ficticio",
  "Actualización de políticas contables",
  "Capacitación en normativa tributaria",
  "Revisión de nómina de empleados ficticios",
  "Análisis de indicadores financieros",
  "Verificación de contratos con proveedores",
  "Control de gastos de representación",
  "Cierre contable mensual",
];

const RESPONSIBLES = [
  "María José Peña",
  "Andrés Muñoz",
  "Camila Restrepo",
  "Sebastián Roa",
  "Ángela Núñez",
  "Iñigo Vélez",
];

function buildRows(count: number): string {
  const rows: string[] = [];
  for (let i = 1; i <= count; i++) {
    const activity = ACTIVITY_NAMES[i % ACTIVITY_NAMES.length];
    const responsible = RESPONSIBLES[i % RESPONSIBLES.length];
    const status =
      i % 3 === 0 ? "Pendiente" : i % 3 === 1 ? "En progreso" : "Completado";
    rows.push(
      `<tr><td>${i}</td><td>${activity} #${i}</td><td>${responsible}</td><td>${status}</td></tr>`,
    );
  }
  return rows.join("\n");
}

function buildHtml(imageDataUri: string): string {
  const rows = buildRows(120);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de ejemplo — Cliente Ficticio S.A.S.</title>
<style>
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }
  body {
    font-family: "DejaVu Sans", "Helvetica", "Arial", sans-serif;
    color: #1a1a1a;
    font-size: 11pt;
  }
  h1 {
    font-size: 16pt;
    margin-bottom: 4pt;
  }
  p.subtitle {
    color: #444;
    margin-top: 0;
  }
  img.logo {
    width: 200px;
    height: 120px;
    display: block;
    margin: 12pt 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
  }
  thead {
    display: table-header-group;
  }
  tr {
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #999;
    padding: 4pt 6pt;
    text-align: left;
  }
  th {
    background-color: #dbe7ff;
  }
  tbody tr:nth-child(even) {
    background-color: #f4f7fb;
  }
</style>
</head>
<body>
  <h1>Informe de ejemplo — Cliente Ficticio S.A.S.</h1>
  <p class="subtitle">
    Documento generado únicamente con fines de validación técnica. Todos los
    datos son ficticios. Área responsable: Contraloría. Revisó: Andrés Muñoz.
    ¿Cumple con la normativa vigente? ¡Sí, según esta revisión de ejemplo!
  </p>
  <img class="logo" src="${imageDataUri}" alt="Imagen incrustada de ejemplo" />
  <p>
    A continuación se presenta el detalle de actividades ficticias registradas
    durante el periodo de prueba, incluyendo responsables y estado de avance.
  </p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Actividad</th>
        <th>Responsable</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(scriptDir, "..", "out");
  mkdirSync(outDir, { recursive: true });

  const png = buildPng(200, 120);
  const imageDataUri = `data:image/png;base64,${png.toString("base64")}`;
  const html = buildHtml(imageDataUri);

  const browser = await chromium.launch();
  console.log(`Chromium version: ${browser.version()}`);

  const page = await browser.newPage();

  let blockedRequestCount = 0;
  await page.route("**/*", (route) => {
    blockedRequestCount++;
    return route.abort();
  });

  await page.setContent(html, { waitUntil: "load" });

  const outPath = path.join(outDir, "sample.pdf");
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8pt;text-align:center;color:#666;">' +
      'Página <span class="pageNumber"></span> de <span class="totalPages"></span>' +
      "</div>",
    margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
  });

  await browser.close();

  console.log(`PDF written to ${outPath}`);
  console.log(
    `Blocked network requests: ${blockedRequestCount} ` +
      "(expected 0: setContent + data: URIs never issue network requests, " +
      "so the abort route never fires; this is reported honestly rather than " +
      "claiming isolation it did not need to exercise).",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
