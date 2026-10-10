import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createDeclaration } from "../../src/billing/declarations.ts";
import { createDraft, updateDraft } from "../../src/billing/drafts.ts";
import { createIssuer } from "../../src/billing/issuers.ts";
import {
  type BillingActor,
  createBankAccount,
} from "../../src/billing/service.ts";
import { createSigner } from "../../src/billing/signers.ts";
import { createClient, setClientActive } from "../../src/clients/service.ts";
import { getDashboardMetrics } from "../../src/dashboard/metrics.ts";
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

// Synthetic data only: never a real client or account number.
const ids = { client: "", issuer: "", signer: "", bankAccount: "" };

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

  await createDeclaration(deps, admin, {
    label: "Texto sintético",
    body: "Declaración sintética para pruebas.",
  });
});

async function draftWorth(currency: "COP" | "USD", amount: string) {
  const draft = await createDraft(deps, admin, {
    clientId: ids.client,
    issuerProfileId: ids.issuer,
    currency,
  });
  await updateDraft(deps, admin, draft.id, {
    clientId: ids.client,
    issuerProfileId: ids.issuer,
    currency,
    bankAccountId: null,
    signerProfileId: ids.signer,
    declarationTextId: null,
    paymentTerms: "Pago de contado 30 días",
    lines: [
      {
        product: "Soporte TIC",
        description: "Acompañamiento mensual",
        quantity: "",
        amount,
      },
    ],
  });
  return draft.id;
}

describe("dashboard metrics", () => {
  it("counts the clients that really exist, active and total", async () => {
    const second = await createClient(deps, admin, {
      name: "Otra Sintética S.A.S",
      identificationType: "NIT",
      identificationNumber: "900000003-5",
      address: null,
      city: null,
      email: null,
      phone: null,
    });
    await setClientActive(deps, admin, second.id, false);

    const metrics = await getDashboardMetrics(deps, admin);
    assert.equal(metrics.clients.total, 2);
    assert.equal(metrics.clients.active, 1);
  });

  it("counts drafts and totals their value per currency, never mixed", async () => {
    await draftWorth("COP", "1.800.000");
    await draftWorth("COP", "200.000");
    await draftWorth("USD", "1.500,50");

    const metrics = await getDashboardMetrics(deps, admin);
    assert.equal(metrics.drafts.count, 3);

    const cop = metrics.drafts.totals.find((t) => t.currency === "COP");
    const usd = metrics.drafts.totals.find((t) => t.currency === "USD");
    // COP has no decimals, USD has two: minor units differ on purpose.
    assert.equal(cop?.totalMinor, 2_000_000);
    assert.equal(usd?.totalMinor, 150_050);
  });

  it("reports the team and the billing setup from real rows", async () => {
    const metrics = await getDashboardMetrics(deps, admin);
    assert.equal(metrics.team.total, 2);
    assert.equal(metrics.billingSetup.issuers, 1);
    assert.equal(metrics.billingSetup.signers, 1);
    assert.equal(metrics.billingSetup.bankAccounts, 1);
    assert.equal(metrics.billingSetup.declarations, 1);
  });

  it("reports zero drafts when none exist instead of guessing", async () => {
    const metrics = await getDashboardMetrics(deps, admin);
    assert.equal(metrics.drafts.count, 0);
    assert.deepEqual(metrics.drafts.totals, []);
  });

  it("is admin only", async () => {
    await assert.rejects(() => getDashboardMetrics(deps, staff));
    await assert.rejects(() => getDashboardMetrics(deps, null));
  });
});
