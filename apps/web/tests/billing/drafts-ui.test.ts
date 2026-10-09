import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same loader as tests/billing/billing-ui.test.ts.
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

const noop = async () => ({ status: "idle" as const });

// Synthetic data only.
const ISSUER = "11111111-1111-4111-8111-111111111111";
const OTHER_ISSUER = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";

const options = {
  clients: [
    { id: "c1", label: "Cliente Demo S.A.S. · NIT 9000000011", active: true },
  ],
  issuers: [
    {
      id: OTHER_ISSUER,
      label: "Otro Emisor Demo",
      active: true,
      isDefault: false,
    },
    { id: ISSUER, label: "Emisor Demo S.A.S.", active: true, isDefault: true },
  ],
  bankAccounts: [
    {
      id: "b-cop",
      label: "Banco Demo · Ahorros ···1222 · Titular Demo · COP",
      issuerProfileId: ISSUER,
      currency: "COP" as const,
      active: true,
    },
    {
      id: "b-usd",
      label: "Banco Demo · Ahorros ···5555 · Titular Demo · USD",
      issuerProfileId: ISSUER,
      currency: "USD" as const,
      active: true,
    },
    {
      id: "b-other",
      label: "Banco Otro · Corriente ···4444 · Titular Otro · COP",
      issuerProfileId: OTHER_ISSUER,
      currency: "COP" as const,
      active: true,
    },
  ],
  signers: [
    { id: "s1", label: "Firmante Demo · Representante legal", active: false },
  ],
  declarations: [{ id: "d1", label: "Declaración de prueba", active: true }],
};

const draft = {
  id: DRAFT,
  status: "draft" as const,
  clientId: "c1",
  client: {
    id: "c1",
    name: "Cliente Demo S.A.S.",
    identificationType: "NIT",
    identificationNumber: "9000000011",
    active: true,
  },
  issuerProfileId: ISSUER,
  issuer: { id: ISSUER, legalName: "Emisor Demo S.A.S.", active: true },
  currency: "COP" as const,
  bankAccountId: "b-cop",
  signerProfileId: "s1",
  declarationTextId: null,
  paymentTerms: "Pago a 15 días.",
  lines: [
    {
      position: 1,
      product: "Asesoría",
      description: "Anticipo 40 %",
      quantity: "1",
      amountMinor: 1_200_000,
    },
    {
      position: 2,
      product: "Soporte",
      description: null,
      quantity: null,
      amountMinor: 300_000,
    },
  ],
  totalMinor: 1_500_000,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

function selectHtml(html: string, name: string) {
  return (
    html.match(
      new RegExp(`<select[^>]*name="${name}"[\\s\\S]*?</select>`),
    )?.[0] ?? ""
  );
}

describe("draft list", () => {
  it("shows client, issuer, total with its currency, status and a link", async () => {
    const { DraftList } = await import("../../src/billing/DraftList.tsx");
    const html = renderToStaticMarkup(
      createElement(DraftList, {
        items: [
          {
            id: DRAFT,
            clientName: "Cliente Demo S.A.S.",
            issuerName: "Emisor Demo S.A.S.",
            currency: "COP",
            totalMinor: 1_500_000,
            lineCount: 2,
            updatedAt: new Date("2026-10-01T10:00:00Z"),
          },
          {
            id: "x",
            clientName: "Otro Cliente Demo",
            issuerName: "Emisor Demo S.A.S.",
            currency: "USD",
            totalMinor: 123_456,
            lineCount: 1,
            updatedAt: new Date("2026-10-01T10:00:00Z"),
          },
        ],
      }),
    );
    assert.match(html, /Cliente Demo S\.A\.S\./);
    assert.match(html, /Emisor Demo S\.A\.S\./);
    assert.match(html, /\$ 1\.500\.000/);
    assert.match(html, /US\$ 1\.234,56/);
    assert.match(html, /Borrador/);
    assert.match(html, /2 líneas/);
    assert.match(html, /1 línea\b/);
    assert.match(html, new RegExp(`href="/billing/drafts/${DRAFT}"`));
    // A draft has no number yet.
    assert.doesNotMatch(html, /TIC/);
  });

  it("invites starting the first one", async () => {
    const { DraftList } = await import("../../src/billing/DraftList.tsx");
    const html = renderToStaticMarkup(createElement(DraftList, { items: [] }));
    assert.match(html, /Todavía no hay cuentas de cobro/);
    assert.match(html, /href="\/billing\/drafts\/new"/);
  });
});

describe("new draft form", () => {
  it("asks for client, issuer and currency; the default issuer and COP come first", async () => {
    const { NewDraftForm } = await import("../../src/billing/NewDraftForm.tsx");
    const html = renderToStaticMarkup(
      createElement(NewDraftForm, { action: noop as never, options }),
    );
    assert.match(selectHtml(html, "clientId"), /Cliente Demo S\.A\.S\./);
    assert.match(
      selectHtml(html, "issuerProfileId"),
      new RegExp(`<option value="${ISSUER}" selected="">`),
    );
    assert.match(
      selectHtml(html, "currency"),
      /<option value="COP" selected="">/,
    );
    assert.match(selectHtml(html, "currency"), /USD/);
    assert.match(html, /Crear borrador/);
  });

  it("explains what to do when there are no clients or issuers", async () => {
    const { NewDraftForm } = await import("../../src/billing/NewDraftForm.tsx");
    const html = renderToStaticMarkup(
      createElement(NewDraftForm, {
        action: noop as never,
        options: { ...options, clients: [], issuers: [] },
      }),
    );
    assert.match(html, /href="\/clients\/new"/);
    assert.match(html, /href="\/settings\/issuers\/new"/);
  });
});

describe("draft editor", () => {
  async function render(overrides: Record<string, unknown> = {}) {
    const { DraftEditor } = await import("../../src/billing/DraftEditor.tsx");
    return renderToStaticMarkup(
      createElement(DraftEditor, {
        action: noop as never,
        draft: { ...draft, ...overrides },
        options,
      }),
    );
  }

  it("prefills the lines with amounts in the document format and shows the total", async () => {
    const html = await render();
    assert.match(html, /name="lines\.0\.product"[^>]*value="Asesoría"/);
    assert.match(html, /name="lines\.0\.amount"[^>]*value="1\.200\.000"/);
    assert.match(html, /name="lines\.1\.product"[^>]*value="Soporte"/);
    assert.match(html, /Total[\s\S]*\$ 1\.500\.000/);
    // Quantity is informative; the form says so.
    assert.match(html, /no multiplica/);
    assert.match(html, /Agregar línea/);
    assert.match(html, /Guardar borrador/);
  });

  it("offers one empty row when the draft has no lines yet", async () => {
    const html = await render({ lines: [], totalMinor: 0 });
    assert.match(html, /name="lines\.0\.product"/);
    assert.doesNotMatch(html, /name="lines\.1\.product"/);
  });

  it("offers only bank accounts of the draft's issuer in its currency", async () => {
    const bank = selectHtml(await render(), "bankAccountId");
    assert.match(bank, /value="b-cop" selected=""/);
    assert.doesNotMatch(bank, /b-usd/);
    assert.doesNotMatch(bank, /b-other/);
    assert.match(bank, /Titular Demo/);
  });

  it("never preselects a declaration and marks inactive choices", async () => {
    const html = await render();
    const declaration = selectHtml(html, "declarationTextId");
    assert.match(
      declaration,
      /<option value="" selected="">Sin declaración<\/option>/,
    );
    assert.match(
      selectHtml(html, "signerProfileId"),
      /Firmante Demo · Representante legal \(inactivo\)/,
    );
  });
});

describe("discard section", () => {
  it("explains that a draft has no number and is deleted", async () => {
    const { DraftDiscardSection } = await import(
      "../../src/billing/DraftDiscardSection.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(DraftDiscardSection, { discard: noop as never }),
    );
    assert.match(html, /Descartar borrador/);
    assert.match(html, /no tiene número/);
  });
});

describe("activity list", () => {
  it("labels draft actions", async () => {
    const { ActivityList } = await import("../../src/users/ActivityList.tsx");
    const labels = [
      ["billing.draft_create", "Creó un borrador de cuenta de cobro"],
      ["billing.draft_update", "Editó un borrador de cuenta de cobro"],
      ["billing.draft_discard", "Descartó un borrador de cuenta de cobro"],
    ];
    const html = renderToStaticMarkup(
      createElement(ActivityList, {
        items: labels.map(([action], index) => ({
          id: index + 1,
          occurredAt: new Date("2026-10-01T10:00:00Z"),
          action: action as string,
          actorName: "Admin Demo",
          details: {},
        })),
      }),
    );
    for (const [, label] of labels)
      assert.match(html, new RegExp(label as string));
  });
});
