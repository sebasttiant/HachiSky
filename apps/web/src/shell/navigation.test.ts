import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  AVAILABILITY_LABEL,
  AVAILABILITY_STATUSES,
  type Availability,
  isActive,
  MODULES,
} from "./navigation.ts";

const byId = (id: string) => MODULES.find((m) => m.id === id);

describe("shell navigation", () => {
  it("lists the six modules in order with Spanish labels and English routes", () => {
    assert.deepEqual(
      MODULES.map((m) => [m.label, m.href]),
      [
        ["Inicio", "/"],
        ["Clientes", "/clients"],
        ["Trabajo", "/work"],
        ["Informes", "/reports"],
        ["Facturación", "/billing"],
        ["Configuración", "/settings"],
      ],
    );
  });

  it("gives every module a status from the closed set", () => {
    assert.deepEqual(
      [...AVAILABILITY_STATUSES],
      ["available", "preview", "unavailable"],
    );
    for (const m of MODULES) {
      assert.ok(
        (AVAILABILITY_STATUSES as readonly string[]).includes(m.availability),
        `${m.id} has invalid availability ${m.availability}`,
      );
    }
  });

  it("marks Clientes and Facturación unavailable, Trabajo and Informes preview", () => {
    assert.equal(byId("clients")?.availability, "unavailable");
    assert.equal(byId("billing")?.availability, "unavailable");
    assert.equal(byId("work")?.availability, "preview");
    assert.equal(byId("reports")?.availability, "preview");
  });

  it("never presents a non-implemented module as available", () => {
    const notAvailable = MODULES.filter((m) => m.availability !== "available");
    assert.ok(notAvailable.length >= 4);
    // Only Inicio and Configuración are implemented in this delivery.
    const available = MODULES.filter((m) => m.availability === "available");
    assert.deepEqual(
      available.map((m) => m.id),
      ["home", "settings"],
    );
  });

  it("describes Facturación with Colombian billing terms", () => {
    assert.equal(
      byId("billing")?.description,
      "Cuentas de cobro, pagos y saldos",
    );
  });

  it("has a Spanish label for every status", () => {
    const statuses: Availability[] = ["available", "preview", "unavailable"];
    assert.deepEqual(
      statuses.map((s) => AVAILABILITY_LABEL[s]),
      ["Disponible", "Vista previa", "No disponible todavía"],
    );
  });

  it("has unique ids and routes, each backed by an app page file", () => {
    assert.equal(new Set(MODULES.map((m) => m.id)).size, MODULES.length);
    assert.equal(new Set(MODULES.map((m) => m.href)).size, MODULES.length);
    for (const m of MODULES) {
      const segment = m.href === "/" ? "" : m.href.slice(1);
      const page = resolve(
        import.meta.dirname,
        "../../app/(app)",
        segment,
        "page.tsx",
      );
      assert.ok(existsSync(page), `missing ${page}`);
    }
  });
});

describe("isActive", () => {
  it("matches home only on the exact root path", () => {
    assert.equal(isActive("/", "/"), true);
    assert.equal(isActive("/", "/clients"), false);
    assert.equal(isActive("/clients", "/"), false);
  });

  it("matches a section on its exact path", () => {
    assert.equal(isActive("/work", "/work"), true);
  });

  it("does not match a different path sharing the prefix", () => {
    assert.equal(isActive("/work", "/workx"), false);
    assert.equal(isActive("/work", "/work-other"), false);
  });

  it("matches nested paths and a trailing slash", () => {
    assert.equal(isActive("/work", "/work/x"), true);
    assert.equal(isActive("/work", "/work/x/y"), true);
    assert.equal(isActive("/work", "/work/"), true);
  });
});
