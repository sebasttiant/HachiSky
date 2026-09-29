import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { getDb } from "../db/client.ts";
import * as schema from "../db/schema/index.ts";
import { type AuthEnv, loadAuthEnv } from "../shared/config/env.ts";
import { ADMIN_ROLES, ac, DEFAULT_ROLE, roles } from "./access-control.ts";
import { resolveCookieOptions } from "./cookies.ts";

export interface CreateAuthOptions {
  env: AuthEnv;
  // Injectable so unit tests can run without a database.
  database: Parameters<typeof betterAuth>[0]["database"];
}

export function createAuth({ env, database }: CreateAuthOptions) {
  return betterAuth({
    appName: "HachiSky",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database,
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // Accounts are created only by an administrator (or the bootstrap CLI).
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        // Job title is descriptive and separate from the access role. It is
        // set by an administrator through createUser `data`; `input: false`
        // keeps users from editing it through the self-service update.
        jobTitle: { type: "string", required: false, input: false },
      },
    },
    ...resolveCookieOptions(env),
    plugins: [
      admin({
        ac,
        roles,
        defaultRole: DEFAULT_ROLE,
        adminRoles: [...ADMIN_ROLES],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

// Lazily built singleton over the app's shared pg pool. Nothing here runs at
// import time, so importing this module never requires auth secrets.
export function getAuth(): Auth {
  if (!instance) {
    instance = createAuth({
      env: loadAuthEnv(),
      database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    });
  }
  return instance;
}
