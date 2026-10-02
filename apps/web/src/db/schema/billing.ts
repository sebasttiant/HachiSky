import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// IL Asesorías is the only issuer, so its data is a single row. The primary
// key is pinned to 1 by a CHECK: a second row cannot exist. No row means "not
// configured yet"; nothing here is seeded with real data. RESTRICT keeps every
// user that created or changed it.
export const issuerSettings = pgTable(
  "issuer_settings",
  {
    id: smallint("id").primaryKey().default(1),
    legalName: text("legal_name").notNull(),
    identificationType: text("identification_type").notNull(),
    identificationNumber: text("identification_number").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    phone: text("phone"),
    email: text("email"),
    // Default payment terms copied into new documents (frozen on issue later).
    paymentTerms: text("payment_terms"),
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
    check("issuer_settings_singleton", sql`${table.id} = 1`),
    check(
      "issuer_settings_identification_type_check",
      sql`${table.identificationType} in ('NIT', 'CC', 'CE', 'PP')`,
    ),
    check(
      "issuer_settings_legal_name_not_blank",
      sql`btrim(${table.legalName}) <> ''`,
    ),
    check(
      "issuer_settings_identification_number_not_blank",
      sql`btrim(${table.identificationNumber}) <> ''`,
    ),
    check(
      "issuer_settings_address_not_blank",
      sql`btrim(${table.address}) <> ''`,
    ),
    check("issuer_settings_city_not_blank", sql`btrim(${table.city}) <> ''`),
    check(
      "issuer_settings_payment_terms_length",
      sql`char_length(${table.paymentTerms}) <= 1000`,
    ),
  ],
);

// Bank accounts shown on billing documents. Deactivated, never deleted, so
// issued documents keep a valid reference. The account number is stored as
// digits only. Uniqueness: one row per (bank name case-insensitively, number,
// currency), inactive rows included, so an account is reactivated instead of
// duplicated; currency is part of the key because a bank may hold the same
// number in two currencies and the document only ever uses one.
export const bankAccount = pgTable(
  "bank_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankName: text("bank_name").notNull(),
    accountType: text("account_type").notNull(),
    accountNumber: text("account_number").notNull(),
    holderName: text("holder_name").notNull(),
    holderIdentificationType: text("holder_identification_type").notNull(),
    holderIdentificationNumber: text("holder_identification_number").notNull(),
    currency: text("currency").notNull(),
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
    uniqueIndex("bank_account_bank_number_currency_unique").on(
      sql`lower(${table.bankName})`,
      table.accountNumber,
      table.currency,
    ),
    index("bank_account_active_idx").on(table.active),
    check(
      "bank_account_account_type_check",
      sql`${table.accountType} in ('ahorros', 'corriente')`,
    ),
    check(
      "bank_account_currency_check",
      sql`${table.currency} in ('COP', 'USD')`,
    ),
    check(
      "bank_account_holder_identification_type_check",
      sql`${table.holderIdentificationType} in ('NIT', 'CC', 'CE', 'PP')`,
    ),
    check(
      "bank_account_bank_name_not_blank",
      sql`btrim(${table.bankName}) <> ''`,
    ),
    check(
      "bank_account_holder_name_not_blank",
      sql`btrim(${table.holderName}) <> ''`,
    ),
    check(
      "bank_account_holder_identification_number_not_blank",
      sql`btrim(${table.holderIdentificationNumber}) <> ''`,
    ),
    check(
      "bank_account_account_number_digits",
      sql`${table.accountNumber} ~ '^[0-9]{4,20}$'`,
    ),
  ],
);
