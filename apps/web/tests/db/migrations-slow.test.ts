import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import {
  buildPoolConfig,
  closeDb,
  getPool,
  POOL_LIMITS,
} from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { loadEnv } from "../../src/shared/config/env.ts";

const SCRATCH_SCHEMA = "slow_migration_test";

// A migration slower than the request pool's 4 s statement/query timeouts.
async function writeSlowMigrationFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "slow-migration-"));
  await mkdir(path.join(folder, "meta"));
  await writeFile(
    path.join(folder, "0000_slow.sql"),
    "select pg_sleep(4.5);\n",
  );
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [
        {
          idx: 0,
          version: "7",
          when: 1700000000000,
          tag: "0000_slow",
          breakpoints: true,
        },
      ],
    }),
  );
  return folder;
}

test("a migration slower than the request timeouts succeeds on the migration connection", async () => {
  await assertTestDatabase(getPool());
  const folder = await writeSlowMigrationFolder();
  try {
    await getPool().query(`drop schema if exists ${SCRATCH_SCHEMA} cascade`);

    // Sanity: the server-side statement_timeout cancels the same statement.
    // The request pool sets query_timeout equal to statement_timeout, so the
    // client-side timer can win the race and surface an error without a
    // SQLSTATE. Use a pool with the real statement_timeout but a client-side
    // query_timeout clearly above it, so the server always cancels first.
    const serverCancelPool = new Pool({
      ...buildPoolConfig(loadEnv()),
      query_timeout: POOL_LIMITS.statement_timeout + 3000,
    });
    serverCancelPool.on("error", () => {
      console.error("Database pool error");
    });
    try {
      await assert.rejects(
        serverCancelPool.query("select pg_sleep(4.5)"),
        (error) => {
          assert.equal((error as { code?: string }).code, "57014");
          return true;
        },
      );
    } finally {
      await serverCancelPool.end();
    }

    await runMigrations({
      migrationsFolder: folder,
      migrationsSchema: SCRATCH_SCHEMA,
    });
    const applied = await getPool().query<{ count: string }>(
      `select count(*)::text as count from ${SCRATCH_SCHEMA}.__drizzle_migrations`,
    );
    assert.equal(applied.rows[0]?.count, "1");
  } finally {
    await getPool().query(`drop schema if exists ${SCRATCH_SCHEMA} cascade`);
    await rm(folder, { recursive: true, force: true });
    await closeDb();
  }
});
