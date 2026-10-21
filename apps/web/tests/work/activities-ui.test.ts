import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same loader as tests/billing/drafts-ui.test.ts.
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
const ACTIVITY = "33333333-3333-4333-8333-333333333333";

function selectHtml(html: string, name: string) {
  return (
    html.match(
      new RegExp(`<select[^>]*name="${name}"[\\s\\S]*?</select>`),
    )?.[0] ?? ""
  );
}

describe("activity form", () => {
  it("renders every field and status option", async () => {
    const { ActivityForm } = await import("../../src/work/ActivityForm.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityForm, {
        action: noop as never,
        clients: [{ id: "c1", label: "Cliente Trabajo S.A.S." }],
        submitLabel: "Guardar actividad",
        pendingLabel: "Guardando…",
      }),
    );

    for (const name of [
      "clientId",
      "performedOn",
      "startedAt",
      "endedAt",
      "title",
      "description",
      "outcome",
      "status",
      "nextSteps",
    ]) {
      assert.match(html, new RegExp(`name="${name}"`), `${name} missing`);
    }
    assert.match(html, /type="date"/);
    assert.equal((html.match(/type="time"/g) ?? []).length, 2);
    assert.match(selectHtml(html, "clientId"), /Cliente Trabajo S\.A\.S\./);
    const status = selectHtml(html, "status");
    assert.match(status, /Realizada/);
    assert.match(status, /En curso/);
    assert.match(status, /Pendiente/);
  });

  it("explains when there are no active clients instead of rendering an empty picker", async () => {
    const { ActivityForm } = await import("../../src/work/ActivityForm.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityForm, {
        action: noop as never,
        clients: [],
        submitLabel: "Guardar actividad",
        pendingLabel: "Guardando…",
      }),
    );
    assert.match(html, /No hay clientes activos/);
    assert.doesNotMatch(html, /name="clientId"/);
  });
});

describe("activity list", () => {
  it("renders an activity with client, date, hours, title, status and link", async () => {
    const { ActivityList } = await import("../../src/work/ActivityList.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityList, {
        items: [
          {
            id: ACTIVITY,
            clientId: "c1",
            clientName: "Cliente Trabajo S.A.S.",
            authorUserId: "u1",
            performedOn: "2026-10-01",
            startedAt: "08:30",
            endedAt: "12:00",
            title: "Revisión contable",
            description: "Detalle",
            outcome: "Resultado",
            status: "completed",
            nextSteps: null,
            createdAt: new Date("2026-10-01T10:00:00Z"),
            updatedAt: new Date("2026-10-01T10:00:00Z"),
            createdBy: "u1",
            updatedBy: "u1",
          },
        ],
      }),
    );
    assert.match(html, /Cliente Trabajo S\.A\.S\./);
    assert.match(html, /01\/10\/2026/);
    assert.match(html, /08:30–12:00/);
    assert.match(html, /Revisión contable/);
    assert.match(html, /Realizada/);
    assert.match(html, new RegExp(`href="/work/${ACTIVITY}"`));
  });

  it("renders its empty state", async () => {
    const { ActivityList } = await import("../../src/work/ActivityList.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityList, { items: [] }),
    );
    assert.match(html, /Todavía no hay actividades registradas/);
    assert.match(html, /no es un error/i);
  });

  it('shows "Sin horario" when hours are absent', async () => {
    const { ActivityList } = await import("../../src/work/ActivityList.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityList, {
        items: [
          {
            id: ACTIVITY,
            clientId: "c1",
            clientName: "Cliente Trabajo S.A.S.",
            authorUserId: "u1",
            performedOn: "2026-10-01",
            startedAt: null,
            endedAt: null,
            title: "Trabajo sin horario",
            description: null,
            outcome: null,
            status: "pending",
            nextSteps: null,
            createdAt: new Date("2026-10-01T10:00:00Z"),
            updatedAt: new Date("2026-10-01T10:00:00Z"),
            createdBy: "u1",
            updatedBy: "u1",
          },
        ],
      }),
    );
    assert.match(html, /Sin horario/);
  });
});
