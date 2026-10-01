// Shared helpers for the auth integration suites. Not a test file itself
// (the runner only picks up `*.test.ts`).
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAuth } from "../../src/auth/auth.ts";
import { buildPoolConfig } from "../../src/db/client.ts";
import * as schema from "../../src/db/schema/index.ts";
import { loadAuthEnv, loadEnv } from "../../src/shared/config/env.ts";

export const ORIGIN = "http://127.0.0.1:3100";
export const PASSWORD = "correct-horse-battery-staple-22";
export const SESSION_COOKIE = "better-auth.session_token";

export function createTestPool() {
  return new Pool({ ...buildPoolConfig(loadEnv()), max: 4 });
}

export function createTestAuth(pool: Pool) {
  return createAuth({
    env: loadAuthEnv({
      APP_ENV: "test",
      BETTER_AUTH_URL: ORIGIN,
      BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdef-0123456789",
    }),
    database: drizzleAdapter(drizzle(pool, { schema }), {
      provider: "pg",
      schema,
    }),
  });
}

export type TestAuth = ReturnType<typeof createTestAuth>;

export async function cleanAuthTables(pool: Pool) {
  await pool.query(
    'truncate table admin_bootstrap, session, account, verification, "user" cascade',
  );
}

export async function createTestUser(
  auth: TestAuth,
  email: string,
  extra: { role?: "admin" | "staff"; name?: string; jobTitle?: string } = {},
) {
  const { user } = await auth.api.createUser({
    body: {
      email,
      password: PASSWORD,
      name: extra.name ?? "Test User",
      role: extra.role ?? "staff",
      ...(extra.jobTitle ? { data: { jobTitle: extra.jobTitle } } : {}),
    },
  });
  return user;
}

// Unique client IP per call so rate-limit buckets (process-wide memory
// storage) never leak between tests.
let ipCounter = 10;
export function nextClientIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

export function authRequest(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    cookie?: string;
    ip?: string;
    origin?: string | null;
  } = {},
) {
  const headers = new Headers({ "x-forwarded-for": init.ip ?? nextClientIp() });
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body,
  });
}

// `name=value` pairs of every Set-Cookie on the response.
export function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function sessionSetCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

export function sessionTokenFrom(cookie: string) {
  const pair = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  // The cookie value is `<token>.<signature>`, URL-encoded.
  return decodeURIComponent(pair?.slice(SESSION_COOKIE.length + 1) ?? "").split(
    ".",
  )[0];
}
