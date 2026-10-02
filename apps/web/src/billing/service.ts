import { asc, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RoleName } from "../auth/session.ts";
import * as schema from "../db/schema/index.ts";
import {
  type BillingSettingsOperation,
  canPerformBillingSettingsOperation,
} from "./permissions.ts";
import {
  type BankAccountFieldErrors,
  type BankAccountInput,
  type IssuerFieldErrors,
  type IssuerInput,
  type SignerFieldErrors,
  validateBankAccount,
  validateIssuer,
} from "./validation.ts";

const { auditLog, bankAccount, issuerSettings } = schema;

// Business rules for the billing settings: the issuer (single row), bank
// accounts and the default payment terms. The service is the authority: every
// operation checks the actor's role first (admin only, reads included),
// validates and normalizes its own input, and writes the audit row in the same
// transaction as the change. Audit details carry ids and changed field names
// only: never account numbers, identification numbers, phones or emails (the
// trail is append-only, so nothing written there can be erased).

export type Db = NodePgDatabase<typeof schema>;
export interface BillingDeps {
  db: Db;
}

export interface BillingActor {
  id: string;
  role: RoleName;
  ipAddress: string | null;
  userAgent: string | null;
}

export type BillingRuleCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "duplicate_bank_account"
  | "signer_not_found"
  | "duplicate_signer"
  | "issuer_not_configured";

export class BillingRuleError extends Error {
  readonly code: BillingRuleCode;
  constructor(code: BillingRuleCode) {
    super(code);
    this.name = "BillingRuleError";
    this.code = code;
  }
}

export class BillingValidationError extends Error {
  readonly fieldErrors: IssuerFieldErrors &
    BankAccountFieldErrors &
    SignerFieldErrors;
  constructor(
    fieldErrors: IssuerFieldErrors | BankAccountFieldErrors | SignerFieldErrors,
  ) {
    super("invalid billing settings");
    this.name = "BillingValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export interface IssuerRecord extends IssuerInput {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface BankAccountRecord extends BankAccountInput {
  id: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUER_ROW_ID = 1;

// Runs before anything else, so a refused actor never reaches validation or
// the database. A missing actor is "no session"; an unknown role is refused.
export function authorize(
  actor: BillingActor | null | undefined,
  operation: BillingSettingsOperation,
): BillingActor {
  if (!actor || typeof actor.id !== "string" || actor.id === "") {
    throw new BillingRuleError("unauthenticated");
  }
  if (!canPerformBillingSettingsOperation(actor.role, operation)) {
    throw new BillingRuleError("forbidden");
  }
  return actor;
}

export function pgErrorCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function mapUniqueViolation(error: unknown): never {
  if (pgErrorCode(error) === "23505") {
    throw new BillingRuleError("duplicate_bank_account");
  }
  throw error;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function audit(
  tx: Tx,
  actor: BillingActor,
  action: string,
  details: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({
    actorUserId: actor.id,
    action,
    targetUserId: null,
    details,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

function parseIssuer(raw: unknown): IssuerInput {
  const result = validateIssuer(raw);
  if (!result.ok) throw new BillingValidationError(result.fieldErrors);
  return result.data;
}

function parseBankAccount(raw: unknown): BankAccountInput {
  const result = validateBankAccount(raw);
  if (!result.ok) throw new BillingValidationError(result.fieldErrors);
  return result.data;
}

const ISSUER_FIELDS = [
  "legalName",
  "identificationType",
  "identificationNumber",
  "address",
  "city",
  "phone",
  "email",
  "paymentTerms",
] as const satisfies readonly (keyof IssuerInput)[];

const BANK_ACCOUNT_FIELDS = [
  "bankName",
  "accountType",
  "accountNumber",
  "holderName",
  "holderIdentificationType",
  "holderIdentificationNumber",
  "currency",
] as const satisfies readonly (keyof BankAccountInput)[];

type IssuerRow = typeof issuerSettings.$inferSelect;
type BankAccountRow = typeof bankAccount.$inferSelect;

function toIssuerRecord(row: IssuerRow): IssuerRecord {
  const {
    id: _id,
    logoImageId: _logoImageId,
    logoImagePurpose: _logoImagePurpose,
    ...rest
  } = row;
  return {
    ...rest,
    identificationType:
      row.identificationType as IssuerRecord["identificationType"],
  };
}

function toBankAccountRecord(row: BankAccountRow): BankAccountRecord {
  return {
    ...row,
    accountType: row.accountType as BankAccountRecord["accountType"],
    holderIdentificationType:
      row.holderIdentificationType as BankAccountRecord["holderIdentificationType"],
    currency: row.currency as BankAccountRecord["currency"],
  };
}

// ---- Issuer ---------------------------------------------------------------

// `null` means "not configured yet": there is no default issuer.
export async function getIssuerSettings(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<IssuerRecord | null> {
  authorize(actorInput, "view_issuer");
  const [row] = await deps.db
    .select()
    .from(issuerSettings)
    .where(eq(issuerSettings.id, ISSUER_ROW_ID))
    .limit(1);
  return row ? toIssuerRecord(row) : null;
}

export async function saveIssuerSettings(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  raw: unknown,
): Promise<{ created: boolean }> {
  const actor = authorize(actorInput, "save_issuer");
  const data = parseIssuer(raw);
  return deps.db.transaction(async (tx) => {
    // ON CONFLICT DO NOTHING makes concurrent first saves converge: the loser
    // waits for the winner's commit and then takes the update path below.
    const inserted = await tx
      .insert(issuerSettings)
      .values({
        ...data,
        id: ISSUER_ROW_ID,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .onConflictDoNothing()
      .returning({ id: issuerSettings.id });
    if (inserted.length > 0) {
      await audit(tx, actor, "billing.issuer_configure", {
        changedFields: ISSUER_FIELDS.filter((field) => data[field] !== null),
      });
      return { created: true };
    }
    const [current] = await tx
      .select()
      .from(issuerSettings)
      .where(eq(issuerSettings.id, ISSUER_ROW_ID))
      .for("update");
    if (!current) throw new Error("issuer settings row vanished");
    const changedFields = ISSUER_FIELDS.filter(
      (field) => current[field] !== data[field],
    );
    if (changedFields.length === 0) return { created: false };
    await tx
      .update(issuerSettings)
      .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(issuerSettings.id, ISSUER_ROW_ID));
    await audit(tx, actor, "billing.issuer_update", { changedFields });
    return { created: false };
  });
}

// ---- Bank accounts ----------------------------------------------------------

export async function listBankAccounts(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<BankAccountRecord[]> {
  authorize(actorInput, "view_bank_accounts");
  const rows = await deps.db
    .select()
    .from(bankAccount)
    .orderBy(
      desc(bankAccount.active),
      asc(bankAccount.bankName),
      asc(bankAccount.holderName),
      asc(bankAccount.id),
    );
  return rows.map(toBankAccountRecord);
}

export async function getBankAccount(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<BankAccountRecord | null> {
  authorize(actorInput, "view_bank_accounts");
  if (!UUID.test(id)) return null;
  const [row] = await deps.db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.id, id))
    .limit(1);
  return row ? toBankAccountRecord(row) : null;
}

export async function createBankAccount(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  raw: unknown,
): Promise<{ id: string }> {
  const actor = authorize(actorInput, "create_bank_account");
  const data = parseBankAccount(raw);
  try {
    return await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(bankAccount)
        .values({ ...data, createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: bankAccount.id });
      if (!created) throw new Error("bank account insert returned no row");
      await audit(tx, actor, "billing.bank_account_create", {
        bankAccountId: created.id,
      });
      return created;
    });
  } catch (error) {
    return mapUniqueViolation(error);
  }
}

export async function updateBankAccount(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit_bank_account");
  const data = parseBankAccount(raw);
  if (!UUID.test(id)) throw new BillingRuleError("not_found");
  try {
    await deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(bankAccount)
        .where(eq(bankAccount.id, id))
        .for("update");
      if (!current) throw new BillingRuleError("not_found");
      const changedFields = BANK_ACCOUNT_FIELDS.filter(
        (field) => current[field] !== data[field],
      );
      if (changedFields.length === 0) return;
      await tx
        .update(bankAccount)
        .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
        .where(eq(bankAccount.id, id));
      await audit(tx, actor, "billing.bank_account_update", {
        bankAccountId: id,
        changedFields,
      });
    });
  } catch (error) {
    mapUniqueViolation(error);
  }
}

export async function setBankAccountActive(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  active: boolean,
): Promise<void> {
  const actor = authorize(
    actorInput,
    active ? "reactivate_bank_account" : "deactivate_bank_account",
  );
  if (!UUID.test(id)) throw new BillingRuleError("not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ active: bankAccount.active })
      .from(bankAccount)
      .where(eq(bankAccount.id, id))
      .for("update");
    if (!current) throw new BillingRuleError("not_found");
    if (current.active === active) return;
    await tx
      .update(bankAccount)
      .set({ active, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(bankAccount.id, id));
    await audit(
      tx,
      actor,
      active
        ? "billing.bank_account_activate"
        : "billing.bank_account_deactivate",
      { bankAccountId: id },
    );
  });
}
