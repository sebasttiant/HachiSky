import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// App-owned account state, kept out of Better Auth's tables. A missing row
// means "nothing pending" (bootstrap admin, users created before 0002).
export const userSecurity = pgTable("user_security", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // Set when an administrator creates the user or resets their password.
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  passwordChangedAt: timestamptz("password_changed_at"),
  updatedAt: timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Append-only trail of administrative and security actions. A trigger in
// migration 0002 refuses UPDATE and DELETE. `details` never holds passwords.
// RESTRICT keeps every referenced user: accounts are deactivated, not deleted.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    occurredAt: timestamptz("occurred_at").defaultNow().notNull(),
    // Null only for actions without a signed-in actor.
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    targetUserId: text("target_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("audit_log_occurred_at_idx").on(table.occurredAt.desc()),
    index("audit_log_target_user_idx").on(
      table.targetUserId,
      table.occurredAt.desc(),
    ),
    check(
      "audit_log_action_format",
      sql`${table.action} ~ '^[a-z]+(\\.[a-z_]+)+$'`,
    ),
  ],
);
