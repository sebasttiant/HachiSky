import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const BILLING_TABLES =
  "bank_account, issuer_logo, issuer_profile, signer_profile, billing_image";

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
});

after(async () => {
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function insertIssuer(
  userId: string,
  values: Record<string, string | boolean | null> = {},
): Promise<string> {
  const row = {
    legal_name: "Emisor Demo S.A.S.",
    identification_type: "NIT",
    identification_number: "9000000022",
    address: "Calle Falsa 123",
    city: "Ciudad Demo",
    payment_terms: null,
    ...values,
  };
  const keys = Object.keys(row);
  const { rows } = await pool.query<{ id: string }>(
    `insert into issuer_profile (${keys.join(", ")}, created_by, updated_by)
     values (${keys.map((_, i) => `$${i + 1}`).join(", ")}, $${keys.length + 1}, $${keys.length + 1})
     returning id`,
    [...Object.values(row), userId],
  );
  const id = rows[0]?.id;
  assert.ok(id);
  return id;
}

async function insertImage(
  userId: string,
  purpose: "issuer_logo" | "signature",
  signerId: string | null = null,
): Promise<string> {
  const data = Buffer.from(`image-${Math.random()}`);
  const { rows } = await pool.query<{ id: string }>(
    `insert into billing_image
       (purpose, signer_profile_id, data, sha256, byte_size, width, height, created_by)
     values ($1, $2, $3, $4, $5, 1, 1, $6) returning id`,
    [
      purpose,
      signerId,
      data,
      createHash("sha256").update(data).digest("hex"),
      data.length,
      userId,
    ],
  );
  const id = rows[0]?.id;
  assert.ok(id);
  return id;
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

describe("migration 0006: issuer_profile", () => {
  it("defaults to an active, non-default profile", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertIssuer(user.id);
    const { rows } = await pool.query(
      "select active, is_default, current_logo_image_id from issuer_profile",
    );
    assert.deepEqual(rows, [
      { active: true, is_default: false, current_logo_image_id: null },
    ]);
  });

  it("is unique per identification, inactive profiles included", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertIssuer(user.id, { active: false });
    assert.equal(await pgErrorCode(insertIssuer(user.id)), "23505");
    assert.equal(
      await pgErrorCode(insertIssuer(user.id, { identification_type: "CC" })),
      "no-error",
    );
  });

  it("allows one default at most, and never an inactive default", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertIssuer(user.id, { is_default: true });
    assert.equal(
      await pgErrorCode(
        insertIssuer(user.id, {
          identification_number: "9000000033",
          is_default: true,
        }),
      ),
      "23505",
    );
    assert.equal(
      await pgErrorCode(
        insertIssuer(user.id, {
          identification_number: "9000000044",
          active: false,
          is_default: true,
        }),
      ),
      "23514",
    );
    assert.equal(
      await pgErrorCode(
        pool.query("update issuer_profile set active = false where is_default"),
      ),
      "23514",
    );
  });

  it("refuses blank required fields, unknown types and oversized terms", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    const overrides: Record<string, string | null>[] = [
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
        where table_name in ('issuer_profile', 'bank_account')
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

describe("migration 0006: issuer_logo", () => {
  it("owns a logo version for exactly one issuer, and the issuer points only at its own logos", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    const a = await insertIssuer(user.id);
    const b = await insertIssuer(user.id, {
      identification_number: "9000000033",
    });
    const logo = await insertImage(user.id, "issuer_logo");
    await pool.query(
      "insert into issuer_logo (image_id, issuer_profile_id) values ($1, $2)",
      [logo, a],
    );
    assert.equal(
      await pgErrorCode(
        pool.query(
          "insert into issuer_logo (image_id, issuer_profile_id) values ($1, $2)",
          [logo, b],
        ),
      ),
      "23505",
    );
    assert.equal(
      await pgErrorCode(
        pool.query(
          "update issuer_profile set current_logo_image_id = $1 where id = $2",
          [logo, b],
        ),
      ),
      "23503",
    );
    assert.equal(
      await pgErrorCode(
        pool.query(
          "update issuer_profile set current_logo_image_id = $1 where id = $2",
          [logo, a],
        ),
      ),
      "no-error",
    );
  });

  it("accepts only issuer logo images, never a signature", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    const issuer = await insertIssuer(user.id);
    const { rows } = await pool.query<{ id: string }>(
      `insert into signer_profile
         (full_name, identification_type, identification_number, job_title,
          email, created_by, updated_by)
       values ('Firmante Demo', 'CC', '1000000009', 'Cargo',
               'firmante@example.test', $1, $1) returning id`,
      [user.id],
    );
    const signature = await insertImage(user.id, "signature", rows[0]?.id);
    assert.equal(
      await pgErrorCode(
        pool.query(
          "insert into issuer_logo (image_id, issuer_profile_id) values ($1, $2)",
          [signature, issuer],
        ),
      ),
      "23503",
    );
  });

  it("is immutable: ownership rows cannot be changed or deleted", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    const a = await insertIssuer(user.id);
    const b = await insertIssuer(user.id, {
      identification_number: "9000000033",
    });
    const logo = await insertImage(user.id, "issuer_logo");
    await pool.query(
      "insert into issuer_logo (image_id, issuer_profile_id) values ($1, $2)",
      [logo, a],
    );
    assert.equal(
      await pgErrorCode(
        pool.query("update issuer_logo set issuer_profile_id = $1", [b]),
      ),
      "55000",
    );
    assert.equal(
      await pgErrorCode(pool.query("delete from issuer_logo")),
      "55000",
    );
  });
});

describe("migration 0006: bank_account issuer", () => {
  it("is optional in the database but must reference an existing issuer", async () => {
    const user = await createTestUser(auth, "owner@example.test");
    await insertAccount(user.id);
    assert.equal(
      await pgErrorCode(
        insertAccount(user.id, {
          account_number: "000999888",
          issuer_profile_id: "00000000-0000-4000-8000-000000000000",
        }),
      ),
      "23503",
    );
    const issuer = await insertIssuer(user.id);
    assert.equal(
      await pgErrorCode(
        insertAccount(user.id, {
          account_number: "000999888",
          issuer_profile_id: issuer,
        }),
      ),
      "no-error",
    );
    assert.equal(
      await pgErrorCode(
        pool.query("delete from issuer_profile where id = $1", [issuer]),
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
