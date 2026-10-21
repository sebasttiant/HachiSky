import { asc, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
import { type DraftSummary, selectDocumentLines } from "./drafts.ts";
import { formatConsecutive } from "./numbering.ts";
import {
  audit,
  authorize,
  type BillingActor,
  type BillingDeps,
  BillingRuleError,
  UUID,
} from "./service.ts";

const { billingDocument, billingNumbering, client, issuerProfile } = schema;

// Issuing a cuenta de cobro.
//
// The consecutive is assigned here and nowhere else, in the same
// transaction that marks the document issued: the issuer's numbering row is
// locked, the document takes exactly its next number, and the series moves
// one step. Two issues of the same issuer therefore cannot share a number,
// and a refused issue consumes nothing — the series runs without gaps
// (owner, 2026-10-10). Annulment keeps its number reserved; that arrives
// with the annul action, not by reusing one here.
//
// A document may only go out complete: at least one line, a signer and a
// bank account — the three things the client needs from it. The declaration
// stays optional, as the owner has not made it mandatory.

export interface IssuedSummary extends DraftSummary {
  number: string;
  consecutive: number;
  issuedAt: Date;
}

export async function issueDraft(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<{ consecutive: number; formatted: string; issuedAt: Date }> {
  const actor = authorize(actorInput, "issue_draft");
  if (!UUID.test(id)) throw new BillingRuleError("draft_not_found");

  return deps.db.transaction(async (tx) => {
    const [document] = await tx
      .select()
      .from(billingDocument)
      .where(eq(billingDocument.id, id))
      .for("update");
    if (!document) throw new BillingRuleError("draft_not_found");
    if (document.status === "issued") {
      throw new BillingRuleError("already_issued");
    }

    // Completeness against the rows the document points at today, not the
    // ones it pointed at when it was saved.
    const lines = await selectDocumentLines(tx, id);
    const [account] = document.bankAccountId
      ? await tx
          .select({
            active: schema.bankAccount.active,
            issuerProfileId: schema.bankAccount.issuerProfileId,
            currency: schema.bankAccount.currency,
          })
          .from(schema.bankAccount)
          .where(eq(schema.bankAccount.id, document.bankAccountId))
          .for("share")
      : [];
    const [signer] = document.signerProfileId
      ? await tx
          .select({ active: schema.signerProfile.active })
          .from(schema.signerProfile)
          .where(eq(schema.signerProfile.id, document.signerProfileId))
          .for("share")
      : [];
    if (
      lines.length === 0 ||
      !signer?.active ||
      !account?.active ||
      account.issuerProfileId !== document.issuerProfileId ||
      account.currency !== document.currency
    ) {
      throw new BillingRuleError("draft_incomplete");
    }

    const [numbering] = await tx
      .select()
      .from(billingNumbering)
      .where(eq(billingNumbering.issuerProfileId, document.issuerProfileId))
      .for("update");
    if (!numbering) throw new BillingRuleError("numbering_not_configured");

    const consecutive = numbering.nextNumber;
    const [issued] = await tx
      .update(billingDocument)
      .set({
        status: "issued",
        consecutive,
        issuedAt: sql`now()`,
        updatedBy: actor.id,
        updatedAt: sql`now()`,
      })
      .where(eq(billingDocument.id, id))
      .returning({ issuedAt: billingDocument.issuedAt });
    if (!issued?.issuedAt) throw new Error("issue update returned no row");

    await tx
      .update(billingNumbering)
      .set({
        lastRegistered: consecutive,
        nextNumber: consecutive + 1,
        updatedBy: actor.id,
        updatedAt: sql`now()`,
      })
      .where(eq(billingNumbering.issuerProfileId, document.issuerProfileId));

    // The document id and the number it took: numbers are the series' own
    // record, never an amount or a client's data.
    await audit(tx, actor, "billing.draft_issue", {
      billingDocumentId: id,
      consecutive,
    });
    return {
      consecutive,
      formatted: formatConsecutive(consecutive),
      issuedAt: issued.issuedAt,
    };
  });
}

/** The issued cuentas, newest first, with the number each one carries. */
export async function listIssued(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<IssuedSummary[]> {
  authorize(actorInput, "view_drafts");
  const rows = await deps.db
    .select({
      id: billingDocument.id,
      clientName: client.name,
      issuerName: issuerProfile.legalName,
      currency: billingDocument.currency,
      totalMinor:
        sql<number>`coalesce(sum(${schema.billingDocumentLine.amountMinor}), 0)`.mapWith(
          Number,
        ),
      lineCount: count(schema.billingDocumentLine.id),
      updatedAt: billingDocument.updatedAt,
      consecutive: billingDocument.consecutive,
      issuedAt: billingDocument.issuedAt,
    })
    .from(billingDocument)
    .innerJoin(client, eq(client.id, billingDocument.clientId))
    .innerJoin(
      issuerProfile,
      eq(issuerProfile.id, billingDocument.issuerProfileId),
    )
    .leftJoin(
      schema.billingDocumentLine,
      eq(schema.billingDocumentLine.documentId, billingDocument.id),
    )
    .where(eq(billingDocument.status, "issued"))
    .groupBy(
      billingDocument.id,
      client.name,
      issuerProfile.legalName,
      billingDocument.consecutive,
      billingDocument.issuedAt,
    )
    .orderBy(desc(billingDocument.issuedAt), asc(billingDocument.id));
  return rows.map((row) => ({
    ...row,
    currency: row.currency as DraftSummary["currency"],
    // An issued row always carries both; the filter above is what says so.
    consecutive: row.consecutive as number,
    issuedAt: row.issuedAt as Date,
    number: formatConsecutive(row.consecutive as number),
  }));
}
