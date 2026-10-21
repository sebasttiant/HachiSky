import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDocumentView } from "../../src/billing/document.ts";
import {
  createDraft,
  getDraft,
  listDrafts,
  updateDraft,
} from "../../src/billing/drafts.ts";
import { issueDraft, listIssued } from "../../src/billing/issuance.ts";
import { createIssuer } from "../../src/billing/issuers.ts";
import {
  configureNumbering,
  getNumbering,
} from "../../src/billing/numbering.ts";
import {
  type BillingActor,
  BillingRuleError,
  createBankAccount,
} from "../../src/billing/service.ts";
import { createSigner } from "../../src/billing/signers.ts";
import { createClient } from "../../src/clients/service.ts";
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

// Issuing is the moment a cuenta de cobro gets its consecutive: exactly the
// next number of its issuer, assigned in the same transaction that marks it
// issued, so the series never has gaps and two issues never share a number.
// Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;
let clientId: string;
let issuerId: string;
let accountId: string;
let signerId: string;

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };

  clientId = (
    await createClient(deps, admin, {
      name: "Cliente Demo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "900.000.001-1",
    })
  ).id;
  issuerId = (
    await createIssuer(deps, admin, {
      legalName: "Emisor Demo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "900.000.002-2",
      address: "Calle Falsa 123",
      city: "Ciudad Demo",
      phone: "",
      email: "",
      paymentTerms: "Pago a 30 días.",
    })
  ).id;
  accountId = (
    await createBankAccount(deps, admin, {
      bankName: "Banco Demo",
      accountType: "ahorros",
      accountNumber: "000111222333",
      holderName: "Titular Demo",
      holderIdentificationType: "CC",
      holderIdentificationNumber: "1000000001",
      currency: "COP",
      issuerProfileId: issuerId,
    })
  ).id;
  signerId = (
    await createSigner(deps, admin, {
      fullName: "Firmante Demo",
      identificationType: "CC",
      identificationNumber: "1000000009",
      jobTitle: "Representante legal",
      email: "firmante@example.test",
    })
  ).id;
  await pool.query("truncate table audit_log");
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function readyDraft() {
  const { id } = await createDraft(deps, admin, {
    clientId,
    issuerProfileId: issuerId,
    currency: "COP",
  });
  await updateDraft(deps, admin, id, {
    clientId,
    issuerProfileId: issuerId,
    currency: "COP",
    bankAccountId: accountId,
    signerProfileId: signerId,
    declarationTextId: "",
    paymentTerms: "Pago a 15 días.",
    lines: [
      {
        product: "Asesoría",
        description: "",
        quantity: "",
        amount: "1.200.000",
      },
    ],
  });
  return id;
}

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BillingRuleError) return error.code;
    throw error;
  }
  return "no-error";
}

describe("issuing a cuenta de cobro", () => {
  it("assigns exactly the next consecutive and shows it on the document", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 45 });
    const id = await readyDraft();

    const issued = await issueDraft(deps, admin, id);
    assert.equal(issued.consecutive, 45);
    assert.equal(issued.formatted, "CC-0045");
    assert.ok(issued.issuedAt instanceof Date);

    const view = await getDocumentView(deps, admin, id);
    assert.equal(view.status, "issued");
    assert.equal(view.number, "CC-0045");
    assert.ok(view.issuedAt instanceof Date);

    // The draft lists no longer carry it; the issued list does.
    assert.deepEqual(await listDrafts(deps, admin), []);
    const issuedList = await listIssued(deps, admin);
    assert.equal(issuedList.length, 1);
    assert.equal(issuedList[0]?.number, "CC-0045");

    const numbering = await getNumbering(deps, admin, issuerId);
    assert.equal(numbering.lastRegistered, 45);
    assert.equal(numbering.nextNumber, 46);
  });

  it("runs the series without gaps and refuses a second issue", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 7 });
    const first = await readyDraft();
    const second = await readyDraft();

    assert.equal((await issueDraft(deps, admin, first)).formatted, "CC-0007");
    assert.equal((await issueDraft(deps, admin, second)).formatted, "CC-0008");
    assert.equal(await code(issueDraft(deps, admin, first)), "already_issued");
    // An issued document is no longer a draft to edit or read as one.
    assert.equal(await getDraft(deps, admin, first), null);
  });

  it("refuses to issue without a configured series or without content", async () => {
    const id = await readyDraft();
    assert.equal(
      await code(issueDraft(deps, admin, id)),
      "numbering_not_configured",
    );

    await configureNumbering(deps, admin, issuerId, { nextNumber: 1 });
    const { id: bareId } = await createDraft(deps, admin, {
      clientId,
      issuerProfileId: issuerId,
      currency: "COP",
    });
    // No lines, no signer, no account: nothing to hand a client.
    assert.equal(
      await code(issueDraft(deps, admin, bareId)),
      "draft_incomplete",
    );
    // The refused issue consumed nothing.
    const numbering = await getNumbering(deps, admin, issuerId);
    assert.equal(numbering.nextNumber, 1);
    assert.equal(numbering.lastRegistered, null);
  });

  it("keeps the role rule and writes an audit row without amounts", async () => {
    await configureNumbering(deps, admin, issuerId, { nextNumber: 3 });
    const id = await readyDraft();
    assert.equal(await code(issueDraft(deps, staff, id)), "forbidden");

    await issueDraft(deps, admin, id);
    const { rows } = await pool.query(
      "select action, details from audit_log where action = 'billing.draft_issue'",
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0].details).sort(), [
      "billingDocumentId",
      "consecutive",
    ]);
    assert.equal(rows[0].details.consecutive, 3);
  });
});
