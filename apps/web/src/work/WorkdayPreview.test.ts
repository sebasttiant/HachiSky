import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node cannot import .tsx or CSS Modules on its own. This in-process loader
// hook compiles .tsx with the SWC that ships inside the (already installed)
// `next` package and stubs `*.module.css` so class names map to themselves.
// It is test-only and adds no dependency.
const LOADER = `
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(process.cwd() + "/");
let swc;
export async function load(url, context, nextLoad) {
  if (url.endsWith(".module.css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default new Proxy({}, { get: (_, k) => (typeof k === 'string' ? k : undefined) });",
    };
  }
  if (url.endsWith(".tsx")) {
    swc ??= require("next/dist/build/swc/index.js");
    await swc.loadBindings();
    const filename = fileURLToPath(url);
    const out = await swc.transform(await readFile(filename, "utf8"), {
      filename,
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", tsx: true },
        transform: { react: { runtime: "automatic" } },
      },
      module: { type: "es6" },
    });
    return { format: "module", shortCircuit: true, source: out.code };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`);

const { WorkdayPreview } = await import("./WorkdayPreview.tsx");
const { default: WorkError } = await import("../../app/(app)/work/error.tsx");

describe("WorkdayPreview (rendered component)", () => {
  const html = renderToStaticMarkup(createElement(WorkdayPreview));

  it("is not a form and cannot submit", () => {
    assert.doesNotMatch(html, /<form/i);
    assert.doesNotMatch(html, /\saction=/i);
  });

  it("renders a disabled type=button save button", () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.length, 1);
    assert.match(buttons[0], /type="button"/);
    assert.match(buttons[0], /disabled/);
    assert.match(html, /Guardar \(no disponible/);
  });

  it("shows the sample-data notice", () => {
    assert.match(html, /Datos de ejemplo: los cambios no se guardan\./);
  });

  it("bounds every minutes input between 0 and one day", () => {
    const inputs = html.match(/<input[^>]*type="number"[^>]*>/g) ?? [];
    assert.ok(inputs.length >= 2);
    for (const input of inputs) {
      assert.match(input, /min="0"/);
      assert.match(input, /max="1440"/);
    }
  });

  it("renders the total computed from the sample minutes", () => {
    assert.match(html, /Total:[^<]*<strong>4 h<\/strong>/);
  });
});

describe("/work error boundary", () => {
  const html = renderToStaticMarkup(
    createElement(WorkError, { reset: () => {} }),
  );

  it("announces the failure in Spanish and offers a retry button", () => {
    assert.match(html, /role="alert"/);
    assert.match(html, /No pudimos mostrar el registro de jornada/);
    assert.match(html, /<button[^>]*type="button"[^>]*>Intentar de nuevo</);
  });
});
