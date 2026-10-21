import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NumberingState } from "../../src/billing/numbering.ts";

// Same loader as tests/billing/issuers-ui.test.ts.
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

const issuerId = "11111111-1111-4111-8111-111111111111";

const unconfigured: NumberingState = {
  issuerProfileId: issuerId,
  configured: false,
  nextNumber: null,
  nextFormatted: null,
  lastRegistered: null,
  lastRegisteredFormatted: null,
  updatedAt: null,
};

const carriedOver: NumberingState = {
  issuerProfileId: issuerId,
  configured: true,
  nextNumber: 45,
  nextFormatted: "CC-0045",
  lastRegistered: null,
  lastRegisteredFormatted: null,
  updatedAt: new Date("2026-10-10T10:00:00Z"),
};

const inUse: NumberingState = {
  issuerProfileId: issuerId,
  configured: true,
  nextNumber: 121,
  nextFormatted: "CC-0121",
  lastRegistered: 120,
  lastRegisteredFormatted: "CC-0120",
  updatedAt: new Date("2026-10-10T10:00:00Z"),
};

// The help text names CC-0001 as the printed format, so "does it show a
// number?" is only meaningful about the summary list.
function summary(html: string) {
  return html.slice(html.indexOf("<dl"), html.indexOf("</dl>"));
}

async function render(numbering: NumberingState) {
  const { NumberingSection } = await import(
    "../../src/billing/NumberingSection.tsx"
  );
  return renderToStaticMarkup(
    createElement(NumberingSection, { numbering, action: noop }),
  );
}

describe("NumberingSection", () => {
  it("says the series is not configured instead of showing a number", async () => {
    const html = await render(unconfigured);
    assert.match(html, /Sin configurar/);
    assert.match(html, /Ninguno todav/);
    assert.doesNotMatch(summary(html), /CC-\d/);
  });

  it("shows the next suggested number and offers it for editing", async () => {
    const html = await render(carriedOver);
    assert.match(summary(html), /CC-0045/);
    assert.match(html, /name="nextNumber"/);
    assert.match(html, /value="45"/);
  });

  it("separates a carried-over series from documents issued here", async () => {
    const html = await render(carriedOver);
    // Nothing has been issued by the platform yet, even though it continues
    // from 45: that must not read as a document registered here.
    assert.match(html, /Ninguno todav/);
  });

  it("shows the last number this platform registered", async () => {
    const html = await render(inUse);
    assert.match(summary(html), /CC-0120/);
    assert.match(summary(html), /CC-0121/);
    assert.doesNotMatch(html, /Ninguno todav/);
  });

  it("explains that the series is per issuer and only moves forward", async () => {
    const html = await render(inUse);
    assert.match(html, /clientes y sedes/);
    assert.match(html, /solo avanza/);
  });
});
