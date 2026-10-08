import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BillingActor } from "../../src/billing/service.ts";
import {
  RULE_MESSAGES,
  submitCreateDeclaration,
  submitSetDeclarationActive,
  submitUpdateDeclaration,
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

// What the Server Functions do with a submitted declaration form: Spanish
// messages and nothing stored when anything is refused.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

// Synthetic texts only; never the owner's real declarations.
const declaration = {
  label: "Declaración de prueba A",
  body: "Texto sintético de prueba.",
};

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
  await pool.query("truncate table declaration_text cascade");
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
});

after(async () => {
  await pool.query("truncate table declaration_text cascade");
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count() {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from declaration_text",
  );
  return rows[0]?.n ?? -1;
}

async function createdDeclaration() {
  const { id } = await submitCreateDeclaration(deps, admin, form(declaration));
  assert.ok(id);
  return id;
}

describe("declaration forms", () => {
  it("creates a declaration and returns its id", async () => {
    const { state, id } = await submitCreateDeclaration(
      deps,
      admin,
      form(declaration),
    );
    assert.equal(state.status, "success");
    assert.ok(id);
    assert.equal(await count(), 1);
  });

  it("answers Spanish field errors and stores nothing", async () => {
    const { state, id } = await submitCreateDeclaration(
      deps,
      admin,
      form({ label: "", body: " " }),
    );
    assert.equal(id, undefined);
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.match(state.fieldErrors?.label ?? "", /nombre/i);
    assert.match(state.fieldErrors?.body ?? "", /texto/i);
    assert.equal(await count(), 0);
  });

  it("explains a duplicate label", async () => {
    await createdDeclaration();
    const { state } = await submitCreateDeclaration(
      deps,
      admin,
      form({ ...declaration, label: "declaración de prueba a" }),
    );
    assert.equal(state.message, RULE_MESSAGES.duplicate_declaration);
    assert.match(state.message ?? "", /nombre/);
  });

  it("updates and toggles with Spanish confirmations", async () => {
    const id = await createdDeclaration();
    const updated = await submitUpdateDeclaration(
      deps,
      admin,
      id,
      form({ ...declaration, body: "Texto sintético corregido." }),
    );
    assert.deepEqual(updated, {
      status: "success",
      message: "Cambios guardados.",
    });
    const off = await submitSetDeclarationActive(deps, admin, id, false);
    assert.match(off.message ?? "", /Declaración desactivada/);
    const on = await submitSetDeclarationActive(deps, admin, id, true);
    assert.match(on.message ?? "", /Declaración reactivada/);
  });

  it("reports an unknown declaration", async () => {
    const state = await submitUpdateDeclaration(
      deps,
      admin,
      "00000000-0000-4000-8000-000000000000",
      form(declaration),
    );
    assert.equal(state.message, RULE_MESSAGES.declaration_not_found);
  });

  it("refuses staff and no session in Spanish, changing nothing", async () => {
    const id = await createdDeclaration();
    for (const actor of [staff, null]) {
      const created = await submitCreateDeclaration(
        deps,
        actor,
        form({ ...declaration, label: "Otra" }),
      );
      assert.equal(created.state.status, "error");
      const updated = await submitUpdateDeclaration(
        deps,
        actor,
        id,
        form({ ...declaration, body: "Cambiado" }),
      );
      assert.equal(updated.status, "error");
      const toggled = await submitSetDeclarationActive(deps, actor, id, false);
      assert.equal(toggled.status, "error");
      assert.equal(
        toggled.message,
        actor ? RULE_MESSAGES.forbidden : RULE_MESSAGES.unauthenticated,
      );
    }
    assert.equal(await count(), 1);
    const { rows } = await pool.query(
      "select body, active from declaration_text",
    );
    assert.deepEqual(rows, [{ body: declaration.body, active: true }]);
  });
});
