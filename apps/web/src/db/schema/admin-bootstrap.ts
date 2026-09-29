import { sql } from "drizzle-orm";
import { check, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

// App-owned singleton recording that the first administrator was bootstrapped.
// PRIMARY KEY plus CHECK (id = 1) makes a second record impossible at the
// database level. The foreign key is RESTRICT on purpose: the bootstrap
// administrator cannot be hard-deleted while this record exists (deactivate
// the account instead).
export const adminBootstrap = pgTable(
  "admin_bootstrap",
  {
    id: smallint("id").primaryKey().default(1),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("admin_bootstrap_single_row", sql`${table.id} = 1`)],
);
