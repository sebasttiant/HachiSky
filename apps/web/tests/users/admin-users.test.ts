import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Auth } from "../../src/auth/auth.ts";
import { createAuthRouteHandlers } from "../../src/auth/http.ts";
import { resolveSession } from "../../src/auth/session.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  type AdminActor,
  changeOwnPassword,
  countUsers,
  createUser,
  getMustChangePassword,
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
    "select action from audit_log where target_user_id = $1 and action not like '%.requested' order by id",
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

// What the session guard grants after signing in with `password`: "full"
// only for an authenticated session (not banned, valid role) with no pending
// forced password change.
async function appAccess(email: string, password: string) {
  const response = await signIn(email, password);
  if (response.status !== 200) return "sign_in_refused";
  const session = await resolveSession(
    auth,
    new Headers({ cookie: cookieHeader(response) }),
  );
  if (session.status !== "authenticated") return `session_${session.status}`;
  if (await getMustChangePassword(deps, session.user.id)) {
    return "forced_change";
  }
  return "full";
}

async function userIdByEmail(email: string) {
  const { rows } = await pool.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email],
  );
  return rows[0]?.id;
}

// Fault injection at the database: every INSERT into `table` matching
// `condition` (SQL over NEW) fails while `run` executes.
async function withInsertFault<T>(
  table: "user_security" | "audit_log",
  condition: string,
  run: () => Promise<T>,
): Promise<T> {
  await pool.query(`create or replace function test_insert_fault() returns trigger
    language plpgsql as $$ begin
      if ${condition} then raise exception 'injected fault'; end if;
      return new;
    end $$`);
  await pool.query(
    `create trigger test_insert_fault before insert on ${table} for each row execute function test_insert_fault()`,
  );
  try {
    return await run();
  } finally {
    await pool.query(`drop trigger if exists test_insert_fault on ${table}`);
  }
}

const injected = () => Promise.reject(new Error("injected auth failure"));

// The real auth instance with some admin endpoints replaced.
function authWith(overrides: Partial<Record<keyof Auth["api"], unknown>>) {
  return { ...auth, api: { ...auth.api, ...overrides } } as Auth;
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
    const { requestId, ...details } = rows[0].details;
    assert.match(requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(details, {
      email: "luis@example.test",
      name: "Luis Gómez",
      jobTitle: "Asesor comercial",
      role: "staff",
    });
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(TEMP));
  });

  const luis = {
    name: "Luis Gómez",
    email: "luis@example.test",
    jobTitle: null,
    role: "staff" as const,
    temporaryPassword: TEMP,
  };

  it("never gives app access when the forced change cannot be recorded and blocking the account fails too", async () => {
    const failing = {
      ...deps,
      auth: authWith({ banUser: injected, unbanUser: injected }),
    };
    await assert.rejects(
      withInsertFault("user_security", "true", () =>
        createUser(failing, admin, luis),
      ),
    );
    const id = await userIdByEmail(luis.email);
    assert.ok(id, "the account was created");
    assert.equal(await appAccess(luis.email, TEMP), "sign_in_refused");
    assert.equal((await getUser(deps, id))?.active, false);
  });

  it("never gives app access when the creation audit fails and blocking the account fails too", async () => {
    const failing = {
      ...deps,
      auth: authWith({ banUser: injected, unbanUser: injected }),
    };
    await assert.rejects(
      withInsertFault("audit_log", "new.action = 'user.create'", () =>
        createUser(failing, admin, luis),
      ),
    );
    assert.notEqual(await appAccess(luis.email, TEMP), "full");
  });

  it("keeps the account blocked, with the forced change recorded, when the final activation fails", async () => {
    const failing = { ...deps, auth: authWith({ unbanUser: injected }) };
    await assert.rejects(createUser(failing, admin, luis));
    const id = await userIdByEmail(luis.email);
    assert.ok(id);
    assert.equal(await appAccess(luis.email, TEMP), "sign_in_refused");
    assert.equal(await getMustChangePassword(deps, id), true);
  });

  it("still forces the change when an incomplete account is reactivated from the panel", async () => {
    await assert.rejects(
      withInsertFault("user_security", "true", () =>
        createUser(deps, admin, luis),
      ),
    );
    const id = await userIdByEmail(luis.email);
    assert.ok(id);
    await setActive(deps, admin, id, true);
    assert.equal(await appAccess(luis.email, TEMP), "forced_change");
  });

  it("does not force a change on the recorded bootstrap admin when reactivated", async () => {
    const owner = await createTestUser(auth, "owner@example.test", {
      name: "Olga Owner",
      role: "admin",
    });
    await pool.query(
      "insert into admin_bootstrap (id, admin_user_id) values (1, $1)",
      [owner.id],
    );
    await setActive(deps, admin, owner.id, false);
    await setActive(deps, admin, owner.id, true);
    assert.equal(await appAccess("owner@example.test", PASSWORD), "full");
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
    const { requestId: _, ...details } = rows[0]?.details ?? {};
    assert.deepEqual(details, {
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

describe("changeOwnPassword", () => {
  const NEW = "mi-clave-nueva-2026";

  async function createdByAdmin(email: string) {
    const { id } = await createUser(deps, admin, {
      name: "Luis Gómez",
      email,
      jobTitle: null,
      role: "staff",
      temporaryPassword: TEMP,
    });
    return id;
  }

  async function selfFor(email: string, password: string) {
    const response = await signIn(email, password);
    assert.equal(response.status, 200, `sign-in ${email}`);
    const { user } = (await response.json()) as { user: { id: string } };
    return {
      id: user.id,
      headers: new Headers({ cookie: cookieHeader(response) }),
      ipAddress: "203.0.113.9",
      userAgent: "node-test",
    } satisfies AdminActor;
  }

  it("replaces the temporary password, clears the forced change, keeps only a new session and audits it", async () => {
    const id = await createdByAdmin("luis@example.test");
    assert.equal(await getMustChangePassword(deps, id), true);
    await signIn("luis@example.test", TEMP);
    const self = await selfFor("luis@example.test", TEMP);

    const { setCookies } = await changeOwnPassword(deps, self, {
      currentPassword: TEMP,
      newPassword: NEW,
    });

    assert.equal(await getMustChangePassword(deps, id), false);
    assert.equal((await getUser(deps, id))?.mustChangePassword, false);
    const { rows } = await pool.query(
      "select password_changed_at from user_security where user_id = $1",
      [id],
    );
    assert.ok(rows[0].password_changed_at instanceof Date);
    assert.equal(await sessionCount(id), 1);
    assert.ok(setCookies.some((c) => /session_token=/.test(c)));
    assert.notEqual((await signIn("luis@example.test", TEMP)).status, 200);
    assert.equal((await signIn("luis@example.test", NEW)).status, 200);

    assert.deepEqual(await auditActions(id), [
      "user.create",
      "user.password_change",
    ]);
    const audit = await pool.query(
      "select actor_user_id, details from audit_log where action = 'user.password_change'",
    );
    assert.equal(audit.rows[0].actor_user_id, id);
    assert.doesNotMatch(
      JSON.stringify(audit.rows),
      new RegExp(`${TEMP}|${NEW}`),
    );
  });

  it("changes nothing when the current password is wrong", async () => {
    const id = await createdByAdmin("luis@example.test");
    const self = await selfFor("luis@example.test", TEMP);
    assert.equal(
      await ruleCode(
        changeOwnPassword(deps, self, {
          currentPassword: "no-es-la-clave-actual",
          newPassword: NEW,
        }),
      ),
      "wrong_current_password",
    );
    assert.equal(await getMustChangePassword(deps, id), true);
    assert.equal((await signIn("luis@example.test", TEMP)).status, 200);
    assert.deepEqual(await auditActions(id), ["user.create"]);
  });

  it("refuses a new password equal to the current one", async () => {
    await createdByAdmin("luis@example.test");
    const self = await selfFor("luis@example.test", TEMP);
    assert.equal(
      await ruleCode(
        changeOwnPassword(deps, self, {
          currentPassword: TEMP,
          newPassword: TEMP,
        }),
      ),
      "same_password",
    );
  });

  // Admin reset racing the user's own change. Barriers pause one operation
  // at its seam; the other then runs until it either finishes or waits on a
  // database lock held by the paused one (checked in pg_locks, no sleeps).
  const TEMP2 = "otra-temporal-2026";

  function barrier() {
    let release!: () => void;
    let arrived!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    return {
      reached,
      release,
      hook: async () => {
        arrived();
        await released;
      },
    };
  }

  async function finishedOrBlocked(operation: Promise<unknown>) {
    let done = false;
    operation.then(
      () => {
        done = true;
      },
      () => {
        done = true;
      },
    );
    const deadline = Date.now() + 3000;
    while (!done && Date.now() < deadline) {
      const { rows } = await pool.query<{ n: number }>(
        "select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted",
      );
      if ((rows[0]?.n ?? 0) > 0) return "blocked";
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(done, "the second operation neither finished nor blocked");
    return "finished";
  }

  it("a reset that lands while the user's own change is finishing still forces the change", async () => {
    const id = await createdByAdmin("luis@example.test");
    const self = await selfFor("luis@example.test", TEMP);
    const pause = barrier();
    const change = changeOwnPassword(
      { ...deps, hooks: { afterPasswordChange: pause.hook } },
      self,
      { currentPassword: TEMP, newPassword: NEW },
    );
    await pause.reached;
    const reset = resetPassword(deps, admin, id, TEMP2);
    // Serialized: the reset waits for the user's change to commit.
    assert.equal(await finishedOrBlocked(reset), "blocked");
    pause.release();
    await Promise.allSettled([change, reset]);
    await reset;

    assert.equal(await appAccess("luis@example.test", TEMP2), "forced_change");
  });

  it("a user's own change that lands while a reset is in progress cannot clear the reset's forced change", async () => {
    const id = await createdByAdmin("luis@example.test");
    const self = await selfFor("luis@example.test", TEMP);
    const pause = barrier();
    const reset = resetPassword(
      { ...deps, hooks: { afterResetFlag: pause.hook } },
      admin,
      id,
      TEMP2,
    );
    await pause.reached;
    const change = changeOwnPassword(deps, self, {
      currentPassword: TEMP,
      newPassword: NEW,
    });
    // Serialized: the change waits until the reset has finished.
    assert.equal(await finishedOrBlocked(change), "blocked");
    pause.release();
    await reset;
    // The reset revoked the session and replaced the password the change
    // relied on, so the late change is refused.
    await assert.rejects(change);

    assert.equal(await appAccess("luis@example.test", TEMP2), "forced_change");
  });

  it("reports no pending change for users without a security row", async () => {
    assert.equal(await getMustChangePassword(deps, admin.id), false);
  });
});

describe("audit trail when the audit write after a change fails", () => {
  // Better Auth commits each change on its own connections, outside the
  // transaction that writes the audit row. The change may persist; the
  // caller must get an error and the trail must still show the request.
  async function unresolvedRequests() {
    const { items } = await listAudit(deps, { page: 1 });
    return items
      .filter((e) => e.action.endsWith(".requested"))
      .map((e) => [e.action, e.targetUserId]);
  }

  function failingAudit(action: string, run: () => Promise<unknown>) {
    return assert.rejects(
      withInsertFault("audit_log", `new.action = '${action}'`, run),
    );
  }

  it("deactivation persists, the caller gets an error and the request stays in the trail", async () => {
    const target = await createTestUser(auth, "sara@example.test");
    await failingAudit("user.deactivate", () =>
      setActive(deps, admin, target.id, false),
    );
    assert.equal((await getUser(deps, target.id))?.active, false);
    assert.deepEqual(await unresolvedRequests(), [
      ["user.deactivate.requested", target.id],
    ]);
  });

  it("reactivation persists, the caller gets an error and the request stays in the trail", async () => {
    const target = await createTestUser(auth, "sara@example.test");
    await setActive(deps, admin, target.id, false);
    await failingAudit("user.activate", () =>
      setActive(deps, admin, target.id, true),
    );
    assert.equal((await getUser(deps, target.id))?.active, true);
    assert.deepEqual(await unresolvedRequests(), [
      ["user.activate.requested", target.id],
    ]);
  });

  it("an edit persists, the caller gets an error and the request stays in the trail", async () => {
    const target = await createTestUser(auth, "eva@example.test");
    await failingAudit("user.update", () =>
      updateUser(deps, admin, target.id, {
        name: "Eva Ríos",
        jobTitle: null,
        role: "admin",
      }),
    );
    assert.equal((await getUser(deps, target.id))?.role, "admin");
    assert.deepEqual(await unresolvedRequests(), [
      ["user.update.requested", target.id],
    ]);
  });

  it("a password reset persists, the caller gets an error and the request stays in the trail", async () => {
    const target = await createTestUser(auth, "tom@example.test");
    await failingAudit("user.password_reset", () =>
      resetPassword(deps, admin, target.id, TEMP),
    );
    assert.equal(await appAccess("tom@example.test", TEMP), "forced_change");
    assert.deepEqual(await unresolvedRequests(), [
      ["user.password_reset.requested", target.id],
    ]);
  });

  it("closing sessions persists, the caller gets an error and the request stays in the trail", async () => {
    const target = await createTestUser(auth, "uma@example.test");
    await signIn("uma@example.test");
    await failingAudit("user.sessions_revoke", () =>
      revokeSessions(deps, admin, target.id),
    );
    assert.equal(await sessionCount(target.id), 0);
    assert.deepEqual(await unresolvedRequests(), [
      ["user.sessions_revoke.requested", target.id],
    ]);
  });

  it("a creation whose audit fails leaves the request in the trail", async () => {
    await failingAudit("user.create", () =>
      createUser(deps, admin, {
        name: "Luis Gómez",
        email: "luis@example.test",
        jobTitle: null,
        role: "staff",
        temporaryPassword: TEMP,
      }),
    );
    assert.notEqual(await appAccess("luis@example.test", TEMP), "full");
    const requests = await unresolvedRequests();
    assert.deepEqual(
      requests.map(([action]) => action),
      ["user.create.requested"],
    );
  });

  it("pairs every completed change with its request and hides resolved requests from the activity views", async () => {
    const target = await createTestUser(auth, "ivan@example.test");
    await revokeSessions(deps, admin, target.id);
    await setActive(deps, admin, target.id, false);
    const { rows } = await pool.query<{ action: string; request: string }>(
      "select action, details->>'requestId' as request from audit_log order by id",
    );
    assert.deepEqual(
      rows.map((r) => r.action),
      [
        "user.sessions_revoke.requested",
        "user.sessions_revoke",
        "user.deactivate.requested",
        "user.deactivate",
      ],
    );
    assert.equal(rows[0]?.request, rows[1]?.request);
    assert.equal(rows[2]?.request, rows[3]?.request);
    assert.notEqual(rows[0]?.request, rows[2]?.request);
    assert.deepEqual(await unresolvedRequests(), []);
    assert.deepEqual(
      (await listAuditForUser(deps, target.id)).map((e) => e.action),
      ["user.deactivate", "user.sessions_revoke"],
    );
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
