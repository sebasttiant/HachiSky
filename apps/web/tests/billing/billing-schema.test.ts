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
  await pool.query("truncate table bank_account, issuer_settings");
});

after(async () => {
  await pool.query("truncate table bank_account, issuer_settings");
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

function insertIssuer(
  userId: string,
  values: Record<string, string | number | null> = {},
) {
  const row = {
    id: 1,
    legal_name: "Emisor Demo S.A.S.",
    identification_type: "NIT",
    identification_number: "9000000022",
    address: "Calle Falsa 123",
    city: "Ciudad Demo",
    payment_terms: null,
    ...values,
  };
  const keys = Object.keys(row);
  return pool.query(
    `insert into issuer_settings (${keys.join(", ")}, created_by, updated_by)
     values (${keys.map((_, i) => `$${i + 1}`).join(", ")}, $${keys.length + 1}, $${keys.length + 1})`,
    [...Object.values(row), userId],
  );
}

function insertAccount(userId: string, values: Record<string, string> = {}) {
  const row = {
    bank_name: "Banco Demo",
    account_type: "ahorros",
    account_number: "000111222",
    holder_name: "Titular Demo",
    holder_identification_type: "CC",
    holder_identification_number: "1000000001",
    currency: "COP",
    ...values,
  };
  const keys = Object.keys(row);
  return pool.query(
    `insert into bank_account (${keys.join(", ")}, created_by, updated_by)
     values (${keys.map((_, i) => `$${i + 1}`).join(", ")}, $${keys.length + 1}, $${keys.length + 1})`,
    [...Object.values(row), userId],
  );
}

describe("migration 0004: issuer_settings", () => {
  it("is a singleton: only id 1, only one row", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertIssuer(user.id);
    assert.equal(await pgErrorCode(insertIssuer(user.id)), "23505");
    assert.equal(await pgErrorCode(insertIssuer(user.id, { id: 2 })), "23514");
  });

  it("refuses blank required fields, unknown types and oversized terms", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    const overrides: Record<string, string | number | null>[] = [
      { legal_name: " " },
      { identification_number: " " },
      { address: " " },
      { city: " " },
      { identification_type: "RUT" },
      { payment_terms: "x".repeat(1001) },
    ];
    for (const override of overrides) {
      assert.equal(
        await pgErrorCode(insertIssuer(user.id, override)),
        "23514",
        JSON.stringify(override),
      );
    }
  });

  it("uses timestamptz and restricts the referenced users", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertIssuer(user.id);
    const columns = await pool.query<{ data_type: string }>(
      `select data_type from information_schema.columns
        where table_name in ('issuer_settings', 'bank_account')
          and column_name in ('created_at', 'updated_at')`,
    );
    assert.equal(columns.rows.length, 4);
    for (const column of columns.rows) {
      assert.equal(column.data_type, "timestamp with time zone");
    }
    assert.equal(
      await pgErrorCode(
        pool.query('delete from "user" where id = $1', [user.id]),
      ),
      "23001",
    );
  });
});

describe("migration 0004: bank_account", () => {
  it("defaults to an active account", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertAccount(user.id);
    const { rows } = await pool.query("select active from bank_account");
    assert.deepEqual(rows, [{ active: true }]);
  });

  it("refuses unknown types and currencies, blanks and non-digit numbers", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    const overrides: Record<string, string>[] = [
      { account_type: "nomina" },
      { currency: "EUR" },
      { holder_identification_type: "RUT" },
      { bank_name: " " },
      { holder_name: " " },
      { holder_identification_number: " " },
      { account_number: "12AB" },
      { account_number: "123" },
    ];
    for (const override of overrides) {
      assert.equal(
        await pgErrorCode(insertAccount(user.id, override)),
        "23514",
        JSON.stringify(override),
      );
    }
  });

  it("is unique per bank (case-insensitive), number and currency", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertAccount(user.id);
    assert.equal(await pgErrorCode(insertAccount(user.id)), "23505");
    assert.equal(
      await pgErrorCode(insertAccount(user.id, { bank_name: "BANCO DEMO" })),
      "23505",
    );
    assert.equal(
      await pgErrorCode(insertAccount(user.id, { currency: "USD" })),
      "no-error",
    );
  });

  it("requires existing creator and updater users", async () => {
    assert.equal(await pgErrorCode(insertAccount("missing")), "23503");
  });
});
