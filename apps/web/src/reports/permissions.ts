import type { RoleName } from "../auth/session.ts";

// A report is personal in the same way recorded work is: its author writes
// and corrects it, an administrator reaches every one (owner, 2026-10-10).
//
// Being allowed into the Informes module is not being allowed at somebody
// else's draft, so the service checks ownership on every read and write.
export type ReportOperation =
  | "view_reports"
  | "create_report"
  | "edit_report"
  | "issue_report"
  | "delete_report";

export const REPORT_PERMISSIONS: Record<ReportOperation, readonly RoleName[]> =
  {
    view_reports: ["admin", "staff"],
    create_report: ["admin", "staff"],
    edit_report: ["admin", "staff"],
    issue_report: ["admin", "staff"],
    delete_report: ["admin", "staff"],
  };

export function canPerformReportOperation(
  role: unknown,
  operation: ReportOperation,
): boolean {
  return (
    typeof role === "string" &&
    (REPORT_PERMISSIONS[operation] as readonly string[]).includes(role)
  );
}

export function canReachReport(
  role: RoleName,
  actorId: string,
  authorUserId: string,
): boolean {
  return role === "admin" || actorId === authorUserId;
}
