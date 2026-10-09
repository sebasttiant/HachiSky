import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createDeclaration } from "../../src/billing/declarations.ts";
import {
  createDraft,
  discardDraft,
  getDraft,
  getDraftOptions,
  listDrafts,
  updateDraft,
} from "../../src/billing/drafts.ts";
import { createIssuer, setIssuerActive } from "../../src/billing/issuers.ts";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
  createBankAccount,
  setBankAccountActive,
} from "../../src/billing/service.ts";
import { createSigner, setSignerActive } from "../../src/billing/signers.ts";
import { validateDraft } from "../../src/billing/validation.ts";
import { createClient, setClientActive } from "../../src/clients/service.ts";
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

// Synthetic data only.
const ids = {
  client: "",
  otherClient: "",
  issuer: "",
  otherIssuer: "",
  copAccount: "",
  usdAccount: "",
  otherIssuerAccount: "",
  signer: "",
  declaration: "",
};

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

const accountFields = {
  bankName: "Banco Demo",
  accountType: "ahorros",
  accountNumber: "000111222",
  holderName: "Titular Demo",
  holderIdentificationType: "CC",
  holderIdentificationNumber: "1000000001",
};

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  // Truncating "user" cascades to every table that records its author,
  // drafts and their lines included.
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

  ids.client = (
    await createClient(deps, admin, {
      name: "Cliente Demo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "900.000.001-1",
    })
  ).id;
  ids.otherClient = (
    await createClient(deps, admin, {
      name: "Otro Cliente Demo",
      identificationType: "CC",
      identificationNumber: "1000000002",
    })
  ).id;
  ids.issuer = (await createIssuer(deps, admin, issuer)).id;
  ids.otherIssuer = (
    await createIssuer(deps, admin, {
      ...issuer,
      legalName: "Otro Emisor Demo",
      identificationNumber: "900.000.003-3",
      paymentTerms: "",
    })
  ).id;
  ids.copAccount = (
    await createBankAccount(deps, admin, {
      ...accountFields,
      currency: "COP",
      issuerProfileId: ids.issuer,
    })
  ).id;
  ids.usdAccount = (
    await createBankAccount(deps, admin, {
      ...accountFields,
      currency: "USD",
      issuerProfileId: ids.issuer,
    })
  ).id;
  ids.otherIssuerAccount = (
    await createBankAccount(deps, admin, {
      ...accountFields,
      accountNumber: "000333444",
      currency: "COP",
      issuerProfileId: ids.otherIssuer,
    })
  ).id;
  ids.signer = (
    await createSigner(deps, admin, {
      fullName: "Firmante Demo",
      identificationType: "CC",
      identificationNumber: "1000000009",
      jobTitle: "Representante legal",
      email: "firmante@example.test",
    })
  ).id;
  ids.declaration = (
    await createDeclaration(deps, admin, {
      label: "Declaración de prueba",
      body: "Texto sintético de prueba.",
    })
  ).id;
  // The setup is not under test here.
  await pool.query("truncate table audit_log");
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count(table: string) {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return rows[0]?.n ?? -1;
}

async function auditRows() {
  const { rows } = await pool.query(
    `select action, details from audit_log
      where action like 'billing.draft%' order by id`,
  );
  return rows as { action: string; details: Record<string, unknown> }[];
}

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

async function fieldErrors(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BillingValidationError)
      return error.fieldErrors as Record<string, string>;
    throw error;
  }
  return {};
}

function newDraft(overrides: Record<string, unknown> = {}) {
  return createDraft(deps, admin, {
    clientId: ids.client,
    issuerProfileId: ids.issuer,
    currency: "COP",
    ...overrides,
  });
}

function fullDraft(overrides: Record<string, unknown> = {}) {
  return {
    clientId: ids.client,
    issuerProfileId: ids.issuer,
    currency: "COP",
    bankAccountId: ids.copAccount,
    signerProfileId: ids.signer,
    declarationTextId: "",
    paymentTerms: "Pago a 15 días.",
    lines: [
      {
        product: "Asesoría",
        description: "Anticipo 40 %",
        quantity: "1",
        amount: "1.200.000",
      },
      { product: "Soporte", description: "", quantity: "", amount: "300.000" },
    ],
    ...overrides,
  };
}

describe("validateDraft", () => {
  it("normalizes the header and the lines and skips blank rows", () => {
    const result = validateDraft({
      ...fullDraft(),
      bankAccountId: "",
      signerProfileId: " ",
      paymentTerms: "  Pago a 15 días.\r\nSin intereses. ",
      lines: [
        {
          product: "  Asesoría   mensual ",
          description: " a\r\nb ",
          quantity: " 3 horas ",
          amount: "$ 1.000",
        },
        { product: "", description: "", quantity: "", amount: "" },
        { product: "Soporte", amount: "2.000" },
      ],
    });
    assert.ok(result.ok, JSON.stringify(!result.ok && result.fieldErrors));
    if (!result.ok) return;
    assert.equal(result.data.bankAccountId, null);
    assert.equal(result.data.signerProfileId, null);
    assert.equal(result.data.declarationTextId, null);
    assert.equal(result.data.paymentTerms, "Pago a 15 días.\nSin intereses.");
    assert.deepEqual(result.data.lines, [
      {
        product: "Asesoría mensual",
        description: "a\nb",
        quantity: "3 horas",
        amountMinor: 1000,
      },
      {
        product: "Soporte",
        description: null,
        quantity: null,
        amountMinor: 2000,
      },
    ]);
  });

  it("reads amounts in the document currency", () => {
    const usd = validateDraft({
      ...fullDraft({
        currency: "USD",
        lines: [{ product: "A", amount: "1.234,56" }],
      }),
    });
    assert.ok(usd.ok);
    if (usd.ok) assert.equal(usd.data.lines[0]?.amountMinor, 123_456);
    const cop = validateDraft(
      fullDraft({ lines: [{ product: "A", amount: "1.234,56" }] }),
    );
    assert.equal(cop.ok, false);
    if (!cop.ok)
      assert.match(cop.fieldErrors["lines.0.amount"] ?? "", /decimales/);
  });

  it("reports each line error at the row the form sent", () => {
    const result = validateDraft(
      fullDraft({
        lines: [
          { product: "", description: "", quantity: "", amount: "" },
          { product: "", amount: "100" },
          { product: "B", amount: "0" },
          { product: "C", quantity: "x".repeat(31), amount: "1" },
        ],
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.fieldErrors["lines.0.product"], undefined);
    assert.match(result.fieldErrors["lines.1.product"] ?? "", /producto/i);
    assert.match(result.fieldErrors["lines.2.amount"] ?? "", /mayor que cero/);
    assert.match(result.fieldErrors["lines.3.quantity"] ?? "", /30/);
  });

  it("refuses more than 50 lines and an unknown currency", () => {
    const many = validateDraft(
      fullDraft({
        lines: Array.from({ length: 51 }, () => ({
          product: "A",
          amount: "1",
        })),
      }),
    );
    assert.equal(many.ok, false);
    if (!many.ok) assert.match(many.fieldErrors.lines ?? "", /50/);
    const eur = validateDraft(fullDraft({ currency: "EUR" }));
    assert.equal(eur.ok, false);
    if (!eur.ok) assert.ok(eur.fieldErrors.currency);
  });
});

describe("drafts", () => {
  it("creates an empty draft without a number and copies the issuer's payment terms", async () => {
    const { id } = await newDraft();
    const draft = await getDraft(deps, admin, id);
    assert.ok(draft);
    assert.equal(draft.status, "draft");
    assert.equal(draft.client.name, "Cliente Demo S.A.S.");
    assert.equal(draft.issuer.legalName, "Emisor Demo S.A.S.");
    assert.equal(draft.currency, "COP");
    assert.equal(draft.paymentTerms, "Pago a 30 días.");
    assert.equal(draft.bankAccountId, null);
    assert.equal(draft.signerProfileId, null);
    assert.equal(draft.declarationTextId, null);
    assert.deepEqual(draft.lines, []);
    assert.equal(draft.totalMinor, 0);
    assert.equal(draft.createdBy, admin.id);
    assert.ok(!("number" in draft));
    assert.deepEqual(await auditRows(), [
      { action: "billing.draft_create", details: { billingDocumentId: id } },
    ]);
  });

  it("never preselects a declaration", async () => {
    const { id } = await newDraft({ declarationTextId: ids.declaration });
    assert.equal((await getDraft(deps, admin, id))?.declarationTextId, null);
  });

  it("requires an active client and issuer to start a draft", async () => {
    await setClientActive(deps, admin, ids.otherClient, false);
    await setIssuerActive(deps, admin, ids.otherIssuer, false);
    assert.match(
      (await fieldErrors(newDraft({ clientId: ids.otherClient }))).clientId ??
        "",
      /cliente activo/,
    );
    assert.match(
      (await fieldErrors(newDraft({ issuerProfileId: ids.otherIssuer })))
        .issuerProfileId ?? "",
      /emisor activo/,
    );
    assert.equal(
      await code(newDraft({ clientId: "nope", currency: "EUR" })),
      "validation",
    );
    assert.equal(await count("billing_document"), 0);
    assert.deepEqual(await auditRows(), []);
  });

  it("saves the header and the lines; the total is the sum of the lines", async () => {
    const { id } = await newDraft();
    await updateDraft(
      deps,
      admin,
      id,
      fullDraft({ declarationTextId: ids.declaration }),
    );
    const draft = await getDraft(deps, admin, id);
    assert.ok(draft);
    assert.equal(draft.bankAccountId, ids.copAccount);
    assert.equal(draft.signerProfileId, ids.signer);
    assert.equal(draft.declarationTextId, ids.declaration);
    assert.equal(draft.paymentTerms, "Pago a 15 días.");
    assert.deepEqual(
      draft.lines.map((line) => [
        line.position,
        line.product,
        line.amountMinor,
      ]),
      [
        [1, "Asesoría", 1_200_000],
        [2, "Soporte", 300_000],
      ],
    );
    assert.equal(draft.totalMinor, 1_500_000);
    // Quantity is informative: it never multiplies the amount.
    assert.equal(draft.lines[0]?.quantity, "1");
  });

  it("replaces the lines on every save", async () => {
    const { id } = await newDraft();
    await updateDraft(deps, admin, id, fullDraft());
    await updateDraft(
      deps,
      admin,
      id,
      fullDraft({ lines: [{ product: "Único", amount: "50" }] }),
    );
    const draft = await getDraft(deps, admin, id);
    assert.deepEqual(
      draft?.lines.map((line) => [line.position, line.product]),
      [[1, "Único"]],
    );
    assert.equal(draft?.totalMinor, 50);
    assert.equal(await count("billing_document_line"), 1);
  });

  it("audits changed field names only, and nothing for a no-op save", async () => {
    const { id } = await newDraft();
    await updateDraft(deps, admin, id, fullDraft());
    await updateDraft(deps, admin, id, fullDraft());
    await updateDraft(
      deps,
      admin,
      id,
      fullDraft({
        paymentTerms: "Otro texto",
        lines: [{ product: "X", amount: "7" }],
      }),
    );
    const rows = await auditRows();
    assert.deepEqual(rows, [
      { action: "billing.draft_create", details: { billingDocumentId: id } },
      {
        action: "billing.draft_update",
        details: {
          billingDocumentId: id,
          changedFields: [
            "bankAccountId",
            "signerProfileId",
            "paymentTerms",
            "lines",
          ],
        },
      },
      {
        action: "billing.draft_update",
        details: {
          billingDocumentId: id,
          changedFields: ["paymentTerms", "lines"],
        },
      },
    ]);
    const trail = JSON.stringify(rows);
    for (const secret of ["Asesoría", "1200000", "Cliente Demo", "Pago a"]) {
      assert.ok(!trail.includes(secret), secret);
    }
  });

  it("checks that the bank account is active, from the issuer and in the currency", async () => {
    const { id } = await newDraft();
    const bank = async (overrides: Record<string, unknown>) =>
      (await fieldErrors(updateDraft(deps, admin, id, fullDraft(overrides))))
        .bankAccountId ?? "";
    assert.match(await bank({ bankAccountId: ids.usdAccount }), /moneda/);
    assert.match(
      await bank({ bankAccountId: ids.otherIssuerAccount }),
      /emisor/,
    );
    await setBankAccountActive(deps, admin, ids.copAccount, false);
    assert.match(await bank({}), /activa/);
    assert.match(
      await bank({ bankAccountId: "00000000-0000-4000-8000-000000000000" }),
      /activa/,
    );
    // Switching currency together with an account in that currency is fine.
    await updateDraft(
      deps,
      admin,
      id,
      fullDraft({ currency: "USD", bankAccountId: ids.usdAccount, lines: [] }),
    );
    assert.equal((await getDraft(deps, admin, id))?.currency, "USD");
  });

  it("refuses inactive references and changes nothing", async () => {
    const { id } = await newDraft();
    await updateDraft(deps, admin, id, fullDraft());
    await setSignerActive(deps, admin, ids.signer, false);
    await setClientActive(deps, admin, ids.otherClient, false);
    const errors = await fieldErrors(
      updateDraft(
        deps,
        admin,
        id,
        fullDraft({
          clientId: ids.otherClient,
          lines: [{ product: "Nuevo", amount: "1" }],
        }),
      ),
    );
    assert.match(errors.clientId ?? "", /cliente activo/);
    assert.match(errors.signerProfileId ?? "", /firmante activo/);
    const draft = await getDraft(deps, admin, id);
    assert.equal(draft?.clientId, ids.client);
    assert.equal(draft?.lines.length, 2);
  });

  it("lists drafts with their client, issuer and total, newest change first", async () => {
    const first = await newDraft();
    const second = await newDraft({
      clientId: ids.otherClient,
      currency: "USD",
    });
    await updateDraft(deps, admin, first.id, fullDraft());
    const list = await listDrafts(deps, admin);
    assert.deepEqual(
      list.map((item) => [
        item.id,
        item.clientName,
        item.currency,
        item.totalMinor,
        item.lineCount,
      ]),
      [
        [first.id, "Cliente Demo S.A.S.", "COP", 1_500_000, 2],
        [second.id, "Otro Cliente Demo", "USD", 0, 0],
      ],
    );
    assert.equal(list[0]?.issuerName, "Emisor Demo S.A.S.");
  });

  it("discards a draft with its lines and keeps the audit trail", async () => {
    const { id } = await newDraft();
    await updateDraft(deps, admin, id, fullDraft());
    await discardDraft(deps, admin, id);
    assert.equal(await getDraft(deps, admin, id), null);
    assert.equal(await count("billing_document"), 0);
    assert.equal(await count("billing_document_line"), 0);
    assert.deepEqual((await auditRows()).at(-1), {
      action: "billing.draft_discard",
      details: { billingDocumentId: id },
    });
    assert.equal(await code(discardDraft(deps, admin, id)), "draft_not_found");
  });

  it("reports unknown and malformed ids", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    assert.equal(await getDraft(deps, admin, unknown), null);
    assert.equal(await getDraft(deps, admin, "x"), null);
    assert.equal(
      await code(updateDraft(deps, admin, unknown, fullDraft())),
      "draft_not_found",
    );
    assert.equal(await code(discardDraft(deps, admin, "x")), "draft_not_found");
  });

  it("refuses every operation to staff, no session and forged roles", async () => {
    const { id } = await newDraft();
    const forged = { ...admin, role: "superadmin" } as unknown as BillingActor;
    for (const actor of [staff, null, forged]) {
      const expected = actor ? "forbidden" : "unauthenticated";
      assert.equal(await code(listDrafts(deps, actor)), expected);
      assert.equal(await code(getDraft(deps, actor, id)), expected);
      assert.equal(
        await code(
          createDraft(deps, actor, {
            clientId: ids.client,
            issuerProfileId: ids.issuer,
            currency: "COP",
          }),
        ),
        expected,
      );
      assert.equal(
        await code(updateDraft(deps, actor, id, fullDraft())),
        expected,
      );
      assert.equal(await code(discardDraft(deps, actor, id)), expected);
    }
    assert.equal(await count("billing_document"), 1);
    assert.equal((await auditRows()).length, 1);
  });
});

describe("draft options", () => {
  it("offers active rows only, with the details an admin needs to choose", async () => {
    await setClientActive(deps, admin, ids.otherClient, false);
    await setBankAccountActive(deps, admin, ids.usdAccount, false);
    const options = await getDraftOptions(deps, admin);
    assert.deepEqual(
      options.clients.map((o) => o.id),
      [ids.client],
    );
    assert.match(
      options.clients[0]?.label ?? "",
      /Cliente Demo S\.A\.S\. · NIT 9000000011/,
    );
    const [defaultIssuer] = options.issuers;
    assert.equal(defaultIssuer?.id, ids.issuer);
    assert.equal(defaultIssuer?.isDefault, true);
    assert.deepEqual(
      options.bankAccounts
        .map((o) => [o.id, o.issuerProfileId, o.currency])
        .sort(),
      [
        [ids.copAccount, ids.issuer, "COP"],
        [ids.otherIssuerAccount, ids.otherIssuer, "COP"],
      ].sort(),
    );
    const account = options.bankAccounts.find((o) => o.id === ids.copAccount);
    // Holder and currency are shown; only the last digits of the number.
    assert.match(account?.label ?? "", /Banco Demo/);
    assert.match(account?.label ?? "", /Titular Demo/);
    assert.match(account?.label ?? "", /1222/);
    assert.doesNotMatch(account?.label ?? "", /000111222/);
    assert.match(
      options.signers[0]?.label ?? "",
      /Firmante Demo · Representante legal/,
    );
    assert.equal(options.declarations[0]?.label, "Declaración de prueba");
  });

  it("keeps the draft's own choices even when they became inactive", async () => {
    const { id } = await newDraft();
    await updateDraft(deps, admin, id, fullDraft());
    await setSignerActive(deps, admin, ids.signer, false);
    const draft = await getDraft(deps, admin, id);
    assert.ok(draft);
    const options = await getDraftOptions(deps, admin, draft);
    const signer = options.signers.find((o) => o.id === ids.signer);
    assert.equal(signer?.active, false);
    assert.equal((await getDraftOptions(deps, admin)).signers.length, 0);
  });

  it("is admin only", async () => {
    assert.equal(await code(getDraftOptions(deps, staff)), "forbidden");
    assert.equal(await code(getDraftOptions(deps, null)), "unauthenticated");
  });
});

describe("billing_document tables", () => {
  async function sqlState(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return "no-error";
  }

  async function insertLine(
    documentId: string,
    position: number,
    amount: number,
  ) {
    await pool.query(
      `insert into billing_document_line (document_id, position, product, amount_minor)
       values ($1, $2, 'Producto', $3)`,
      [documentId, position, amount],
    );
  }

  it("refuses zero or negative amounts and repeated positions", async () => {
    const { id } = await newDraft();
    assert.equal(await sqlState(insertLine(id, 1, 0)), "23514");
    assert.equal(await sqlState(insertLine(id, 1, -5)), "23514");
    assert.equal(await sqlState(insertLine(id, 1, 10)), "no-error");
    assert.equal(await sqlState(insertLine(id, 1, 10)), "23505");
    assert.equal(await sqlState(insertLine(id, 51, 10)), "23514");
  });

  it("only knows drafts until issuing exists", async () => {
    const { id } = await newDraft();
    assert.equal(
      await sqlState(
        pool.query(
          "update billing_document set status = 'issued' where id = $1",
          [id],
        ),
      ),
      "23514",
    );
  });

  it("keeps the client, issuer and accounts a document points at", async () => {
    const { id } = await newDraft();
    await updateDraft(deps, admin, id, fullDraft());
    assert.equal(
      await sqlState(
        pool.query("delete from client where id = $1", [ids.client]),
      ),
      "23001",
    );
    assert.equal(
      await sqlState(
        pool.query("delete from bank_account where id = $1", [ids.copAccount]),
      ),
      "23001",
    );
  });
});
