// Written reports (module "reports", staff and administrators).
export const REPORTS_PATH = "/reports";
export const NEW_REPORT_PATH = `${REPORTS_PATH}/new`;

export function reportPath(id: string): string {
  return `${REPORTS_PATH}/${encodeURIComponent(id)}`;
}
