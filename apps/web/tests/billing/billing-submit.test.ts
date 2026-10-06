import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BillingActor } from "../../src/billing/service.ts";
import {
  RULE_MESSAGES,
  submitCreateBankAccount,
  submitCreateIssuer,
  submitSetBankAccountActive,
  submitSetDefaultIssuer,
  submitSetIssuerActive,
  submitUpdateBankAccount,
  submitUpdateIssuer,
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

const BILLING_TABLES =
  "bank_account, issuer_logo, issuer_profile, signer_profile, billing_image";

let account: Record<string, string>;

const accountFields = {
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
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  account = { ...accountFields, issuerProfileId: "" };
});

// Bank accounts need an issuer; created through the submit under test.
async function withIssuer() {
  const { id } = await submitCreateIssuer(deps, admin, form(issuer));
  assert.ok(id);
  account = { ...accountFields, issuerProfileId: id };
  return id;
}

after(async () => {
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count(table: "bank_account" | "issuer_profile" | "audit_log") {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return rows[0]?.n ?? -1;
}

describe("issuer submits", () => {
  it("answers Spanish field errors and saves nothing", async () => {
    const { state, id } = await submitCreateIssuer(deps, admin, form({}));
    assert.equal(id, undefined);
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.equal(
      state.fieldErrors?.legalName,
      "Escribe el nombre o razón social del emisor.",
    );
    assert.equal(await count("issuer_profile"), 0);
    assert.equal(await count("audit_log"), 0);
  });

  it("creates issuers and says which one became the default", async () => {
    const first = await submitCreateIssuer(deps, admin, form(issuer));
    assert.equal(first.state.status, "success");
    assert.equal(first.isDefault, true);
    const second = await submitCreateIssuer(
      deps,
      admin,
      form({ ...issuer, identificationNumber: "900.000.003-3" }),
    );
    assert.equal(second.isDefault, false);
    const duplicate = await submitCreateIssuer(deps, admin, form(issuer));
    assert.equal(duplicate.state.message, RULE_MESSAGES.duplicate_issuer);
    assert.match(duplicate.state.message ?? "", /Ya existe un emisor/);
    assert.equal(await count("issuer_profile"), 2);
  });

  it("updates, switches the default and explains the default rule in Spanish", async () => {
    const a = await submitCreateIssuer(deps, admin, form(issuer));
    const b = await submitCreateIssuer(
      deps,
      admin,
      form({ ...issuer, identificationNumber: "900.000.003-3" }),
    );
    const aId = a.id ?? "";
    const bId = b.id ?? "";
    assert.deepEqual(
      await submitUpdateIssuer(
        deps,
        admin,
        aId,
        form({ ...issuer, city: "Otra Ciudad" }),
      ),
      { status: "success", message: "Cambios guardados." },
    );
    assert.deepEqual(await submitSetIssuerActive(deps, admin, aId, false), {
      status: "error",
      message:
        "Este es el emisor predeterminado. Elige primero otro emisor como predeterminado para poder desactivarlo.",
    });
    assert.deepEqual(await submitSetIssuerActive(deps, admin, bId, false), {
      status: "success",
      message: "Emisor desactivado. Su información y sus logos se conservan.",
    });
    assert.equal(
      (await submitSetDefaultIssuer(deps, admin, bId)).message,
      RULE_MESSAGES.issuer_inactive,
    );
    assert.deepEqual(await submitSetIssuerActive(deps, admin, bId, true), {
      status: "success",
      message: "Emisor reactivado.",
    });
    assert.deepEqual(await submitSetDefaultIssuer(deps, admin, bId), {
      status: "success",
      message: "Ahora es el emisor predeterminado.",
    });
    assert.equal(
      (
        await submitUpdateIssuer(
          deps,
          admin,
          "11111111-1111-4111-8111-111111111111",
          form(issuer),
        )
      ).message,
      RULE_MESSAGES.issuer_not_found,
    );
  });

  it("refuses staff and no session in Spanish, changing nothing", async () => {
    const created = await submitCreateIssuer(deps, admin, form(issuer));
    const id = created.id ?? "";
    const audits = await count("audit_log");
    const outcomes = [
      (await submitCreateIssuer(deps, staff, form(issuer))).state,
      (await submitCreateIssuer(deps, null, form(issuer))).state,
      await submitUpdateIssuer(deps, staff, id, form({ ...issuer, city: "X" })),
      await submitSetIssuerActive(deps, null, id, false),
      await submitSetDefaultIssuer(deps, staff, id),
    ];
    assert.deepEqual(
      outcomes.map((state) => state.message),
      [
        RULE_MESSAGES.forbidden,
        RULE_MESSAGES.unauthenticated,
        RULE_MESSAGES.forbidden,
        RULE_MESSAGES.unauthenticated,
        RULE_MESSAGES.forbidden,
      ],
    );
    assert.equal(await count("issuer_profile"), 1);
    assert.equal(await count("audit_log"), audits);
  });
});

describe("bank account submits", () => {
  beforeEach(async () => {
    await withIssuer();
  });

  it("asks for the issuer and refuses an unknown one", async () => {
    const missing = await submitCreateBankAccount(
      deps,
      admin,
      form({ ...account, issuerProfileId: "" }),
    );
    assert.equal(
      missing.state.fieldErrors?.issuerProfileId,
      "Elige el emisor de la cuenta.",
    );
    const unknown = await submitCreateBankAccount(
      deps,
      admin,
      form({
        ...account,
        issuerProfileId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    assert.equal(unknown.state.message, RULE_MESSAGES.issuer_not_found);
    assert.equal(await count("bank_account"), 0);
  });

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
