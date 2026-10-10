import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createDeclaration } from "../../src/billing/declarations.ts";
import { getDocumentView } from "../../src/billing/document.ts";
import { createDraft, updateDraft } from "../../src/billing/drafts.ts";
import { createIssuer } from "../../src/billing/issuers.ts";
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

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

// Synthetic data only: never a real client, signature or account number.
const ids = {
  client: "",
  issuer: "",
  signer: "",
  bankAccount: "",
  declaration: "",
};

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

after(async () => {
  await closeDb();
  await pool.end();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  const adminUser = await createTestUser(auth, "admin@example.test", {
    role: "admin",
  });
  const staffUser = await createTestUser(auth, "staff@example.test", {
    role: "staff",
  });
  admin = { id: adminUser.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: staffUser.id, role: "staff", ipAddress: null, userAgent: null };

  const client = await createClient(deps, admin, {
    name: "Compradora Sintética S.A.S",
    identificationType: "NIT",
    identificationNumber: "900000001-1",
    address: "Calle Falsa 123",
    city: "Medellín",
    email: null,
    phone: null,
  });
  ids.client = client.id;

  const issuer = await createIssuer(deps, admin, {
    legalName: "Emisora Sintética S.A.S",
    identificationType: "NIT",
    identificationNumber: "900000002-3",
    address: "Carrera Inventada 45",
    city: "Medellín",
    phone: null,
    email: null,
    paymentTerms: "Pago de contado 30 días",
    isDefault: true,
  });
  ids.issuer = issuer.id;

  const signer = await createSigner(deps, admin, {
    fullName: "Firmante Sintético",
    identificationType: "CC",
    identificationNumber: "1000000001",
    jobTitle: "Consultor",
    email: "firmante@example.test",
  });
  ids.signer = signer.id;

  const account = await createBankAccount(deps, admin, {
    bankName: "Banco Sintético",
    accountType: "ahorros",
    accountNumber: "00001111222",
    holderName: "Emisora Sintética S.A.S",
    holderIdentificationType: "NIT",
    holderIdentificationNumber: "900000002-3",
    currency: "COP",
    issuerProfileId: ids.issuer,
  });
  ids.bankAccount = account.id;

  const declaration = await createDeclaration(deps, admin, {
    label: "Texto sintético",
    body: "Declaración sintética para pruebas.",
  });
  ids.declaration = declaration.id;
});

async function draftWithEverything(): Promise<string> {
  const draft = await createDraft(deps, admin, {
    clientId: ids.client,
    issuerProfileId: ids.issuer,
    currency: "COP",
  });
  // The service takes the raw form shape and validates it, so amounts arrive
  // as typed text in Colombian format.
  await updateDraft(deps, admin, draft.id, {
    clientId: ids.client,
    issuerProfileId: ids.issuer,
    currency: "COP",
    bankAccountId: ids.bankAccount,
    signerProfileId: ids.signer,
    declarationTextId: ids.declaration,
    paymentTerms: "Pago de contado 30 días",
    lines: [
      {
        product: "Soporte TIC",
        description: "Acompañamiento mensual",
        quantity: "24 horas",
        amount: "1.800.000",
      },
      {
        product: "Repuesto",
        description: "",
        quantity: "",
        amount: "200.000",
      },
    ],
  });
  return draft.id;
}

describe("document view of a draft", () => {
  it("resolves every party the printed document needs", async () => {
    const id = await draftWithEverything();
    const view = await getDocumentView(deps, admin, id);

    // A draft carries no number and no issue date: both arrive in C5.
    assert.equal(view.number, null);
    assert.equal(view.issuedAt, null);
    assert.equal(view.status, "draft");

    assert.equal(view.client.name, "Compradora Sintética S.A.S");
    // B1 normalises identification numbers to digits only, so the document
    // prints "9000000011" and not the "900000001-1" that was typed. The
    // reference documents show the dash, so display formatting of the NIT is
    // a separate, still open question.
    assert.equal(view.client.identificationNumber, "9000000011");
    // The reference documents show the client's address and city in the
    // header block, so the view must carry them.
    assert.equal(view.client.address, "Calle Falsa 123");
    assert.equal(view.client.city, "Medellín");

    assert.equal(view.issuer.legalName, "Emisora Sintética S.A.S");
    assert.equal(view.signer?.fullName, "Firmante Sintético");
    assert.equal(view.signer?.jobTitle, "Consultor");
    assert.equal(view.bankAccount?.bankName, "Banco Sintético");
    assert.equal(view.bankAccount?.accountType, "ahorros");
    assert.equal(view.declaration?.body, "Declaración sintética para pruebas.");
    assert.equal(view.paymentTerms, "Pago de contado 30 días");
  });

  it("totals the lines and keeps their order", async () => {
    const id = await draftWithEverything();
    const view = await getDocumentView(deps, admin, id);

    assert.equal(view.lines.length, 2);
    assert.equal(view.lines[0]?.product, "Soporte TIC");
    assert.equal(view.lines[1]?.product, "Repuesto");
    assert.equal(view.totalMinor, 2_000_000);
    assert.equal(view.currency, "COP");
  });

  it("omits the parts a draft has not chosen yet", async () => {
    const draft = await createDraft(deps, admin, {
      clientId: ids.client,
      issuerProfileId: ids.issuer,
      currency: "COP",
    });
    const view = await getDocumentView(deps, admin, draft.id);

    assert.equal(view.signer, null);
    assert.equal(view.bankAccount, null);
    assert.equal(view.declaration, null);
    assert.deepEqual(view.lines, []);
    assert.equal(view.totalMinor, 0);
    // The issuer's default terms are copied when the draft is created.
    assert.equal(view.paymentTerms, "Pago de contado 30 días");
  });

  it("is admin only and reports unknown ids", async () => {
    const id = await draftWithEverything();
    await assert.rejects(() => getDocumentView(deps, staff, id));
    await assert.rejects(
      () =>
        getDocumentView(deps, admin, "00000000-0000-4000-8000-000000000000"),
      BillingRuleError,
    );
  });
});
