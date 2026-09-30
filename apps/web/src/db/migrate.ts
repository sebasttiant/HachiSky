import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "../shared/config/env.ts";
import { buildMigrationPoolConfig, closeDb } from "./client.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// Resolved relative to this file (not process.cwd()) so `db:migrate` behaves
// the same no matter which directory it is invoked from.
const migrationsFolder = path.resolve(currentDir, "..", "..", "drizzle");

// Same defaults as drizzle-orm's pg migrator.
const DEFAULT_MIGRATIONS_SCHEMA = "drizzle";
const DEFAULT_MIGRATIONS_TABLE = "__drizzle_migrations";

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function countAppliedMigrations(
  pool: Pool,
  options: RunMigrationsOptions,
): Promise<number> {
  const schema = quoteIdentifier(
    options.migrationsSchema ?? DEFAULT_MIGRATIONS_SCHEMA,
  );
  const table = quoteIdentifier(
    options.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE,
  );
  try {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count from ${schema}.${table}`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    // The migrations schema/table does not exist yet on a fresh database.
    return 0;
  }
}

export interface RunMigrationsOptions {
  migrationsFolder?: string;
  migrationsSchema?: string;
  migrationsTable?: string;
}

// Runs on a dedicated pool without the request pool's statement/query
// timeouts, and always closes it (success or failure).
export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<{
  before: number;
  after: number;
}> {
  const pool = new Pool(buildMigrationPoolConfig(loadEnv()));
  pool.on("error", () => {
    console.error("Database pool error");
  });
  try {
    const before = await countAppliedMigrations(pool, options);
    await migrate(drizzle(pool), {
      migrationsFolder,
      ...options,
    });
    const after = await countAppliedMigrations(pool, options);
    return { before, after };
  } finally {
    await pool.end();
  }
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
