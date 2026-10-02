import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// node-postgres reads and writes bytea as a Buffer.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

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
    // Current issuer logo version (see billing_image). The generated purpose
    // column lets the composite foreign key below accept only a logo.
    logoImageId: uuid("logo_image_id"),
    logoImagePurpose:
      text("logo_image_purpose").generatedAlwaysAs(sql`'issuer_logo'`),
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
    foreignKey({
      name: "issuer_settings_logo_image_fk",
      columns: [table.logoImageId, table.logoImagePurpose],
      foreignColumns: [billingImage.id, billingImage.purpose],
    }).onDelete("restrict"),
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

// People who may sign billing documents (the signer is separate from the
// author; IL Asesorías remains the issuer). Deactivated, never deleted. One
// profile per identification, inactive rows included. The current signature
// is a version of THIS signer's images: the composite foreign key refuses a
// version that belongs to another signer or to the issuer logo.
export const signerProfile = pgTable(
  "signer_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    identificationType: text("identification_type").notNull(),
    identificationNumber: text("identification_number").notNull(),
    jobTitle: text("job_title").notNull(),
    email: text("email").notNull(),
    active: boolean("active").default(true).notNull(),
    currentSignatureImageId: uuid("current_signature_image_id"),
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
    uniqueIndex("signer_profile_identification_unique").on(
      table.identificationType,
      table.identificationNumber,
    ),
    index("signer_profile_active_idx").on(table.active),
    foreignKey({
      name: "signer_profile_current_signature_fk",
      columns: [table.currentSignatureImageId, table.id],
      foreignColumns: [billingImage.id, billingImage.signerProfileId],
    }).onDelete("restrict"),
    check(
      "signer_profile_identification_type_check",
      sql`${table.identificationType} in ('NIT', 'CC', 'CE', 'PP')`,
    ),
    check(
      "signer_profile_full_name_not_blank",
      sql`btrim(${table.fullName}) <> ''`,
    ),
    check(
      "signer_profile_identification_number_not_blank",
      sql`btrim(${table.identificationNumber}) <> ''`,
    ),
    check(
      "signer_profile_job_title_not_blank",
      sql`btrim(${table.jobTitle}) <> ''`,
    ),
    check("signer_profile_email_not_blank", sql`btrim(${table.email}) <> ''`),
  ],
);

// Validated images (re-encoded PNG, never the raw upload), stored in the
// database as immutable versions: a new upload is a new row and the owner
// points at it; old rows are never changed or deleted (a trigger in
// migration 0005 refuses UPDATE and DELETE). No public URL: served only by
// app/api/billing/images/[id] to administrators.
export const billingImage = pgTable(
  "billing_image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: text("purpose").notNull(),
    signerProfileId: uuid("signer_profile_id").references(
      (): AnyPgColumn => signerProfile.id,
      { onDelete: "restrict" },
    ),
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
    unique("billing_image_id_signer_unique").on(
      table.id,
      table.signerProfileId,
    ),
    unique("billing_image_id_purpose_unique").on(table.id, table.purpose),
    index("billing_image_signer_profile_idx").on(table.signerProfileId),
    check(
      "billing_image_purpose_check",
      sql`${table.purpose} in ('signature', 'issuer_logo')`,
    ),
    check(
      "billing_image_owner_check",
      sql`(${table.purpose} = 'signature') = (${table.signerProfileId} is not null)`,
    ),
    check("billing_image_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "billing_image_byte_size_check",
      sql`${table.byteSize} = octet_length(${table.data}) and ${table.byteSize} between 1 and 524288`,
    ),
    check(
      "billing_image_dimensions_check",
      sql`${table.width} between 1 and 2000 and ${table.height} between 1 and 2000`,
    ),
  ],
);
