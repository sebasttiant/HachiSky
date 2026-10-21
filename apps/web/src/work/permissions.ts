import type { RoleName } from "../auth/session.ts";

// Recorded work is personal: a colleague reads and corrects their own
// entries, an administrator reaches every entry (owner, 2026-10-10).
//
// Module access is a different question and already answered in
// src/auth/permissions.ts: both roles may open Trabajo. Being allowed into
// the module is not being allowed at somebody else's rows, so the service
// checks ownership on every read and every write.
export type WorkOperation =
  | "view_activities"
  | "create_activity"
  | "edit_activity"
  | "delete_activity";

export const WORK_PERMISSIONS: Record<WorkOperation, readonly RoleName[]> = {
  view_activities: ["admin", "staff"],
  create_activity: ["admin", "staff"],
  edit_activity: ["admin", "staff"],
  delete_activity: ["admin", "staff"],
};

export function canPerformWorkOperation(
  role: unknown,
  operation: WorkOperation,
): boolean {
  return (
    typeof role === "string" &&
    (WORK_PERMISSIONS[operation] as readonly string[]).includes(role)
  );
}

// Who may reach a row once the operation itself is allowed.
export function canReachActivity(
  role: RoleName,
  actorId: string,
  authorUserId: string,
): boolean {
  return role === "admin" || actorId === authorUserId;
}
