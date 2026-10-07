import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same loader as tests/billing/signers-ui.test.ts.
const loader = `
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(process.cwd() + "/");
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/link") return nextResolve("next/link.js", context);
  if (specifier === "next/navigation") return { url: "data:text/javascript,export function useRouter(){return {refresh(){}}}", shortCircuit: true };
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

const logo = {
  id: "44444444-4444-4444-8444-444444444444",
  sha256: "a".repeat(64),
  byteSize: 2048,
  width: 300,
  height: 100,
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

const issuer = {
  id: "66666666-6666-4666-8666-666666666666",
  legalName: "Emisor Demo S.A.S.",
  identificationType: "NIT" as const,
  identificationNumber: "9000000022",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  phone: null,
  email: null,
  paymentTerms: null,
  active: true,
  isDefault: true,
  logo,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

const other = {
  ...issuer,
  id: "77777777-7777-4777-8777-777777777777",
  legalName: "Otro Emisor Demo",
  identificationType: "CC" as const,
  identificationNumber: "1000000001",
  active: false,
  isDefault: false,
  logo: null,
};

const account = {
  id: "33333333-3333-4333-8333-333333333333",
  bankName: "Banco Demo",
  accountType: "ahorros" as const,
  accountNumber: "000111222",
  holderName: "Titular Demo",
  holderIdentificationType: "CC" as const,
  holderIdentificationNumber: "1000000001",
  currency: "COP" as const,
  issuerProfileId: issuer.id,
  issuer: { id: issuer.id, legalName: issuer.legalName, active: true },
  active: true,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

describe("issuer list", () => {
  it("shows name, identification, status and the default mark", async () => {
    const { IssuerList } = await import("../../src/billing/IssuerList.tsx");
    const html = renderToStaticMarkup(
      createElement(IssuerList, { items: [issuer, other] }),
    );
    assert.match(html, /Emisor Demo S\.A\.S\./);
    assert.match(html, /NIT 9000000022/);
    assert.match(html, /Otro Emisor Demo/);
    assert.match(html, /CC 1000000001/);
    assert.match(html, /Predeterminado/);
    assert.equal(html.match(/>Predeterminado</g)?.length, 2);
    assert.match(html, /Activo/);
    assert.match(html, /Inactivo/);
    assert.match(
      html,
      /href="\/settings\/issuers\/66666666-6666-4666-8666-666666666666"/,
    );
    assert.doesNotMatch(html, /Eliminar|Borrar/i);
  });

  it("invites creating the first issuer when there are none", async () => {
    const { IssuerList } = await import("../../src/billing/IssuerList.tsx");
    const html = renderToStaticMarkup(createElement(IssuerList, { items: [] }));
    assert.match(html, /Aún no hay emisores/);
    assert.match(html, /href="\/settings\/issuers\/new"/);
  });
});

describe("issuer form", () => {
  it("labels every field in Spanish and uses the given submit label", async () => {
    const { IssuerForm } = await import("../../src/billing/IssuerForm.tsx");
    const html = renderToStaticMarkup(
      createElement(IssuerForm, {
        action: noop as never,
        values: issuer,
        submitLabel: "Guardar cambios",
        pendingLabel: "Guardando…",
      }),
    );
    for (const label of [
      "Nombre o razón social",
      "Tipo de identificación",
      "Número de identificación",
      "Dirección",
      "Ciudad",
      "Teléfono",
      "Correo",
      "Condiciones de pago por defecto",
    ]) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /value="Emisor Demo S\.A\.S\."/);
    assert.match(html, /Guardar cambios/);
  });

  it("starts empty, with no data baked in, for a new issuer", async () => {
    const { IssuerForm } = await import("../../src/billing/IssuerForm.tsx");
    const html = renderToStaticMarkup(
      createElement(IssuerForm, {
        action: noop as never,
        submitLabel: "Crear emisor",
        pendingLabel: "Creando…",
      }),
    );
    for (const name of [
      "legalName",
      "identificationNumber",
      "address",
      "city",
    ]) {
      const tag = html.match(
        new RegExp(`<input[^>]*name="${name}"[^>]*>`),
      )?.[0];
      assert.ok(tag, `${name} input`);
      assert.doesNotMatch(tag, /value="[^"]+"/, `${name} must start empty`);
    }
    assert.match(html, /Crear emisor/);
  });
});

describe("issuer status section", () => {
  async function section(active: boolean, isDefault: boolean) {
    const { IssuerStatusSection } = await import(
      "../../src/billing/IssuerStatusSection.tsx"
    );
    return renderToStaticMarkup(
      createElement(IssuerStatusSection, {
        active,
        isDefault,
        label: "Emisor Demo",
        deactivate: noop as never,
        reactivate: noop as never,
        makeDefault: noop as never,
      }),
    );
  }

  it("explains that the default cannot be deactivated and offers no deactivate button", async () => {
    const html = await section(true, true);
    assert.match(html, /emisor predeterminado/);
    assert.match(html, /elige primero otro emisor como predeterminado/i);
    assert.doesNotMatch(html, /Desactivar emisor/);
    assert.doesNotMatch(html, /Usar como predeterminado/);
  });

  it("offers default and deactivate for an active issuer, reactivate for an inactive one", async () => {
    const active = await section(true, false);
    assert.match(active, /Usar como predeterminado/);
    assert.match(active, /Desactivar emisor/);
    const inactive = await section(false, false);
    assert.match(inactive, /Reactivar emisor/);
    assert.doesNotMatch(inactive, /Usar como predeterminado/);
    assert.doesNotMatch(inactive, /Eliminar|Borrar/i);
  });
});

describe("issuer logo section", () => {
  it("shows the current logo and uploads to this issuer's route", async () => {
    const { IssuerLogoSection } = await import(
      "../../src/billing/IssuerLogoSection.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(IssuerLogoSection, {
        logo,
        versionCount: 2,
        active: true,
        uploadUrl:
          "/api/billing/uploads/issuers/66666666-6666-4666-8666-666666666666/logo",
      }),
    );
    assert.match(
      html,
      /src="\/api\/billing\/images\/44444444-4444-4444-8444-444444444444"/,
    );
    assert.match(html, /1 versión anterior/);
    assert.match(html, /Subir nuevo logo/);
    assert.match(html, /2000 × 2000/);
    assert.doesNotMatch(html, /Eliminar|Borrar/i);
  });

  it("asks to reactivate an inactive issuer before uploading", async () => {
    const { IssuerLogoSection } = await import(
      "../../src/billing/IssuerLogoSection.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(IssuerLogoSection, {
        logo: null,
        versionCount: 0,
        active: false,
        uploadUrl: "/x",
      }),
    );
    assert.match(html, /todavía no tiene logo/);
    assert.match(html, /Reactiva el emisor/);
    assert.doesNotMatch(html, /type="file"/);
  });
});

describe("bank accounts and issuers", () => {
  it("lists the issuer of each account, or says it has none", async () => {
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
            accountNumber: "000999888",
            issuerProfileId: null,
            issuer: null,
          },
        ],
      }),
    );
    assert.match(html, /Emisor Demo S\.A\.S\./);
    assert.match(html, /Sin emisor asignado/);
  });

  it("requires choosing one of the active issuers", async () => {
    const { BankAccountForm } = await import(
      "../../src/billing/BankAccountForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountForm, {
        action: noop as never,
        issuers: [{ id: issuer.id, legalName: issuer.legalName }],
        submitLabel: "Crear cuenta",
        pendingLabel: "Creando…",
      }),
    );
    assert.match(html, /<label[^>]*for="account-issuer"[^>]*>Emisor<\/label>/);
    assert.match(html, /<select[^>]*name="issuerProfileId"/);
    assert.match(html, /<option value=""[^>]*>Elige un emisor<\/option>/);
    assert.match(html, /<option value="66666666-6666-4666-8666-666666666666">/);
  });

  it("flags an account whose issuer is inactive and does not preselect it", async () => {
    const { BankAccountForm } = await import(
      "../../src/billing/BankAccountForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountForm, {
        action: noop as never,
        issuers: [{ id: issuer.id, legalName: issuer.legalName }],
        values: {
          ...account,
          issuerProfileId: other.id,
          issuer: { id: other.id, legalName: other.legalName, active: false },
        },
        submitLabel: "Guardar cambios",
        pendingLabel: "Guardando…",
      }),
    );
    assert.match(html, /Otro Emisor Demo/);
    assert.match(html, /está inactivo/);
    assert.doesNotMatch(html, /value="77777777-7777-4777-8777-777777777777"/);
  });

  it("flags an account without issuer", async () => {
    const { BankAccountForm } = await import(
      "../../src/billing/BankAccountForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountForm, {
        action: noop as never,
        issuers: [{ id: issuer.id, legalName: issuer.legalName }],
        values: { ...account, issuerProfileId: null, issuer: null },
        submitLabel: "Guardar cambios",
        pendingLabel: "Guardando…",
      }),
    );
    assert.match(html, /no tiene emisor asignado/);
  });

  it("points to creating an issuer when there is no active one", async () => {
    const { BankAccountForm } = await import(
      "../../src/billing/BankAccountForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(BankAccountForm, {
        action: noop as never,
        issuers: [],
        submitLabel: "Crear cuenta",
        pendingLabel: "Creando…",
      }),
    );
    assert.match(html, /No hay emisores activos/);
    assert.match(html, /href="\/settings\/issuers\/new"/);
  });
});

describe("activity list", () => {
  it("labels issuer profile actions and keeps the old labels", async () => {
    const { ActivityList } = await import("../../src/users/ActivityList.tsx");
    const labels = [
      ["billing.issuer_create", "Creó un emisor"],
      ["billing.issuer_update", "Editó los datos del emisor"],
      ["billing.issuer_deactivate", "Desactivó un emisor"],
      ["billing.issuer_activate", "Reactivó un emisor"],
      ["billing.issuer_set_default", "Cambió el emisor predeterminado"],
      ["billing.issuer_logo_upload", "Subió el logo del emisor"],
      ["billing.issuer_configure", "Configuró los datos del emisor"],
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

describe("pages", () => {
  const page = (path: string) =>
    readFileSync(new URL(`../../app/(app)/${path}`, import.meta.url), "utf8");

  it("redirects the old issuer page to the issuer list", () => {
    const source = page("settings/issuer/page.tsx");
    assert.match(source, /redirect\(ISSUERS_PATH\)/);
  });

  it("links the settings hub to Emisores", () => {
    const source = page("settings/page.tsx");
    assert.match(source, /href="\/settings\/issuers"/);
    assert.match(source, />\s*Emisores\s*</);
    assert.doesNotMatch(source, /IL Asesorías/);
  });

  it("explains on the new issuer page that the logo comes after saving", () => {
    assert.match(
      page("settings/issuers/new/page.tsx"),
      /Después de crearlo podrás subir su logo/,
    );
  });
});
