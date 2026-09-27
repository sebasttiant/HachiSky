import { defineConfig } from "drizzle-kit";

// Discrete PG* fields only, never a connection string with an embedded
// password. This config is used by `drizzle-kit generate`, which does not
// need a reachable database, and by `drizzle-kit` tooling that inspects
// connection shape.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "hachisky",
    user: process.env.PGUSER ?? "hachisky",
    password: process.env.PGPASSWORD ?? "",
  },
});
