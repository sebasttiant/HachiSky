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
  primaryKey,
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

// Issuer profiles: the entities billing documents are issued for (HachiSky
// is the platform, not necessarily the issuer). Deactivated, never deleted,
// so issued documents keep a valid reference. One profile per
// identification, inactive rows included (reactivate instead of
// duplicating). At most one default profile, and the default is always
// active. The current logo is a version owned by THIS profile (see
// issuer_logo): the composite foreign key refuses another issuer's logo.
// Nothing here is seeded with real data. RESTRICT keeps every user that
// created or changed a profile.
export const issuerProfile = pgTable(
  "issuer_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legalName: text("legal_name").notNull(),
    identificationType: text("identification_type").notNull(),
    identificationNumber: text("identification_number").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    phone: text("phone"),
    email: text("email"),
    // Default payment terms copied into new documents (frozen on issue later).
    paymentTerms: text("payment_terms"),
    active: boolean("active").default(true).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    currentLogoImageId: uuid("current_logo_image_id"),
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
    uniqueIndex("issuer_profile_identification_unique").on(
      table.identificationType,
      table.identificationNumber,
    ),
    uniqueIndex("issuer_profile_single_default")
      .on(table.isDefault)
      .where(sql`${table.isDefault}`),
    index("issuer_profile_active_idx").on(table.active),
    foreignKey({
      name: "issuer_profile_current_logo_fk",
      columns: [table.currentLogoImageId, table.id],
      foreignColumns: [issuerLogo.imageId, issuerLogo.issuerProfileId],
    }).onDelete("restrict"),
    check(
      "issuer_profile_default_is_active",
      sql`not ${table.isDefault} or ${table.active}`,
    ),
    check(
      "issuer_profile_identification_type_check",
      sql`${table.identificationType} in ('NIT', 'CC', 'CE', 'PP')`,
    ),
    check(
      "issuer_profile_legal_name_not_blank",
      sql`btrim(${table.legalName}) <> ''`,
    ),
    check(
      "issuer_profile_identification_number_not_blank",
      sql`btrim(${table.identificationNumber}) <> ''`,
    ),
    check(
      "issuer_profile_address_not_blank",
      sql`btrim(${table.address}) <> ''`,
    ),
    check("issuer_profile_city_not_blank", sql`btrim(${table.city}) <> ''`),
    check(
      "issuer_profile_payment_terms_length",
      sql`char_length(${table.paymentTerms}) <= 1000`,
    ),
  ],
);

// Which issuer owns each logo version. billing_image rows are immutable and
// carry no issuer, so ownership lives here, immutable too (a trigger in
// migration 0006 refuses UPDATE and DELETE). The generated purpose column
// lets the composite foreign key accept only an issuer logo image.
export const issuerLogo = pgTable(
  "issuer_logo",
  {
    imageId: uuid("image_id").notNull(),
    imagePurpose: text("image_purpose").generatedAlwaysAs(sql`'issuer_logo'`),
    issuerProfileId: uuid("issuer_profile_id")
      .notNull()
      .references((): AnyPgColumn => issuerProfile.id, {
        onDelete: "restrict",
      }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "issuer_logo_pkey", columns: [table.imageId] }),
    unique("issuer_logo_image_issuer_unique").on(
      table.imageId,
      table.issuerProfileId,
    ),
    index("issuer_logo_issuer_profile_idx").on(table.issuerProfileId),
    foreignKey({
      name: "issuer_logo_image_fk",
      columns: [table.imageId, table.imagePurpose],
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
    // Null only for accounts that existed before issuer profiles and could
    // not be assigned unambiguously; the app requires an active issuer on
    // every create and update.
    issuerProfileId: uuid("issuer_profile_id").references(
      () => issuerProfile.id,
      { onDelete: "restrict" },
    ),
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
    index("bank_account_issuer_profile_idx").on(table.issuerProfileId),
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
// author and from the issuer profile). Deactivated, never deleted. One
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
