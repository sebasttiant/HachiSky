import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadEnv } from "../shared/config/env.ts";
import * as schema from "./schema/index.ts";

let pool: Pool | undefined;

// Lazily created singleton pool, built from discrete PG* fields only — never
// a connection string, so a password can never end up concatenated into a
// URL and logged or leaked by accident.
export function getPool(): Pool {
  if (!pool) {
    const env = loadEnv();
    pool = new Pool({
      host: env.PGHOST,
      port: env.PGPORT,
      database: env.PGDATABASE,
      user: env.PGUSER,
      password: env.PGPASSWORD,
      max: 5,
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
