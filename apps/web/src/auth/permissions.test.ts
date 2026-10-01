import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODULES } from "../shell/navigation.ts";
import { ROLE_NAMES } from "./access-control.ts";
import {
  canAccessModule,
  MODULE_ROLES,
  visibleModules,
} from "./permissions.ts";

describe("module permissions", () => {
  it("defines access for every navigation module", () => {
    assert.deepEqual(
      Object.keys(MODULE_ROLES).sort(),
      MODULES.map((m) => m.id).sort(),
    );
  });

  it("only uses existing roles", () => {
    for (const roles of Object.values(MODULE_ROLES)) {
      for (const role of roles) assert.ok(ROLE_NAMES.includes(role));
    }
  });

  it("lets admin use every module", () => {
    for (const m of MODULES) assert.equal(canAccessModule("admin", m.id), true);
  });

  it("lets staff use Inicio, Clientes, Trabajo and Informes, not Facturación", () => {
    assert.deepEqual(
      MODULES.filter((m) => canAccessModule("staff", m.id)).map((m) => m.id),
      ["home", "clients", "work", "reports"],
    );
    assert.equal(canAccessModule("staff", "billing"), false);
  });

  it("denies roles and modules it does not know", () => {
    assert.equal(canAccessModule("user" as never, "home"), false);
    assert.equal(canAccessModule("admin", "settings" as never), false);
  });

  it("lists the visible modules in navigation order", () => {
    assert.deepEqual(
      visibleModules("staff").map((m) => m.href),
      ["/", "/clients", "/work", "/reports"],
    );
    assert.deepEqual(
      visibleModules("admin").map((m) => m.href),
      MODULES.map((m) => m.href),
    );
  });
});
