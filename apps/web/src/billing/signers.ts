import { asc, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
import {
  BillingImageError,
  IMAGE_LIMITS,
  type ImageDecoder,
  type ImagePurpose,
  type ProcessedImage,
  processImage,
  sharpDecoder,
} from "./image.ts";
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
import { type SignerInput, validateSigner } from "./validation.ts";

const { billingImage, signerProfile } = schema;

// Signer profiles and their graphic signatures, plus the image helpers that
// issuers.ts reuses for issuer logos. Same rules as service.ts: the role is
// checked first on every call (admin only, reads included), input is
// validated here, and every change writes its audit row in the same
// transaction. Images go through image.ts and are stored as immutable
// versions; audit rows carry ids, hash and size only, never bytes or
// personal values.

export interface ImageVersionSummary {
  id: string;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: Date;
}

export interface StoredImage extends ImageVersionSummary {
  purpose: ImagePurpose;
  data: Buffer;
}

export interface SignerRecord extends SignerInput {
  id: string;
  active: boolean;
  signature: ImageVersionSummary | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

// A Blob (a File from the form) or anything exposing its size before its
// bytes, so the byte limit is checked before the upload is read.
export type ImageUpload = Pick<Blob, "size" | "arrayBuffer">;

const SIGNER_FIELDS = [
  "fullName",
  "identificationType",
  "identificationNumber",
  "jobTitle",
  "email",
] as const satisfies readonly (keyof SignerInput)[];

export const summaryColumns = {
  id: billingImage.id,
  sha256: billingImage.sha256,
  byteSize: billingImage.byteSize,
  width: billingImage.width,
  height: billingImage.height,
  createdAt: billingImage.createdAt,
};

function parseSigner(raw: unknown): SignerInput {
  const result = validateSigner(raw);
  if (!result.ok) throw new BillingValidationError(result.fieldErrors);
  return result.data;
}

function mapDuplicateSigner(error: unknown): never {
  if (pgErrorCode(error) === "23505") {
    throw new BillingRuleError("duplicate_signer");
  }
  throw error;
}

export async function readUpload(
  upload: ImageUpload,
  purpose: ImagePurpose,
  decoder: ImageDecoder,
): Promise<ProcessedImage> {
  // Size first: an oversized upload is refused before it is read.
  if (upload.size > IMAGE_LIMITS.maxInputBytes) {
    throw new BillingImageError("too_large");
  }
  const bytes = Buffer.from(await upload.arrayBuffer());
  const result = await processImage(bytes, purpose, decoder);
  if (!result.ok) throw new BillingImageError(result.reason);
  return result.image;
}

export async function insertImage(
  tx: Tx,
  actor: BillingActor,
  purpose: ImagePurpose,
  signerProfileId: string | null,
  image: ProcessedImage,
): Promise<string> {
  const [row] = await tx
    .insert(billingImage)
    .values({
      purpose,
      signerProfileId,
      data: image.png,
      sha256: image.sha256,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      createdBy: actor.id,
    })
    .returning({ id: billingImage.id });
  if (!row) throw new Error("image insert returned no row");
  return row.id;
}

type SignerRow = typeof signerProfile.$inferSelect;

function toSignerRecord(
  row: SignerRow,
  image: ImageVersionSummary | null,
): SignerRecord {
  const { currentSignatureImageId: _current, ...rest } = row;
  return {
    ...rest,
    identificationType:
      row.identificationType as SignerRecord["identificationType"],
    signature: image,
  };
}

async function selectSigners(deps: BillingDeps, id?: string) {
  const query = deps.db
    .select({ signer: signerProfile, image: summaryColumns })
    .from(signerProfile)
    .leftJoin(
      billingImage,
      eq(billingImage.id, signerProfile.currentSignatureImageId),
    );
  const rows = await (id
    ? query.where(eq(signerProfile.id, id)).limit(1)
    : query.orderBy(
        desc(signerProfile.active),
        asc(signerProfile.fullName),
        asc(signerProfile.id),
      ));
  return rows.map((row) => toSignerRecord(row.signer, row.image));
}

// ---- Signer profiles ------------------------------------------------------

export async function listSigners(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
): Promise<SignerRecord[]> {
  authorize(actorInput, "view_signers");
  return selectSigners(deps);
}

export async function getSigner(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<SignerRecord | null> {
  authorize(actorInput, "view_signers");
  if (!UUID.test(id)) return null;
  const [record] = await selectSigners(deps, id);
  return record ?? null;
}

// Every version ever stored for this signer, newest first (the first one is
// the current signature).
export async function listSignatureVersions(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<ImageVersionSummary[]> {
  authorize(actorInput, "view_signers");
  if (!UUID.test(id)) return [];
  return deps.db
    .select(summaryColumns)
    .from(billingImage)
    .where(eq(billingImage.signerProfileId, id))
    .orderBy(desc(billingImage.createdAt), desc(billingImage.id));
}

export async function countSignatureVersions(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<number> {
  authorize(actorInput, "view_signers");
  if (!UUID.test(id)) return 0;
  const [row] = await deps.db
    .select({ n: count() })
    .from(billingImage)
    .where(eq(billingImage.signerProfileId, id));
  return row?.n ?? 0;
}

export async function createSigner(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  raw: unknown,
): Promise<{ id: string }> {
  const actor = authorize(actorInput, "create_signer");
  const data = parseSigner(raw);
  try {
    return await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(signerProfile)
        .values({ ...data, createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: signerProfile.id });
      if (!created) throw new Error("signer insert returned no row");
      await audit(tx, actor, "billing.signer_create", {
        signerProfileId: created.id,
      });
      return created;
    });
  } catch (error) {
    return mapDuplicateSigner(error);
  }
}

export async function updateSigner(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit_signer");
  const data = parseSigner(raw);
  if (!UUID.test(id)) throw new BillingRuleError("signer_not_found");
  try {
    await deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(signerProfile)
        .where(eq(signerProfile.id, id))
        .for("update");
      if (!current) throw new BillingRuleError("signer_not_found");
      const changedFields = SIGNER_FIELDS.filter(
        (field) => current[field] !== data[field],
      );
      if (changedFields.length === 0) return;
      await tx
        .update(signerProfile)
        .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
        .where(eq(signerProfile.id, id));
      await audit(tx, actor, "billing.signer_update", {
        signerProfileId: id,
        changedFields,
      });
    });
  } catch (error) {
    mapDuplicateSigner(error);
  }
}

export async function setSignerActive(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  active: boolean,
): Promise<void> {
  const actor = authorize(
    actorInput,
    active ? "reactivate_signer" : "deactivate_signer",
  );
  if (!UUID.test(id)) throw new BillingRuleError("signer_not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ active: signerProfile.active })
      .from(signerProfile)
      .where(eq(signerProfile.id, id))
      .for("update");
    if (!current) throw new BillingRuleError("signer_not_found");
    if (current.active === active) return;
    await tx
      .update(signerProfile)
      .set({ active, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(signerProfile.id, id));
    await audit(
      tx,
      actor,
      active ? "billing.signer_activate" : "billing.signer_deactivate",
      { signerProfileId: id },
    );
  });
}

// ---- Images -----------------------------------------------------------------

// A new upload is a new version; the signer then points at it. Earlier
// versions stay (issued documents will reference the exact version).
export async function uploadSignerSignature(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
  upload: ImageUpload,
  decoder: ImageDecoder = sharpDecoder,
): Promise<{ imageId: string }> {
  const actor = authorize(actorInput, "upload_signature");
  if (!UUID.test(id)) throw new BillingRuleError("signer_not_found");
  const image = await readUpload(upload, "signature", decoder);
  return deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: signerProfile.id })
      .from(signerProfile)
      .where(eq(signerProfile.id, id))
      .for("update");
    if (!current) throw new BillingRuleError("signer_not_found");
    const imageId = await insertImage(tx, actor, "signature", id, image);
    await tx
      .update(signerProfile)
      .set({
        currentSignatureImageId: imageId,
        updatedBy: actor.id,
        updatedAt: sql`now()`,
      })
      .where(eq(signerProfile.id, id));
    await audit(tx, actor, "billing.signer_signature_upload", {
      signerProfileId: id,
      imageId,
      sha256: image.sha256,
      byteSize: image.byteSize,
    });
    return { imageId };
  });
}

// One exact version with its bytes, for the protected image route.
export async function getBillingImage(
  deps: BillingDeps,
  actorInput: BillingActor | null | undefined,
  id: string,
): Promise<StoredImage | null> {
  authorize(actorInput, "view_images");
  if (!UUID.test(id)) return null;
  const [row] = await deps.db
    .select({
      ...summaryColumns,
      purpose: billingImage.purpose,
      data: billingImage.data,
    })
    .from(billingImage)
    .where(eq(billingImage.id, id))
    .limit(1);
  return row ? { ...row, purpose: row.purpose as ImagePurpose } : null;
}
