import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SectionRecord } from "../../src/reports/service.ts";

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

const noop = async () => ({ status: "idle" as const });

function section(overrides: Partial<SectionRecord> = {}): SectionRecord {
  return {
    id: "s1",
    key: "results",
    kind: "prose",
    heading: "Resultados",
    body: null,
    items: [],
    ...overrides,
  };
}

async function render(value: SectionRecord) {
  const { SectionEditor } = await import("../../src/reports/SectionEditor.tsx");
  return renderToStaticMarkup(
    createElement(SectionEditor, {
      section: value,
      hint: "Qué va acá.",
      saveSection: noop as never,
      saveItems: noop as never,
    }),
  );
}

describe("section editor", () => {
  it("opens a section that has nothing in it yet", async () => {
    const html = await render(section());
    assert.match(html, /<details[^>]*\sopen/);
    assert.match(html, /Vacía/);
  });

  it("starts a section that already has content collapsed", async () => {
    const html = await render(section({ body: "Todo operativo." }));
    assert.doesNotMatch(html, /<details[^>]*\sopen/);
    assert.match(html, /Con contenido/);
  });

  it("starts a structured section with rows collapsed", async () => {
    const html = await render(
      section({
        kind: "status_table",
        heading: "Semáforo",
        items: [
          {
            id: "i1",
            position: 0,
            label: "Respaldos",
            body: null,
            status: "risk",
            priority: null,
            impact: null,
          },
        ],
      }),
    );
    assert.doesNotMatch(html, /<details[^>]*\sopen/);
    assert.match(html, /Con contenido/);
  });

  it("offers only the classifications its kind carries", async () => {
    const steps = await render(section({ kind: "steps", heading: "Pasos" }));
    // A step has no priority and no status: offering them would invite a
    // value the service refuses.
    assert.doesNotMatch(steps, /name="items\.0\.priority"/);
    assert.doesNotMatch(steps, /name="items\.0\.status"/);

    const findings = await render(
      section({ kind: "findings", heading: "Hallazgos" }),
    );
    assert.match(findings, /name="items\.0\.priority"/);
    assert.match(findings, /name="items\.0\.impact"/);
    assert.doesNotMatch(findings, /name="items\.0\.status"/);

    const semaforo = await render(
      section({ kind: "status_table", heading: "Semáforo" }),
    );
    assert.match(semaforo, /name="items\.0\.status"/);
    assert.doesNotMatch(semaforo, /name="items\.0\.priority"/);
  });

  it("sends the section key so the server knows what is being saved", async () => {
    const html = await render(section());
    assert.match(html, /name="key"[^>]*value="results"/);
  });
});
