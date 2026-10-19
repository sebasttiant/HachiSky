// Written reports (module "reports", staff and administrators).
export const REPORTS_PATH = "/reports";
export const NEW_REPORT_PATH = `${REPORTS_PATH}/new`;

export function reportPath(id: string): string {
  return `${REPORTS_PATH}/${encodeURIComponent(id)}`;
}

// The only way to read the bytes of a figure: an authenticated route, served
// to somebody who may reach the report holding it. Lives here so both the
// editing screen and the document can name it without the document pulling
// in a client component.
export function reportImagePath(id: string): string {
  return `/api/reports/images/${encodeURIComponent(id)}`;
}
