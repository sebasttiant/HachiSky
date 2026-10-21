import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createIssuer } from "../../src/billing/issuers.ts";
import { createSigner } from "../../src/billing/signers.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  createReport,
  getReport,
  issueReport,
  listProviderOptions,
  listSignerOptions,
  type ReportActor,
  ReportRuleError,
  ReportValidationError,
  updateReport,
} from "../../src/reports/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// A report goes out under a provider (IL Asesorías, Converfente Digital, …)
// with that provider's logo and its signer's signature — the same profiles
// billing already keeps. Issuing freezes that identity into the document.
// Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: ReportActor;
let staff: ReportActor;
let clientId: string;
let issuerId: string;
let signerId: string;

const TABLES =
  "report, work_activity, client, issuer_profile, signer_profile, billing_image";

const issuerFields = {
  legalName: "Proveedor Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.002-2",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  phone: null,
  email: "proveedor@example.test",
  paymentTerms: null,
};

const signerFields = {
  fullName: "Firmante Demo",
  identificationType: "CC",
  identificationNumber: "1000000009",
  jobTitle: "Representante legal",
  email: "firmante@example.test",
};

const base = {
  type: "follow_up",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  title: "Seguimiento de octubre",
};

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", {
    role: "staff",
    name: "Autora Demo",
  });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente Demo",
      identificationType: "NIT",
      identificationNumber: "900111222",
      createdBy: a.id,
      updatedBy: a.id,
    })
    .returning({ id: schema.client.id });
  if (!row) throw new Error("client insert returned no row");
  clientId = row.id;
  issuerId = (await createIssuer(deps, admin, issuerFields)).id;
  signerId = (await createSigner(deps, admin, signerFields)).id;
  await pool.query("truncate table audit_log");
});

after(async () => {
  await pool.query(`truncate table ${TABLES} cascade`);
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

describe("report provider, signer and detail level", () => {
  it("carries the chosen provider, signer and detail level", async () => {
    const id = await createReport(deps, staff, {
      ...base,
      clientId,
      issuerProfileId: issuerId,
      signerProfileId: signerId,
      detailLevel: "summary",
    });
    const record = await getReport(deps, staff, id);
    assert.equal(record?.detailLevel, "summary");
    assert.equal(record?.provider?.name, "Proveedor Demo S.A.S.");
    assert.equal(record?.provider?.logoImageId, null);
    assert.equal(record?.signer?.name, "Firmante Demo");
    assert.equal(record?.signer?.identificationNumber, "1000000009");
    assert.equal(record?.signer?.signatureImageId, null);
  });

  it("refuses an unknown provider or signer", async () => {
    await assert.rejects(
      createReport(deps, staff, {
        ...base,
        clientId,
        issuerProfileId: "11111111-1111-4111-8111-111111111111",
        signerProfileId: signerId,
      }),
      (error: unknown) =>
        error instanceof ReportValidationError &&
        "issuerProfileId" in error.fieldErrors,
    );
    await assert.rejects(
      createReport(deps, staff, {
        ...base,
        clientId,
        issuerProfileId: issuerId,
        signerProfileId: "11111111-1111-4111-8111-111111111111",
      }),
      (error: unknown) =>
        error instanceof ReportValidationError &&
        "signerProfileId" in error.fieldErrors,
    );
  });

  it("updates provider, signer and detail level", async () => {
    const id = await createReport(deps, staff, { ...base, clientId });
    await updateReport(deps, staff, id, {
      ...base,
      clientId,
      issuerProfileId: issuerId,
      signerProfileId: signerId,
      detailLevel: "summary",
    });
    const record = await getReport(deps, staff, id);
    assert.equal(record?.provider?.name, "Proveedor Demo S.A.S.");
    assert.equal(record?.signer?.name, "Firmante Demo");
    assert.equal(record?.detailLevel, "summary");
  });

  it("refuses to issue without provider and signer", async () => {
    const id = await createReport(deps, staff, { ...base, clientId });
    await assert.rejects(
      issueReport(deps, staff, id),
      (error: unknown) =>
        error instanceof ReportRuleError &&
        error.code === "provider_incomplete",
    );
  });

  it("offers only active providers and signers to the form", async () => {
    const other = await createIssuer(deps, admin, {
      ...issuerFields,
      legalName: "Otro Proveedor Demo",
      identificationNumber: "900.000.004-4",
    });
    assert.deepEqual(
      (await listProviderOptions(deps, staff)).map((option) => option.label),
      ["Otro Proveedor Demo", "Proveedor Demo S.A.S."],
    );
    const signers = await listSignerOptions(deps, staff);
    assert.deepEqual(
      signers.map((option) => option.label),
      ["Firmante Demo · Representante legal"],
    );
    await pool.query("update issuer_profile set active = false where id = $1", [
      other.id,
    ]);
    assert.deepEqual(
      (await listProviderOptions(deps, staff)).map((option) => option.label),
      ["Proveedor Demo S.A.S."],
    );
  });

  it("freezes provider and signer identity on issue", async () => {
    const id = await createReport(deps, staff, {
      ...base,
      clientId,
      issuerProfileId: issuerId,
      signerProfileId: signerId,
      detailLevel: "detailed",
    });
    await issueReport(deps, staff, id);
    // Renaming the profiles afterwards must not rewrite the issued document.
    await pool.query(
      "update issuer_profile set legal_name = 'Proveedor Renombrado' where id = $1",
      [issuerId],
    );
    await pool.query(
      "update signer_profile set full_name = 'Firmante Renombrado' where id = $1",
      [signerId],
    );
    const record = await getReport(deps, staff, id);
    assert.equal(record?.status, "issued");
    assert.equal(record?.provider?.name, "Proveedor Demo S.A.S.");
    assert.equal(record?.signer?.name, "Firmante Demo");
    assert.equal(record?.detailLevel, "detailed");
  });
});
