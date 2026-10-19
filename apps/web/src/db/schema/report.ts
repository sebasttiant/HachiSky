import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { bytea } from "./bytea.ts";
import { client } from "./client.ts";
import { workActivity } from "./work.ts";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// A written report about work done for a client.
//
// Five kinds share this table because they differ in their sections, not in
// their nature: seguimiento, diagnóstico, informe general, infraestructura
// and manual. Adding a kind is seeding rows, not a migration.
//
// `author_user_id` is who signs the report, separate from `created_by`, for
// the same reason as work_activity: an administrator may correct a
// colleague's draft without taking authorship of it.
//
// The period is optional and open at both ends: a diagnóstico describes a
// moment, a seguimiento describes a span.
export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    title: text("title").notNull(),
    // Only 'draft' exists today. The issued version arrives in R6 and must
    // preserve its own copy, so nothing here is treated as immutable yet.
    status: text("status").notNull().default("draft"),
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
    index("report_client_idx").on(table.clientId),
    index("report_author_idx").on(table.authorUserId),
    check(
      "report_type_check",
      sql`${table.type} in ('follow_up', 'diagnostic', 'general', 'infrastructure', 'manual')`,
    ),
    check("report_status_check", sql`${table.status} in ('draft')`),
    check(
      "report_title_check",
      sql`btrim(${table.title}) <> '' and char_length(${table.title}) <= 200`,
    ),
    check(
      "report_period_check",
      sql`${table.periodStart} is null or ${table.periodEnd} is null
        or ${table.periodEnd} >= ${table.periodStart}`,
    ),
  ],
);

// One section of a report, as a row.
//
// Sections are rows and not columns on purpose: the five kinds would
// otherwise need either five tables or a column per heading, and renaming a
// heading would become a migration. `key` is the stable identifier the
// template seeds and the audit log records; `heading` is what the reader
// sees and the author may rewrite.
//
// `kind` says what the body is. Most sections are prose. The ones that are
// not — a semáforo por dominio, an inventory, findings with impact and
// priority, the numbered steps of a manual — carry report_item rows.
export const reportSection = pgTable(
  "report_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    key: text("key").notNull(),
    kind: text("kind").notNull().default("prose"),
    heading: text("heading").notNull(),
    body: text("body"),
  },
  (table) => [
    index("report_section_report_idx").on(table.reportId, table.position),
    unique("report_section_key_unique").on(table.reportId, table.key),
    check(
      "report_section_kind_check",
      sql`${table.kind} in ('prose', 'findings', 'status_table', 'inventory', 'steps')`,
    ),
    check(
      "report_section_key_check",
      sql`btrim(${table.key}) <> '' and char_length(${table.key}) <= 60`,
    ),
    check(
      "report_section_heading_check",
      sql`btrim(${table.heading}) <> '' and char_length(${table.heading}) <= 200`,
    ),
    check(
      "report_section_body_length",
      sql`char_length(${table.body}) <= 20000`,
    ),
    check("report_section_position_check", sql`${table.position} >= 0`),
  ],
);

// A row inside a structured section.
//
// One table rather than four near-identical ones: a finding, a domain in the
// semáforo, a piece of equipment and a step of a manual are all "a labelled
// line with optional detail and an optional classification". Which of
// status, priority and impact apply is decided by the section's kind, and
// the service refuses the ones that do not.
export const reportItem = pgTable(
  "report_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => reportSection.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    body: text("body"),
    status: text("status"),
    priority: text("priority"),
    impact: text("impact"),
  },
  (table) => [
    index("report_item_section_idx").on(table.sectionId, table.position),
    check(
      "report_item_label_check",
      sql`btrim(${table.label}) <> '' and char_length(${table.label}) <= 200`,
    ),
    check("report_item_body_length", sql`char_length(${table.body}) <= 5000`),
    check(
      "report_item_status_check",
      sql`${table.status} is null or ${table.status} in ('ok', 'watch', 'risk')`,
    ),
    check(
      "report_item_priority_check",
      sql`${table.priority} is null or ${table.priority} in ('low', 'medium', 'high')`,
    ),
    check(
      "report_item_impact_length",
      sql`char_length(${table.impact}) <= 500`,
    ),
    check("report_item_position_check", sql`${table.position} >= 0`),
  ],
);

// A figure inside a section.
//
// It hangs off the SECTION and not off the report, because where an image
// sits is the whole point: a step of a manual carries its own screenshot,
// and "evidencia de entrega" carries its own. Hanging them off the report
// would leave the document guessing where each one belongs.
//
// Deliberately unlike billing_image, which is an immutable version a trigger
// refuses to update or delete: a logo has history worth keeping, while a
// figure in a draft is content being written. The author must be able to
// remove the wrong screenshot and reorder the right ones, so these rows are
// ordinary mutable rows. R6 freezes its own copy into the issued report.
//
// The bytes are what src/images/pipeline.ts produced: a re-encoded PNG with
// no metadata, never the raw upload. No public URL; they are served only
// through the application, to somebody who may reach the report.
export const reportImage = pgTable(
  "report_image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => reportSection.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    // The title is what the document prints above the figure, so it is
    // required: an untitled screenshot in a client document is noise.
    title: text("title").notNull(),
    caption: text("caption"),
    data: bytea("data").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("report_image_section_idx").on(table.sectionId, table.position),
    check(
      "report_image_title_check",
      sql`btrim(${table.title}) <> '' and char_length(${table.title}) <= 200`,
    ),
    check(
      "report_image_caption_length",
      sql`char_length(${table.caption}) <= 500`,
    ),
    check("report_image_position_check", sql`${table.position} >= 0`),
    check("report_image_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "report_image_byte_size_check",
      sql`${table.byteSize} = octet_length(${table.data}) and ${table.byteSize} between 1 and 524288`,
    ),
    check(
      "report_image_dimensions_check",
      sql`${table.width} between 1 and 2000 and ${table.height} between 1 and 2000`,
    ),
  ],
);

// The recorded activities a report is built from.
//
// While the report is a draft this is a live link, not a copy: correcting an
// activity corrects the report, which is what keeps a draft from drifting
// away from the work it describes. Deleting the activity therefore removes
// it from the draft — a report must not keep asserting work whose record is
// gone. R6 freezes its own copy into the issued version, so an issued
// report is not rewritten by anything that happens afterwards.
export const reportActivity = pgTable(
  "report_activity",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => workActivity.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.activityId] }),
    index("report_activity_report_idx").on(table.reportId, table.position),
    check("report_activity_position_check", sql`${table.position} >= 0`),
  ],
);
