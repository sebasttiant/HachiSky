import type { Auth } from "./auth.ts";

// The only Better Auth endpoints reachable over HTTP. Everything else (public
// sign-up, admin endpoints, password reset, account linking, ...) answers 404
// before Better Auth sees the request. Server code keeps full access through
// `auth.api.*`, which does not go through this handler.
//
// An allowlist (exact method + exact pathname) instead of Better Auth's
// `disabledPaths` denylist: an endpoint added by a library upgrade or a new
// plugin stays unreachable until it is listed here on purpose.
export const AUTH_HTTP_ROUTES = [
  { method: "POST", path: "/api/auth/sign-in/email" },
  { method: "POST", path: "/api/auth/sign-out" },
  { method: "GET", path: "/api/auth/get-session" },
] as const;

const ALLOWED = new Set(
  AUTH_HTTP_ROUTES.map((route) => `${route.method} ${route.path}`),
);

function notFound() {
  return new Response("Not Found", { status: 404 });
}

export function isAllowedAuthRequest(request: Request): boolean {
  // `URL.pathname` keeps percent-encoding and dot segments are already
  // resolved, so an exact string match cannot be bypassed by encoded or
  // doubled slashes: any variant is simply not in the set.
  const { pathname } = new URL(request.url);
  return ALLOWED.has(`${request.method} ${pathname}`);
}

// `getAuth` is called per request so importing the route module never needs
// the auth environment (e.g. during `next build`).
export function createAuthRouteHandlers(getAuth: () => Auth) {
  const handler = async (request: Request) => {
    if (!isAllowedAuthRequest(request)) return notFound();
    return getAuth().handler(request);
  };
  return { GET: handler, POST: handler };
}
