import type { ModuleId } from "../shell/navigation.ts";
import { canAccessModule } from "./permissions.ts";
import type { AuthenticatedSession, SessionResolution } from "./session.ts";

// The answer of checkModuleAccess (guard.ts) for API route handlers that
// must reply with a status code (JSON 401/403) instead of a redirect to
// /login or the 403 page. Same rules as requireModule: a valid session, no
// pending password change, and a role allowed to use the module.
export type ModuleAccess =
  | { status: "authenticated"; session: AuthenticatedSession }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

export function moduleAccessDecision(
  resolution: SessionResolution,
  mustChangePassword: boolean,
  module: ModuleId,
): ModuleAccess {
  if (resolution.status !== "authenticated") {
    return { status: "unauthenticated" };
  }
  if (mustChangePassword) return { status: "forbidden" };
  if (!canAccessModule(resolution.user.role, module)) {
    return { status: "forbidden" };
  }
  return { status: "authenticated", session: resolution };
}
