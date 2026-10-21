import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same loader as tests/billing/drafts-ui.test.ts.
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

// Synthetic data only: never a real client, signature or account number.
const FULL = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "draft" as const,
  number: null,
  issuedAt: null,
  currency: "COP" as const,
  client: {
    name: "Compradora Demo S.A.S",
    identificationType: "NIT",
    identificationNumber: "900000001-1",
    address: "Calle Demo 123",
    city: "Medellín",
  },
  issuer: {
    legalName: "Emisora Demo S.A.S",
    identificationType: "NIT",
    identificationNumber: "900000002-3",
    address: "Carrera Demo 45",
    city: "Medellín",
    phone: null,
    email: null,
    logoImageId: null,
  },
  signer: {
    fullName: "Firmante Demo",
    identificationType: "CC",
    identificationNumber: "1000000001",
    jobTitle: "Consultor",
    email: "firmante@example.test",
    signatureImageId: null,
  },
  bankAccount: {
    bankName: "Banco Demo",
    accountType: "ahorros" as const,
    accountNumber: "00001111222",
    holderName: "Emisora Demo S.A.S",
    currency: "COP" as const,
  },
  declaration: { body: "Declaración demo para pruebas." },
  paymentTerms: "Pago de contado 30 días",
  lines: [
    {
      position: 1,
      product: "Soporte TIC",
      description: "Acompañamiento mensual",
      quantity: "24 horas",
      amountMinor: 1_800_000,
    },
    {
      position: 2,
      product: "Repuesto",
      description: null,
      quantity: null,
      amountMinor: 200_000,
    },
  ],
  totalMinor: 2_000_000,
  updatedAt: new Date("2026-10-09T15:00:00.000Z"),
};

async function render(view: unknown) {
  const { CuentaDeCobroSheet } = await import(
    "../../src/billing/CuentaDeCobroSheet.tsx"
  );
  return renderToStaticMarkup(
    createElement(CuentaDeCobroSheet, { view } as never),
  );
}

describe("cuenta de cobro sheet", () => {
  it("follows the reference layout: parties, items, total, signature, bank and declaration", async () => {
    const html = await render(FULL);

    // The reference documents open with the greeting and the recipient.
    assert.match(html, /Saludos Cordiales/);
    assert.match(html, /Compradora Demo S\.A\.S/);
    assert.match(html, /900000001-1/);
    // The header block carries the recipient's address and city.
    assert.match(html, /Calle Demo 123/);
    assert.match(html, /Medellín/);
    assert.match(html, /Raz[oó]n social/i);

    // The item columns the owner fixed: no unit price, quantity informative.
    assert.match(html, /PRODUCTO/i);
    assert.match(html, /DESCRIPCI[OÓ]N/i);
    assert.match(html, /CANTIDAD/i);
    assert.match(html, /PRECIO TOTAL/i);
    assert.doesNotMatch(html, /PRECIO UND/i);

    assert.match(html, /Soporte TIC/);
    assert.match(html, /24 horas/);
    // es-CO amounts in the document currency.
    assert.match(html, /1\.800\.000/);
    assert.match(html, /Valor Total/i);
    assert.match(html, /2\.000\.000/);

    // Closing block, exactly the parts the references carry.
    assert.match(html, /CORDIALMENTE/i);
    assert.match(html, /Firmante Demo/);
    assert.match(html, /1000000001/);
    assert.match(html, /Consultor/);
    assert.match(html, /Banco Demo/);
    assert.match(html, /Declaración demo para pruebas\./);
  });

  it("names the recipient once instead of repeating the block", async () => {
    const html = await render(FULL);
    const count = (needle: string) => html.split(needle).length - 1;
    // The recipient used to appear twice: once under the greeting and again
    // in the boxed party grid. One block, one place to read it.
    assert.equal(count("Compradora Demo S.A.S"), 1);
    assert.equal(count("900000001-1"), 1);
  });

  it("marks a draft as having no number instead of inventing one", async () => {
    const html = await render(FULL);
    assert.match(html, /Borrador/i);
    assert.match(html, /[Ss]in n[uú]mero/);
    // Numbering only exists once issuing does; never show a 1.
    assert.doesNotMatch(html, /\b1TIC\b/);
  });

  it("explains what is still missing rather than leaving silent gaps", async () => {
    const bare = {
      ...FULL,
      signer: null,
      bankAccount: null,
      declaration: null,
      paymentTerms: null,
      lines: [],
      totalMinor: 0,
    };
    const html = await render(bare);

    assert.match(html, /Sin firmante/i);
    assert.match(html, /Sin cuenta/i);
    // No declaration is included and none is added automatically.
    assert.match(html, /Sin declaraci[oó]n/i);
    assert.match(html, /Sin conceptos/i);
  });

  it("shows the quantity column only when a line carries a quantity", async () => {
    // Some cuentas list quantities (hours, units); others do not. The column
    // follows the data instead of being a fixed choice.
    const withQuantity = await render(FULL);
    assert.match(withQuantity, /CANTIDAD/i);

    const noQuantity = {
      ...FULL,
      lines: FULL.lines.map((line) => ({ ...line, quantity: null })),
    };
    const html = await render(noQuantity);
    assert.doesNotMatch(html, /CANTIDAD/i);
    // The other columns and the total stay intact.
    assert.match(html, /PRODUCTO/i);
    assert.match(html, /PRECIO TOTAL/i);
    assert.match(html, /Valor Total/i);
    assert.match(html, /2\.000\.000/);
  });

  it("signs the document with a discreet maker's mark", async () => {
    const html = await render(FULL);
    // The software signature names HachiSky by IL Asesorías, kept subordinate
    // to the issuer identity rather than replacing it.
    assert.match(html, /HachiSky/);
    assert.match(html, /by IL Asesor[ií]as/i);
  });

  it("prints the full account number to consign to, prominently", async () => {
    // The document is what the client acts on: masking the account here
    // would send them to guess the number they must pay to (owner,
    // 2026-10-21). The pickers keep their masking; the paper does not.
    const html = await render(FULL);
    assert.match(html, /Favor consignar/i);
    assert.match(html, /00001111222/);
    assert.match(html, /Banco Demo/);
    assert.match(html, /Emisora Demo S\.A\.S/);
  });

  it("keeps the issuer's data at the bottom and omits its address", async () => {
    // The letterhead is the brand alone: no issuer name or address opens
    // the document. The signer signs below, with their identification.
    const html = await render(FULL);
    assert.doesNotMatch(html, /Carrera Demo 45/);
    assert.ok(
      html.indexOf("Emisora Demo S.A.S") > html.indexOf("CORDIALMENTE"),
      "the issuer is first named only under the signature",
    );
    assert.match(html, /Firmante Demo/);
    assert.match(html, /CC: 1000000001|CC 1000000001|1000000001/);
  });

  it("carries its consecutive and date once issued", async () => {
    const html = await render({
      ...FULL,
      status: "issued",
      number: "CC-0045",
      issuedAt: new Date("2026-10-21T15:00:00.000Z"),
    });
    assert.match(html, /CC-0045/);
    assert.match(html, /Emitida/);
    assert.doesNotMatch(html, /Sin n[uú]mero/);
  });
});
