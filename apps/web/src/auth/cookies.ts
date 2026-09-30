import type { BetterAuthOptions } from "better-auth";
import type { AuthEnv } from "../shared/config/env.ts";

// Cookie behavior is derived from the validated base URL and set explicitly
// on every field that matters, so a Better Auth default change can never
// silently alter it. `loadAuthEnv` already rejects production over http.
//
//   https (production): `__Secure-` prefix, Secure, HttpOnly, Path=/, no Domain
//   http  (development/test): no prefix, no Secure, HttpOnly, Path=/, no Domain
//
// Never set: cookiePrefix, cross-subdomain cookies, a Domain attribute, or the
// session cookie cache (a cached session would outlive a revocation or ban).
export function resolveCookieOptions(
  env: AuthEnv,
): Pick<BetterAuthOptions, "advanced" | "session"> {
  const secure = new URL(env.BETTER_AUTH_URL).protocol === "https:";
  return {
    advanced: {
      useSecureCookies: secure,
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        secure,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
    session: { cookieCache: { enabled: false } },
  };
}
