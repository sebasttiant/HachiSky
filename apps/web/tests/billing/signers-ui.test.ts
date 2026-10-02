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
  // The upload form refreshes through the App Router; a static render has none.
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

const image = {
  id: "44444444-4444-4444-8444-444444444444",
  sha256: "a".repeat(64),
  byteSize: 2048,
  width: 300,
  height: 100,
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

const signer = {
  id: "55555555-5555-4555-8555-555555555555",
  fullName: "Firmante Demo",
  identificationType: "CC" as const,
  identificationNumber: "1000000009",
  jobTitle: "Representante legal",
  email: "firmante@example.test",
  active: true,
  signature: image,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

describe("signer list", () => {
  it("shows name, identification, job title, email, signature and status", async () => {
    const { SignerList } = await import("../../src/billing/SignerList.tsx");
    const html = renderToStaticMarkup(
      createElement(SignerList, {
        items: [
          signer,
          {
            ...signer,
            id: "x",
            fullName: "Otra Firmante",
            signature: null,
            active: false,
          },
        ],
      }),
    );
    assert.match(html, /Firmante Demo/);
    assert.match(html, /CC 1000000009/);
    assert.match(html, /Representante legal/);
    assert.match(html, /firmante@example\.test/);
    assert.match(html, /Con firma/);
    assert.match(html, /Sin firma/);
    assert.match(html, /Inactivo/);
    assert.match(
      html,
      /href="\/settings\/signers\/55555555-5555-4555-8555-555555555555"/,
    );
    // The list never loads image bytes.
    assert.doesNotMatch(html, /<img/);
  });

  it("invites creating the first signer when there are none", async () => {
    const { SignerList } = await import("../../src/billing/SignerList.tsx");
    const html = renderToStaticMarkup(createElement(SignerList, { items: [] }));
    assert.match(html, /Todavía no hay firmantes/);
    assert.match(html, /href="\/settings\/signers\/new"/);
  });
});

describe("signer form", () => {
  it("labels every field in Spanish and prefills values", async () => {
    const { SignerForm } = await import("../../src/billing/SignerForm.tsx");
    const html = renderToStaticMarkup(
      createElement(SignerForm, {
        action: noop as never,
        values: signer,
        submitLabel: "Guardar cambios",
        pendingLabel: "Guardando…",
      }),
    );
    for (const label of [
      "Nombre completo",
      "Tipo de identificación",
      "Número de identificación",
      "Cargo",
      "Correo",
    ]) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /value="Firmante Demo"/);
    assert.match(html, /value="Representante legal"/);
    assert.match(html, /Guardar cambios/);
  });

  it("starts empty when creating", async () => {
    const { SignerForm } = await import("../../src/billing/SignerForm.tsx");
    const html = renderToStaticMarkup(
      createElement(SignerForm, {
        action: noop as never,
        submitLabel: "Crear firmante",
        pendingLabel: "Creando…",
      }),
    );
    for (const name of [
      "fullName",
      "identificationNumber",
      "jobTitle",
      "email",
    ]) {
      const tag = html.match(
        new RegExp(`<input[^>]*name="${name}"[^>]*>`),
      )?.[0];
      assert.ok(tag, `${name} input`);
      assert.doesNotMatch(tag, /value="[^"]+"/);
    }
  });
});

describe("image upload form", () => {
  it("accepts only PNG and JPEG files and states the limits", async () => {
    const { ImageUploadForm } = await import(
      "../../src/billing/ImageUploadForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(ImageUploadForm, {
        uploadUrl: "/api/billing/uploads/signers/x/signature",
        purpose: "signature",
        label: "Imagen de la firma",
        submitLabel: "Subir firma",
      }),
    );
    assert.match(html, /<input[^>]*type="file"[^>]*>/);
    assert.match(html, /name="image"/);
    assert.match(html, /accept="image\/png,image\/jpeg"/);
    assert.match(html, /Imagen de la firma/);
    assert.match(html, /PNG o JPG/);
    assert.match(html, /1 MB/);
    assert.match(html, /2000 × 1000/);
    assert.match(html, /Subir firma/);
    // Sent by fetch to the upload route, never as a Server Function form.
    assert.doesNotMatch(html, /<form[^>]*action=/);
    assert.doesNotMatch(html, /enctype=/);
  });

  it("states the logo limits for the logo", async () => {
    const { ImageUploadForm } = await import(
      "../../src/billing/ImageUploadForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(ImageUploadForm, {
        uploadUrl: "/api/billing/uploads/issuer-logo",
        purpose: "issuer_logo",
        label: "Logo",
        submitLabel: "Subir logo",
      }),
    );
    assert.match(html, /2000 × 2000/);
  });
});

describe("stored image preview", () => {
  it("points at the protected route for that exact version, never a data URL", async () => {
    const { StoredImagePreview } = await import(
      "../../src/billing/StoredImagePreview.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(StoredImagePreview, {
        image,
        alt: "Firma actual",
        emptyText: "Sin firma",
      }),
    );
    assert.match(
      html,
      /src="\/api\/billing\/images\/44444444-4444-4444-8444-444444444444"/,
    );
    assert.match(html, /alt="Firma actual"/);
    assert.match(html, /300 × 100/);
    assert.match(html, /2 KB/);
    assert.doesNotMatch(html, /data:image/);
  });

  it("says when there is no image yet", async () => {
    const { StoredImagePreview } = await import(
      "../../src/billing/StoredImagePreview.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(StoredImagePreview, {
        image: null,
        alt: "Firma actual",
        emptyText: "Este firmante todavía no tiene firma.",
      }),
    );
    assert.match(html, /todavía no tiene firma/);
    assert.doesNotMatch(html, /<img/);
  });
});

describe("signature section", () => {
  it("explains it is a graphic signature and keeps earlier versions", async () => {
    const { SignatureSection } = await import(
      "../../src/billing/SignatureSection.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(SignatureSection, {
        signature: image,
        versionCount: 3,
        uploadUrl: "/api/billing/uploads/signers/x/signature",
      }),
    );
    assert.match(html, /firma gráfica/);
    assert.match(html, /no es una firma digital certificada/);
    assert.match(html, /2 versiones anteriores/);
    assert.match(html, /Subir nueva firma/);
    assert.doesNotMatch(html, /Eliminar|Borrar/i);
  });
});

describe("signer status section", () => {
  async function section(active: boolean) {
    const { SignerStatusSection } = await import(
      "../../src/billing/SignerStatusSection.tsx"
    );
    return renderToStaticMarkup(
      createElement(SignerStatusSection, {
        active,
        label: "Firmante Demo",
        deactivate: noop as never,
        reactivate: noop as never,
      }),
    );
  }

  it("offers deactivate or reactivate, never delete", async () => {
    assert.match(await section(true), /Desactivar firmante/);
    assert.match(await section(false), /Reactivar firmante/);
    assert.doesNotMatch(await section(true), /Eliminar|Borrar/i);
  });
});

describe("activity list", () => {
  it("labels signer and image actions", async () => {
    const { ActivityList } = await import("../../src/users/ActivityList.tsx");
    const labels = [
      ["billing.signer_create", "Creó un firmante"],
      ["billing.signer_update", "Editó un firmante"],
      ["billing.signer_deactivate", "Desactivó un firmante"],
      ["billing.signer_activate", "Reactivó un firmante"],
      ["billing.signer_signature_upload", "Subió una firma"],
      ["billing.issuer_logo_upload", "Subió el logo del emisor"],
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
