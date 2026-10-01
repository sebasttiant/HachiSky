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
  // The bootstrap CLI disables logging so no error path can echo request data.
  logger?: NonNullable<Parameters<typeof betterAuth>[0]["logger"]>;
}

const DAY_SECONDS = 24 * 60 * 60;

// Sessions last 7 days and slide: once a session is older than `updateAge`,
// the next authenticated request pushes its expiry back to 7 days.
export const SESSION_POLICY = {
  expiresIn: 7 * DAY_SECONDS,
  updateAge: DAY_SECONDS,
} as const;

// Rate limiting runs inside `auth.handler` (HTTP only; server-side
// `auth.api.*` calls are not limited). Enabled explicitly because Better
// Auth's default depends on NODE_ENV. Memory storage is per process: correct
// for the single `web` container, lost on restart, and not shared if the app
// is ever scaled out (then switch to "database" or a secondary storage).
export const RATE_LIMIT_POLICY = {
  enabled: true,
  storage: "memory",
  window: 60,
  max: 100,
  customRules: {
    // Counts every sign-in attempt (successful or not) per client IP.
    "/sign-in/email": { window: 300, max: 10 },
  },
} as const;

export function createAuth({ env, database, logger }: CreateAuthOptions) {
  const cookieOptions = resolveCookieOptions(env);
  return betterAuth({
    appName: "HachiSky",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database,
    telemetry: { enabled: false },
    ...(logger ? { logger } : {}),
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
    session: { ...cookieOptions.session, ...SESSION_POLICY },
    rateLimit: {
      ...RATE_LIMIT_POLICY,
      customRules: { ...RATE_LIMIT_POLICY.customRules },
    },
    advanced: {
      ...cookieOptions.advanced,
      // Better Auth turns the origin/CSRF check off when NODE_ENV=test; keep
      // it on everywhere.
      disableOriginCheck: false,
      ipAddress: {
        // The client IP comes from X-Forwarded-For. With no reverse proxy in
        // front, `next start` fills it from the socket address only when the
        // client did not send one, so a client can spoof it (see README,
        // "Rate limiting"). Without a usable IP Better Auth falls back to one
        // shared bucket per path instead of skipping the limit.
        ipAddressHeaders: ["x-forwarded-for"],
        disableIpTracking: false,
      },
    },
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
