import { eq, sql } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
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

const { billingNumbering, issuerProfile } = schema;

// One continuous consecutive per issuer, independent of the client or the
// site (owner, 2026-10-10). This module owns where the series stands; it
// never assigns a number to a document. Reading the state, suggesting the
// next number and checking a proposed one are all advisory: none of them
// reserves or consumes a consecutive, and a draft never moves the series.
// Assigning a number belongs to issuance, which does not exist yet.

export const NUMBER_PREFIX = "CC-";
const NUMBER_MIN = 1;
const NUMBER_MAX = 99_999_999;
const NUMBER_PAD = 4;

// "CC-0045". Numbers past four digits simply grow; they are never truncated.
export function formatConsecutive(consecutive: number): string {
  return `${NUMBER_PREFIX}${String(consecutive).padStart(NUMBER_PAD, "0")}`;
}

// Accepts a whole positive number, as a number or as the string a form
// sends. Anything else — blank, decimal, exponent, sign, out of range — is
// not a consecutive.
export function parseConsecutive(raw: unknown): number | null {
  const text =
    typeof raw === "number"
      ? String(raw)
      : typeof raw === "string"
        ? raw.trim()
        : "";
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return null;
  if (value < NUMBER_MIN || value > NUMBER_MAX) return null;
  return value;
}

export interface NumberingState {
  issuerProfileId: string;
  // False while no administrator has said where the series continues from.
  configured: boolean;
  nextNumber: number | null;
  nextFormatted: string | null;
  // The last consecutive this platform assigned. Null when the series was
  // carried over from outside and nothing has been issued here yet.
  lastRegistered: number | null;
  lastRegisteredFormatted: string | null;
  updatedAt: Date | null;
}

export type PreviewReason =
  | "numbering_not_configured"
  | "invalid_number"
  | "numbering_backwards";

export interface ConsecutivePreview {
  issuerProfileId: string;
  valid: boolean;
  reason: PreviewReason | null;
  // The consecutive that would be used, once it is known to be usable.
  consecutive: number | null;
  formatted: string | null;
  // True when the proposed number leaves a gap in the series.
  skipsAhead: boolean;
  nextNumber: number | null;
  lastRegistered: number | null;
}

const UNCONFIGURED = (issuerProfileId: string): NumberingState => ({
  issuerProfileId,
  configured: false,
  nextNumber: null,
  nextFormatted: null,
  lastRegistered: null,
  lastRegisteredFormatted: null,
  updatedAt: null,
});

type NumberingRow = typeof billingNumbering.$inferSelect;

function toState(row: NumberingRow): NumberingState {
  return {
    issuerProfileId: row.issuerProfileId,
    configured: true,
    nextNumber: row.nextNumber,
    nextFormatted: formatConsecutive(row.nextNumber),
    lastRegistered: row.lastRegistered,
    lastRegisteredFormatted:
      row.lastRegistered === null
        ? null
        : formatConsecutive(row.lastRegistered),
    updatedAt: row.updatedAt,
  };
}

// The issuer must exist before it can have a series. FOR SHARE makes a
// concurrent deactivation wait for this write to finish.
async function assertIssuerExists(tx: Tx, issuerProfileId: string) {
  const [issuer] = await tx
    .select({ id: issuerProfile.id })
    .from(issuerProfile)
    .where(eq(issuerProfile.id, issuerProfileId))
    .for("share");
  if (!issuer) throw new BillingRuleError("issuer_not_found");
}

export async function getNumbering(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  issuerProfileId: string,
): Promise<NumberingState> {
  authorize(actorInput, "view_numbering");
  if (!UUID.test(issuerProfileId)) return UNCONFIGURED(issuerProfileId);
  const [row] = await deps.db
    .select()
    .from(billingNumbering)
    .where(eq(billingNumbering.issuerProfileId, issuerProfileId))
    .limit(1);
  return row ? toState(row) : UNCONFIGURED(issuerProfileId);
}

export interface NumberingInput {
  nextNumber: unknown;
}

// Sets where the series continues from. Forward only: an administrator may
// jump ahead, never back onto a number the series already passed.
export async function configureNumbering(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  issuerProfileId: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "configure_numbering");
  const nextNumber = parseConsecutive(
    (raw as NumberingInput | null | undefined)?.nextNumber,
  );
  if (nextNumber === null) {
    throw new BillingValidationError({
      nextNumber: "Escribe un número entero mayor que cero.",
    });
  }
  if (!UUID.test(issuerProfileId)) {
    throw new BillingRuleError("issuer_not_found");
  }

  await deps.db.transaction(async (tx) => {
    await assertIssuerExists(tx, issuerProfileId);
    const [current] = await tx
      .select()
      .from(billingNumbering)
      .where(eq(billingNumbering.issuerProfileId, issuerProfileId))
      .for("update");

    if (!current) {
      // Two administrators may configure the same issuer at once; the
      // primary key settles it and the loser simply re-reads the row.
      const inserted = await tx
        .insert(billingNumbering)
        .values({
          issuerProfileId,
          nextNumber,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .onConflictDoNothing({ target: billingNumbering.issuerProfileId })
        .returning({ issuerProfileId: billingNumbering.issuerProfileId });
      if (inserted.length > 0) {
        await audit(tx, actor, "billing.numbering_configure", {
          issuerProfileId,
          nextNumber,
          previousNextNumber: null,
        });
        return;
      }
      const [raced] = await tx
        .select()
        .from(billingNumbering)
        .where(eq(billingNumbering.issuerProfileId, issuerProfileId))
        .for("update");
      if (!raced) throw new Error("numbering row vanished after conflict");
      await applyForwardChange(tx, actor, raced, nextNumber);
      return;
    }

    await applyForwardChange(tx, actor, current, nextNumber);
  });
}

async function applyForwardChange(
  tx: Tx,
  actor: BillingActor,
  current: NumberingRow,
  nextNumber: number,
) {
  if (nextNumber === current.nextNumber) return;
  // Behind the series, or back onto a number already handed out.
  if (
    nextNumber < current.nextNumber ||
    (current.lastRegistered !== null && nextNumber <= current.lastRegistered)
  ) {
    throw new BillingRuleError("numbering_backwards");
  }
  await tx
    .update(billingNumbering)
    .set({ nextNumber, updatedBy: actor.id, updatedAt: sql`now()` })
    .where(eq(billingNumbering.issuerProfileId, current.issuerProfileId));
  await audit(tx, actor, "billing.numbering_configure", {
    issuerProfileId: current.issuerProfileId,
    nextNumber,
    previousNextNumber: current.nextNumber,
  });
}

// Advisory only. It answers "which number would this document take, and is
// the one I typed usable?" without reserving anything, so two previews can
// legitimately return the same number. Issuance has to check again.
export async function previewConsecutive(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  issuerProfileId: string,
  proposed: unknown,
): Promise<ConsecutivePreview> {
  const state = await getNumbering(deps, actorInput, issuerProfileId);

  const base: ConsecutivePreview = {
    issuerProfileId,
    valid: false,
    reason: null,
    consecutive: null,
    formatted: null,
    skipsAhead: false,
    nextNumber: state.nextNumber,
    lastRegistered: state.lastRegistered,
  };

  if (!state.configured || state.nextNumber === null) {
    return { ...base, reason: "numbering_not_configured" };
  }

  const wantsManual =
    proposed !== null && proposed !== undefined && proposed !== "";
  if (!wantsManual) {
    return {
      ...base,
      valid: true,
      consecutive: state.nextNumber,
      formatted: formatConsecutive(state.nextNumber),
    };
  }

  const consecutive = parseConsecutive(proposed);
  if (consecutive === null) return { ...base, reason: "invalid_number" };
  if (consecutive < state.nextNumber) {
    return { ...base, reason: "numbering_backwards" };
  }
  return {
    ...base,
    valid: true,
    consecutive,
    formatted: formatConsecutive(consecutive),
    skipsAhead: consecutive > state.nextNumber,
  };
}
