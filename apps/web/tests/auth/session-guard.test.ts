import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createAuthRouteHandlers } from "../../src/auth/http.ts";
import { decideProxy, isPublicPath } from "../../src/auth/proxy-decision.ts";
import { resolveSession } from "../../src/auth/session.ts";
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
  ORIGIN,
  SESSION_COOKIE,
} from "./support.ts";

const pool = createTestPool();
const auth = createTestAuth(pool);
const { POST } = createAuthRouteHandlers(() => auth);

async function signedInCookie(email: string) {
  const response = await POST(
    authRequest("/api/auth/sign-in/email", {
      body: { email, password: "correct-horse-battery-staple-22" },
    }),
  );
  assert.equal(response.status, 200);
  return cookieHeader(response);
}

function headersWith(cookie?: string) {
  return new Headers(cookie ? { cookie } : {});
}

async function sessionCount(userId: string) {
  const result = await pool.query<{ n: number }>(
    "select count(*)::int as n from session where user_id = $1",
    [userId],
  );
  return result.rows[0]?.n ?? -1;
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

describe("resolveSession", () => {
  it("is anonymous without a cookie or with a forged one", async () => {
    assert.equal(
      (await resolveSession(auth, headersWith())).status,
      "anonymous",
    );
    const forged = await resolveSession(
      auth,
      headersWith(`${SESSION_COOKIE}=forged.value`),
    );
    assert.equal(forged.status, "anonymous");
  });

  it("returns the signed-in user's name, job title and role", async () => {
    await createTestUser(auth, "ana@example.test", {
      name: "Ana Pérez",
      jobTitle: "Asesora de seguros",
      role: "admin",
    });
    const cookie = await signedInCookie("ana@example.test");
    const result = await resolveSession(auth, headersWith(cookie));
    assert.equal(result.status, "authenticated");
    if (result.status !== "authenticated") return;
    assert.equal(result.user.name, "Ana Pérez");
    assert.equal(result.user.jobTitle, "Asesora de seguros");
    assert.equal(result.user.role, "admin");
    assert.equal(result.user.email, "ana@example.test");
  });

  it("denies a user banned after the session was created and deletes their sessions", async () => {
    const user = await createTestUser(auth, "banned@example.test");
    const cookie = await signedInCookie("banned@example.test");
    const second = await signedInCookie("banned@example.test");
    assert.equal(
      (await resolveSession(auth, headersWith(cookie))).status,
      "authenticated",
    );
    assert.equal(await sessionCount(user.id), 2);

    // Ban directly in the database: Better Auth's own banUser would already
    // delete the sessions, so this is the case the guard must catch.
    await pool.query('update "user" set banned = true where id = $1', [
      user.id,
    ]);

    const result = await resolveSession(auth, headersWith(cookie));
    assert.deepEqual(
      { status: result.status, reason: "reason" in result && result.reason },
      { status: "denied", reason: "banned" },
    );
    assert.equal(await sessionCount(user.id), 0, "all sessions deleted");
    // The other device is denied too.
    assert.equal(
      (await resolveSession(auth, headersWith(second))).status,
      "anonymous",
    );
  });

  it("denies a ban that has not expired yet", async () => {
    const user = await createTestUser(auth, "temp-ban@example.test");
    const cookie = await signedInCookie("temp-ban@example.test");
    await pool.query(
      `update "user" set banned = true, ban_expires = now() + interval '1 hour' where id = $1`,
      [user.id],
    );
    assert.equal(
      (await resolveSession(auth, headersWith(cookie))).status,
      "denied",
    );
  });

  it("allows a user whose ban has expired", async () => {
    const user = await createTestUser(auth, "expired-ban@example.test");
    const cookie = await signedInCookie("expired-ban@example.test");
    await pool.query(
      `update "user" set banned = true, ban_expires = now() - interval '1 minute' where id = $1`,
      [user.id],
    );
    assert.equal(
      (await resolveSession(auth, headersWith(cookie))).status,
      "authenticated",
    );
  });

  it("denies a role other than admin or staff", async () => {
    const user = await createTestUser(auth, "odd-role@example.test");
    const cookie = await signedInCookie("odd-role@example.test");
    await pool.query(`update "user" set role = 'user' where id = $1`, [
      user.id,
    ]);
    const result = await resolveSession(auth, headersWith(cookie));
    assert.deepEqual(
      { status: result.status, reason: "reason" in result && result.reason },
      { status: "denied", reason: "invalid_role" },
    );
  });

  it("does not renew the session unless asked to", async () => {
    await createTestUser(auth, "no-renew@example.test");
    const cookie = await signedInCookie("no-renew@example.test");
    await pool.query(
      "update session set expires_at = now() + interval '5 days'",
    );
    const passive = await resolveSession(auth, headersWith(cookie));
    assert.equal(passive.status, "authenticated");
    if (passive.status !== "authenticated") return;
    assert.deepEqual(passive.setCookies, []);

    const renewing = await resolveSession(auth, headersWith(cookie), {
      refresh: true,
    });
    assert.equal(renewing.status, "authenticated");
    if (renewing.status !== "authenticated") return;
    assert.ok(
      renewing.setCookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`)),
    );
  });
});

describe("isPublicPath", () => {
  it("treats only /login, the auth endpoints and the health check as public", () => {
    for (const path of [
      "/login",
      "/api/health",
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
    ]) {
      assert.equal(isPublicPath(path), true, path);
    }
    for (const path of [
      "/",
      "/work",
      "/login/extra",
      "/loginx",
      "/api/healthz",
      "/api/auth",
      "/api/authx/sign-in",
      "/reports",
    ]) {
      assert.equal(isPublicPath(path), false, path);
    }
  });
});

describe("decideProxy", () => {
  function pageRequest(path: string, cookie?: string) {
    return new Request(`${ORIGIN}${path}`, {
      headers: headersWith(cookie),
    });
  }

  it("redirects an anonymous request to /login with the requested path", async () => {
    const decision = await decideProxy(auth, pageRequest("/work?day=1"));
    assert.deepEqual(decision, {
      type: "redirect",
      location: "/login?next=%2Fwork%3Fday%3D1",
      setCookies: [],
    });
  });

  it("lets public paths through without a session", async () => {
    for (const path of ["/login", "/api/health", "/api/auth/get-session"]) {
      const decision = await decideProxy(auth, pageRequest(path));
      assert.equal(decision.type, "next", path);
    }
  });

  it("lets a valid session through and forwards the renewal cookie", async () => {
    await createTestUser(auth, "proxy@example.test");
    const cookie = await signedInCookie("proxy@example.test");
    await pool.query(
      "update session set expires_at = now() + interval '5 days'",
    );
    const decision = await decideProxy(auth, pageRequest("/work", cookie));
    assert.equal(decision.type, "next");
    assert.ok(
      decision.setCookies.some((c) =>
        /^better-auth\.session_token=.+Max-Age=604800/i.test(c),
      ),
    );
  });

  it("redirects a banned user and expires the cookie", async () => {
    const user = await createTestUser(auth, "proxy-ban@example.test");
    const cookie = await signedInCookie("proxy-ban@example.test");
    await pool.query('update "user" set banned = true where id = $1', [
      user.id,
    ]);
    const decision = await decideProxy(auth, pageRequest("/work", cookie));
    assert.equal(decision.type, "redirect");
    assert.equal(
      decision.type === "redirect" && decision.location,
      "/login?next=%2Fwork",
    );
    assert.ok(
      decision.setCookies.some((c) =>
        /^better-auth\.session_token=;.*Max-Age=0/i.test(c),
      ),
      decision.setCookies.join(" | "),
    );
    assert.equal(await sessionCount(user.id), 0);
  });
});
