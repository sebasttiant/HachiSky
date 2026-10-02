import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
  createBankAccount,
  getBankAccount,
  getIssuerSettings,
  listBankAccounts,
  saveIssuerSettings,
  setBankAccountActive,
  updateBankAccount,
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

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

const issuer = {
  legalName: "Emisor Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.002-2",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  phone: "+57 300 000 0000",
  email: "emisor@example.test",
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
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
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

async function auditRows() {
  const { rows } = await pool.query(
    `select actor_user_id, action, target_user_id, details, ip_address, user_agent
       from audit_log where action like 'billing.%' order by id`,
  );
  return rows;
}

async function rejects(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BillingRuleError) return error.code;
    throw error;
  }
  return "no-error";
}

describe("issuer settings", () => {
  it("is not configured until an admin saves it", async () => {
    assert.equal(await getIssuerSettings(deps, admin), null);
  });

  it("saves, normalizes and reads back the single row", async () => {
    assert.deepEqual(await saveIssuerSettings(deps, admin, issuer), {
      created: true,
    });
    const saved = await getIssuerSettings(deps, admin);
    assert.ok(saved);
    assert.equal(saved.legalName, "Emisor Demo S.A.S.");
    assert.equal(saved.identificationNumber, "9000000022");
    assert.equal(saved.paymentTerms, "Pago a 30 días.");
    assert.equal(saved.updatedBy, admin.id);
    assert.equal(await count("issuer_settings"), 1);
  });

  it("updates in place and never creates a second row", async () => {
    await saveIssuerSettings(deps, admin, issuer);
    assert.deepEqual(
      await saveIssuerSettings(deps, admin, { ...issuer, city: "Otra Ciudad" }),
      { created: false },
    );
    assert.equal(await count("issuer_settings"), 1);
    assert.equal((await getIssuerSettings(deps, admin))?.city, "Otra Ciudad");
  });

  it("audits creation and update with field names only, no values", async () => {
    await saveIssuerSettings(deps, admin, issuer);
    await saveIssuerSettings(deps, admin, {
      ...issuer,
      phone: "+57 311 111 1111",
      email: "otro@example.test",
      paymentTerms: "Contado.",
    });
    const rows = await auditRows();
    assert.deepEqual(
      rows.map((row) => row.action),
      ["billing.issuer_configure", "billing.issuer_update"],
    );
    assert.deepEqual(rows[1].details, {
      changedFields: ["phone", "email", "paymentTerms"],
    });
    assert.equal(rows[1].actor_user_id, admin.id);
    assert.equal(rows[1].target_user_id, null);
    assert.equal(rows[1].ip_address, "203.0.113.7");
    const serialized = JSON.stringify(rows);
    for (const secret of [
      "9000000022",
      "900.000.002-2",
      "311",
      "300 000",
      "otro@example.test",
      "emisor@example.test",
      "Emisor Demo",
    ]) {
      assert.equal(serialized.includes(secret), false, secret);
    }
  });

  it("writes no audit row when nothing changed", async () => {
    await saveIssuerSettings(deps, admin, issuer);
    const before = await count("audit_log");
    await saveIssuerSettings(deps, admin, issuer);
    assert.equal(await count("audit_log"), before);
  });

  it("rejects invalid input with field errors and saves nothing", async () => {
    await assert.rejects(
      saveIssuerSettings(deps, admin, { ...issuer, legalName: "" }),
      (error: unknown) =>
        error instanceof BillingValidationError &&
        Boolean(error.fieldErrors.legalName),
    );
    assert.equal(await count("issuer_settings"), 0);
    assert.equal(await count("audit_log"), 0);
  });

  it("lets concurrent first saves converge on one row", async () => {
    const results = await Promise.all([
      saveIssuerSettings(deps, admin, issuer),
      saveIssuerSettings(deps, admin, { ...issuer, city: "Otra Ciudad" }),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(await count("issuer_settings"), 1);
  });
});

describe("bank accounts", () => {
  it("creates an active account with its creator and audits it", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    const created = await getBankAccount(deps, admin, id);
    assert.ok(created);
    assert.equal(created.active, true);
    assert.equal(created.currency, "COP");
    assert.equal(created.holderName, "Titular Demo");
    assert.equal(created.createdBy, admin.id);
    const rows = await auditRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "billing.bank_account_create");
    assert.deepEqual(rows[0].details, { bankAccountId: id });
  });

  it("normalizes the stored number and bank name", async () => {
    const { id } = await createBankAccount(deps, admin, {
      ...account,
      bankName: "  Banco   Demo ",
      accountNumber: "000-111 222",
    });
    const created = await getBankAccount(deps, admin, id);
    assert.equal(created?.accountNumber, "000111222");
    assert.equal(created?.bankName, "Banco Demo");
  });

  it("rejects invalid input and saves nothing", async () => {
    await assert.rejects(
      createBankAccount(deps, admin, { ...account, accountNumber: "12AB" }),
      BillingValidationError,
    );
    assert.equal(await count("bank_account"), 0);
    assert.equal(await count("audit_log"), 0);
  });

  it("refuses a duplicate bank, number and currency, case-insensitively", async () => {
    await createBankAccount(deps, admin, account);
    assert.equal(
      await rejects(
        createBankAccount(deps, admin, { ...account, bankName: "BANCO demo" }),
      ),
      "duplicate_bank_account",
    );
    assert.equal(await count("bank_account"), 1);
    assert.equal((await auditRows()).length, 1);
  });

  it("allows the same number in another currency or another bank", async () => {
    await createBankAccount(deps, admin, account);
    await createBankAccount(deps, admin, { ...account, currency: "USD" });
    await createBankAccount(deps, admin, { ...account, bankName: "Banco Dos" });
    assert.equal(await count("bank_account"), 3);
  });

  it("keeps a deactivated account in the uniqueness rule", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    await setBankAccountActive(deps, admin, id, false);
    assert.equal(
      await rejects(createBankAccount(deps, admin, account)),
      "duplicate_bank_account",
    );
  });

  it("lets concurrent identical creates have one winner", async () => {
    const results = await Promise.allSettled([
      createBankAccount(deps, admin, account),
      createBankAccount(deps, admin, account),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await count("bank_account"), 1);
    assert.equal((await auditRows()).length, 1);
  });

  it("updates, audits the changed field names only and maps a clash", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    await createBankAccount(deps, admin, {
      ...account,
      accountNumber: "999888777",
    });
    await updateBankAccount(deps, admin, id, {
      ...account,
      holderName: "Otro Titular",
      accountNumber: "555444333",
    });
    const rows = await auditRows();
    const last = rows.at(-1);
    assert.equal(last?.action, "billing.bank_account_update");
    assert.deepEqual(last?.details, {
      bankAccountId: id,
      changedFields: ["accountNumber", "holderName"],
    });
    const serialized = JSON.stringify(rows);
    for (const secret of [
      "555444333",
      "000111222",
      "999888777",
      "Otro Titular",
      "1000000001",
    ]) {
      assert.equal(serialized.includes(secret), false, secret);
    }
    assert.equal(
      await rejects(
        updateBankAccount(deps, admin, id, {
          ...account,
          accountNumber: "999888777",
        }),
      ),
      "duplicate_bank_account",
    );
  });

  it("writes no audit row for an unchanged update", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    const before = await count("audit_log");
    await updateBankAccount(deps, admin, id, account);
    assert.equal(await count("audit_log"), before);
  });

  it("answers not_found for unknown or malformed ids", async () => {
    assert.equal(
      await rejects(
        updateBankAccount(
          deps,
          admin,
          "11111111-1111-4111-8111-111111111111",
          account,
        ),
      ),
      "not_found",
    );
    assert.equal(
      await rejects(setBankAccountActive(deps, admin, "nope", false)),
      "not_found",
    );
    assert.equal(await getBankAccount(deps, admin, "nope"), null);
  });

  it("deactivates and reactivates with audit and no physical delete", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    await setBankAccountActive(deps, admin, id, false);
    assert.equal((await getBankAccount(deps, admin, id))?.active, false);
    await setBankAccountActive(deps, admin, id, false);
    await setBankAccountActive(deps, admin, id, true);
    assert.equal((await getBankAccount(deps, admin, id))?.active, true);
    assert.deepEqual(
      (await auditRows()).map((row) => row.action),
      [
        "billing.bank_account_create",
        "billing.bank_account_deactivate",
        "billing.bank_account_activate",
      ],
    );
    assert.equal(await count("bank_account"), 1);
  });

  it("lists active accounts first, then by bank and holder", async () => {
    const a = await createBankAccount(deps, admin, {
      ...account,
      bankName: "Banco B",
    });
    await createBankAccount(deps, admin, {
      ...account,
      bankName: "Banco A",
      accountNumber: "111222333",
    });
    await createBankAccount(deps, admin, {
      ...account,
      bankName: "Banco C",
      accountNumber: "222333444",
    });
    await setBankAccountActive(deps, admin, a.id, false);
    const list = await listBankAccounts(deps, admin);
    assert.deepEqual(
      list.map((item) => [item.bankName, item.active]),
      [
        ["Banco A", true],
        ["Banco C", true],
        ["Banco B", false],
      ],
    );
  });
});

describe("authorization: admin only, nothing changes otherwise", () => {
  function actors(): [string, BillingActor | null, string][] {
    return [
      ["staff", staff, "forbidden"],
      ["no session", null, "unauthenticated"],
      ["a forged role", { ...admin, role: "superuser" as never }, "forbidden"],
      ["an empty actor id", { ...admin, id: "" }, "unauthenticated"],
    ];
  }

  it("refuses every operation to staff, no session and forged roles", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    await saveIssuerSettings(deps, admin, issuer);
    const audits = await count("audit_log");
    const operations: [
      string,
      (actor: BillingActor | null) => Promise<unknown>,
    ][] = [
      ["getIssuerSettings", (a) => getIssuerSettings(deps, a)],
      [
        "saveIssuerSettings",
        (a) => saveIssuerSettings(deps, a, { ...issuer, city: "X Ciudad" }),
      ],
      ["listBankAccounts", (a) => listBankAccounts(deps, a)],
      ["getBankAccount", (a) => getBankAccount(deps, a, id)],
      [
        "createBankAccount",
        (a) =>
          createBankAccount(deps, a, {
            ...account,
            accountNumber: "777666555",
          }),
      ],
      [
        "updateBankAccount",
        (a) =>
          updateBankAccount(deps, a, id, { ...account, holderName: "Otro" }),
      ],
      ["deactivate", (a) => setBankAccountActive(deps, a, id, false)],
      ["reactivate", (a) => setBankAccountActive(deps, a, id, true)],
    ];
    for (const [label, actor, expected] of actors()) {
      for (const [name, run] of operations) {
        assert.equal(
          await rejects(run(actor)),
          expected,
          `${name} as ${label}`,
        );
      }
    }
    assert.equal(await count("bank_account"), 1);
    assert.equal(await count("issuer_settings"), 1);
    assert.equal(await count("audit_log"), audits);
    assert.equal((await getBankAccount(deps, admin, id))?.active, true);
    assert.equal((await getIssuerSettings(deps, admin))?.city, "Ciudad Demo");
  });

  it("refuses before validating: an invalid payload from staff is forbidden, not a field error", async () => {
    assert.equal(
      await rejects(createBankAccount(deps, staff, {})),
      "forbidden",
    );
    assert.equal(
      await rejects(saveIssuerSettings(deps, null, {})),
      "unauthenticated",
    );
  });
});
