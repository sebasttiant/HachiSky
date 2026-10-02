import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import sharp from "sharp";
import { BillingImageError } from "../../src/billing/image.ts";
import { billingImageResponse } from "../../src/billing/image-response.ts";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
  saveIssuerSettings,
} from "../../src/billing/service.ts";
import {
  createSigner,
  getBillingImage,
  getIssuerLogo,
  getSigner,
  listSignatureVersions,
  listSigners,
  setSignerActive,
  updateSigner,
  uploadIssuerLogo,
  uploadSignerSignature,
} from "../../src/billing/signers.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";
import { SVG, solidJpeg, solidPng, spyDecoder } from "./image-fixtures.ts";

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

const signer = {
  fullName: "Firmante Demo",
  identificationType: "CC",
  identificationNumber: "1.000.000.009",
  jobTitle: "Representante legal",
  email: "Firmante@Example.test",
};

const issuer = {
  legalName: "Emisor Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.002-2",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
};

const BILLING_TABLES =
  "signer_profile, billing_image, bank_account, issuer_settings";

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
});

after(async () => {
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count(table: string) {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return rows[0]?.n ?? -1;
}

async function auditRows() {
  const { rows } = await pool.query(
    `select action, details from audit_log
      where action like 'billing.%' order by id`,
  );
  return rows as { action: string; details: Record<string, unknown> }[];
}

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BillingRuleError) return error.code;
    if (error instanceof BillingImageError) return `image:${error.reason}`;
    if (error instanceof BillingValidationError) return "validation";
    throw error;
  }
  return "no-error";
}

const blob = (bytes: Buffer) => new Blob([new Uint8Array(bytes)]);

describe("signer profiles", () => {
  it("creates, normalizes, lists and reads a signer without a signature", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const saved = await getSigner(deps, admin, id);
    assert.ok(saved);
    assert.equal(saved.fullName, "Firmante Demo");
    assert.equal(saved.identificationNumber, "1000000009");
    assert.equal(saved.email, "firmante@example.test");
    assert.equal(saved.jobTitle, "Representante legal");
    assert.equal(saved.active, true);
    assert.equal(saved.signature, null);
    assert.equal(saved.createdBy, admin.id);
    const list = await listSigners(deps, admin);
    assert.deepEqual(
      list.map((s) => s.id),
      [id],
    );
  });

  it("requires every field and reuses the identification validators", async () => {
    assert.equal(await code(createSigner(deps, admin, {})), "validation");
    try {
      await createSigner(deps, admin, {
        ...signer,
        identificationNumber: "12",
        email: "no-es-correo",
        jobTitle: " ",
      });
      assert.fail("expected validation error");
    } catch (error) {
      assert.ok(error instanceof BillingValidationError);
      assert.deepEqual(Object.keys(error.fieldErrors).sort(), [
        "email",
        "identificationNumber",
        "jobTitle",
      ]);
    }
    assert.equal(await count("signer_profile"), 0);
  });

  it("refuses a second profile with the same identification", async () => {
    await createSigner(deps, admin, signer);
    assert.equal(
      await code(createSigner(deps, admin, { ...signer, fullName: "Otro" })),
      "duplicate_signer",
    );
  });

  it("edits with an audit of changed field names only, and skips no-op saves", async () => {
    const { id } = await createSigner(deps, admin, signer);
    await updateSigner(deps, admin, id, { ...signer, jobTitle: "Gerente" });
    await updateSigner(deps, admin, id, { ...signer, jobTitle: "Gerente" });
    const rows = await auditRows();
    assert.deepEqual(
      rows.map((r) => r.action),
      ["billing.signer_create", "billing.signer_update"],
    );
    assert.deepEqual(rows[1]?.details, {
      signerProfileId: id,
      changedFields: ["jobTitle"],
    });
  });

  it("deactivates and reactivates, never deletes", async () => {
    const { id } = await createSigner(deps, admin, signer);
    await setSignerActive(deps, admin, id, false);
    assert.equal((await getSigner(deps, admin, id))?.active, false);
    await setSignerActive(deps, admin, id, true);
    assert.equal((await getSigner(deps, admin, id))?.active, true);
    assert.deepEqual(
      (await auditRows()).map((r) => r.action),
      [
        "billing.signer_create",
        "billing.signer_deactivate",
        "billing.signer_activate",
      ],
    );
  });

  it("answers not found for unknown or malformed ids", async () => {
    assert.equal(await getSigner(deps, admin, "nope"), null);
    assert.equal(
      await code(
        updateSigner(
          deps,
          admin,
          "11111111-1111-4111-8111-111111111111",
          signer,
        ),
      ),
      "signer_not_found",
    );
    assert.equal(
      await code(setSignerActive(deps, admin, "nope", false)),
      "signer_not_found",
    );
  });

  it("refuses staff, no session and forged roles on every operation, changing nothing", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const png = blob(await solidPng());
    const auditBefore = await auditRows();
    for (const actor of [
      staff,
      null,
      { ...staff, role: "owner" as never },
    ] as const) {
      const expected = actor === null ? "unauthenticated" : "forbidden";
      for (const op of [
        listSigners(deps, actor),
        getSigner(deps, actor, id),
        createSigner(deps, actor, signer),
        updateSigner(deps, actor, id, signer),
        setSignerActive(deps, actor, id, false),
        uploadSignerSignature(deps, actor, id, png),
        uploadIssuerLogo(deps, actor, png),
        getIssuerLogo(deps, actor),
        getBillingImage(deps, actor, id),
        listSignatureVersions(deps, actor, id),
      ]) {
        assert.equal(await code(op), expected);
      }
    }
    assert.deepEqual(await auditRows(), auditBefore);
    assert.equal(await count("billing_image"), 0);
  });
});

describe("signature images", () => {
  it("stores the validated PNG as the signer's current version with an audit of hash and size only", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const { imageId } = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidJpeg(400, 120)),
    );
    const saved = await getSigner(deps, admin, id);
    assert.equal(saved?.signature?.id, imageId);
    assert.equal(saved?.signature?.width, 400);
    assert.equal(saved?.signature?.height, 120);
    const image = await getBillingImage(deps, admin, imageId);
    assert.ok(image);
    assert.equal((await sharp(image.data).metadata()).format, "png");
    assert.equal(image.byteSize, image.data.length);
    assert.match(image.sha256, /^[0-9a-f]{64}$/);

    const rows = await auditRows();
    const upload = rows.find(
      (r) => r.action === "billing.signer_signature_upload",
    );
    assert.deepEqual(upload?.details, {
      signerProfileId: id,
      imageId,
      sha256: image.sha256,
      byteSize: image.byteSize,
    });
    const text = JSON.stringify(rows);
    for (const forbidden of [
      "Firmante Demo",
      "1000000009",
      "firmante@example.test",
      "Representante legal",
      image.data.toString("base64").slice(0, 32),
      image.data.toString("hex").slice(0, 32),
    ]) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  });

  it("keeps every version immutable: a new upload adds a version and old bytes stay", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const first = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidPng(300, 100, "#111111")),
    );
    const firstBytes = (await getBillingImage(deps, admin, first.imageId))
      ?.data;
    const second = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidPng(300, 100, "#eeeeee")),
    );
    assert.notEqual(first.imageId, second.imageId);
    assert.equal(
      (await getSigner(deps, admin, id))?.signature?.id,
      second.imageId,
    );
    assert.deepEqual(
      (await getBillingImage(deps, admin, first.imageId))?.data,
      firstBytes,
    );
    const versions = await listSignatureVersions(deps, admin, id);
    assert.deepEqual(
      versions.map((v) => v.id),
      [second.imageId, first.imageId],
    );
    // The database refuses to change or delete a stored version.
    for (const sql of [
      "update billing_image set width = 1 where id = $1",
      "update billing_image set data = '\\x00'::bytea where id = $1",
      "delete from billing_image where id = $1",
    ]) {
      await assert.rejects(pool.query(sql, [first.imageId]), (error) => {
        assert.equal((error as { code?: string }).code, "55000");
        return true;
      });
    }
  });

  it("rejects an invalid image with no version, no pointer change and no audit row", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const { decoder, calls } = spyDecoder();
    assert.equal(
      await code(uploadSignerSignature(deps, admin, id, blob(SVG), decoder)),
      "image:unsupported_type",
    );
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
    assert.equal(await count("billing_image"), 0);
    assert.equal((await getSigner(deps, admin, id))?.signature, null);
    assert.deepEqual(
      (await auditRows()).map((r) => r.action),
      ["billing.signer_create"],
    );
  });

  it("checks the byte limit before reading or decoding the upload", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const { decoder, calls } = spyDecoder();
    let read = false;
    const huge = {
      size: 1024 * 1024 + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(8);
      },
    } as unknown as Blob;
    assert.equal(
      await code(uploadSignerSignature(deps, admin, id, huge, decoder)),
      "image:too_large",
    );
    assert.equal(read, false);
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
  });

  it("refuses a signature for an unknown signer", async () => {
    assert.equal(
      await code(
        uploadSignerSignature(
          deps,
          admin,
          "11111111-1111-4111-8111-111111111111",
          blob(await solidPng()),
        ),
      ),
      "signer_not_found",
    );
    assert.equal(await count("billing_image"), 0);
  });

  it("cannot point a signer at another signer's version", async () => {
    const a = await createSigner(deps, admin, signer);
    const b = await createSigner(deps, admin, {
      ...signer,
      identificationNumber: "1000000017",
    });
    const { imageId } = await uploadSignerSignature(
      deps,
      admin,
      a.id,
      blob(await solidPng()),
    );
    await assert.rejects(
      pool.query(
        "update signer_profile set current_signature_image_id = $1 where id = $2",
        [imageId, b.id],
      ),
      (error) => (error as { code?: string }).code === "23503",
    );
  });
});

describe("issuer logo", () => {
  it("needs the issuer configured first", async () => {
    assert.equal(
      await code(uploadIssuerLogo(deps, admin, blob(await solidPng()))),
      "issuer_not_configured",
    );
    assert.equal(await count("billing_image"), 0);
  });

  it("stores versions through the same pipeline and points the issuer at the latest", async () => {
    await saveIssuerSettings(deps, admin, issuer);
    assert.equal(await getIssuerLogo(deps, admin), null);
    const first = await uploadIssuerLogo(
      deps,
      admin,
      blob(await solidPng(600, 600)),
    );
    const second = await uploadIssuerLogo(
      deps,
      admin,
      blob(await solidJpeg(500, 250)),
    );
    const logo = await getIssuerLogo(deps, admin);
    assert.equal(logo?.id, second.imageId);
    assert.equal(logo?.width, 500);
    assert.ok(await getBillingImage(deps, admin, first.imageId));
    const rows = (await auditRows()).filter(
      (r) => r.action === "billing.issuer_logo_upload",
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(Object.keys(rows[1]?.details ?? {}).sort(), [
      "byteSize",
      "imageId",
      "sha256",
    ]);
    assert.equal(
      await code(uploadIssuerLogo(deps, admin, blob(await solidPng(2001, 10)))),
      "image:dimensions",
    );
  });

  it("cannot point the issuer at a signature version", async () => {
    await saveIssuerSettings(deps, admin, issuer);
    const { id } = await createSigner(deps, admin, signer);
    const { imageId } = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidPng()),
    );
    await assert.rejects(
      pool.query("update issuer_settings set logo_image_id = $1", [imageId]),
      (error) => (error as { code?: string }).code === "23503",
    );
  });
});

describe("serving a stored image", () => {
  it("returns the PNG to an admin with private, no-sniff, inline headers", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const { imageId } = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidPng()),
    );
    const stored = await getBillingImage(deps, admin, imageId);
    const response = await billingImageResponse(deps, admin, imageId);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(
      response.headers.get("content-disposition"),
      'inline; filename="imagen.png"',
    );
    assert.equal(
      response.headers.get("content-length"),
      String(stored?.byteSize),
    );
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), stored?.data);
  });

  it("denies staff (403) and no session (401) without the bytes", async () => {
    const { id } = await createSigner(deps, admin, signer);
    const { imageId } = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidPng()),
    );
    for (const [actor, status] of [
      [staff, 403],
      [null, 401],
    ] as const) {
      const response = await billingImageResponse(deps, actor, imageId);
      assert.equal(response.status, status);
      assert.notEqual(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
  });

  it("answers 404 for unknown and malformed ids", async () => {
    for (const id of ["11111111-1111-4111-8111-111111111111", "x"]) {
      const response = await billingImageResponse(deps, admin, id);
      assert.equal(response.status, 404);
    }
  });
});
