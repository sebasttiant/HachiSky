import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportImageRecord } from "../../src/reports/images.ts";
import type {
  ItemRecord,
  ReportRecord,
  SectionRecord,
} from "../../src/reports/service.ts";

// Same loader as the other UI tests.
const loader = `
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(process.cwd() + "/");
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/link") return nextResolve("next/link.js", context);
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default new Proxy({}, { get: (_, k) => k });" };
  if (url.endsWith(".tsx")) {
    const swc = require("next/dist/build/swc/index.js");
    await swc.loadBindings();
    const filename = fileURLToPath(url);
    const out = await swc.transform(await readFile(filename, "utf8"), {
      filename, jsc: { target: "es2022", parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" }
    });
    return { format: "module", shortCircuit: true, source: out.code };
  }
  return nextLoad(url, context);
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);

function item(overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: `i-${overrides.label ?? "x"}`,
    position: 0,
    label: "Elemento",
    body: null,
    status: null,
    priority: null,
    impact: null,
    ...overrides,
  };
}

function section(overrides: Partial<SectionRecord> = {}): SectionRecord {
  return {
    id: `s-${overrides.key ?? "k"}`,
    key: "results",
    kind: "prose",
    heading: "Resultados",
    body: null,
    items: [],
    ...overrides,
  };
}

function report(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: "r1",
    type: "follow_up",
    clientId: "c1",
    clientName: "Cliente Informes",
    title: "Seguimiento de octubre",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    status: "draft",
    authorUserId: "u1",
    authorName: "Sebastián Amaya Rivera",
    authorJobTitle: "Director TIC",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    createdBy: "u1",
    updatedBy: "u1",
    sections: [],
    activities: [],
    ...overrides,
    issuedAt: overrides.issuedAt ?? null,
    issuedVersion: overrides.issuedVersion ?? null,
  };
}

function figure(overrides: Partial<ReportImageRecord> = {}): ReportImageRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sectionKey: "results",
    position: 0,
    title: "Pantalla de ingreso",
    caption: null,
    width: 800,
    height: 600,
    byteSize: 2048,
    ...overrides,
  };
}

async function render(value: ReportRecord, images: ReportImageRecord[] = []) {
  const { ReportSheet } = await import("../../src/reports/ReportSheet.tsx");
  return renderToStaticMarkup(
    createElement(ReportSheet, { report: value, images }),
  );
}

describe("report document", () => {
  it("shows what it is, for whom, and who signs it", async () => {
    const html = await render(
      report({
        sections: [section({ body: "Todo operativo." })],
      }),
    );
    assert.match(html, /Seguimiento de octubre/);
    assert.match(html, /Seguimiento de actividades/);
    assert.match(html, /Cliente Informes/);
    assert.match(html, /Sebastián Amaya Rivera/);
    assert.match(html, /Director TIC/);
    assert.match(html, /Generado desde la plataforma HachiSky/);
  });

  it("says it is a draft, so it is never mistaken for a delivered report", async () => {
    const html = await render(report());
    assert.match(html, /Borrador/);
  });

  it("says when it was issued, with its date, once it went out", async () => {
    const html = await render(
      report({
        status: "issued",
        issuedAt: new Date("2026-10-21T15:00:00.000Z"),
        issuedVersion: 1,
        sections: [section({ body: "Todo operativo." })],
      }),
    );
    assert.match(html, /Emitido/);
    assert.match(html, /21\/10\/2026|21 de octubre de 2026/);
    assert.doesNotMatch(html, /Borrador/);
  });

  it("leaves out the sections that have no content", async () => {
    const html = await render(
      report({
        sections: [
          section({ key: "period", heading: "Período", body: "Octubre" }),
          section({ key: "results", heading: "Resultados", body: null }),
          section({ key: "pending", heading: "Pendientes", body: "   " }),
        ],
      }),
    );
    assert.match(html, /Período/);
    assert.doesNotMatch(html, /Resultados/);
    assert.doesNotMatch(html, /Pendientes/);
  });

  it("says so when nothing has been written yet", async () => {
    const html = await render(report());
    assert.match(html, /todavía no tiene contenido/i);
  });

  it("renders findings with their priority and impact", async () => {
    const html = await render(
      report({
        type: "diagnostic",
        sections: [
          section({
            key: "findings",
            kind: "findings",
            heading: "Hallazgos",
            items: [
              item({
                label: "Disco con falla",
                priority: "high",
                impact: "Pérdida de datos",
                body: "El arreglo reporta errores.",
              }),
            ],
          }),
        ],
      }),
    );
    assert.match(html, /Disco con falla/);
    // The word, not only the colour: a black-and-white print has to work.
    assert.match(html, /Alta/);
    assert.match(html, /Pérdida de datos/);
  });

  it("renders the semáforo as a table with a named status", async () => {
    const html = await render(
      report({
        type: "infrastructure",
        sections: [
          section({
            key: "status",
            kind: "status_table",
            heading: "Semáforo por dominio",
            items: [
              item({ label: "Respaldos", status: "risk" }),
              item({ label: "Red", status: "ok" }),
            ],
          }),
        ],
      }),
    );
    assert.match(html, /<table/);
    assert.match(html, /Respaldos/);
    assert.match(html, /En riesgo/);
    assert.match(html, /Bien/);
  });

  it("renders the manual steps in order", async () => {
    const html = await render(
      report({
        type: "manual",
        sections: [
          section({
            key: "steps",
            kind: "steps",
            heading: "Paso a paso",
            items: [
              item({ label: "Abrir el navegador" }),
              item({ label: "Ingresar con su usuario" }),
            ],
          }),
        ],
      }),
    );
    assert.match(html, /<ol/);
    assert.ok(
      html.indexOf("Abrir el navegador") <
        html.indexOf("Ingresar con su usuario"),
    );
  });

  it("lists the recorded activities it describes", async () => {
    const html = await render(
      report({
        activities: [
          {
            id: "a1",
            title: "Revisión de respaldos",
            clientName: "Cliente Informes",
            performedOn: "2026-10-05",
            startedAt: "08:30",
            endedAt: "12:00",
            status: "completed",
            outcome: "Respaldos verificados.",
          },
        ],
      }),
    );
    assert.match(html, /Actividades registradas/);
    assert.match(html, /Revisión de respaldos/);
    assert.match(html, /08:30–12:00/);
    assert.match(html, /Respaldos verificados\./);
  });

  it("omits the activities table when there are none", async () => {
    const html = await render(report());
    assert.doesNotMatch(html, /Actividades registradas/);
  });

  it("omits the period when the report has none", async () => {
    const html = await render(report({ periodStart: null, periodEnd: null }));
    assert.doesNotMatch(html, /Período/);
  });
});

describe("figures in the document", () => {
  it("prints a figure under the section that holds it", async () => {
    const html = await render(
      report({ sections: [section({ body: "Todo operativo." })] }),
      [figure({ caption: "Menú principal" })],
    );
    assert.match(html, /<figure/);
    assert.match(html, /Pantalla de ingreso/);
    assert.match(html, /Menú principal/);
  });

  it("reads the bytes from the authenticated route, never a public URL", async () => {
    const html = await render(
      report({ sections: [section({ body: "Todo operativo." })] }),
      [figure()],
    );
    assert.match(
      html,
      /src="\/api\/reports\/images\/11111111-1111-4111-8111-111111111111"/,
    );
    assert.doesNotMatch(html, /blob:|data:image/);
  });

  it("keeps a section whose only content is a figure", async () => {
    // A step explained entirely by its screenshot is not an empty section,
    // and dropping it would lose the only thing it had to say.
    const html = await render(report({ sections: [section()] }), [figure()]);
    assert.match(html, /Resultados/);
    assert.match(html, /<figure/);
    assert.doesNotMatch(html, /todavía no tiene contenido/);
  });

  it("still leaves out a section with neither text nor figures", async () => {
    const html = await render(
      report({
        sections: [section(), section({ key: "next", heading: "Pendientes" })],
      }),
      [],
    );
    assert.doesNotMatch(html, /Resultados/);
    assert.doesNotMatch(html, /Pendientes/);
  });

  it("gives each figure to its own section, in stored order", async () => {
    const html = await render(
      report({
        sections: [
          section({ key: "results", heading: "Resultados", body: "Listo." }),
          section({ key: "next", heading: "Pendientes", body: "Nada." }),
        ],
      }),
      [
        figure({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          sectionKey: "next",
          position: 1,
          title: "Segunda de pendientes",
        }),
        figure({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          sectionKey: "next",
          position: 0,
          title: "Primera de pendientes",
        }),
        figure({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          sectionKey: "results",
          position: 0,
          title: "La de resultados",
        }),
      ],
    );
    const order = [
      "La de resultados",
      "Primera de pendientes",
      "Segunda de pendientes",
    ].map((title) => html.indexOf(title));
    assert.ok(
      order.every((at) => at > 0),
      "every figure is printed",
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
  });

  it("prints no figure markup when the report has none", async () => {
    const html = await render(
      report({ sections: [section({ body: "Todo operativo." })] }),
      [],
    );
    assert.doesNotMatch(html, /<figure/);
  });
});
