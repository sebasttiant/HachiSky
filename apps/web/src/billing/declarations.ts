import { asc, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
import {
  audit,
  authorize,
  type BillingActor,
  type BillingDeps,
  BillingRuleError,
  BillingValidationError,
  pgErrorCode,
  UUID,
} from "./service.ts";
import { type DeclarationInput, validateDeclaration } from "./validation.ts";

const { declarationText } = schema;

// Tax declaration texts. Same rules as signers.ts: the role is checked first
// on every call (admin only, reads included), input is validated here, and
// every change writes its audit row in the same transaction. Audit rows carry
// the id and changed field names only, never the texts. There is no default
// text and nothing here marks one as preselected (owner, 2026-10-07).

export interface DeclarationRecord extends DeclarationInput {
  id: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

const DECLARATION_FIELDS = [
  "label",
  "body",
] as const satisfies readonly (keyof DeclarationInput)[];

function parseDeclaration(raw: unknown): DeclarationInput {
  const result = validateDeclaration(raw);
  if (!result.ok) throw new BillingValidationError(result.fieldErrors);
  return result.data;
}

function mapDuplicateDeclaration(error: unknown): never {
  if (pgErrorCode(error) === "23505") {
    throw new BillingRuleError("duplicate_declaration");
  }
  throw error;
}

export async function listDeclarations(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<DeclarationRecord[]> {
  authorize(actorInput, "view_declarations");
  return deps.db
    .select()
    .from(declarationText)
    .orderBy(
      desc(declarationText.active),
      asc(sql`lower(${declarationText.label})`),
      asc(declarationText.id),
    );
}

export async function getDeclaration(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<DeclarationRecord | null> {
  authorize(actorInput, "view_declarations");
  if (!UUID.test(id)) return null;
  const [row] = await deps.db
    .select()
    .from(declarationText)
    .where(eq(declarationText.id, id))
    .limit(1);
  return row ?? null;
}

export async function createDeclaration(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  raw: unknown,
): Promise<{ id: string }> {
  const actor = authorize(actorInput, "create_declaration");
  const data = parseDeclaration(raw);
  try {
    return await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(declarationText)
        .values({ ...data, createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: declarationText.id });
      if (!created) throw new Error("declaration insert returned no row");
      await audit(tx, actor, "billing.declaration_create", {
        declarationTextId: created.id,
      });
      return created;
    });
  } catch (error) {
    return mapDuplicateDeclaration(error);
  }
}

export async function updateDeclaration(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit_declaration");
  const data = parseDeclaration(raw);
  if (!UUID.test(id)) throw new BillingRuleError("declaration_not_found");
  try {
    await deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(declarationText)
        .where(eq(declarationText.id, id))
        .for("update");
      if (!current) throw new BillingRuleError("declaration_not_found");
      const changedFields = DECLARATION_FIELDS.filter(
        (field) => current[field] !== data[field],
      );
      if (changedFields.length === 0) return;
      await tx
        .update(declarationText)
        .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
        .where(eq(declarationText.id, id));
      await audit(tx, actor, "billing.declaration_update", {
        declarationTextId: id,
        changedFields,
      });
    });
  } catch (error) {
    mapDuplicateDeclaration(error);
  }
}

export async function setDeclarationActive(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  active: boolean,
): Promise<void> {
  const actor = authorize(
    actorInput,
    active ? "reactivate_declaration" : "deactivate_declaration",
  );
  if (!UUID.test(id)) throw new BillingRuleError("declaration_not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ active: declarationText.active })
      .from(declarationText)
      .where(eq(declarationText.id, id))
      .for("update");
    if (!current) throw new BillingRuleError("declaration_not_found");
    if (current.active === active) return;
    await tx
      .update(declarationText)
      .set({ active, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(declarationText.id, id));
    await audit(
      tx,
      actor,
      active
        ? "billing.declaration_activate"
        : "billing.declaration_deactivate",
      { declarationTextId: id },
    );
  });
}
