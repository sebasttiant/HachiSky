import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthRouteHandlers } from "../../src/auth/http.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  type AdminActor,
  countUsers,
  createUser,
  getUser,
  listAudit,
  listAuditForUser,
  listUsers,
  resetPassword,
  revokeSessions,
  setActive,
  UserRuleError,
  updateUser,
} from "../../src/users/service.ts";
import {
  authRequest,
  cleanAuthTables,
  cookieHeader,
  createTestAuth,
  createTestPool,
  createTestUser,
  PASSWORD,
} from "../auth/support.ts";

const pool = createTestPool();
const auth = createTestAuth(pool);
const db = drizzle(pool, { schema });
const deps = { auth, db };
const { POST } = createAuthRouteHandlers(() => auth);

const TEMP = "temporal-segura-2026";

async function signIn(email: string, password = PASSWORD) {
  return POST(
    authRequest("/api/auth/sign-in/email", { body: { email, password } }),
  );
}

async function actorFor(email: string): Promise<AdminActor> {
  const response = await signIn(email);
  assert.equal(response.status, 200, `sign-in ${email}`);
  const { user } = (await response.json()) as { user: { id: string } };
  return {
    id: user.id,
    headers: new Headers({ cookie: cookieHeader(response) }),
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
}

async function sessionCount(userId: string) {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from session where user_id = $1",
    [userId],
  );
  return rows[0]?.n ?? -1;
}

async function auditActions(targetId: string) {
  const { rows } = await pool.query<{ action: string }>(
    "select action from audit_log where target_user_id = $1 order by id",
    [targetId],
  );
  return rows.map((row) => row.action);
}

async function ruleCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UserRuleError) return error.code;
    throw error;
  }
  return "no-error";
}

let admin: AdminActor;

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await createTestUser(auth, "admin@example.test", {
    name: "Ana Admin",
    role: "admin",
  });
  admin = await actorFor("admin@example.test");
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

describe("createUser", () => {
  it("creates a staff user who must change the temporary password, and audits it without the password", async () => {
    const created = await createUser(deps, admin, {
      name: "Luis Gómez",
      email: "luis@example.test",
      jobTitle: "Asesor comercial",
      role: "staff",
      temporaryPassword: TEMP,
    });
    const user = await getUser(deps, created.id);
    assert.equal(user?.name, "Luis Gómez");
    assert.equal(user?.jobTitle, "Asesor comercial");
    assert.equal(user?.role, "staff");
    assert.equal(user?.active, true);
    assert.equal(user?.mustChangePassword, true);
    assert.equal((await signIn("luis@example.test", TEMP)).status, 200);

    const { rows } = await pool.query(
      "select actor_user_id, action, details, ip_address from audit_log where target_user_id = $1",
      [created.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_user_id, admin.id);
    assert.equal(rows[0].action, "user.create");
    assert.equal(rows[0].ip_address, "203.0.113.7");
    assert.deepEqual(rows[0].details, {
      email: "luis@example.test",
      name: "Luis Gómez",
      jobTitle: "Asesor comercial",
      role: "staff",
    });
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(TEMP));
  });

  it("refuses an email that is already registered", async () => {
    assert.equal(
      await ruleCode(
        createUser(deps, admin, {
          name: "Otra Ana",
          email: "admin@example.test",
          jobTitle: null,
          role: "staff",
          temporaryPassword: TEMP,
        }),
      ),
      "email_taken",
    );
  });

  it("is rejected by Better Auth for a staff session even if called directly", async () => {
    await createTestUser(auth, "staff@example.test");
    const staff = await actorFor("staff@example.test");
    await assert.rejects(
      createUser(deps, staff, {
        name: "Intruso",
        email: "intruso@example.test",
        jobTitle: null,
        role: "admin",
        temporaryPassword: TEMP,
      }),
    );
    const { rows } = await pool.query(
      "select 1 from \"user\" where email = 'intruso@example.test'",
    );
    assert.equal(rows.length, 0);
  });
});

describe("updateUser", () => {
  it("updates name, job title and role and audits before/after", async () => {
    const target = await createTestUser(auth, "eva@example.test", {
      name: "Eva",
      jobTitle: "Auxiliar",
    });
    await updateUser(deps, admin, target.id, {
      name: "Eva Ríos",
      jobTitle: "Coordinadora",
      role: "admin",
    });
    const user = await getUser(deps, target.id);
    assert.deepEqual(
      { name: user?.name, jobTitle: user?.jobTitle, role: user?.role },
      { name: "Eva Ríos", jobTitle: "Coordinadora", role: "admin" },
    );
    const { rows } = await pool.query(
      "select details from audit_log where target_user_id = $1 and action = 'user.update'",
      [target.id],
    );
    assert.deepEqual(rows[0]?.details, {
      before: { name: "Eva", jobTitle: "Auxiliar", role: "staff" },
      after: { name: "Eva Ríos", jobTitle: "Coordinadora", role: "admin" },
    });
  });

  it("does not let an admin demote themselves", async () => {
    assert.equal(
      await ruleCode(
        updateUser(deps, admin, admin.id, {
          name: "Ana Admin",
          jobTitle: null,
          role: "staff",
        }),
      ),
      "self_demotion",
    );
  });

  it("answers not_found for an unknown user", async () => {
    assert.equal(
      await ruleCode(
        updateUser(deps, admin, "missing", {
          name: "X",
          jobTitle: null,
          role: "staff",
        }),
      ),
      "not_found",
    );
  });

  it("never leaves the system without an active admin under concurrent demotions", async () => {
    await createTestUser(auth, "beto@example.test", {
      name: "Beto",
      role: "admin",
    });
    const beto = await actorFor("beto@example.test");
    // Each request waits (bounded) for the other to pass its rule checks too.
    // Without serialization both see two admins and both demotions land.
    let arrived = 0;
    const racing = {
      ...deps,
      hooks: {
        afterRuleCheck: async () => {
          arrived += 1;
          const deadline = Date.now() + 750;
          while (arrived < 2 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        },
      },
    };
    const results = await Promise.allSettled([
      updateUser(racing, admin, beto.id, {
        name: "Beto",
        jobTitle: null,
        role: "staff",
      }),
      updateUser(racing, beto, admin.id, {
        name: "Ana Admin",
        jobTitle: null,
        role: "staff",
      }),
    ]);
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      1,
      "exactly one demotion wins",
    );
    const loser = results.find((r) => r.status === "rejected");
    assert.equal(
      loser?.status === "rejected" && (loser.reason as UserRuleError).code,
      "last_admin",
    );
    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from \"user\" where role = 'admin'",
    );
    assert.equal(rows[0]?.n, 1);
  });
});

describe("setActive", () => {
  it("deactivates a user, revokes every session and blocks sign-in; reactivating restores access", async () => {
    const target = await createTestUser(auth, "sara@example.test");
    await signIn("sara@example.test");
    await signIn("sara@example.test");
    assert.equal(await sessionCount(target.id), 2);

    await setActive(deps, admin, target.id, false);
    assert.equal((await getUser(deps, target.id))?.active, false);
    assert.equal(await sessionCount(target.id), 0);
    assert.notEqual((await signIn("sara@example.test")).status, 200);

    await setActive(deps, admin, target.id, true);
    assert.equal((await getUser(deps, target.id))?.active, true);
    assert.equal((await signIn("sara@example.test")).status, 200);
    assert.deepEqual(await auditActions(target.id), [
      "user.deactivate",
      "user.activate",
    ]);
  });

  it("does not let an admin deactivate themselves", async () => {
    assert.equal(
      await ruleCode(setActive(deps, admin, admin.id, false)),
      "self_deactivation",
    );
  });
});

describe("resetPassword and revokeSessions", () => {
  it("sets a new temporary password, forces the change and signs the user out everywhere", async () => {
    const target = await createTestUser(auth, "tom@example.test");
    await signIn("tom@example.test");
    await resetPassword(deps, admin, target.id, TEMP);

    assert.equal(await sessionCount(target.id), 0);
    assert.notEqual((await signIn("tom@example.test")).status, 200);
    assert.equal((await signIn("tom@example.test", TEMP)).status, 200);
    assert.equal((await getUser(deps, target.id))?.mustChangePassword, true);
    const { rows } = await pool.query(
      "select details from audit_log where target_user_id = $1",
      [target.id],
    );
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(TEMP));
    assert.deepEqual(await auditActions(target.id), ["user.password_reset"]);
  });

  it("refuses to reset the admin's own password from the panel", async () => {
    assert.equal(
      await ruleCode(resetPassword(deps, admin, admin.id, TEMP)),
      "self_password_reset",
    );
  });

  it("closes every session of a user", async () => {
    const target = await createTestUser(auth, "uma@example.test");
    await signIn("uma@example.test");
    await revokeSessions(deps, admin, target.id);
    assert.equal(await sessionCount(target.id), 0);
    assert.deepEqual(await auditActions(target.id), ["user.sessions_revoke"]);
  });
});

describe("listUsers and listAuditForUser", () => {
  it("filters by text, role and status", async () => {
    const luis = await createTestUser(auth, "luis@example.test", {
      name: "Luis Gómez",
    });
    await createTestUser(auth, "maria@example.test", { name: "María Paz" });
    await setActive(deps, admin, luis.id, false);

    const names = async (filters: Parameters<typeof listUsers>[1]) =>
      (await listUsers(deps, filters)).items.map((u) => u.name);

    assert.deepEqual(await names({}), ["Ana Admin", "Luis Gómez", "María Paz"]);
    assert.deepEqual(await names({ q: "GÓMEZ" }), ["Luis Gómez"]);
    assert.deepEqual(await names({ q: "maria@" }), ["María Paz"]);
    assert.deepEqual(await names({ role: "admin" }), ["Ana Admin"]);
    assert.deepEqual(await names({ status: "inactive" }), ["Luis Gómez"]);
    assert.deepEqual(await names({ status: "active", role: "staff" }), [
      "María Paz",
    ]);
    assert.deepEqual(await names({ q: "%" }), []);
    assert.deepEqual(await countUsers(deps), {
      active: 2,
      inactive: 1,
      mustChangePassword: 0,
    });
  });

  it("lists all activity with actor and target names, filterable by action, paged", async () => {
    const target = await createTestUser(auth, "ivan@example.test", {
      name: "Iván",
    });
    await revokeSessions(deps, admin, target.id);
    await setActive(deps, admin, target.id, false);
    const all = await listAudit(deps, { page: 1 });
    assert.deepEqual(
      all.items.map((e) => [e.action, e.actorName, e.targetName]),
      [
        ["user.deactivate", "Ana Admin", "Iván"],
        ["user.sessions_revoke", "Ana Admin", "Iván"],
      ],
    );
    assert.equal(all.hasMore, false);
    const only = await listAudit(deps, { page: 1, action: "user.deactivate" });
    assert.deepEqual(
      only.items.map((e) => e.action),
      ["user.deactivate"],
    );
  });

  it("returns a user's recent activity newest first with the actor's name", async () => {
    const target = await createTestUser(auth, "ivan@example.test");
    await revokeSessions(deps, admin, target.id);
    await resetPassword(deps, admin, target.id, TEMP);
    const entries = await listAuditForUser(deps, target.id);
    assert.deepEqual(
      entries.map((e) => [e.action, e.actorName]),
      [
        ["user.password_reset", "Ana Admin"],
        ["user.sessions_revoke", "Ana Admin"],
      ],
    );
  });
});
