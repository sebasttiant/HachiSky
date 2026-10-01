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

function insertClient(
  userId: string,
  values: { name?: string; type?: string; number?: string } = {},
) {
  return pool.query(
    `insert into client (name, identification_type, identification_number, created_by, updated_by)
     values ($1, $2, $3, $4, $4)`,
    [
      values.name ?? "Cliente Demo",
      values.type ?? "NIT",
      values.number ?? "9000000011",
      userId,
    ],
  );
}

describe("migration 0003: client", () => {
  it("uses timestamptz columns and defaults to an active client", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertClient(user.id);
    const columns = await pool.query<{
      column_name: string;
      data_type: string;
    }>(
      `select column_name, data_type from information_schema.columns
        where table_name = 'client' and column_name in ('created_at', 'updated_at')`,
    );
    assert.deepEqual(
      columns.rows.map((row) => row.data_type),
      ["timestamp with time zone", "timestamp with time zone"],
    );
    const { rows } = await pool.query("select active from client");
    assert.deepEqual(rows, [{ active: true }]);
  });

  it("refuses unknown identification types, blank names and blank numbers at the database", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    assert.equal(
      await pgErrorCode(insertClient(user.id, { type: "RUT" })),
      "23514",
    );
    assert.equal(
      await pgErrorCode(insertClient(user.id, { name: "  " })),
      "23514",
    );
    assert.equal(
      await pgErrorCode(insertClient(user.id, { number: " " })),
      "23514",
    );
  });

  it("enforces one client per identification type and number", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertClient(user.id);
    assert.equal(await pgErrorCode(insertClient(user.id)), "23505");
    assert.equal(
      await pgErrorCode(insertClient(user.id, { type: "CC" })),
      "no-error",
    );
  });

  it("requires existing creator and updater users", async () => {
    assert.equal(await pgErrorCode(insertClient("missing")), "23503");
  });
});
