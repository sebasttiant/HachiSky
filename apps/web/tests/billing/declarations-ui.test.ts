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

// Synthetic texts only; never the owner's real declarations.
const declaration = {
  id: "66666666-6666-4666-8666-666666666666",
  label: "Declaración de prueba A",
  body: "Primera línea sintética.\nSegunda línea sintética.",
  active: true,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

describe("declaration list", () => {
  it("shows the label, the start of the text, the status and a link", async () => {
    const { DeclarationList } = await import(
      "../../src/billing/DeclarationList.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(DeclarationList, {
        items: [
          declaration,
          {
            ...declaration,
            id: "x",
            label: "Declaración de prueba B",
            active: false,
          },
        ],
      }),
    );
    assert.match(html, /Declaración de prueba A/);
    assert.match(html, /Declaración de prueba B/);
    assert.match(html, /Primera línea sintética/);
    assert.match(html, /Inactiv/);
    assert.match(
      html,
      /href="\/settings\/declarations\/66666666-6666-4666-8666-666666666666"/,
    );
    // Nothing is marked as the default or preselected text.
    assert.doesNotMatch(html, /predeterminad|por defecto/i);
  });

  it("invites creating the first one and says there is none by default", async () => {
    const { DeclarationList } = await import(
      "../../src/billing/DeclarationList.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(DeclarationList, { items: [] }),
    );
    assert.match(html, /Todavía no hay declaraciones/);
    assert.match(html, /ninguna viene incluida/);
    assert.match(html, /href="\/settings\/declarations\/new"/);
  });
});

describe("declaration form", () => {
  it("labels the fields in Spanish and keeps the line breaks of the text", async () => {
    const { DeclarationForm } = await import(
      "../../src/billing/DeclarationForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(DeclarationForm, {
        action: noop as never,
        values: declaration,
        submitLabel: "Guardar cambios",
        pendingLabel: "Guardando…",
      }),
    );
    assert.match(html, /Nombre/);
    assert.match(html, /Texto de la declaración/);
    assert.match(html, /value="Declaración de prueba A"/);
    assert.match(
      html,
      /<textarea[^>]*name="body"[^>]*>Primera línea sintética.\nSegunda línea sintética.<\/textarea>/,
    );
    assert.match(html, /maxLength="2000"/);
    assert.match(html, /maxLength="120"/);
    // Editing never rewrites documents already issued.
    assert.match(html, /no cambia las cuentas de cobro ya emitidas/);
    assert.match(html, /Guardar cambios/);
  });

  it("starts empty when creating", async () => {
    const { DeclarationForm } = await import(
      "../../src/billing/DeclarationForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(DeclarationForm, {
        action: noop as never,
        submitLabel: "Crear declaración",
        pendingLabel: "Creando…",
      }),
    );
    const input = html.match(/<input[^>]*name="label"[^>]*>/)?.[0];
    assert.ok(input);
    assert.doesNotMatch(input, /value="[^"]+"/);
    assert.match(html, /<textarea[^>]*name="body"[^>]*><\/textarea>/);
  });
});

describe("declaration status section", () => {
  async function section(active: boolean) {
    const { DeclarationStatusSection } = await import(
      "../../src/billing/DeclarationStatusSection.tsx"
    );
    return renderToStaticMarkup(
      createElement(DeclarationStatusSection, {
        active,
        label: "Declaración de prueba A",
        deactivate: noop as never,
        reactivate: noop as never,
      }),
    );
  }

  it("offers deactivate or reactivate, never delete", async () => {
    assert.match(await section(true), /Desactivar declaración/);
    assert.match(await section(false), /Reactivar declaración/);
    assert.doesNotMatch(await section(true), /Eliminar|Borrar/i);
  });
});

describe("activity list", () => {
  it("labels declaration actions", async () => {
    const { ActivityList } = await import("../../src/users/ActivityList.tsx");
    const labels = [
      ["billing.declaration_create", "Creó una declaración"],
      ["billing.declaration_update", "Editó una declaración"],
      ["billing.declaration_deactivate", "Desactivó una declaración"],
      ["billing.declaration_activate", "Reactivó una declaración"],
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
