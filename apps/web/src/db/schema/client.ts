import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// Persistent client records. Clients are deactivated, never deleted, so the
// audit trail and future billing documents keep a valid reference. RESTRICT
// keeps every user that created or changed a client.
export const client = pgTable(
  "client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    identificationType: text("identification_type").notNull(),
    // Normalized by the service (no separators); unique per type, inactive
    // clients included, so a client is reactivated instead of duplicated.
    identificationNumber: text("identification_number").notNull(),
    address: text("address"),
    city: text("city"),
    email: text("email"),
    phone: text("phone"),
    active: boolean("active").default(true).notNull(),
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
    unique("client_identification_unique").on(
      table.identificationType,
      table.identificationNumber,
    ),
    index("client_name_idx").on(table.name),
    index("client_active_idx").on(table.active),
    check(
      "client_identification_type_check",
      sql`${table.identificationType} in ('NIT', 'CC', 'CE', 'PP')`,
    ),
    check("client_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "client_identification_number_not_blank",
      sql`btrim(${table.identificationNumber}) <> ''`,
    ),
  ],
);
