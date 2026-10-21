import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDraft } from "../../src/billing/drafts.ts";
import { createIssuer } from "../../src/billing/issuers.ts";
import {
  type BillingActor,
  createBankAccount,
} from "../../src/billing/service.ts";
import {
  draftFormToRaw,
  RULE_MESSAGES,
  submitCreateDraft,
  submitDiscardDraft,
  submitUpdateDraft,
} from "../../src/billing/submit.ts";
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

// What the Server Functions do with a submitted draft form: lines read from
// row-numbered fields, Spanish messages, nothing stored when refused.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;
let clientId: string;
let issuerId: string;
let accountId: string;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
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
      paymentTerms: "Pago a 30 días.",
    })
  ).id;
  accountId = (
    await createBankAccount(deps, admin, {
      bankName: "Banco Demo",
      accountType: "ahorros",
      accountNumber: "000111222",
      holderName: "Titular Demo",
      holderIdentificationType: "CC",
      holderIdentificationNumber: "1000000001",
      currency: "COP",
      issuerProfileId: issuerId,
    })
  ).id;
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count() {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from billing_document",
  );
  return rows[0]?.n ?? -1;
}

async function createdDraft() {
  const { id } = await submitCreateDraft(
    deps,
    admin,
    form({ clientId, issuerProfileId: issuerId, currency: "COP" }),
  );
  assert.ok(id);
  return id;
}

function editorForm(extra: Record<string, string> = {}) {
  return form({
    clientId,
    issuerProfileId: issuerId,
    currency: "COP",
    bankAccountId: accountId,
    signerProfileId: "",
    declarationTextId: "",
    paymentTerms: "Pago a 15 días.",
    "lines.0.product": "Asesoría",
    "lines.0.description": "Anticipo 40 %",
    "lines.0.quantity": "1",
    "lines.0.amount": "1.200.000",
    ...extra,
  });
}

describe("draftFormToRaw", () => {
  it("reads the header and the numbered line rows in order, gaps included", () => {
    const raw = draftFormToRaw(
      form({
        clientId: "c",
        currency: "USD",
        "lines.0.product": "A",
        "lines.0.amount": "1",
        "lines.2.product": "C",
        "lines.2.amount": "3",
      }),
    );
    assert.equal(raw.clientId, "c");
    assert.equal(raw.currency, "USD");
    assert.equal(raw.bankAccountId, undefined);
    assert.deepEqual(raw.lines, [
      {
        product: "A",
        description: undefined,
        quantity: undefined,
        amount: "1",
      },
      {
        product: undefined,
        description: undefined,
        quantity: undefined,
        amount: undefined,
      },
      {
        product: "C",
        description: undefined,
        quantity: undefined,
        amount: "3",
      },
    ]);
  });

  it("ignores rows past the form limit and malformed keys", () => {
    const raw = draftFormToRaw(
      form({
        "lines.0.product": "A",
        "lines.100.product": "far",
        "lines.x.product": "bad",
        "lines.1.other": "bad",
      }),
    );
    assert.equal((raw.lines as unknown[]).length, 1);
  });
});

describe("draft forms", () => {
  it("creates a draft and returns its id", async () => {
    const { state, id } = await submitCreateDraft(
      deps,
      admin,
      form({ clientId, issuerProfileId: issuerId, currency: "COP" }),
    );
    assert.equal(state.status, "success");
    assert.ok(id);
  });

  it("answers Spanish field errors when starting a draft", async () => {
    const { state, id } = await submitCreateDraft(
      deps,
      admin,
      form({ clientId: "", issuerProfileId: issuerId, currency: "EUR" }),
    );
    assert.equal(id, undefined);
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.match(state.fieldErrors?.clientId ?? "", /cliente/);
    assert.match(state.fieldErrors?.currency ?? "", /moneda/);
    assert.equal(await count(), 0);
  });

  it("saves the draft and confirms in Spanish", async () => {
    const id = await createdDraft();
    const state = await submitUpdateDraft(deps, admin, id, editorForm());
    assert.deepEqual(state, {
      status: "success",
      message: "Borrador guardado.",
    });
    const draft = await getDraft(deps, admin, id);
    assert.equal(draft?.totalMinor, 1_200_000);
    assert.equal(draft?.bankAccountId, accountId);
  });

  it("points line errors at their row and keeps the draft unchanged", async () => {
    const id = await createdDraft();
    const state = await submitUpdateDraft(
      deps,
      admin,
      id,
      editorForm({ "lines.1.product": "Soporte", "lines.1.amount": "12,5" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.match(state.fieldErrors?.["lines.1.amount"] ?? "", /decimales/);
    assert.deepEqual((await getDraft(deps, admin, id))?.lines, []);
  });

  it("discards a draft, then reports it gone", async () => {
    const id = await createdDraft();
    assert.equal((await submitDiscardDraft(deps, admin, id)).status, "success");
    const again = await submitDiscardDraft(deps, admin, id);
    assert.equal(again.message, RULE_MESSAGES.draft_not_found);
    assert.equal(await count(), 0);
  });

  it("refuses staff and no session in Spanish, changing nothing", async () => {
    const id = await createdDraft();
    for (const actor of [staff, null]) {
      const created = await submitCreateDraft(
        deps,
        actor,
        form({ clientId, issuerProfileId: issuerId, currency: "COP" }),
      );
      assert.equal(created.state.status, "error");
      const updated = await submitUpdateDraft(deps, actor, id, editorForm());
      assert.equal(updated.status, "error");
      const discarded = await submitDiscardDraft(deps, actor, id);
      assert.equal(
        discarded.message,
        actor ? RULE_MESSAGES.forbidden : RULE_MESSAGES.unauthenticated,
      );
    }
    assert.equal(await count(), 1);
    assert.deepEqual((await getDraft(deps, admin, id))?.lines, []);
  });
});
