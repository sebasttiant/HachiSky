import type { RoleName } from "../auth/session.ts";

// Per-operation permissions for clients (owner, 2026-10-01). Module access
// (`clients`) is checked by requireModule; these rules refine it per
// operation. Enforced by the service on every call; the UI only mirrors them.
export type ClientOperation =
  | "view"
  | "create"
  | "edit"
  | "deactivate"
  | "reactivate";

export const CLIENT_PERMISSIONS: Record<ClientOperation, readonly RoleName[]> =
  {
    view: ["admin", "staff"],
    create: ["admin", "staff"],
    edit: ["admin", "staff"],
    deactivate: ["admin"],
    reactivate: ["admin"],
  };

export function canPerformClientOperation(
  role: unknown,
  operation: ClientOperation,
): boolean {
  return (
    typeof role === "string" &&
    (CLIENT_PERMISSIONS[operation] as readonly string[]).includes(role)
  );
}
