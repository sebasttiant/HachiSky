import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MODULES } from "../../src/shell/navigation.ts";

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

// The banner claimed that sections show sample data and save nothing. That
// was true once. Telling an author their work is not being saved, while it
// is, is worse than saying nothing: it is the product lying about itself.

describe("preview banner", () => {
  it("names the modules that are still a preview", async () => {
    const { modulesInPreview } = await import(
      "../../src/shell/PreviewNotice.tsx"
    );
    assert.deepEqual(
      modulesInPreview([
        { id: "a", label: "Alfa", href: "/a", availability: "available" },
        { id: "b", label: "Beta", href: "/b", availability: "preview" },
        { id: "c", label: "Gama", href: "/c", availability: "planned" },
      ] as never),
      ["Beta", "Gama"],
    );
  });

  it("shows nothing when every module stores real data", async () => {
    const { PreviewNotice } = await import("../../src/shell/PreviewNotice.tsx");
    const html = renderToStaticMarkup(createElement(PreviewNotice));
    assert.equal(html, "");
  });

  it("agrees with the module registry as it stands today", async () => {
    const { modulesInPreview } = await import(
      "../../src/shell/PreviewNotice.tsx"
    );
    const previews = modulesInPreview(MODULES);
    const notAvailable = MODULES.filter(
      (module) => module.availability !== "available",
    ).map((module) => module.label);
    // Whatever the registry says, the banner says the same thing.
    assert.deepEqual(previews, notAvailable);
  });
});
