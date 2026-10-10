import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createDraft } from "../../src/billing/drafts.ts";
import { createIssuer } from "../../src/billing/issuers.ts";
import {
  configureNumbering,
  getNumbering,
  previewConsecutive,
} from "../../src/billing/numbering.ts";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
} from "../../src/billing/service.ts";
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

// Billing numbering: one continuous consecutive per issuer, independent of
// the client or the site. The owner sets where the series continues from;
// the platform suggests the next number and refuses to walk backwards.
// Nothing here assigns a number to a document: reading, suggesting and
// checking a proposed number never consume one. Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;
let issuerId: string;
let otherIssuerId: string;
let clientId: string;

const BILLING_TABLES =
  "billing_numbering, billing_document, bank_account, issuer_logo, issuer_profile, signer_profile, billing_image, client";

function issuer(legalName: string, identificationNumber: string) {
  return {
    legalName,
    identificationType: "NIT",
    identificationNumber,
    address: "Calle Falsa 123",
    city: "Ciudad Demo",
    phone: "",
    email: "",
    paymentTerms: "",
  };
}

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

  issuerId = (
    await createIssuer(deps, admin, issuer("Emisor Demo S.A.S.", "900000002-2"))
  ).id;
  otherIssuerId = (
    await createIssuer(deps, admin, issuer("Otro Emisor Demo", "900000003-3"))
  ).id;

  const [createdClient] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente Demo",
      identificationType: "NIT",
      identificationNumber: "900111222",
      createdBy: admin.id,
      updatedBy: admin.id,
    })
    .returning({ id: schema.client.id });
  if (!createdClient) throw new Error("client insert returned no row");
  clientId = createdClient.id;
});

after(async () => {
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BillingRuleError) return error.code;
    if (error instanceof BillingValidationError) return "validation";
    throw error;
  }
  return "no-error";
}

async function rowCount() {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from billing_numbering",
  );
  return rows[0]?.n ?? -1;
}

async function auditActions() {
  const { rows } = await pool.query<{ action: string }>(
    `select action from audit_log where action like 'billing.numbering%' order by id`,
  );
  return rows.map((row) => row.action);
}

describe("billing numbering", () => {
  it("reports an unconfigured issuer instead of assuming it starts at one", async () => {
    const state = await getNumbering(deps, admin, issuerId);
    assert.equal(state.configured, false);
    assert.equal(state.nextNumber, null);
    assert.equal(state.lastRegistered, null);
    assert.equal(state.nextFormatted, null);
  });

  it("continues the series from the number the owner configures", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: "45" });
    const state = await getNumbering(deps, admin, issuerId);
    assert.equal(state.configured, true);
    assert.equal(state.nextNumber, 45);
    assert.equal(state.nextFormatted, "CC-0045");
    // Nothing has been issued by the platform yet.
    assert.equal(state.lastRegistered, null);
  });

  it("keeps each issuer's series independent", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    const other = await getNumbering(deps, admin, otherIssuerId);
    assert.equal(other.configured, false);
    assert.equal((await getNumbering(deps, admin, issuerId)).nextNumber, 45);
  });

  it("refuses every non-administrator and writes nothing", async () => {
    assert.equal(
      await code(configureNumbering(deps, staff, issuerId, { nextNumber: 5 })),
      "forbidden",
    );
    assert.equal(
      await code(configureNumbering(deps, null, issuerId, { nextNumber: 5 })),
      "unauthenticated",
    );
    assert.equal(await code(getNumbering(deps, staff, issuerId)), "forbidden");
    assert.equal(await rowCount(), 0);
    assert.deepEqual(await auditActions(), []);
  });

  it("rejects numbers that are not whole positive values", async () => {
    for (const nextNumber of ["0", "-3", "1.5", "abc", "", " ", "1e3"]) {
      assert.equal(
        await code(configureNumbering(deps, admin, issuerId, { nextNumber })),
        "validation",
        `expected ${JSON.stringify(nextNumber)} to be rejected`,
      );
    }
    assert.equal(await rowCount(), 0);
  });

  it("refuses an unknown issuer", async () => {
    assert.equal(
      await code(
        configureNumbering(
          deps,
          admin,
          "00000000-0000-4000-8000-000000000000",
          { nextNumber: 5 },
        ),
      ),
      "issuer_not_found",
    );
  });

  it("never walks the series backwards", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    assert.equal(
      await code(configureNumbering(deps, admin, issuerId, { nextNumber: 44 })),
      "numbering_backwards",
    );
    assert.equal((await getNumbering(deps, admin, issuerId)).nextNumber, 45);
  });

  it("moves the series forward and records the change once", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    await configureNumbering(deps, admin, issuerId, { nextNumber: 120 });
    assert.equal((await getNumbering(deps, admin, issuerId)).nextNumber, 120);
    // The repeated value changes nothing, so it leaves no audit row.
    assert.deepEqual(await auditActions(), [
      "billing.numbering_configure",
      "billing.numbering_configure",
    ]);
  });

  it("suggests the next number without consuming it", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    const first = await previewConsecutive(deps, admin, issuerId, null);
    const second = await previewConsecutive(deps, admin, issuerId, null);
    assert.deepEqual(first, second);
    assert.equal(first.valid, true);
    assert.equal(first.consecutive, 45);
    assert.equal(first.formatted, "CC-0045");
    assert.equal((await getNumbering(deps, admin, issuerId)).nextNumber, 45);
  });

  it("accepts a manual number ahead of the series and flags the skip", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    const preview = await previewConsecutive(deps, admin, issuerId, "80");
    assert.equal(preview.valid, true);
    assert.equal(preview.consecutive, 80);
    assert.equal(preview.formatted, "CC-0080");
    assert.equal(preview.skipsAhead, true);
    // Checking a number is not choosing it.
    assert.equal((await getNumbering(deps, admin, issuerId)).nextNumber, 45);
  });

  it("rejects a manual number behind the series", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    const preview = await previewConsecutive(deps, admin, issuerId, "12");
    assert.equal(preview.valid, false);
    assert.equal(preview.reason, "numbering_backwards");
    assert.equal(preview.consecutive, null);
  });

  it("reports an unconfigured series instead of suggesting a number", async () => {
    const preview = await previewConsecutive(deps, admin, issuerId, null);
    assert.equal(preview.valid, false);
    assert.equal(preview.reason, "numbering_not_configured");
    assert.equal(preview.consecutive, null);
  });

  it("leaves the series untouched when a draft is created", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    await createDraft(deps, admin, {
      clientId,
      issuerProfileId: issuerId,
      currency: "COP",
    });
    const state = await getNumbering(deps, admin, issuerId);
    assert.equal(state.nextNumber, 45);
    assert.equal(state.lastRegistered, null);
  });

  it("keeps a single series when two administrators configure at once", async () => {
    const results = await Promise.allSettled([
      configureNumbering(deps, admin, issuerId, { nextNumber: 45 }),
      configureNumbering(deps, admin, issuerId, { nextNumber: 45 }),
    ]);
    for (const result of results) {
      assert.equal(result.status, "fulfilled", JSON.stringify(result));
    }
    assert.equal(await rowCount(), 1);
    assert.equal((await getNumbering(deps, admin, issuerId)).nextNumber, 45);
  });
});
