import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

// A no-op migration folder, so a custom migrations table can be exercised
// without re-running the baseline DDL against the shared test database.
async function writeNoopMigrationFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "noop-migration-"));
  await mkdir(path.join(folder, "meta"));
  await writeFile(path.join(folder, "0000_noop.sql"), "select 1;\n");
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
          tag: "0000_noop",
          breakpoints: true,
        },
      ],
    }),
  );
  return folder;
}

test("counts applied migrations from a custom migrations schema and table", async () => {
  await assertTestDatabase(getPool());
  const schemaName = 'custom "migrations" schema';
  const tableName = 'custom "journal" table';
  const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const folder = await writeNoopMigrationFolder();
  try {
    await getPool().query(
      `drop schema if exists ${quoted(schemaName)} cascade`,
    );

    const first = await runMigrations({
      migrationsFolder: folder,
      migrationsSchema: schemaName,
      migrationsTable: tableName,
    });
    // The fixture holds exactly one migration.
    assert.equal(first.before, 0, "fresh custom table starts empty");
    assert.equal(first.after, 1, "the single fixture migration is recorded");

    const stored = await getPool().query<{ count: string }>(
      `select count(*)::text as count from ${quoted(schemaName)}.${quoted(tableName)}`,
    );
    assert.equal(Number(stored.rows[0]?.count), 1);

    const second = await runMigrations({
      migrationsFolder: folder,
      migrationsSchema: schemaName,
      migrationsTable: tableName,
    });
    assert.equal(second.before, 1);
    assert.equal(second.after, 1);
  } finally {
    await getPool().query(
      `drop schema if exists ${quoted(schemaName)} cascade`,
    );
    await rm(folder, { recursive: true, force: true });
  }
});

test.after(async () => {
  await closeDb();
});
