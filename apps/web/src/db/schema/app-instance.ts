import { sql } from "drizzle-orm";
import { check, pgTable, smallint, timestamp } from "drizzle-orm/pg-core";

// Single-row table: exactly one HachiSky installation per database. The
// CHECK constraint enforces id = 1 at the database level so a second row can
// never be inserted, regardless of application-level mistakes.
export const appInstance = pgTable(
  "app_instance",
  {
    id: smallint("id").primaryKey().default(1),
    installedAt: timestamp("installed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("app_instance_single_row", sql`${table.id} = 1`)],
);
