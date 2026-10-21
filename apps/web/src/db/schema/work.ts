import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { client } from "./client.ts";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// What was actually done for a client, on a date. Reports are built from
// these rows, so a report can only ever describe work somebody recorded.
//
// `author_user_id` is who did the work, which is not the same as who typed
// it in (`created_by`): an administrator may correct a colleague's entry
// without becoming its author. Staff read and edit only their own rows;
// administrators see every row (owner, 2026-10-10).
//
// The hours are optional: some work is reported by day. A reusable activity
// catalog is deferred, not dropped — the title is free text until the owner
// decides who owns that catalog.
//
// RESTRICT everywhere: a client or a user that has recorded work is kept.
export const workActivity = pgTable(
  "work_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    performedOn: date("performed_on").notNull(),
    startedAt: time("started_at"),
    endedAt: time("ended_at"),
    title: text("title").notNull(),
    description: text("description"),
    // What came of it, and what is still open.
    outcome: text("outcome"),
    status: text("status").notNull(),
    nextSteps: text("next_steps"),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("work_activity_client_date_idx").on(
      table.clientId,
      table.performedOn,
    ),
    index("work_activity_author_idx").on(table.authorUserId),
    check(
      "work_activity_title_check",
      sql`btrim(${table.title}) <> '' and char_length(${table.title}) <= 200`,
    ),
    check(
      "work_activity_description_length",
      sql`char_length(${table.description}) <= 5000`,
    ),
    check(
      "work_activity_outcome_length",
      sql`char_length(${table.outcome}) <= 2000`,
    ),
    check(
      "work_activity_next_steps_length",
      sql`char_length(${table.nextSteps}) <= 2000`,
    ),
    check(
      "work_activity_status_check",
      sql`${table.status} in ('completed', 'in_progress', 'pending')`,
    ),
    // Either both hours or neither, and the end cannot precede the start.
    check(
      "work_activity_hours_check",
      sql`(${table.startedAt} is null) = (${table.endedAt} is null)
        and (${table.startedAt} is null or ${table.endedAt} >= ${table.startedAt})`,
    ),
  ],
);
