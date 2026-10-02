// Runs the process in a non-UTC time zone. Node re-reads TZ when it is
// assigned, and every test file runs in its own process, so this cannot leak
// into other suites.
process.env.TZ = "Asia/Kolkata";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createAuth } from "../../src/auth/auth.ts";
import { buildPoolConfig, closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { loadAuthEnv, loadEnv } from "../../src/shared/config/env.ts";

const SESSION_TIME_ZONE = "America/Bogota";
const PASSWORD = "correct-horse-battery-staple-1";

// Session TimeZone differs from both UTC and the process TZ, so a column that
// silently depends on either would round-trip to a different instant.
const pool = new Pool({
  ...buildPoolConfig(loadEnv()),
  max: 4,
  options: `-c TimeZone=${SESSION_TIME_ZONE}`,
});
const db = drizzle(pool, { schema });
const auth = createAuth({
  env: loadAuthEnv({
    APP_ENV: "test",
    BETTER_AUTH_URL: "http://localhost:3100",
    BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdef-0123456789",
  }),
  database: drizzleAdapter(db, { provider: "pg", schema }),
});

async function cleanAuthTables() {
  await pool.query(
    'truncate table admin_bootstrap, session, account, verification, "user" cascade',
  );
}

async function pgErrorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    // Drizzle wraps the driver error in `cause`.
    const source = (error as { cause?: unknown }).cause ?? error;
    const code = (source as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "no-error";
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
  await cleanAuthTables();
});

after(async () => {
  await cleanAuthTables();
  await pool.end();
  await closeDb();
});

describe("migration 0001 on a fresh database", () => {
  it("applies cleanly and creates the auth tables with timestamptz columns", async () => {
    const name = `hachisky_fresh_${process.pid}`;
    const admin = getPool();
    await admin.query(`drop database if exists "${name}"`);
    await admin.query(`create database "${name}"`);
    const fresh = new Pool({ ...buildPoolConfig(loadEnv()), database: name });
    try {
      await migrate(drizzle(fresh), {
        migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
      });
      const tables = await fresh.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
      );
      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        [
          "account",
          "admin_bootstrap",
          "app_instance",
          "audit_log",
          "bank_account",
          "client",
          "issuer_settings",
          "session",
          "user",
          "user_security",
          "verification",
        ],
      );
      const columns = await fresh.query<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>(
        "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and data_type like 'timestamp%'",
      );
      assert.ok(
        columns.rows.length >= 14,
        "expected the auth timestamp columns",
      );
      for (const column of columns.rows) {
        assert.equal(
          column.data_type,
          "timestamp with time zone",
          `${column.table_name}.${column.column_name}`,
        );
      }
      const userColumns = await fresh.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = 'user' and table_schema = 'public'",
      );
      for (const expected of [
        "role",
        "banned",
        "ban_reason",
        "ban_expires",
        "job_title",
      ]) {
        assert.ok(
          userColumns.rows.some((row) => row.column_name === expected),
          `user.${expected}`,
        );
      }
      const sessionColumns = await fresh.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = 'session' and table_schema = 'public'",
      );
      assert.ok(
        sessionColumns.rows.some(
          (row) => row.column_name === "impersonated_by",
        ),
      );
    } finally {
      await fresh.end();
      await admin.query(`drop database if exists "${name}"`);
    }
  });
});

describe("timezone round trip", () => {
  it("runs under a non-UTC process TZ and a non-UTC session TimeZone", async () => {
    assert.equal(process.env.TZ, "Asia/Kolkata");
    assert.equal(new Date(2026, 0, 1).getTimezoneOffset(), -330);
    const shown = await pool.query<{ TimeZone: string }>("show timezone");
    assert.equal(shown.rows[0]?.TimeZone, SESSION_TIME_ZONE);
  });

  it("reads back createdAt of an API-created user as the same instant", async () => {
    await cleanAuthTables();
    const { user } = await auth.api.createUser({
      body: {
        email: "tz@example.test",
        password: PASSWORD,
        name: "Timezone Tester",
      },
    });
    const viaDrizzle = await db.select().from(schema.user);
    assert.equal(viaDrizzle.length, 1);
    const stored = viaDrizzle[0];
    assert.ok(stored);
    assert.equal(stored.createdAt.getTime(), user.createdAt.getTime());
    assert.equal(stored.updatedAt.getTime(), user.updatedAt.getTime());

    // Independent of the driver's date parsing: ask Postgres for the epoch.
    const raw = await pool.query<{ ms: string }>(
      'select (extract(epoch from created_at) * 1000)::bigint::text as ms from "user" where id = $1',
      [user.id],
    );
    assert.equal(Number(raw.rows[0]?.ms), user.createdAt.getTime());
  });

  it("stores a session expiry with the same instant the API reported", async () => {
    const signedIn = await auth.api.signInEmail({
      body: { email: "tz@example.test", password: PASSWORD },
    });
    const [row] = await db.select().from(schema.session);
    assert.ok(row);
    assert.equal(row.token, signedIn.token);
    const remainingMs = row.expiresAt.getTime() - Date.now();
    // Default session lifetime is 7 days; a timezone shift of hours would fall
    // far outside this window.
    assert.ok(
      Math.abs(remainingMs - 7 * 24 * 3600 * 1000) < 60_000,
      `expiresAt off by ${remainingMs}ms`,
    );
  });
});

describe("account unique indexes", () => {
  async function createUser(email: string) {
    const { user } = await auth.api.createUser({
      body: { email, password: PASSWORD, name: email },
    });
    return user;
  }

  it("rejects a second account with the same (provider_id, account_id)", async () => {
    await cleanAuthTables();
    const first = await createUser("dup-a@example.test");
    const second = await createUser("dup-b@example.test");
    const code = await pgErrorCode(
      db.insert(schema.account).values({
        id: "dup-provider-account",
        accountId: first.id,
        providerId: "credential",
        userId: second.id,
      }),
    );
    assert.equal(code, "23505");
  });

  it("rejects a second credential account for the same user", async () => {
    const [existing] = await db.select().from(schema.user).limit(1);
    assert.ok(existing);
    const code = await pgErrorCode(
      db.insert(schema.account).values({
        id: "second-credential",
        accountId: "another-account-id",
        providerId: "credential",
        userId: existing.id,
      }),
    );
    assert.equal(code, "23505");
  });

  it("still allows several non-credential accounts for one user", async () => {
    const [existing] = await db.select().from(schema.user).limit(1);
    assert.ok(existing);
    await db.insert(schema.account).values([
      {
        id: "social-1",
        accountId: "social-account-1",
        providerId: "example-idp-a",
        userId: existing.id,
      },
      {
        id: "social-2",
        accountId: "social-account-2",
        providerId: "example-idp-b",
        userId: existing.id,
      },
    ]);
    const rows = await db.select().from(schema.account);
    assert.equal(
      rows.filter((row) => row.providerId !== "credential").length,
      2,
    );
  });

  it("keeps the Better Auth API working with both indexes in place", async () => {
    await cleanAuthTables();
    const admin = await auth.api.createUser({
      body: {
        email: "api-admin@example.test",
        password: PASSWORD,
        name: "API Admin",
        role: "admin",
        data: { jobTitle: "Owner" },
      },
    });
    assert.equal(admin.user.role, "admin");
    const accounts = await db.select().from(schema.account);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]?.providerId, "credential");
    assert.equal(accounts[0]?.accountId, admin.user.id);

    const signedIn = await auth.api.signInEmail({
      body: { email: "api-admin@example.test", password: PASSWORD },
    });
    assert.equal(signedIn.user.id, admin.user.id);
    assert.ok(signedIn.token.length > 0);
    const sessions = await db.select().from(schema.session);
    assert.equal(sessions.length, 1);

    const [stored] = await db.select().from(schema.user);
    assert.equal(stored?.jobTitle, "Owner");
    assert.equal(stored?.role, "admin");

    await assert.rejects(
      auth.api.signInEmail({
        body: { email: "api-admin@example.test", password: "wrong-password-1" },
      }),
    );
  });
});

describe("admin_bootstrap", () => {
  it("is a singleton keyed by id = 1 that references an existing user", async () => {
    await cleanAuthTables();
    const { user } = await auth.api.createUser({
      body: {
        email: "boot@example.test",
        password: PASSWORD,
        name: "Boot Admin",
        role: "admin",
      },
    });

    assert.equal(
      await pgErrorCode(
        db
          .insert(schema.adminBootstrap)
          .values({ id: 2, adminUserId: user.id }),
      ),
      "23514",
      "id other than 1 violates the CHECK",
    );
    assert.equal(
      await pgErrorCode(
        db.insert(schema.adminBootstrap).values({
          adminUserId: "no-such-user",
        }),
      ),
      "23503",
      "admin_user_id must reference a user",
    );

    await db.insert(schema.adminBootstrap).values({ adminUserId: user.id });
    const [row] = await db.select().from(schema.adminBootstrap);
    assert.equal(row?.id, 1);
    assert.equal(row?.adminUserId, user.id);
    assert.ok(row?.createdAt instanceof Date);
    assert.ok(Math.abs(row.createdAt.getTime() - Date.now()) < 60_000);

    assert.equal(
      await pgErrorCode(
        db.insert(schema.adminBootstrap).values({ adminUserId: user.id }),
      ),
      "23505",
      "a second row is rejected by the primary key",
    );
    assert.equal(
      await pgErrorCode(
        pool.query('delete from "user" where id = $1', [user.id]),
      ),
      "23001",
      "the bootstrap admin cannot be deleted while the record exists",
    );
  });
});
