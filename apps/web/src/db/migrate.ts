import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, getPool } from "./client.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// Resolved relative to this file (not process.cwd()) so `db:migrate` behaves
// the same no matter which directory it is invoked from.
const migrationsFolder = path.resolve(currentDir, "..", "..", "drizzle");

async function countAppliedMigrations(): Promise<number> {
  try {
    const result = await getPool().query<{ count: string }>(
      "select count(*)::text as count from drizzle.__drizzle_migrations",
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    // The migrations schema/table does not exist yet on a fresh database.
    return 0;
  }
}

export async function runMigrations(): Promise<{
  before: number;
  after: number;
}> {
  const before = await countAppliedMigrations();
  const db = getDb();
  await migrate(db, { migrationsFolder });
  const after = await countAppliedMigrations();
  return { before, after };
}

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

function extractSqlState(source: unknown): string | undefined {
  if (typeof source !== "object" || source === null) {
    return undefined;
  }
  const candidate = (source as { code?: unknown }).code;
  return typeof candidate === "string" && SQLSTATE_PATTERN.test(candidate)
    ? candidate
    : undefined;
}

// Drizzle wraps a failed migration as "Failed query: <sql> params: [...]",
// which can embed table names, column names, or literal values. Never
// surface that message: only a SQLSTATE code (a fixed 5-character
// alphanumeric identifier, never free text) is safe to log.
export function describeMigrationError(error: unknown): string {
  const cause =
    typeof error === "object" && error !== null
      ? (error as { cause?: unknown }).cause
      : undefined;
  const code = extractSqlState(error) ?? extractSqlState(cause) ?? "unknown";
  return `Migration failed (code=${code})`;
}

async function main(): Promise<void> {
  try {
    const { before, after } = await runMigrations();
    console.log(`migrations before=${before} after=${after}`);
  } catch (error) {
    console.error(describeMigrationError(error));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  await main();
}
