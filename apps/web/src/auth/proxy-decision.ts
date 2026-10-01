import { getSessionCookie } from "better-auth/cookies";
import type { Auth } from "./auth.ts";
import { loginPath } from "./next-path.ts";
import { resolveSession } from "./session.ts";

// Reachable without a session. Everything else needs one.
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth/")
  );
}

export type ProxyDecision =
  | { type: "next"; setCookies: string[] }
  | { type: "redirect"; location: string; setCookies: string[] };

// Optimistic check run by proxy.ts before rendering. It redirects early and
// renews the session cookie (the proxy can write response headers; Server
// Components cannot). It is NOT the authorization boundary: every page and
// data entry point still calls requireSession (src/auth/guard.ts).
export async function decideProxy(
  auth: Auth,
  request: Request,
): Promise<ProxyDecision> {
  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return { type: "next", setCookies: [] };
  const location = loginPath(`${url.pathname}${url.search}`);
  // No cookie at all: skip the database lookup.
  if (!getSessionCookie(request)) {
    return { type: "redirect", location, setCookies: [] };
  }
  const result = await resolveSession(auth, request.headers, { refresh: true });
  if (result.status === "authenticated") {
    return { type: "next", setCookies: result.setCookies };
  }
  return { type: "redirect", location, setCookies: result.setCookies };
}
