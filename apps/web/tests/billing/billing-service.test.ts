import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createIssuer, setIssuerActive } from "../../src/billing/issuers.ts";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
  createBankAccount,
  getBankAccount,
  listBankAccounts,
  setBankAccountActive,
  updateBankAccount,
} from "../../src/billing/service.ts";
import { createSigner } from "../../src/billing/signers.ts";
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

const otherIssuer = {
  ...issuer,
  legalName: "Otro Emisor Demo",
  identificationNumber: "900.000.003-3",
};

const BILLING_TABLES =
  "bank_account, issuer_logo, issuer_profile, signer_profile, billing_image";

// Every account belongs to an issuer: the default one created per test.
let issuerId: string;
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
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  issuerId = (await createIssuer(deps, admin, issuer)).id;
  account = { ...accountFields, issuerProfileId: issuerId };
  // The issuer setup is not under test here (truncate skips row triggers;
  // cleanAuthTables already empties audit_log through the user cascade).
  await pool.query("truncate table audit_log");
});

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

describe("bank accounts and their issuer", () => {
  it("stores and shows the issuer of each account", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    const saved = await getBankAccount(deps, admin, id);
    assert.equal(saved?.issuerProfileId, issuerId);
    assert.deepEqual(saved?.issuer, {
      id: issuerId,
      legalName: "Emisor Demo S.A.S.",
      active: true,
    });
    const [listed] = await listBankAccounts(deps, admin);
    assert.equal(listed?.issuer?.legalName, "Emisor Demo S.A.S.");
  });

  it("requires an issuer: missing or malformed is a field error", async () => {
    for (const issuerProfileId of [undefined, "", "nope"]) {
      await assert.rejects(
        createBankAccount(deps, admin, { ...accountFields, issuerProfileId }),
        (error: unknown) =>
          error instanceof BillingValidationError &&
          error.fieldErrors.issuerProfileId === "Elige el emisor de la cuenta.",
      );
    }
    assert.equal(await count("bank_account"), 0);
  });

  it("refuses an unknown issuer, another kind of id and an inactive issuer", async () => {
    const { id: signerId } = await createSigner(deps, admin, {
      fullName: "Firmante Demo",
      identificationType: "CC",
      identificationNumber: "1000000009",
      jobTitle: "Representante legal",
      email: "firmante@example.test",
    });
    const other = await createIssuer(deps, admin, otherIssuer);
    await setIssuerActive(deps, admin, other.id, false);
    const cases: [string, string][] = [
      ["11111111-1111-4111-8111-111111111111", "issuer_not_found"],
      [signerId, "issuer_not_found"],
      [other.id, "issuer_inactive"],
    ];
    for (const [issuerProfileId, expected] of cases) {
      assert.equal(
        await rejects(
          createBankAccount(deps, admin, { ...account, issuerProfileId }),
        ),
        expected,
      );
    }
    assert.equal(await count("bank_account"), 0);
  });

  it("moves an account to another active issuer, and refuses an inactive one on update", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    const other = await createIssuer(deps, admin, otherIssuer);
    await updateBankAccount(deps, admin, id, {
      ...account,
      issuerProfileId: other.id,
    });
    assert.equal(
      (await getBankAccount(deps, admin, id))?.issuerProfileId,
      other.id,
    );
    assert.deepEqual((await auditRows()).at(-1)?.details, {
      bankAccountId: id,
      changedFields: ["issuerProfileId"],
    });
    await updateBankAccount(deps, admin, id, account);
    await setIssuerActive(deps, admin, other.id, false);
    assert.equal(
      await rejects(
        updateBankAccount(deps, admin, id, {
          ...account,
          issuerProfileId: other.id,
        }),
      ),
      "issuer_inactive",
    );
    assert.equal(
      (await getBankAccount(deps, admin, id))?.issuerProfileId,
      issuerId,
    );
  });

  it("asks for an active issuer when editing an account left without one", async () => {
    const { id } = await createBankAccount(deps, admin, account);
    await pool.query(
      "update bank_account set issuer_profile_id = null where id = $1",
      [id],
    );
    const unassigned = await getBankAccount(deps, admin, id);
    assert.equal(unassigned?.issuerProfileId, null);
    assert.equal(unassigned?.issuer, null);
    await assert.rejects(
      updateBankAccount(deps, admin, id, accountFields),
      BillingValidationError,
    );
    await updateBankAccount(deps, admin, id, account);
    assert.equal(
      (await getBankAccount(deps, admin, id))?.issuerProfileId,
      issuerId,
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
    const audits = await count("audit_log");
    const operations: [
      string,
      (actor: BillingActor | null) => Promise<unknown>,
    ][] = [
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
    assert.equal(await count("audit_log"), audits);
    assert.equal((await getBankAccount(deps, admin, id))?.active, true);
  });

  it("refuses before validating: an invalid payload from staff is forbidden, not a field error", async () => {
    assert.equal(
      await rejects(createBankAccount(deps, staff, {})),
      "forbidden",
    );
    assert.equal(
      await rejects(createBankAccount(deps, null, {})),
      "unauthenticated",
    );
  });
});
