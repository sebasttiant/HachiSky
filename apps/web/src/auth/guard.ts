import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth.ts";
import { loginPath } from "./next-path.ts";
import { type AuthenticatedSession, resolveSession } from "./session.ts";

// Authoritative server-side session check (data-access layer). Deduplicated
// per request, so a layout and a page can both ask without a second query.
// `headers()` must run before `getAuth()`: it opts the route out of
// prerendering, so `next build` never needs the auth environment.
export const getCurrentSession = cache(async () => {
  const requestHeaders = await headers();
  return resolveSession(getAuth(), requestHeaders);
});

// Every protected page, route handler and Server Function calls this with its
// own route (enforced by tests/auth/route-guards.test.ts). Layouts are not
// enough: they do not re-run on client-side navigation.
export async function requireSession(
  currentPath: string,
): Promise<AuthenticatedSession> {
  const result = await getCurrentSession();
  if (result.status !== "authenticated") redirect(loginPath(currentPath));
  return result;
}
