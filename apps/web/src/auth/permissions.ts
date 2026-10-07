import { type AppModule, MODULES, type ModuleId } from "../shell/navigation.ts";
import type { RoleName } from "./session.ts";

// Which roles may use each module (owner, 2026-09-30). Enforced on the server
// by requireModule; the navigation only mirrors it.
export const MODULE_ROLES: Record<ModuleId, readonly RoleName[]> = {
  home: ["admin", "staff"],
  clients: ["admin", "staff"],
  work: ["admin", "staff"],
  reports: ["admin", "staff"],
  billing: ["admin"],
  settings: ["admin"],
};

export function canAccessModule(role: RoleName, module: ModuleId): boolean {
  return Object.hasOwn(MODULE_ROLES, module)
    ? MODULE_ROLES[module].includes(role)
    : false;
}

export function visibleModules(role: RoleName): AppModule[] {
  return MODULES.filter((module) => canAccessModule(role, module.id));
}
