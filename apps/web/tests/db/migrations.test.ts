import assert from "node:assert/strict";
import { test } from "node:test";
import { closeDb, getDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { appInstance } from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";

async function countAppliedMigrations(): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    "select count(*)::text as count from drizzle.__drizzle_migrations",
  );
  return Number(result.rows[0]?.count ?? 0);
}

test("migrations install exactly one app_instance row and are idempotent", async () => {
  await assertTestDatabase(getPool());

  const first = await runMigrations();
  assert.ok(
    first.after >= 1,
    "expected at least one applied migration after the first run",
  );

  const db = getDb();
  const rows = await db.select().from(appInstance);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, 1);
  const firstInstalledAt = rows[0]?.installedAt;
  assert.ok(firstInstalledAt instanceof Date);

  const firstMigrationCount = await countAppliedMigrations();
  assert.ok(firstMigrationCount >= 1);

  const second = await runMigrations();
  assert.equal(
    second.after,
    first.after,
    "re-running the migrator must not add migrations",
  );

  const rowsAfterSecond = await db.select().from(appInstance);
  assert.equal(
    rowsAfterSecond.length,
    1,
    "re-running the migrator must not duplicate the row",
  );
  assert.deepEqual(
    rowsAfterSecond[0]?.installedAt,
    firstInstalledAt,
    "installed_at must not change on a second migration run",
  );

  const migrationCountAfterSecond = await countAppliedMigrations();
  assert.equal(migrationCountAfterSecond, firstMigrationCount);
});

test.after(async () => {
  await closeDb();
});
