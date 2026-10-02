import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BillingActor } from "../../src/billing/service.ts";
import {
  RULE_MESSAGES,
  submitCreateBankAccount,
  submitSaveIssuer,
  submitSetBankAccountActive,
  submitUpdateBankAccount,
} from "../../src/billing/submit.ts";
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

// What the Server Functions do with a submitted form: Spanish field errors,
// Spanish rule messages, and no state change when the role is refused.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const issuer = {
  legalName: "Emisor Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.002-2",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  phone: "",
  email: "",
  paymentTerms: "Pago a 30 días.",
};

const account = {
  bankName: "Banco Demo",
  accountType: "ahorros",
  accountNumber: "000111222",
  holderName: "Titular Demo",
  holderIdentificationType: "CC",
  holderIdentificationNumber: "1000000001",
  currency: "COP",
};

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query("truncate table bank_account, issuer_settings");
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
});

after(async () => {
  await pool.query("truncate table bank_account, issuer_settings");
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count(table: "bank_account" | "issuer_settings" | "audit_log") {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return rows[0]?.n ?? -1;
}

describe("submitSaveIssuer", () => {
  it("answers Spanish field errors and saves nothing", async () => {
    const state = await submitSaveIssuer(deps, admin, form({}));
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.equal(
      state.fieldErrors?.legalName,
      "Escribe el nombre o razón social del emisor.",
    );
    assert.equal(await count("issuer_settings"), 0);
    assert.equal(await count("audit_log"), 0);
  });

  it("saves and confirms in Spanish", async () => {
    const state = await submitSaveIssuer(deps, admin, form(issuer));
    assert.deepEqual(state, {
      status: "success",
      message: "Datos del emisor guardados.",
    });
    assert.equal(await count("issuer_settings"), 1);
  });

  it("refuses staff and no session in Spanish, changing nothing", async () => {
    const staffState = await submitSaveIssuer(deps, staff, form(issuer));
    assert.deepEqual(staffState, {
      status: "error",
      message: RULE_MESSAGES.forbidden,
    });
    const anonymous = await submitSaveIssuer(deps, null, form(issuer));
    assert.equal(anonymous.message, RULE_MESSAGES.unauthenticated);
    assert.equal(await count("issuer_settings"), 0);
    assert.equal(await count("audit_log"), 0);
  });
});

describe("bank account submits", () => {
  it("creates an account and returns its id", async () => {
    const { state, id } = await submitCreateBankAccount(
      deps,
      admin,
      form(account),
    );
    assert.equal(state.status, "success");
    assert.ok(id);
    assert.equal(await count("bank_account"), 1);
  });

  it("answers field errors and saves nothing", async () => {
    const { state, id } = await submitCreateBankAccount(
      deps,
      admin,
      form({ ...account, accountNumber: "12AB", currency: "" }),
    );
    assert.equal(id, undefined);
    assert.equal(
      state.fieldErrors?.accountNumber,
      "Usa solo números, sin letras ni símbolos.",
    );
    assert.equal(state.fieldErrors?.currency, "Elige la moneda.");
    assert.equal(await count("bank_account"), 0);
  });

  it("explains a duplicate account", async () => {
    await submitCreateBankAccount(deps, admin, form(account));
    const { state } = await submitCreateBankAccount(deps, admin, form(account));
    assert.equal(state.message, RULE_MESSAGES.duplicate_bank_account);
    assert.match(state.message ?? "", /Ya existe una cuenta/);
  });

  it("updates, deactivates and reactivates as admin", async () => {
    const { id } = await submitCreateBankAccount(deps, admin, form(account));
    assert.deepEqual(
      await submitUpdateBankAccount(
        deps,
        admin,
        id ?? "",
        form({ ...account, holderName: "Otro Titular" }),
      ),
      { status: "success", message: "Cambios guardados." },
    );
    assert.equal(
      (await submitSetBankAccountActive(deps, admin, id ?? "", false)).status,
      "success",
    );
    assert.equal(
      (await submitSetBankAccountActive(deps, admin, id ?? "", true)).status,
      "success",
    );
  });

  it("answers that an unknown account no longer exists", async () => {
    const state = await submitUpdateBankAccount(
      deps,
      admin,
      "11111111-1111-4111-8111-111111111111",
      form(account),
    );
    assert.equal(state.message, RULE_MESSAGES.not_found);
  });

  it("refuses forged staff and anonymous requests with no state change and no audit row", async () => {
    const { id } = await submitCreateBankAccount(deps, admin, form(account));
    const audits = await count("audit_log");
    const outcomes = [
      (
        await submitCreateBankAccount(
          deps,
          staff,
          form({ ...account, accountNumber: "999888777" }),
        )
      ).state,
      (
        await submitCreateBankAccount(
          deps,
          null,
          form({ ...account, accountNumber: "999888777" }),
        )
      ).state,
      await submitUpdateBankAccount(
        deps,
        staff,
        id ?? "",
        form({ ...account, holderName: "Otro" }),
      ),
      await submitUpdateBankAccount(
        deps,
        null,
        id ?? "",
        form({ ...account, holderName: "Otro" }),
      ),
      await submitSetBankAccountActive(deps, staff, id ?? "", false),
      await submitSetBankAccountActive(deps, null, id ?? "", false),
    ];
    assert.deepEqual(
      outcomes.map((state) => state.message),
      [
        RULE_MESSAGES.forbidden,
        RULE_MESSAGES.unauthenticated,
        RULE_MESSAGES.forbidden,
        RULE_MESSAGES.unauthenticated,
        RULE_MESSAGES.forbidden,
        RULE_MESSAGES.unauthenticated,
      ],
    );
    assert.equal(await count("bank_account"), 1);
    assert.equal(await count("audit_log"), audits);
    const { rows } = await pool.query(
      "select active, holder_name from bank_account",
    );
    assert.deepEqual(rows, [{ active: true, holder_name: "Titular Demo" }]);
  });
});
