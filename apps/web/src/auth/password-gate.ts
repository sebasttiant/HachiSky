import { safeNextPath } from "./next-path.ts";

export const CHANGE_PASSWORD_PATH = "/account/password";
export const PASSWORD_CHANGED_PARAM = "cambiada";

// While an administrator-set password is pending a change, every protected
// page sends the user to the change page, and back where they were going
// afterwards.
export function passwordGateRedirect(
  mustChangePassword: boolean,
  currentPath: string,
): string | null {
  if (!mustChangePassword || currentPath === CHANGE_PASSWORD_PATH) return null;
  const next = safeNextPath(currentPath);
  return next === "/"
    ? CHANGE_PASSWORD_PATH
    : `${CHANGE_PASSWORD_PATH}?next=${encodeURIComponent(next)}`;
}
