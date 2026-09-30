import { ROLE_NAMES } from "./access-control.ts";
import type { Auth } from "./auth.ts";

export type RoleName = (typeof ROLE_NAMES)[number];

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  jobTitle: string | null;
}

// `setCookies` carries the Set-Cookie headers Better Auth produced (session
// renewal, or expiring a dead cookie). Only callers that can write response
// headers (the proxy) forward them.
export type SessionResolution =
  | { status: "authenticated"; user: SessionUser; setCookies: string[] }
  | { status: "anonymous"; setCookies: string[] }
  | {
      status: "denied";
      reason: "banned" | "invalid_role";
      setCookies: string[];
    };

export type AuthenticatedSession = Extract<
  SessionResolution,
  { status: "authenticated" }
>;

interface BanFields {
  banned?: boolean | null;
  banExpires?: Date | string | null;
}

// Same semantics as Better Auth's admin plugin at sign-in: a ban without an
// expiry is permanent; an expired ban no longer applies.
export function isBanActive(user: BanFields, now = new Date()): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires).getTime() > now.getTime();
}

function isRoleName(role: unknown): role is RoleName {
  return typeof role === "string" && ROLE_NAMES.includes(role as RoleName);
}

// Better Auth's getSession does NOT check bans (the admin plugin only blocks
// new sign-ins, and its banUser endpoint deletes sessions). A ban written any
// other way would leave existing sessions valid, so every guarded access
// checks it here. A denied user loses ALL their sessions, like banUser does.
//
// `refresh: false` (default) never renews the session: Server Components
// cannot write the renewed cookie, which would leave the database expiry and
// the cookie out of sync. The proxy passes `refresh: true` and forwards the
// cookie.
export async function resolveSession(
  auth: Auth,
  headers: Headers,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<SessionResolution> {
  const lookup = () =>
    auth.api.getSession({
      headers,
      query: refresh ? {} : { disableRefresh: true },
      returnHeaders: true,
    });
  const { headers: responseHeaders, response } = await lookup();
  const setCookies = responseHeaders.getSetCookie();
  if (!response) return { status: "anonymous", setCookies };

  const user = response.user as typeof response.user &
    BanFields & { role?: unknown; jobTitle?: string | null };
  const reason = isBanActive(user)
    ? "banned"
    : isRoleName(user.role)
      ? null
      : "invalid_role";
  if (reason) {
    const context = await auth.$context;
    await context.internalAdapter.deleteUserSessions(user.id);
    // The session is gone now, so a second lookup makes Better Auth emit the
    // headers that expire the session cookie.
    const cleared = await lookup();
    return {
      status: "denied",
      reason,
      setCookies: cleared.headers.getSetCookie(),
    };
  }
  return {
    status: "authenticated",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as RoleName,
      jobTitle: user.jobTitle ?? null,
    },
    setCookies,
  };
}
