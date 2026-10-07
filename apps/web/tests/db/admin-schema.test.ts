import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

const pool = createTestPool();
const auth = createTestAuth(pool);

async function pgErrorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "no-error";
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

describe("migration 0002: user_security", () => {
  it("defaults must_change_password to false and requires an existing user", async () => {
    const user = await createTestUser(auth, "sec@example.test");
    await pool.query("insert into user_security (user_id) values ($1)", [
      user.id,
    ]);
    const { rows } = await pool.query(
      "select must_change_password, password_changed_at from user_security where user_id = $1",
      [user.id],
    );
    assert.deepEqual(rows, [
      { must_change_password: false, password_changed_at: null },
    ]);
    assert.equal(
      await pgErrorCode(
        pool.query("insert into user_security (user_id) values ('missing')"),
      ),
      "23503",
    );
  });
});

describe("migration 0002: audit_log", () => {
  async function insertEntry(actorId: string, action = "user.create") {
    const { rows } = await pool.query<{ id: string }>(
      `insert into audit_log (actor_user_id, action, target_user_id, details)
       values ($1, $2, $1, '{"role":"staff"}') returning id`,
      [actorId, action],
    );
    return rows[0]?.id ?? "";
  }

  it("records an entry with a timestamp and empty-object details by default", async () => {
    const user = await createTestUser(auth, "audit@example.test");
    await pool.query(
      "insert into audit_log (actor_user_id, action) values ($1, 'user.update')",
      [user.id],
    );
    const { rows } = await pool.query(
      "select action, details, occurred_at is not null as stamped from audit_log",
    );
    assert.deepEqual(rows, [
      { action: "user.update", details: {}, stamped: true },
    ]);
  });

  it("is append-only: updates and deletes are refused by the database", async () => {
    const user = await createTestUser(auth, "append@example.test");
    const id = await insertEntry(user.id);
    assert.equal(
      await pgErrorCode(
        pool.query("update audit_log set action = 'user.ban' where id = $1", [
          id,
        ]),
      ),
      "P0001",
    );
    assert.equal(
      await pgErrorCode(
        pool.query("delete from audit_log where id = $1", [id]),
      ),
      "P0001",
    );
  });

  it("only accepts dotted lower-case action names", async () => {
    const user = await createTestUser(auth, "action@example.test");
    assert.equal(
      await pgErrorCode(insertEntry(user.id, "Drop Table")),
      "23514",
    );
  });

  it("keeps the actor: a user with audit entries cannot be hard-deleted", async () => {
    const user = await createTestUser(auth, "keep@example.test");
    await insertEntry(user.id);
    assert.equal(
      await pgErrorCode(
        pool.query('delete from "user" where id = $1', [user.id]),
      ),
      "23001",
    );
  });
});
