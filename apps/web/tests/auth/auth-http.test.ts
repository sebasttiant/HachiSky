import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  AUTH_HTTP_ROUTES,
  createAuthRouteHandlers,
} from "../../src/auth/http.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  authRequest,
  cleanAuthTables,
  cookieHeader,
  createTestAuth,
  createTestPool,
  createTestUser,
  nextClientIp,
  PASSWORD,
  sessionSetCookie,
  sessionTokenFrom,
} from "./support.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const pool = createTestPool();
const auth = createTestAuth(pool);
const handlers = createAuthRouteHandlers(() => auth);

function dispatch(request: Request) {
  const method = request.method as keyof typeof handlers;
  const handler = handlers[method];
  assert.ok(handler, `no handler exported for ${request.method}`);
  return handler(request);
}

async function signIn(email: string, password = PASSWORD, ip?: string) {
  return dispatch(
    authRequest("/api/auth/sign-in/email", {
      body: { email, password },
      ip,
    }),
  );
}

async function sessionRows(userId: string) {
  const result = await pool.query<{ token: string; expires_at: Date }>(
    "select token, expires_at from session where user_id = $1",
    [userId],
  );
  return result.rows;
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

describe("route file", () => {
  it("mounts the auth handler at app/api/auth/[...all]/route.ts", () => {
    const route = new URL(
      "../../app/api/auth/[...all]/route.ts",
      import.meta.url,
    );
    assert.ok(existsSync(route), "route file must exist");
    const source = readFileSync(route, "utf8");
    assert.match(source, /createAuthRouteHandlers\(/);
    // Only the methods the allowlist needs.
    assert.match(source, /export const \{ GET, POST \}/);
  });
});

describe("endpoint allowlist", () => {
  it("allows exactly sign-in (email), sign-out and get-session", () => {
    assert.deepEqual(
      AUTH_HTTP_ROUTES.map((route) => `${route.method} ${route.path}`).sort(),
      [
        "GET /api/auth/get-session",
        "POST /api/auth/sign-in/email",
        "POST /api/auth/sign-out",
      ],
    );
  });

  it("answers 404 for every other Better Auth endpoint, including sign-up and admin", async () => {
    const allowed = new Set(
      AUTH_HTTP_ROUTES.map((route) => `${route.method} ${route.path}`),
    );
    const paths = Object.values(auth.api)
      .map((endpoint) => (endpoint as { path?: string }).path)
      .filter((path): path is string => typeof path === "string");
    assert.ok(paths.includes("/sign-up/email"));
    assert.ok(paths.includes("/admin/create-user"));
    let checked = 0;
    for (const path of paths) {
      const concrete = path.replace(/:[a-zA-Z]+/g, "x");
      for (const method of ["GET", "POST"] as const) {
        const full = `/api/auth${concrete}`;
        if (allowed.has(`${method} ${full}`)) continue;
        const response = await dispatch(
          authRequest(full, {
            method,
            body: method === "POST" ? {} : undefined,
          }),
        );
        assert.equal(response.status, 404, `${method} ${full}`);
        checked += 1;
      }
    }
    assert.ok(checked > 60, `expected many blocked routes, got ${checked}`);
  });

  it("does not match path variants of an allowed route", async () => {
    for (const path of [
      "/api/auth/sign-in/email/",
      "/api/auth//sign-in/email",
      "/api/auth/sign-in/EMAIL",
      "/api/auth/sign-in%2Femail",
      "/api/auth/get-session/../sign-up/email",
    ]) {
      const response = await dispatch(
        authRequest(path, { body: { email: "a@example.test", password: "x" } }),
      );
      assert.equal(response.status, 404, path);
    }
  });

  it("keeps public sign-up unreachable over HTTP", async () => {
    const response = await dispatch(
      authRequest("/api/auth/sign-up/email", {
        body: {
          email: "self@example.test",
          password: PASSWORD,
          name: "Self",
        },
      }),
    );
    assert.equal(response.status, 404);
    const users = await pool.query('select count(*)::int as n from "user"');
    assert.equal(users.rows[0]?.n, 0);
  });
});

describe("sign-in and sessions", () => {
  it("sets an HttpOnly session cookie and stores a 7-day session", async () => {
    const user = await createTestUser(auth, "session@example.test");
    const response = await signIn("session@example.test");
    assert.equal(response.status, 200);
    const setCookie = sessionSetCookie(response);
    assert.ok(setCookie, "session cookie must be set");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Max-Age=604800/i);
    assert.match(setCookie, /SameSite=Lax/i);

    const rows = await sessionRows(user.id);
    assert.equal(rows.length, 1);
    const remaining = (rows[0]?.expires_at.getTime() ?? 0) - Date.now();
    assert.ok(
      Math.abs(remaining - 7 * DAY_MS) < 60_000,
      `expected ~7 days, got ${remaining} ms`,
    );
  });

  it("returns the same generic 401 for an unknown email and a wrong password", async () => {
    await createTestUser(auth, "known@example.test");
    const wrong = await signIn("known@example.test", "not-the-password");
    const unknown = await signIn("nobody@example.test", "not-the-password");
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });

  it("resolves the session over GET /api/auth/get-session", async () => {
    await createTestUser(auth, "get@example.test", {
      name: "Get Session",
      jobTitle: "Advisor",
    });
    const cookie = cookieHeader(await signIn("get@example.test"));
    const response = await dispatch(
      authRequest("/api/auth/get-session", { cookie }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      user: { name: string; jobTitle: string };
    };
    assert.equal(body.user.name, "Get Session");
    assert.equal(body.user.jobTitle, "Advisor");
  });

  it("renews a session used after updateAge (1 day) back to 7 days", async () => {
    const user = await createTestUser(auth, "renew@example.test");
    const cookie = cookieHeader(await signIn("renew@example.test"));
    const token = sessionTokenFrom(cookie);
    // Pretend the session was last renewed two days ago.
    await pool.query(
      "update session set expires_at = now() + interval '5 days' where token = $1",
      [token],
    );
    const response = await dispatch(
      authRequest("/api/auth/get-session", { cookie }),
    );
    assert.equal(response.status, 200);
    const refreshed = sessionSetCookie(response);
    assert.ok(refreshed, "renewal must re-send the session cookie");
    assert.match(refreshed, /Max-Age=604800/i);
    const [row] = await sessionRows(user.id);
    const remaining = (row?.expires_at.getTime() ?? 0) - Date.now();
    assert.ok(
      Math.abs(remaining - 7 * DAY_MS) < 60_000,
      `expected ~7 days after renewal, got ${remaining} ms`,
    );
  });

  it("rejects a cookie-bearing POST from a foreign origin", async () => {
    await createTestUser(auth, "origin@example.test");
    const cookie = cookieHeader(await signIn("origin@example.test"));
    const response = await dispatch(
      authRequest("/api/auth/sign-out", {
        body: {},
        cookie,
        origin: "https://evil.example",
      }),
    );
    assert.equal(response.status, 403);
  });
});

describe("sign-out", () => {
  it("deletes the session row and clears the cookie", async () => {
    const user = await createTestUser(auth, "logout@example.test");
    const cookie = cookieHeader(await signIn("logout@example.test"));
    assert.equal((await sessionRows(user.id)).length, 1);

    const response = await dispatch(
      authRequest("/api/auth/sign-out", { body: {}, cookie }),
    );
    assert.equal(response.status, 200);
    const cleared = sessionSetCookie(response);
    assert.ok(cleared, "sign-out must overwrite the session cookie");
    assert.match(cleared, /Max-Age=0/i);
    assert.equal((await sessionRows(user.id)).length, 0);

    const after = await dispatch(
      authRequest("/api/auth/get-session", { cookie }),
    );
    assert.equal(await after.json(), null);
  });
});

describe("rate limiting", () => {
  it("is enabled explicitly with in-memory storage, independent of NODE_ENV", () => {
    assert.equal(auth.options.rateLimit?.enabled, true);
    assert.equal(auth.options.rateLimit?.storage, "memory");
  });

  it("answers 429 after repeated failed sign-ins from one client IP", async () => {
    await createTestUser(auth, "limited@example.test");
    const ip = nextClientIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await signIn("limited@example.test", "wrong-pass", ip);
      statuses.push(response.status);
    }
    const firstLimited = statuses.indexOf(429);
    assert.ok(firstLimited > 0, `expected a 429, got ${statuses.join(",")}`);
    assert.ok(
      statuses.slice(0, firstLimited).every((status) => status === 401),
      statuses.join(","),
    );
    assert.ok(statuses.slice(firstLimited).every((status) => status === 429));

    // Even the right password is refused while the window is exhausted.
    const blocked = await signIn("limited@example.test", PASSWORD, ip);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("x-retry-after"));

    // Another client IP is not affected.
    const other = await signIn("limited@example.test", PASSWORD);
    assert.equal(other.status, 200);
  });
});
