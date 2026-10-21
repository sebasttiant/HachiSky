import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same loader as tests/auth/login-ui.test.ts: CSS modules become proxies and
// .tsx is compiled with the SWC build that ships with Next.
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

async function statusSection(role: "admin" | "staff", active: boolean) {
  const { ClientStatusSection } = await import(
    "../../src/clients/ClientStatusSection.tsx"
  );
  return renderToStaticMarkup(
    createElement(ClientStatusSection, {
      role,
      active,
      name: "Cliente Demo",
      deactivate: noop,
      reactivate: noop,
    }),
  );
}

describe("client status controls", () => {
  it("shows an admin the deactivate button for an active client", async () => {
    const html = await statusSection("admin", true);
    assert.match(html, /Desactivar cliente/);
    assert.doesNotMatch(html, /Reactivar cliente/);
  });

  it("shows an admin the reactivate button for an inactive client", async () => {
    const html = await statusSection("admin", false);
    assert.match(html, /Reactivar cliente/);
    assert.doesNotMatch(html, /Desactivar cliente/);
  });

  it("shows staff no deactivate or reactivate control, only the reason", async () => {
    for (const active of [true, false]) {
      const html = await statusSection("staff", active);
      assert.doesNotMatch(html, /<button/);
      assert.match(html, /Solo un administrador puede/);
    }
  });

  it("offers no delete option", async () => {
    const html = await statusSection("admin", true);
    assert.doesNotMatch(html, /Eliminar|Borrar/i);
  });
});

const client = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Cliente Demo S.A.S.",
  identificationType: "NIT" as const,
  identificationNumber: "9000000011",
  address: null,
  city: "Ciudad Demo",
  email: "contacto@example.test",
  phone: null,
  active: true,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  createdBy: "u1",
  updatedBy: "u1",
};

describe("client list", () => {
  it("renders clients with a link to each one and the status badge", async () => {
    const { ClientList } = await import("../../src/clients/ClientList.tsx");
    const html = renderToStaticMarkup(
      createElement(ClientList, {
        items: [client, { ...client, id: "x", name: "Otro", active: false }],
        hasMore: false,
        filters: { status: "active", page: 1 },
      }),
    );
    assert.match(html, /Cliente Demo S\.A\.S\./);
    assert.match(html, /NIT 9000000011/);
    assert.match(
      html,
      /href="\/clients\/22222222-2222-4222-8222-222222222222"/,
    );
    assert.match(html, /Inactivo/);
  });

  it("invites creating the first client when there are none", async () => {
    const { ClientList } = await import("../../src/clients/ClientList.tsx");
    const html = renderToStaticMarkup(
      createElement(ClientList, {
        items: [],
        hasMore: false,
        filters: { status: "active", page: 1 },
      }),
    );
    assert.match(html, /Todavía no hay clientes/);
    assert.match(html, /href="\/clients\/new"/);
  });

  it("says there are no matches when a search finds nothing", async () => {
    const { ClientList } = await import("../../src/clients/ClientList.tsx");
    const html = renderToStaticMarkup(
      createElement(ClientList, {
        items: [],
        hasMore: false,
        filters: { q: "zzz", status: "active", page: 1 },
      }),
    );
    assert.match(html, /Sin coincidencias/);
    assert.doesNotMatch(html, /Todavía no hay clientes/);
  });

  it("links to the next page only when more results exist", async () => {
    const { ClientList } = await import("../../src/clients/ClientList.tsx");
    const html = renderToStaticMarkup(
      createElement(ClientList, {
        items: [client],
        hasMore: true,
        filters: { q: "demo", status: "all", page: 2 },
      }),
    );
    assert.match(html, /href="\/clients\?q=demo&amp;status=all&amp;page=3"/);
    assert.match(html, /href="\/clients\?q=demo&amp;status=all"/);
  });
});

describe("client filters form", () => {
  it("defaults to active clients and keeps the typed query", async () => {
    const { ClientFiltersForm } = await import(
      "../../src/clients/ClientFiltersForm.tsx"
    );
    const html = renderToStaticMarkup(
      createElement(ClientFiltersForm, {
        filters: { q: "demo", status: "active", page: 1 },
      }),
    );
    assert.match(html, /method="get"/);
    assert.match(html, /value="demo"/);
    assert.match(html, /<option value="active" selected/);
  });
});

describe("client form", () => {
  it("labels every field in Spanish and prefills the values", async () => {
    const { ClientForm } = await import("../../src/clients/ClientForm.tsx");
    const html = renderToStaticMarkup(
      createElement(ClientForm, {
        action: noop as never,
        values: client,
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
      "Correo de contacto",
      "Teléfono de contacto",
    ]) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /value="Cliente Demo S\.A\.S\."/);
    assert.match(html, /Guardar cambios/);
  });
});

describe("activity list", () => {
  it("names the client in client actions", async () => {
    const { ActivityList } = await import("../../src/users/ActivityList.tsx");
    const html = renderToStaticMarkup(
      createElement(ActivityList, {
        items: [
          {
            id: 1,
            occurredAt: new Date("2026-10-01T10:00:00Z"),
            action: "client.create",
            actorName: "Admin Demo",
            details: { clientId: "x", name: "Cliente Demo S.A.S." },
          },
        ],
      }),
    );
    assert.match(html, /Creó un cliente/);
    assert.match(html, /Cliente Demo S\.A\.S\./);
  });
});
