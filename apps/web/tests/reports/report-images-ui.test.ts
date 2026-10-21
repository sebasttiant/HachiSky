import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportImageRecord } from "../../src/reports/images.ts";

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

// The section-local figure controls. What matters here is the shape the
// browser receives: the preview points at the authenticated route, the
// forms are siblings rather than nested, and the move buttons are disabled
// at the ends of the list.

const noop = async () => ({ status: "idle" as const });

function figure(overrides: Partial<ReportImageRecord> = {}): ReportImageRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sectionKey: "steps",
    position: 0,
    title: "Pantalla de ingreso",
    caption: null,
    width: 800,
    height: 600,
    byteSize: 2048,
    ...overrides,
  };
}

// Attribute order is React's business, not this suite's: find the button by
// the words the author reads, then look at what it carries.
function buttonFor(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));
  assert.ok(match, `expected a "${label}" button`);
  return match[0];
}

/** One markup block per rendered figure. */
function itemsOf(html: string): string[] {
  return [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((match) => match[0]);
}

async function render(images: ReportImageRecord[], limit = 20) {
  const { ReportImagesEditor } = await import(
    "../../src/reports/ReportImagesEditor.tsx"
  );
  return renderToStaticMarkup(
    createElement(ReportImagesEditor, {
      reportId: "99999999-9999-4999-8999-999999999999",
      sectionKey: "steps",
      images,
      updateText: noop as never,
      remove: noop as never,
      move: noop as never,
      refresh: noop as never,
      limit,
    }),
  );
}

describe("the figures of a section", () => {
  it("explains itself when the section has none", async () => {
    const html = await render([]);
    assert.match(html, /todavía no tiene imágenes/);
  });

  it("previews a stored figure through the authenticated route", async () => {
    const html = await render([figure()]);
    assert.match(
      html,
      /src="\/api\/reports\/images\/11111111-1111-4111-8111-111111111111"/,
    );
    // Never a public or object URL for these bytes.
    assert.doesNotMatch(html, /blob:|data:image/);
  });

  it("carries the title as the alternative text and the stored size", async () => {
    const html = await render([figure()]);
    assert.match(html, /alt="Pantalla de ingreso"/);
    assert.match(html, /width="800"/);
    assert.match(html, /height="600"/);
  });

  it("offers the title and the description of each figure", async () => {
    const html = await render([figure({ caption: "Menú principal" })]);
    assert.match(html, /value="Pantalla de ingreso"/);
    assert.match(html, /Menú principal/);
  });

  it("never nests one form inside another", async () => {
    const html = await render([
      figure(),
      figure({ id: "22222222-2222-4222-8222-222222222222" }),
    ]);
    // A form inside a form is invalid HTML and the browser drops the inner
    // one, which would silently break whichever control it held.
    assert.doesNotMatch(html, /<form[^>]*>(?:(?!<\/form>)[\s\S])*<form/);
  });

  it("sends the id of the figure with every control", async () => {
    const html = await render([figure()]);
    const hidden = [
      ...html.matchAll(
        /name="imageId"[^>]*value="11111111-1111-4111-8111-111111111111"/g,
      ),
    ];
    // One per form: the text, the order and the removal.
    assert.equal(hidden.length, 3);
  });
});

describe("reordering from the screen", () => {
  it("disables both buttons when there is a single figure", async () => {
    const html = await render([figure()]);
    assert.ok(buttonFor(html, "Subir").includes("disabled"));
    assert.ok(buttonFor(html, "Bajar").includes("disabled"));
  });

  it("disables only the ends with several figures", async () => {
    const html = await render([
      figure({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", position: 0 }),
      figure({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", position: 1 }),
      figure({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", position: 2 }),
    ]);
    const items = itemsOf(html);
    assert.equal(items.length, 3, "one block per figure, never repeated");
    // First: cannot go up. Last: cannot go down. The middle one moves both
    // ways, because there is something to swap with on either side.
    assert.ok(buttonFor(items[0], "Subir").includes("disabled"));
    assert.ok(!buttonFor(items[0], "Bajar").includes("disabled"));
    assert.ok(!buttonFor(items[1], "Subir").includes("disabled"));
    assert.ok(!buttonFor(items[1], "Bajar").includes("disabled"));
    assert.ok(!buttonFor(items[2], "Subir").includes("disabled"));
    assert.ok(buttonFor(items[2], "Bajar").includes("disabled"));
  });

  it("names the direction on the button itself", async () => {
    const html = await render([figure()]);
    const up = buttonFor(html, "Subir");
    const down = buttonFor(html, "Bajar");
    // The button's own name and value travel with the submission, so one
    // form serves both directions.
    assert.ok(up.includes('name="direction"') && up.includes('value="up"'));
    assert.ok(
      down.includes('name="direction"') && down.includes('value="down"'),
    );
  });
});

describe("adding a figure", () => {
  it("accepts only the formats the pipeline re-encodes", async () => {
    const html = await render([]);
    assert.match(html, /accept="image\/png,image\/jpeg"/);
  });

  it("states the limits instead of letting the server be the first to say", async () => {
    const html = await render([]);
    assert.match(html, /1024 KB/);
    assert.match(html, /2000 × 2000 píxeles/);
    assert.match(html, /sin los metadatos/);
  });

  it("closes the form once the section is full", async () => {
    const html = await render([figure()], 1);
    // Said out loud, not just greyed out: the author should know why.
    assert.match(html, /ya tiene 1 imágenes, el máximo/);
    assert.ok(buttonFor(html, "Agregar imagen").includes("disabled"));
  });

  it("leaves the form open while there is room", async () => {
    const html = await render([figure()], 20);
    assert.doesNotMatch(html, /el máximo/);
    assert.ok(!buttonFor(html, "Agregar imagen").includes("disabled"));
  });

  it("does not fix a multipart content type by hand", async () => {
    // The browser has to set the boundary; hard-coding the header breaks
    // the parse on the server.
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/reports/ReportImagesEditor.tsx", "utf8"),
    );
    assert.doesNotMatch(source, /"Content-Type":\s*"multipart/i);
    assert.doesNotMatch(source, /multipart\/form-data/i);
  });
});
