import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { type AppEnv, loadEnv } from "../shared/config/env.ts";
import * as schema from "./schema/index.ts";

let pool: Pool | undefined;

// Explicit limits so an unreachable or hung database fails fast instead of
// blocking a request (e.g. the home page system status) indefinitely.
export const POOL_LIMITS = {
  max: 5,
  connectionTimeoutMillis: 2000, // TCP connect + startup handshake
  query_timeout: 4000, // client-side, covers a server that stops answering
  statement_timeout: 4000, // server-side, cancels long-running statements
  idleTimeoutMillis: 30000,
} as const;

// Discrete PG* fields only — never a connection string, so a password can
// never end up concatenated into a URL and logged or leaked by accident.
export function buildPoolConfig(env: AppEnv): PoolConfig {
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    ...POOL_LIMITS,
  };
}

// Migrations get their own limits: connect fails fast, but there is NO
// query_timeout/statement_timeout, because a legitimate migration (index
// build, table rewrite) can run far longer than a request. One connection
// is enough: the migrator runs statements sequentially.
export const MIGRATION_POOL_LIMITS = {
  max: 1,
  connectionTimeoutMillis: POOL_LIMITS.connectionTimeoutMillis,
} as const;

export function buildMigrationPoolConfig(env: AppEnv): PoolConfig {
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    ...MIGRATION_POOL_LIMITS,
  };
}

// Lazily created singleton pool.
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig(loadEnv()));
    // An idle client failing must not crash the process (unhandled 'error').
    pool.on("error", () => {
      console.error("Database pool error");
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
