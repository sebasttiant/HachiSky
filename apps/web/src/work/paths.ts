// Recorded work activities (module "work", staff and administrators).
export const WORK_PATH = "/work";
export const NEW_ACTIVITY_PATH = `${WORK_PATH}/new`;

export function activityPath(id: string): string {
  return `${WORK_PATH}/${encodeURIComponent(id)}`;
}
