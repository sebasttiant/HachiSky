import { and, eq } from "drizzle-orm";
import {
  bankAccount,
  billingDocument,
  declarationText,
  issuerProfile,
  signerProfile,
} from "../db/schema/billing.ts";
import { client } from "../db/schema/client.ts";
import type { DraftLine } from "./drafts.ts";
import { selectDocumentLines } from "./drafts.ts";
import { sumAmounts } from "./money.ts";
import {
  authorize,
  type BillingActor,
  type BillingDeps,
  BillingRuleError,
} from "./service.ts";
import type { Currency } from "./validation.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Everything the printed cuenta de cobro shows, resolved in one read. A draft
// has no number and no issue date: both arrive with issuing (C5), and the
// system never defaults a number, so they stay null here.
export interface DocumentView {
  id: string;
  status: "draft";
  number: string | null;
  issuedAt: Date | null;
  currency: Currency;
  client: {
    name: string;
    identificationType: string;
    identificationNumber: string;
    address: string | null;
    city: string | null;
  };
  issuer: {
    legalName: string;
    identificationType: string;
    identificationNumber: string;
    address: string;
    city: string;
    phone: string | null;
    email: string | null;
    logoImageId: string | null;
  };
  signer: {
    fullName: string;
    identificationType: string;
    identificationNumber: string;
    jobTitle: string;
    email: string;
    signatureImageId: string | null;
  } | null;
  bankAccount: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    holderName: string;
    currency: Currency;
  } | null;
  declaration: { body: string } | null;
  paymentTerms: string | null;
  lines: DraftLine[];
  totalMinor: number;
  updatedAt: Date;
}

// Reads the document view of a draft. Admin only, like every draft read: the
// service checks the role first, before touching the database.
export async function getDocumentView(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<DocumentView> {
  authorize(actorInput, "view_drafts");
  if (!UUID.test(id)) throw new BillingRuleError("draft_not_found");

  const [row] = await deps.db
    .select({
      document: billingDocument,
      client: {
        name: client.name,
        identificationType: client.identificationType,
        identificationNumber: client.identificationNumber,
        address: client.address,
        city: client.city,
      },
      issuer: {
        legalName: issuerProfile.legalName,
        identificationType: issuerProfile.identificationType,
        identificationNumber: issuerProfile.identificationNumber,
        address: issuerProfile.address,
        city: issuerProfile.city,
        phone: issuerProfile.phone,
        email: issuerProfile.email,
        logoImageId: issuerProfile.currentLogoImageId,
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
  if (!row) throw new BillingRuleError("draft_not_found");

  // The optional parties are read separately so an inactive or since-changed
  // row still prints exactly what the draft points at.
  const [signer, account, declaration, lines] = await Promise.all([
    row.document.signerProfileId
      ? selectSigner(deps, row.document.signerProfileId)
      : null,
    row.document.bankAccountId
      ? selectBankAccount(deps, row.document.bankAccountId)
      : null,
    row.document.declarationTextId
      ? selectDeclaration(deps, row.document.declarationTextId)
      : null,
    selectDocumentLines(deps.db, id),
  ]);

  return {
    id: row.document.id,
    status: "draft",
    number: null,
    issuedAt: null,
    currency: row.document.currency as Currency,
    client: row.client,
    issuer: row.issuer,
    signer,
    bankAccount: account,
    declaration,
    paymentTerms: row.document.paymentTerms,
    lines,
    totalMinor: sumAmounts(lines.map((line) => line.amountMinor)),
    updatedAt: row.document.updatedAt,
  };
}

async function selectSigner(
  deps: BillingDeps,
  id: string,
): Promise<DocumentView["signer"]> {
  const [found] = await deps.db
    .select({
      fullName: signerProfile.fullName,
      identificationType: signerProfile.identificationType,
      identificationNumber: signerProfile.identificationNumber,
      jobTitle: signerProfile.jobTitle,
      email: signerProfile.email,
      signatureImageId: signerProfile.currentSignatureImageId,
    })
    .from(signerProfile)
    .where(eq(signerProfile.id, id))
    .limit(1);
  return found ?? null;
}

async function selectBankAccount(
  deps: BillingDeps,
  id: string,
): Promise<DocumentView["bankAccount"]> {
  const [found] = await deps.db
    .select({
      bankName: bankAccount.bankName,
      accountType: bankAccount.accountType,
      accountNumber: bankAccount.accountNumber,
      holderName: bankAccount.holderName,
      currency: bankAccount.currency,
    })
    .from(bankAccount)
    .where(eq(bankAccount.id, id))
    .limit(1);
  if (!found) return null;
  return { ...found, currency: found.currency as Currency };
}

async function selectDeclaration(
  deps: BillingDeps,
  id: string,
): Promise<DocumentView["declaration"]> {
  const [found] = await deps.db
    .select({ body: declarationText.body })
    .from(declarationText)
    .where(eq(declarationText.id, id))
    .limit(1);
  return found ?? null;
}
