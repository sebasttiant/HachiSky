import {
  type AnyColumn,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
import { sumAmounts } from "./money.ts";
import {
  audit,
  authorize,
  type BillingActor,
  type BillingDeps,
  BillingRuleError,
  BillingValidationError,
  type Tx,
  UUID,
} from "./service.ts";
import {
  ACCOUNT_TYPE_LABEL,
  type AccountType,
  type Currency,
  DRAFT_MESSAGES,
  type DraftFieldErrors,
  type DraftInput,
  type DraftLineInput,
  type NewDraftInput,
  validateDraft,
  validateNewDraft,
} from "./validation.ts";

const {
  bankAccount,
  billingDocument,
  billingDocumentLine,
  client,
  declarationText,
  issuerProfile,
  signerProfile,
} = schema;

// Draft cuentas de cobro. Same rules as the other billing services: the role
// is checked first on every call (admin only, reads included), input is
// validated here, and every change writes its audit row in the same
// transaction. Audit rows carry the document id and changed field names
// only: never amounts, products, client data or texts.
//
// Every row a draft points at must be active when the draft is saved, and
// the bank account must belong to the draft's issuer and use its currency.
// Those rows are locked (FOR SHARE) while saving so they cannot be
// deactivated halfway. Completeness for issuing is checked in C5.

export interface DraftLine extends DraftLineInput {
  position: number;
}

export interface DraftRecord {
  id: string;
  status: "draft";
  clientId: string;
  client: {
    id: string;
    name: string;
    identificationType: string;
    identificationNumber: string;
    active: boolean;
  };
  issuerProfileId: string;
  issuer: { id: string; legalName: string; active: boolean };
  currency: Currency;
  bankAccountId: string | null;
  signerProfileId: string | null;
  declarationTextId: string | null;
  paymentTerms: string | null;
  lines: DraftLine[];
  totalMinor: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface DraftSummary {
  id: string;
  clientName: string;
  issuerName: string;
  currency: Currency;
  totalMinor: number;
  lineCount: number;
  updatedAt: Date;
}

export interface DraftOption {
  id: string;
  label: string;
  active: boolean;
}

// What the draft forms can choose from: active rows, plus the draft's own
// choices when they became inactive (shown as such, so the admin sees why
// saving asks to change them).
export interface DraftOptions {
  clients: DraftOption[];
  issuers: (DraftOption & { isDefault: boolean })[];
  bankAccounts: (DraftOption & {
    issuerProfileId: string | null;
    currency: Currency;
  })[];
  signers: DraftOption[];
  declarations: DraftOption[];
}

type DraftSelection = Partial<
  Pick<
    DraftRecord,
    | "clientId"
    | "issuerProfileId"
    | "bankAccountId"
    | "signerProfileId"
    | "declarationTextId"
  >
>;

const HEADER_FIELDS = [
  "clientId",
  "issuerProfileId",
  "currency",
  "bankAccountId",
  "signerProfileId",
  "declarationTextId",
  "paymentTerms",
] as const satisfies readonly (keyof DraftInput)[];

function invalid(errors: DraftFieldErrors): never {
  throw new BillingValidationError(errors);
}

async function isActive(
  tx: Tx,
  table:
    | typeof client
    | typeof issuerProfile
    | typeof signerProfile
    | typeof declarationText,
  id: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ active: table.active })
    .from(table)
    .where(eq(table.id, id))
    .for("share");
  return row?.active === true;
}

// Collects every reference problem at once so the form can mark them all.
async function checkReferences(
  tx: Tx,
  data: NewDraftInput & Partial<DraftInput>,
): Promise<void> {
  const errors: DraftFieldErrors = {};
  if (!(await isActive(tx, client, data.clientId)))
    errors.clientId = DRAFT_MESSAGES.clientId;
  if (!(await isActive(tx, issuerProfile, data.issuerProfileId)))
    errors.issuerProfileId = DRAFT_MESSAGES.issuerProfileId;
  if (data.bankAccountId) {
    const [account] = await tx
      .select({
        active: bankAccount.active,
        issuerProfileId: bankAccount.issuerProfileId,
        currency: bankAccount.currency,
      })
      .from(bankAccount)
      .where(eq(bankAccount.id, data.bankAccountId))
      .for("share");
    if (!account?.active) errors.bankAccountId = DRAFT_MESSAGES.bankAccountId;
    else if (account.issuerProfileId !== data.issuerProfileId)
      errors.bankAccountId = DRAFT_MESSAGES.bankAccountIssuer;
    else if (account.currency !== data.currency)
      errors.bankAccountId = DRAFT_MESSAGES.bankAccountCurrency;
  }
  if (
    data.signerProfileId &&
    !(await isActive(tx, signerProfile, data.signerProfileId))
  )
    errors.signerProfileId = DRAFT_MESSAGES.signerProfileId;
  if (
    data.declarationTextId &&
    !(await isActive(tx, declarationText, data.declarationTextId))
  )
    errors.declarationTextId = DRAFT_MESSAGES.declarationTextId;
  if (Object.keys(errors).length > 0) invalid(errors);
}

// Exported for the document view, which reads the same lines in the same
// order rather than repeating the query.
export async function selectDocumentLines(
  db: BillingDeps["db"] | Tx,
  documentId: string,
): Promise<DraftLine[]> {
  return db
    .select({
      position: billingDocumentLine.position,
      product: billingDocumentLine.product,
      description: billingDocumentLine.description,
      quantity: billingDocumentLine.quantity,
      amountMinor: billingDocumentLine.amountMinor,
    })
    .from(billingDocumentLine)
    .where(eq(billingDocumentLine.documentId, documentId))
    .orderBy(asc(billingDocumentLine.position));
}

function sameLines(
  current: readonly DraftLine[],
  next: readonly DraftLineInput[],
): boolean {
  return (
    current.length === next.length &&
    current.every((line, index) => {
      const other = next[index];
      return (
        other !== undefined &&
        line.product === other.product &&
        line.description === other.description &&
        line.quantity === other.quantity &&
        line.amountMinor === other.amountMinor
      );
    })
  );
}

export async function listDrafts(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<DraftSummary[]> {
  authorize(actorInput, "view_drafts");
  const rows = await deps.db
    .select({
      id: billingDocument.id,
      clientName: client.name,
      issuerName: issuerProfile.legalName,
      currency: billingDocument.currency,
      // At most 50 lines of at most 99.999.999.999.999 minor units each, so
      // the sum stays within the safe integer range.
      totalMinor:
        sql<number>`coalesce(sum(${billingDocumentLine.amountMinor}), 0)`.mapWith(
          Number,
        ),
      lineCount: count(billingDocumentLine.id),
      updatedAt: billingDocument.updatedAt,
    })
    .from(billingDocument)
    .innerJoin(client, eq(client.id, billingDocument.clientId))
    .innerJoin(
      issuerProfile,
      eq(issuerProfile.id, billingDocument.issuerProfileId),
    )
    .leftJoin(
      billingDocumentLine,
      eq(billingDocumentLine.documentId, billingDocument.id),
    )
    .where(eq(billingDocument.status, "draft"))
    .groupBy(billingDocument.id, client.name, issuerProfile.legalName)
    .orderBy(desc(billingDocument.updatedAt), asc(billingDocument.id));
  return rows.map((row) => ({ ...row, currency: row.currency as Currency }));
}

export async function getDraft(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<DraftRecord | null> {
  authorize(actorInput, "view_drafts");
  if (!UUID.test(id)) return null;
  const [row] = await deps.db
    .select({
      document: billingDocument,
      client: {
        id: client.id,
        name: client.name,
        identificationType: client.identificationType,
        identificationNumber: client.identificationNumber,
        active: client.active,
      },
      issuer: {
        id: issuerProfile.id,
        legalName: issuerProfile.legalName,
        active: issuerProfile.active,
      },
    })
    .from(billingDocument)
    .innerJoin(client, eq(client.id, billingDocument.clientId))
    .innerJoin(
      issuerProfile,
      eq(issuerProfile.id, billingDocument.issuerProfileId),
    )
    .where(and(eq(billingDocument.id, id), eq(billingDocument.status, "draft")))
    .limit(1);
  if (!row) return null;
  const lines = await selectDocumentLines(deps.db, id);
  return {
    ...row.document,
    status: "draft",
    currency: row.document.currency as Currency,
    client: row.client,
    issuer: row.issuer,
    lines,
    totalMinor: sumAmounts(lines.map((line) => line.amountMinor)),
  };
}

// A new draft starts with its client, issuer and currency, and the issuer's
// default payment terms. Nothing else is preselected, a declaration
// included.
export async function createDraft(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  raw: unknown,
): Promise<{ id: string }> {
  const actor = authorize(actorInput, "create_draft");
  const result = validateNewDraft(raw);
  if (!result.ok) invalid(result.fieldErrors);
  const data = result.data;
  return deps.db.transaction(async (tx) => {
    await checkReferences(tx, data);
    const [issuer] = await tx
      .select({ paymentTerms: issuerProfile.paymentTerms })
      .from(issuerProfile)
      .where(eq(issuerProfile.id, data.issuerProfileId));
    const [created] = await tx
      .insert(billingDocument)
      .values({
        ...data,
        paymentTerms: issuer?.paymentTerms ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning({ id: billingDocument.id });
    if (!created) throw new Error("draft insert returned no row");
    await audit(tx, actor, "billing.draft_create", {
      billingDocumentId: created.id,
    });
    return created;
  });
}

// Saves the whole draft: header and lines. The lines are replaced, in the
// order received.
export async function updateDraft(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit_draft");
  const result = validateDraft(raw);
  if (!result.ok) invalid(result.fieldErrors);
  const data = result.data;
  if (!UUID.test(id)) throw new BillingRuleError("draft_not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(billingDocument)
      .where(
        and(eq(billingDocument.id, id), eq(billingDocument.status, "draft")),
      )
      .for("update");
    if (!current) throw new BillingRuleError("draft_not_found");
    await checkReferences(tx, data);

    const linesChanged = !sameLines(
      await selectDocumentLines(tx, id),
      data.lines,
    );
    const changedFields: string[] = HEADER_FIELDS.filter(
      (field) => current[field] !== data[field],
    );
    if (linesChanged) changedFields.push("lines");
    if (changedFields.length === 0) return;

    const { lines, ...header } = data;
    await tx
      .update(billingDocument)
      .set({ ...header, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(billingDocument.id, id));
    if (linesChanged) {
      await tx
        .delete(billingDocumentLine)
        .where(eq(billingDocumentLine.documentId, id));
      if (lines.length > 0) {
        await tx.insert(billingDocumentLine).values(
          lines.map((line, index) => ({
            ...line,
            documentId: id,
            position: index + 1,
          })),
        );
      }
    }
    await audit(tx, actor, "billing.draft_update", {
      billingDocumentId: id,
      changedFields,
    });
  });
}

// A draft has no number, so discarding deletes it with its lines. The audit
// row keeps its id.
export async function discardDraft(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<void> {
  const actor = authorize(actorInput, "discard_draft");
  if (!UUID.test(id)) throw new BillingRuleError("draft_not_found");
  await deps.db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(billingDocument)
      .where(
        and(eq(billingDocument.id, id), eq(billingDocument.status, "draft")),
      )
      .returning({ id: billingDocument.id });
    if (!deleted) throw new BillingRuleError("draft_not_found");
    await audit(tx, actor, "billing.draft_discard", { billingDocumentId: id });
  });
}

function activeOr(
  active: AnyColumn,
  id: AnyColumn,
  selected: string | null | undefined,
) {
  return selected
    ? or(eq(active, true), inArray(id, [selected]))
    : eq(active, true);
}

// Only the last four digits of an account number are shown in pickers.
function bankAccountLabel(row: {
  bankName: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
  currency: string;
}): string {
  const type = ACCOUNT_TYPE_LABEL[row.accountType as AccountType] ?? "";
  return `${row.bankName} · ${type} ···${row.accountNumber.slice(-4)} · ${row.holderName} · ${row.currency}`;
}

export async function getDraftOptions(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  selected: DraftSelection = {},
): Promise<DraftOptions> {
  authorize(actorInput, "view_drafts");
  const db = deps.db;
  const [clients, issuers, accounts, signers, declarations] = await Promise.all(
    [
      db
        .select({
          id: client.id,
          name: client.name,
          identificationType: client.identificationType,
          identificationNumber: client.identificationNumber,
          active: client.active,
        })
        .from(client)
        .where(activeOr(client.active, client.id, selected.clientId))
        .orderBy(asc(client.name), asc(client.id)),
      db
        .select({
          id: issuerProfile.id,
          label: issuerProfile.legalName,
          active: issuerProfile.active,
          isDefault: issuerProfile.isDefault,
        })
        .from(issuerProfile)
        .where(
          activeOr(
            issuerProfile.active,
            issuerProfile.id,
            selected.issuerProfileId,
          ),
        )
        .orderBy(
          desc(issuerProfile.isDefault),
          asc(issuerProfile.legalName),
          asc(issuerProfile.id),
        ),
      db
        .select({
          id: bankAccount.id,
          bankName: bankAccount.bankName,
          accountType: bankAccount.accountType,
          accountNumber: bankAccount.accountNumber,
          holderName: bankAccount.holderName,
          currency: bankAccount.currency,
          issuerProfileId: bankAccount.issuerProfileId,
          active: bankAccount.active,
        })
        .from(bankAccount)
        .where(
          activeOr(bankAccount.active, bankAccount.id, selected.bankAccountId),
        )
        .orderBy(asc(bankAccount.bankName), asc(bankAccount.id)),
      db
        .select({
          id: signerProfile.id,
          fullName: signerProfile.fullName,
          jobTitle: signerProfile.jobTitle,
          active: signerProfile.active,
        })
        .from(signerProfile)
        .where(
          activeOr(
            signerProfile.active,
            signerProfile.id,
            selected.signerProfileId,
          ),
        )
        .orderBy(asc(signerProfile.fullName), asc(signerProfile.id)),
      db
        .select({
          id: declarationText.id,
          label: declarationText.label,
          active: declarationText.active,
        })
        .from(declarationText)
        .where(
          activeOr(
            declarationText.active,
            declarationText.id,
            selected.declarationTextId,
          ),
        )
        .orderBy(
          asc(sql`lower(${declarationText.label})`),
          asc(declarationText.id),
        ),
    ],
  );
  return {
    clients: clients.map((row) => ({
      id: row.id,
      label: `${row.name} · ${row.identificationType} ${row.identificationNumber}`,
      active: row.active,
    })),
    issuers,
    bankAccounts: accounts.map((row) => ({
      id: row.id,
      label: bankAccountLabel(row),
      issuerProfileId: row.issuerProfileId,
      currency: row.currency as Currency,
      active: row.active,
    })),
    signers: signers.map((row) => ({
      id: row.id,
      label: `${row.fullName} · ${row.jobTitle}`,
      active: row.active,
    })),
    declarations,
  };
}
