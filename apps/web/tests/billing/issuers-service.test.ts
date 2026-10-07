import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { BillingImageError } from "../../src/billing/image.ts";
import { billingImageResponse } from "../../src/billing/image-response.ts";
import {
  countIssuerLogoVersions,
  createIssuer,
  getIssuer,
  listIssuers,
  setDefaultIssuer,
  setIssuerActive,
  updateIssuer,
  uploadIssuerLogo,
} from "../../src/billing/issuers.ts";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
} from "../../src/billing/service.ts";
import {
  createSigner,
  getBillingImage,
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

// Issuer profiles: several issuers, one default, deactivation instead of
// deletion, and one logo history per issuer. Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

const issuerA = {
  legalName: "Emisor Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.002-2",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  phone: "+57 300 000 0000",
  email: "emisor@example.test",
  paymentTerms: "Pago a 30 días.",
};

const issuerB = {
  legalName: "Otro Emisor Demo",
  identificationType: "CC",
  identificationNumber: "1000000001",
  address: "Carrera Demo 45",
  city: "Otra Ciudad",
  phone: "",
  email: "",
  paymentTerms: "",
};

const BILLING_TABLES =
  "bank_account, issuer_logo, issuer_profile, signer_profile, billing_image";

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

async function defaults() {
  const { rows } = await pool.query<{ id: string }>(
    "select id from issuer_profile where is_default",
  );
  return rows.map((row) => row.id);
}

const blob = (bytes: Buffer) => new Blob([new Uint8Array(bytes)]);
const UNKNOWN = "11111111-1111-4111-8111-111111111111";

describe("issuer profiles", () => {
  it("starts with no issuer and makes the first one the default", async () => {
    assert.deepEqual(await listIssuers(deps, admin), []);
    const first = await createIssuer(deps, admin, issuerA);
    assert.equal(first.isDefault, true);
    const second = await createIssuer(deps, admin, issuerB);
    assert.equal(second.isDefault, false);
    assert.deepEqual(await defaults(), [first.id]);
    const list = await listIssuers(deps, admin);
    assert.deepEqual(
      list.map((item) => [item.legalName, item.isDefault, item.active]),
      [
        ["Emisor Demo S.A.S.", true, true],
        ["Otro Emisor Demo", false, true],
      ],
    );
  });

  it("normalizes and reads back one issuer", async () => {
    const { id } = await createIssuer(deps, admin, issuerA);
    const saved = await getIssuer(deps, admin, id);
    assert.ok(saved);
    assert.equal(saved.identificationNumber, "9000000022");
    assert.equal(saved.paymentTerms, "Pago a 30 días.");
    assert.equal(saved.logo, null);
    assert.equal(saved.createdBy, admin.id);
    assert.equal(await getIssuer(deps, admin, UNKNOWN), null);
    assert.equal(await getIssuer(deps, admin, "nope"), null);
  });

  it("edits one issuer without touching another, auditing field names only", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    const bBefore = await getIssuer(deps, admin, b.id);
    await updateIssuer(deps, admin, a.id, {
      ...issuerA,
      city: "Ciudad Nueva",
      phone: "+57 311 111 1111",
    });
    assert.equal((await getIssuer(deps, admin, a.id))?.city, "Ciudad Nueva");
    assert.deepEqual(await getIssuer(deps, admin, b.id), bBefore);
    const rows = await auditRows();
    assert.deepEqual(
      rows.map((row) => row.action),
      [
        "billing.issuer_create",
        "billing.issuer_create",
        "billing.issuer_update",
      ],
    );
    assert.deepEqual(rows[0]?.details, {
      issuerProfileId: a.id,
      isDefault: true,
    });
    assert.deepEqual(rows[2]?.details, {
      issuerProfileId: a.id,
      changedFields: ["city", "phone"],
    });
    const serialized = JSON.stringify(rows);
    for (const secret of ["9000000022", "311", "emisor@example.test", "Demo"]) {
      assert.equal(serialized.includes(secret), false, secret);
    }
    const audits = await count("audit_log");
    await updateIssuer(deps, admin, b.id, issuerB);
    assert.equal(await count("audit_log"), audits);
  });

  it("refuses a duplicate identification, inactive issuers included", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    await setIssuerActive(deps, admin, b.id, false);
    assert.equal(
      await code(
        createIssuer(deps, admin, { ...issuerB, legalName: "Copia Demo" }),
      ),
      "duplicate_issuer",
    );
    assert.equal(
      await code(
        updateIssuer(deps, admin, a.id, {
          ...issuerA,
          identificationType: "CC",
          identificationNumber: "1000000001",
        }),
      ),
      "duplicate_issuer",
    );
    assert.equal(await count("issuer_profile"), 2);
  });

  it("rejects invalid input with field errors and saves nothing", async () => {
    await assert.rejects(
      createIssuer(deps, admin, { ...issuerA, legalName: "" }),
      (error: unknown) =>
        error instanceof BillingValidationError &&
        Boolean(error.fieldErrors.legalName),
    );
    assert.equal(await count("issuer_profile"), 0);
    assert.equal(await count("audit_log"), 0);
  });

  it("answers issuer_not_found for unknown or malformed ids", async () => {
    for (const id of [UNKNOWN, "nope"]) {
      assert.equal(
        await code(updateIssuer(deps, admin, id, issuerA)),
        "issuer_not_found",
      );
      assert.equal(
        await code(setIssuerActive(deps, admin, id, false)),
        "issuer_not_found",
      );
      assert.equal(
        await code(setDefaultIssuer(deps, admin, id)),
        "issuer_not_found",
      );
    }
  });
});

describe("default issuer", () => {
  it("switches the default atomically and audits it", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    await setDefaultIssuer(deps, admin, b.id);
    assert.deepEqual(await defaults(), [b.id]);
    assert.equal((await getIssuer(deps, admin, a.id))?.isDefault, false);
    const audits = await count("audit_log");
    await setDefaultIssuer(deps, admin, b.id);
    assert.equal(await count("audit_log"), audits);
    const last = (await auditRows()).at(-1);
    assert.equal(last?.action, "billing.issuer_set_default");
    assert.deepEqual(last?.details, {
      issuerProfileId: b.id,
      previousDefaultId: a.id,
    });
  });

  it("serializes concurrent switches: exactly one default remains", async () => {
    await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    const c = await createIssuer(deps, admin, {
      ...issuerB,
      identificationNumber: "1000000002",
      legalName: "Tercer Emisor Demo",
    });
    const results = await Promise.allSettled([
      setDefaultIssuer(deps, admin, b.id),
      setDefaultIssuer(deps, admin, c.id),
      setDefaultIssuer(deps, admin, b.id),
    ]);
    assert.deepEqual(
      results.map((result) => result.status),
      ["fulfilled", "fulfilled", "fulfilled"],
    );
    assert.equal((await defaults()).length, 1);
  });

  it("makes exactly one of several concurrent first issuers the default", async () => {
    const results = await Promise.all([
      createIssuer(deps, admin, issuerA),
      createIssuer(deps, admin, issuerB),
    ]);
    assert.equal(results.filter((result) => result.isDefault).length, 1);
    assert.equal((await defaults()).length, 1);
  });

  it("refuses to deactivate the default and to make an inactive issuer the default", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    assert.equal(
      await code(setIssuerActive(deps, admin, a.id, false)),
      "issuer_is_default",
    );
    assert.equal((await getIssuer(deps, admin, a.id))?.active, true);
    await setIssuerActive(deps, admin, b.id, false);
    assert.equal(
      await code(setDefaultIssuer(deps, admin, b.id)),
      "issuer_inactive",
    );
    assert.deepEqual(await defaults(), [a.id]);
  });

  it("deactivates and reactivates a non-default issuer with audit, never deleting it", async () => {
    await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    await setIssuerActive(deps, admin, b.id, false);
    assert.equal((await getIssuer(deps, admin, b.id))?.active, false);
    await setIssuerActive(deps, admin, b.id, false);
    await setIssuerActive(deps, admin, b.id, true);
    assert.equal((await getIssuer(deps, admin, b.id))?.active, true);
    const actions = (await auditRows()).map((row) => row.action);
    assert.deepEqual(actions.slice(2), [
      "billing.issuer_deactivate",
      "billing.issuer_activate",
    ]);
    assert.equal(await count("issuer_profile"), 2);
  });
});

describe("issuer logos", () => {
  it("keeps one logo history per issuer: replacing one never touches another", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    const first = await uploadIssuerLogo(
      deps,
      admin,
      a.id,
      blob(await solidPng(600, 600)),
    );
    const other = await uploadIssuerLogo(
      deps,
      admin,
      b.id,
      blob(await solidPng(300, 100)),
    );
    const second = await uploadIssuerLogo(
      deps,
      admin,
      a.id,
      blob(await solidJpeg(500, 250)),
    );
    assert.equal(
      (await getIssuer(deps, admin, a.id))?.logo?.id,
      second.imageId,
    );
    assert.equal((await getIssuer(deps, admin, a.id))?.logo?.width, 500);
    assert.equal((await getIssuer(deps, admin, b.id))?.logo?.id, other.imageId);
    assert.equal(await countIssuerLogoVersions(deps, admin, a.id), 2);
    assert.equal(await countIssuerLogoVersions(deps, admin, b.id), 1);
    assert.ok(await getBillingImage(deps, admin, first.imageId));
    const { rows } = await pool.query(
      "select image_id, issuer_profile_id from issuer_logo order by created_at, image_id",
    );
    assert.deepEqual(
      new Set(rows.map((row) => `${row.image_id}:${row.issuer_profile_id}`)),
      new Set([
        `${first.imageId}:${a.id}`,
        `${other.imageId}:${b.id}`,
        `${second.imageId}:${a.id}`,
      ]),
    );
    const uploads = (await auditRows()).filter(
      (row) => row.action === "billing.issuer_logo_upload",
    );
    assert.equal(uploads.length, 3);
    assert.deepEqual(Object.keys(uploads[2]?.details ?? {}).sort(), [
      "byteSize",
      "imageId",
      "issuerProfileId",
      "sha256",
    ]);
    assert.equal(uploads[2]?.details.issuerProfileId, a.id);
  });

  it("serves a stored logo version to administrators only", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const { imageId } = await uploadIssuerLogo(
      deps,
      admin,
      a.id,
      blob(await solidPng(120, 40)),
    );
    const served = await billingImageResponse(deps, admin, imageId);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.equal(
      (await billingImageResponse(deps, staff, imageId)).status,
      403,
    );
    assert.equal((await billingImageResponse(deps, null, imageId)).status, 401);
  });

  it("refuses an unknown or inactive issuer before storing anything", async () => {
    await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    await setIssuerActive(deps, admin, b.id, false);
    const png = blob(await solidPng());
    assert.equal(
      await code(uploadIssuerLogo(deps, admin, UNKNOWN, png)),
      "issuer_not_found",
    );
    assert.equal(
      await code(uploadIssuerLogo(deps, admin, "nope", png)),
      "issuer_not_found",
    );
    assert.equal(
      await code(uploadIssuerLogo(deps, admin, b.id, png)),
      "issuer_inactive",
    );
    assert.equal(await count("billing_image"), 0);
    assert.equal(await count("issuer_logo"), 0);
  });

  it("rejects an invalid image through the pipeline, storing nothing", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const { decoder } = spyDecoder();
    assert.equal(
      await code(uploadIssuerLogo(deps, admin, a.id, blob(SVG), decoder)),
      "image:unsupported_type",
    );
    assert.equal(
      await code(
        uploadIssuerLogo(deps, admin, a.id, blob(await solidPng(2001, 10))),
      ),
      "image:dimensions",
    );
    assert.equal(await count("billing_image"), 0);
    assert.equal((await getIssuer(deps, admin, a.id))?.logo, null);
  });

  it("cannot point an issuer at a signature version", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const { id } = await createSigner(deps, admin, {
      fullName: "Firmante Demo",
      identificationType: "CC",
      identificationNumber: "1000000009",
      jobTitle: "Representante legal",
      email: "firmante@example.test",
    });
    const { imageId } = await uploadSignerSignature(
      deps,
      admin,
      id,
      blob(await solidPng()),
    );
    await assert.rejects(
      pool.query(
        "insert into issuer_logo (image_id, issuer_profile_id) values ($1, $2)",
        [imageId, a.id],
      ),
      (error) => (error as { code?: string }).code === "23503",
    );
  });
});

describe("authorization: admin only, nothing changes otherwise", () => {
  it("refuses staff, no session and forged roles on every operation", async () => {
    const a = await createIssuer(deps, admin, issuerA);
    const b = await createIssuer(deps, admin, issuerB);
    const png = blob(await solidPng());
    const auditBefore = await auditRows();
    const before = await listIssuers(deps, admin);
    for (const actor of [
      staff,
      null,
      { ...staff, role: "owner" as never },
      { ...admin, id: "" },
    ] as const) {
      const expected =
        actor === null || actor.id === "" ? "unauthenticated" : "forbidden";
      for (const op of [
        listIssuers(deps, actor),
        getIssuer(deps, actor, a.id),
        countIssuerLogoVersions(deps, actor, a.id),
        createIssuer(deps, actor, {
          ...issuerB,
          identificationNumber: "1000000003",
        }),
        updateIssuer(deps, actor, a.id, { ...issuerA, city: "X Ciudad" }),
        setIssuerActive(deps, actor, b.id, false),
        setIssuerActive(deps, actor, b.id, true),
        setDefaultIssuer(deps, actor, b.id),
        uploadIssuerLogo(deps, actor, a.id, png),
        createIssuer(deps, actor, {}),
      ]) {
        assert.equal(await code(op), expected);
      }
    }
    assert.deepEqual(await auditRows(), auditBefore);
    assert.deepEqual(await listIssuers(deps, admin), before);
    assert.equal(await count("billing_image"), 0);
  });
});
