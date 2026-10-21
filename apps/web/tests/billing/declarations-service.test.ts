import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  createDeclaration,
  getDeclaration,
  listDeclarations,
  setDeclarationActive,
  updateDeclaration,
} from "../../src/billing/declarations.ts";
import {
  type BillingActor,
  BillingRuleError,
  BillingValidationError,
} from "../../src/billing/service.ts";
import {
  DECLARATION_BODY_MAX,
  validateDeclaration,
} from "../../src/billing/validation.ts";
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

// Synthetic texts only; never the owner's real declarations.
const declaration = {
  label: "Declaración de prueba A",
  body: "Texto sintético de prueba.\r\nSegunda línea.",
};

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query("truncate table declaration_text cascade");
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
  await pool.query("truncate table declaration_text cascade");
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
      where action like 'billing.%' order by id`,
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

describe("validateDeclaration", () => {
  it("normalizes the label and the line breaks of the body", () => {
    const result = validateDeclaration({
      label: "  Declaración   A ",
      body: "  Primera línea.\r\nSegunda línea.\rTercera.  ",
    });
    assert.deepEqual(result, {
      ok: true,
      data: {
        label: "Declaración A",
        body: "Primera línea.\nSegunda línea.\nTercera.",
      },
    });
  });

  it("requires a label and a body within their limits", () => {
    const empty = validateDeclaration({ label: " ", body: "\n " });
    assert.equal(empty.ok, false);
    if (empty.ok) return;
    assert.ok(empty.fieldErrors.label);
    assert.ok(empty.fieldErrors.body);

    const long = validateDeclaration({
      label: "x".repeat(121),
      body: "y".repeat(DECLARATION_BODY_MAX + 1),
    });
    assert.equal(long.ok, false);
    if (long.ok) return;
    assert.match(long.fieldErrors.label ?? "", /120/);
    assert.match(long.fieldErrors.body ?? "", /2000/);

    const limit = validateDeclaration({
      label: "x".repeat(120),
      body: "y".repeat(DECLARATION_BODY_MAX),
    });
    assert.equal(limit.ok, true);
  });
});

describe("declaration texts", () => {
  it("starts empty: there is no default declaration", async () => {
    assert.deepEqual(await listDeclarations(deps, admin), []);
    assert.equal(await count("declaration_text"), 0);
  });

  it("creates, lists and reads a declaration with its authorship", async () => {
    const { id } = await createDeclaration(deps, admin, declaration);
    const saved = await getDeclaration(deps, admin, id);
    assert.ok(saved);
    assert.equal(saved.label, "Declaración de prueba A");
    assert.equal(saved.body, "Texto sintético de prueba.\nSegunda línea.");
    assert.equal(saved.active, true);
    assert.equal(saved.createdBy, admin.id);
    assert.equal(saved.updatedBy, admin.id);
    assert.deepEqual(
      (await listDeclarations(deps, admin)).map((d) => d.id),
      [id],
    );
    assert.deepEqual(await auditRows(), [
      {
        action: "billing.declaration_create",
        details: { declarationTextId: id },
      },
    ]);
  });

  it("lists active declarations first, then by label", async () => {
    for (const label of ["B", "a", "C", "d"]) {
      await createDeclaration(deps, admin, { ...declaration, label });
    }
    const [first] = await listDeclarations(deps, admin);
    assert.equal(first?.label, "a");
    if (first) await setDeclarationActive(deps, admin, first.id, false);
    assert.deepEqual(
      (await listDeclarations(deps, admin)).map((d) => d.label),
      ["B", "C", "d", "a"],
    );
  });

  it("refuses a duplicate label, ignoring case and inactive rows", async () => {
    const { id } = await createDeclaration(deps, admin, declaration);
    await setDeclarationActive(deps, admin, id, false);
    assert.equal(
      await code(
        createDeclaration(deps, admin, {
          ...declaration,
          label: "DECLARACIÓN DE PRUEBA A",
        }),
      ),
      "duplicate_declaration",
    );
    const other = await createDeclaration(deps, admin, {
      ...declaration,
      label: "Otra",
    });
    assert.equal(
      await code(
        updateDeclaration(deps, admin, other.id, {
          ...declaration,
          label: "declaración de prueba a",
        }),
      ),
      "duplicate_declaration",
    );
    assert.equal(await count("declaration_text"), 2);
  });

  it("updates only what changed and audits the changed field names only", async () => {
    const { id } = await createDeclaration(deps, admin, declaration);
    await updateDeclaration(deps, admin, id, declaration);
    await updateDeclaration(deps, admin, id, {
      ...declaration,
      body: "Texto sintético corregido.",
    });
    const saved = await getDeclaration(deps, admin, id);
    assert.equal(saved?.body, "Texto sintético corregido.");
    const rows = await auditRows();
    assert.deepEqual(rows, [
      {
        action: "billing.declaration_create",
        details: { declarationTextId: id },
      },
      {
        action: "billing.declaration_update",
        details: { declarationTextId: id, changedFields: ["body"] },
      },
    ]);
    // The trail never carries the texts themselves.
    const trail = JSON.stringify(rows);
    assert.ok(!trail.includes("sintético"));
    assert.ok(!trail.includes("Declaración de prueba"));
  });

  it("deactivates and reactivates, never deletes", async () => {
    const { id } = await createDeclaration(deps, admin, declaration);
    await setDeclarationActive(deps, admin, id, false);
    await setDeclarationActive(deps, admin, id, false);
    assert.equal((await getDeclaration(deps, admin, id))?.active, false);
    await setDeclarationActive(deps, admin, id, true);
    assert.equal((await getDeclaration(deps, admin, id))?.active, true);
    assert.equal(await count("declaration_text"), 1);
    assert.deepEqual(
      (await auditRows()).map((row) => row.action),
      [
        "billing.declaration_create",
        "billing.declaration_deactivate",
        "billing.declaration_activate",
      ],
    );
  });

  it("reports unknown and malformed ids", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    assert.equal(await getDeclaration(deps, admin, unknown), null);
    assert.equal(await getDeclaration(deps, admin, "not-a-uuid"), null);
    assert.equal(
      await code(updateDeclaration(deps, admin, unknown, declaration)),
      "declaration_not_found",
    );
    assert.equal(
      await code(setDeclarationActive(deps, admin, "x", false)),
      "declaration_not_found",
    );
  });

  it("rejects invalid input before touching the database", async () => {
    assert.equal(
      await code(createDeclaration(deps, admin, { label: "", body: "" })),
      "validation",
    );
    assert.equal(await count("declaration_text"), 0);
    assert.deepEqual(await auditRows(), []);
  });

  it("refuses every operation to staff, no session and forged roles", async () => {
    const { id } = await createDeclaration(deps, admin, declaration);
    const forged = { ...admin, role: "superadmin" } as unknown as BillingActor;
    for (const actor of [staff, null, forged]) {
      const expected = actor ? "forbidden" : "unauthenticated";
      assert.equal(await code(listDeclarations(deps, actor)), expected);
      assert.equal(await code(getDeclaration(deps, actor, id)), expected);
      assert.equal(
        await code(createDeclaration(deps, actor, declaration)),
        expected,
      );
      assert.equal(
        await code(updateDeclaration(deps, actor, id, declaration)),
        expected,
      );
      assert.equal(
        await code(setDeclarationActive(deps, actor, id, false)),
        expected,
      );
    }
    assert.equal(await count("declaration_text"), 1);
    assert.equal((await auditRows()).length, 1);
  });
});

describe("declaration_text table", () => {
  async function insertRaw(label: string, body: string) {
    await pool.query(
      `insert into declaration_text (label, body, created_by, updated_by)
       values ($1, $2, $3, $3)`,
      [label, body, admin.id],
    );
  }

  async function sqlState(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return "no-error";
  }

  it("refuses blank labels and bodies, and bodies over the limit", async () => {
    assert.equal(await sqlState(insertRaw("  ", "Texto")), "23514");
    assert.equal(await sqlState(insertRaw("Etiqueta", " \n ")), "23514");
    assert.equal(
      await sqlState(
        insertRaw("Etiqueta", "y".repeat(DECLARATION_BODY_MAX + 1)),
      ),
      "23514",
    );
    assert.equal(await sqlState(insertRaw("Etiqueta", "Texto")), "no-error");
    assert.equal(await sqlState(insertRaw("ETIQUETA", "Texto")), "23505");
  });

  it("keeps the authors: a user with declarations cannot be deleted", async () => {
    await insertRaw("Etiqueta", "Texto");
    assert.equal(
      await sqlState(
        pool.query('delete from "user" where id = $1', [admin.id]),
      ),
      "23001",
    );
  });
});
