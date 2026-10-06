import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same loader as tests/clients/clients-ui.test.ts: CSS modules become proxies
// and .tsx is compiled with the SWC build that ships with Next.
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

const account = {
  id: "33333333-3333-4333-8333-333333333333",
  bankName: "Banco Demo",
  accountType: "ahorros" as const,
  accountNumber: "000111222",
  holderName: "Titular Demo",
  holderIdentificationType: "CC" as const,
  holderIdentificationNumber: "1000000001",
  currency: "COP" as const,
  active: true,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

describe("bank account list", () => {
  it("shows holder, currency, type, number and status", async () => {
    const { BankAccountList } = await import(
      "../../src/billing/BankAccountList.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountList, {
        items: [
          account,
          {
            ...account,
            id: "x",
            currency: "USD" as const,
            active: false,
            holderName: "Otra Titular",
          },
        ],
      }),
    );
    assert.match(html, /Banco Demo/);
    assert.match(html, /Titular Demo/);
    assert.match(html, /CC 1000000001/);
    assert.match(html, /000111222/);
    assert.match(html, /Ahorros/);
    assert.match(html, /COP/);
    assert.match(html, /USD/);
    assert.match(html, /Inactivo/);
    assert.match(
      html,
      /href="\/settings\/bank-accounts\/33333333-3333-4333-8333-333333333333"/,
    );
  });

  it("invites creating the first account when there are none", async () => {
    const { BankAccountList } = await import(
      "../../src/billing/BankAccountList.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountList, { items: [] }),
    );
    assert.match(html, /Todavía no hay cuentas bancarias/);
    assert.match(html, /href="\/settings\/bank-accounts\/new"/);
  });
});

describe("bank account form", () => {
  it("labels every field in Spanish and offers both account types and currencies", async () => {
    const { BankAccountForm } = await import(
      "../../src/billing/BankAccountForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountForm, {
        action: noop as never,
        values: account,
        submitLabel: "Guardar cambios",
        pendingLabel: "Guardando…",
      }),
    );
    for (const label of [
      "Banco",
      "Tipo de cuenta",
      "Número de cuenta",
      "Titular",
      "Tipo de identificación del titular",
      "Número de identificación del titular",
      "Moneda",
    ]) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /value="ahorros"/);
    assert.match(html, /value="corriente"/);
    assert.match(html, /value="COP"/);
    assert.match(html, /value="USD"/);
    assert.match(html, /value="Banco Demo"/);
  });
});

describe("bank account status controls", () => {
  async function section(active: boolean) {
    const { BankAccountStatusSection } = await import(
      "../../src/billing/BankAccountStatusSection.tsx"
    );
    return renderToStaticMarkup(
      createElement(BankAccountStatusSection, {
        active,
        label: "Banco Demo",
        deactivate: noop,
        reactivate: noop,
      }),
    );
  }

  it("offers deactivate for an active account and reactivate for an inactive one", async () => {
    assert.match(await section(true), /Desactivar cuenta/);
    assert.doesNotMatch(await section(true), /Reactivar cuenta/);
    assert.match(await section(false), /Reactivar cuenta/);
    assert.doesNotMatch(await section(false), /Desactivar cuenta/);
  });

  it("offers no delete option", async () => {
    assert.doesNotMatch(await section(true), /Eliminar|Borrar/i);
  });
});

describe("activity list", () => {
  it("labels billing configuration actions", async () => {
    const { ActivityList } = await import("../../src/users/ActivityList.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityList, {
        items: [
          ["billing.issuer_configure", "Configuró los datos del emisor"],
          ["billing.issuer_update", "Editó los datos del emisor"],
          ["billing.bank_account_create", "Creó una cuenta bancaria"],
          ["billing.bank_account_update", "Editó una cuenta bancaria"],
          ["billing.bank_account_deactivate", "Desactivó una cuenta bancaria"],
          ["billing.bank_account_activate", "Reactivó una cuenta bancaria"],
        ].map(([action], index) => ({
          id: index + 1,
          occurredAt: new Date("2026-10-01T10:00:00Z"),
          action: action as string,
          actorName: "Admin Demo",
          details: {},
        })),
      }),
    );
    for (const label of [
      "Configuró los datos del emisor",
      "Editó los datos del emisor",
      "Creó una cuenta bancaria",
      "Editó una cuenta bancaria",
      "Desactivó una cuenta bancaria",
      "Reactivó una cuenta bancaria",
    ]) {
      assert.match(html, new RegExp(label));
    }
  });
});
