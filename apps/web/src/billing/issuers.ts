import { asc, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
import { type ImageDecoder, sharpDecoder } from "./image.ts";
import {
  audit,
  authorize,
  type BillingActor,
  type BillingDeps,
  BillingRuleError,
  BillingValidationError,
  pgErrorCode,
  type Tx,
  UUID,
} from "./service.ts";
import {
  type ImageUpload,
  type ImageVersionSummary,
  insertImage,
  readUpload,
  summaryColumns,
} from "./signers.ts";
import { type IssuerInput, validateIssuer } from "./validation.ts";

const { billingImage, issuerLogo, issuerProfile } = schema;

// Issuer profiles: the entities billing documents are issued for. Same
// rules as service.ts and signers.ts: the role is checked first on every
// call (admin only, reads included), input is validated here, and every
// change writes its audit row in the same transaction. Audit details carry
// ids and changed field names only, never identification numbers, phones or
// emails.
//
// Default issuer: at most one, always active (enforced by the database too).
// The first issuer created while no default exists becomes the default; the
// default cannot be deactivated (another issuer must be made the default
// first). Nothing is reassigned silently.

export interface IssuerRecord extends IssuerInput {
  id: string;
  active: boolean;
  isDefault: boolean;
  logo: ImageVersionSummary | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
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

// Serializes every decision about which issuer is the default (first
// create, default switch), so concurrent requests cannot both see "no
// default" or race on the partial unique index. Transaction-scoped: released
// on commit or rollback.
const DEFAULT_ISSUER_LOCK = sql`select pg_advisory_xact_lock(hashtext('billing.issuer_profile.default'))`;

function parseIssuer(raw: unknown): IssuerInput {
  const result = validateIssuer(raw);
  if (!result.ok) throw new BillingValidationError(result.fieldErrors);
  return result.data;
}

function mapDuplicateIssuer(error: unknown): never {
  if (pgErrorCode(error) === "23505") {
    throw new BillingRuleError("duplicate_issuer");
  }
  throw error;
}

type IssuerRow = typeof issuerProfile.$inferSelect;

function toIssuerRecord(
  row: IssuerRow,
  logo: ImageVersionSummary | null,
): IssuerRecord {
  const { currentLogoImageId: _current, ...rest } = row;
  return {
    ...rest,
    identificationType:
      row.identificationType as IssuerRecord["identificationType"],
    logo,
  };
}

async function selectIssuers(deps: BillingDeps, id?: string) {
  const query = deps.db
    .select({ issuer: issuerProfile, logo: summaryColumns })
    .from(issuerProfile)
    .leftJoin(
      billingImage,
      eq(billingImage.id, issuerProfile.currentLogoImageId),
    );
  const rows = await (id
    ? query.where(eq(issuerProfile.id, id)).limit(1)
    : query.orderBy(
        desc(issuerProfile.isDefault),
        desc(issuerProfile.active),
        asc(issuerProfile.legalName),
        asc(issuerProfile.id),
      ));
  return rows.map((row) => toIssuerRecord(row.issuer, row.logo));
}

// Locks one issuer row for the rest of the transaction.
async function lockIssuer(tx: Tx, id: string) {
  const [current] = await tx
    .select()
    .from(issuerProfile)
    .where(eq(issuerProfile.id, id))
    .for("update");
  if (!current) throw new BillingRuleError("issuer_not_found");
  return current;
}

// ---- Reads ------------------------------------------------------------------

// Default first, then active issuers by name, then inactive ones.
export async function listIssuers(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<IssuerRecord[]> {
  authorize(actorInput, "view_issuers");
  return selectIssuers(deps);
}

export async function getIssuer(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<IssuerRecord | null> {
  authorize(actorInput, "view_issuers");
  if (!UUID.test(id)) return null;
  const [record] = await selectIssuers(deps, id);
  return record ?? null;
}

// Every logo version this issuer ever had (the current one included).
export async function countIssuerLogoVersions(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<number> {
  authorize(actorInput, "view_issuers");
  if (!UUID.test(id)) return 0;
  const [row] = await deps.db
    .select({ n: count() })
    .from(issuerLogo)
    .where(eq(issuerLogo.issuerProfileId, id));
  return row?.n ?? 0;
}

// ---- Changes ----------------------------------------------------------------

export async function createIssuer(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  raw: unknown,
): Promise<{ id: string; isDefault: boolean }> {
  const actor = authorize(actorInput, "create_issuer");
  const data = parseIssuer(raw);
  try {
    return await deps.db.transaction(async (tx) => {
      await tx.execute(DEFAULT_ISSUER_LOCK);
      const [existing] = await tx
        .select({ id: issuerProfile.id })
        .from(issuerProfile)
        .where(eq(issuerProfile.isDefault, true))
        .limit(1);
      const isDefault = !existing;
      const [created] = await tx
        .insert(issuerProfile)
        .values({
          ...data,
          isDefault,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: issuerProfile.id });
      if (!created) throw new Error("issuer insert returned no row");
      await audit(tx, actor, "billing.issuer_create", {
        issuerProfileId: created.id,
        isDefault,
      });
      return { id: created.id, isDefault };
    });
  } catch (error) {
    return mapDuplicateIssuer(error);
  }
}

export async function updateIssuer(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit_issuer");
  const data = parseIssuer(raw);
  if (!UUID.test(id)) throw new BillingRuleError("issuer_not_found");
  try {
    await deps.db.transaction(async (tx) => {
      const current = await lockIssuer(tx, id);
      const changedFields = ISSUER_FIELDS.filter(
        (field) => current[field] !== data[field],
      );
      if (changedFields.length === 0) return;
      await tx
        .update(issuerProfile)
        .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
        .where(eq(issuerProfile.id, id));
      await audit(tx, actor, "billing.issuer_update", {
        issuerProfileId: id,
        changedFields,
      });
    });
  } catch (error) {
    mapDuplicateIssuer(error);
  }
}

export async function setIssuerActive(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  active: boolean,
): Promise<void> {
  const actor = authorize(
    actorInput,
    active ? "reactivate_issuer" : "deactivate_issuer",
  );
  if (!UUID.test(id)) throw new BillingRuleError("issuer_not_found");
  await deps.db.transaction(async (tx) => {
    const current = await lockIssuer(tx, id);
    if (current.active === active) return;
    if (!active && current.isDefault) {
      throw new BillingRuleError("issuer_is_default");
    }
    await tx
      .update(issuerProfile)
      .set({ active, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(issuerProfile.id, id));
    await audit(
      tx,
      actor,
      active ? "billing.issuer_activate" : "billing.issuer_deactivate",
      { issuerProfileId: id },
    );
  });
}

// Moves the default to this issuer in one transaction: the previous default
// is cleared first (the partial unique index is not deferrable), then this
// one is set. Only an active issuer can be the default.
export async function setDefaultIssuer(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<void> {
  const actor = authorize(actorInput, "set_default_issuer");
  if (!UUID.test(id)) throw new BillingRuleError("issuer_not_found");
  await deps.db.transaction(async (tx) => {
    await tx.execute(DEFAULT_ISSUER_LOCK);
    const current = await lockIssuer(tx, id);
    if (!current.active) throw new BillingRuleError("issuer_inactive");
    if (current.isDefault) return;
    const previous = await tx
      .update(issuerProfile)
      .set({ isDefault: false, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(issuerProfile.isDefault, true))
      .returning({ id: issuerProfile.id });
    await tx
      .update(issuerProfile)
      .set({ isDefault: true, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(issuerProfile.id, id));
    await audit(tx, actor, "billing.issuer_set_default", {
      issuerProfileId: id,
      previousDefaultId: previous[0]?.id ?? null,
    });
  });
}

// ---- Logo -------------------------------------------------------------------

// A new upload is a new immutable version owned by this issuer (issuer_logo),
// and this issuer then points at it. Other issuers are never touched; earlier
// versions stay (issued documents will reference the exact version). Only an
// active issuer receives a new logo.
export async function uploadIssuerLogo(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  upload: ImageUpload,
  decoder: ImageDecoder = sharpDecoder,
): Promise<{ imageId: string }> {
  const actor = authorize(actorInput, "upload_issuer_logo");
  if (!UUID.test(id)) throw new BillingRuleError("issuer_not_found");
  const image = await readUpload(upload, "issuer_logo", decoder);
  return deps.db.transaction(async (tx) => {
    const current = await lockIssuer(tx, id);
    if (!current.active) throw new BillingRuleError("issuer_inactive");
    const imageId = await insertImage(tx, actor, "issuer_logo", null, image);
    await tx.insert(issuerLogo).values({ imageId, issuerProfileId: id });
    await tx
      .update(issuerProfile)
      .set({
        currentLogoImageId: imageId,
        updatedBy: actor.id,
        updatedAt: sql`now()`,
      })
      .where(eq(issuerProfile.id, id));
    await audit(tx, actor, "billing.issuer_logo_upload", {
      issuerProfileId: id,
      imageId,
      sha256: image.sha256,
      byteSize: image.byteSize,
    });
    return { imageId };
  });
}
