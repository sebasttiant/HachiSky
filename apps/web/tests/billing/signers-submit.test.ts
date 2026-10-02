import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BillingActor } from "../../src/billing/service.ts";
import {
  RULE_MESSAGES,
  submitCreateSigner,
  submitSetSignerActive,
  submitUpdateSigner,
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

// What the Server Functions do with a submitted signer form: Spanish
// messages and nothing stored when anything is refused. Image uploads go
// through the upload route (tests/billing/image-upload.test.ts).

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: BillingActor;
let staff: BillingActor;

const BILLING_TABLES =
  "signer_profile, billing_image, bank_account, issuer_settings";

const signer = {
  fullName: "Firmante Demo",
  identificationType: "CC",
  identificationNumber: "1000000009",
  jobTitle: "Representante legal",
  email: "firmante@example.test",
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
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
});

after(async () => {
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
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

async function createdSigner() {
  const { id } = await submitCreateSigner(deps, admin, form(signer));
  assert.ok(id);
  return id;
}

describe("signer forms", () => {
  it("creates a signer and returns its id", async () => {
    const { state, id } = await submitCreateSigner(deps, admin, form(signer));
    assert.equal(state.status, "success");
    assert.ok(id);
  });

  it("answers Spanish field errors", async () => {
    const { state, id } = await submitCreateSigner(
      deps,
      admin,
      form({ ...signer, fullName: "", email: "x" }),
    );
    assert.equal(id, undefined);
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.match(state.fieldErrors?.fullName ?? "", /nombre/i);
    assert.match(state.fieldErrors?.email ?? "", /correo/i);
  });

  it("explains a duplicate identification", async () => {
    await createdSigner();
    const { state } = await submitCreateSigner(deps, admin, form(signer));
    assert.equal(state.message, RULE_MESSAGES.duplicate_signer);
    assert.match(state.message ?? "", /identificación/);
  });

  it("updates and toggles with Spanish confirmations", async () => {
    const id = await createdSigner();
    const updated = await submitUpdateSigner(
      deps,
      admin,
      id,
      form({ ...signer, jobTitle: "Gerente" }),
    );
    assert.deepEqual(updated, {
      status: "success",
      message: "Cambios guardados.",
    });
    const off = await submitSetSignerActive(deps, admin, id, false);
    assert.match(off.message ?? "", /Firmante desactivado/);
    const on = await submitSetSignerActive(deps, admin, id, true);
    assert.match(on.message ?? "", /Firmante reactivado/);
  });

  it("refuses staff and no session in Spanish, changing nothing", async () => {
    const id = await createdSigner();
    for (const actor of [staff, null]) {
      const created = await submitCreateSigner(deps, actor, form(signer));
      assert.equal(created.state.status, "error");
      const updated = await submitUpdateSigner(deps, actor, id, form(signer));
      assert.equal(updated.status, "error");
      const toggled = await submitSetSignerActive(deps, actor, id, false);
      assert.equal(toggled.status, "error");
      assert.equal(
        toggled.message,
        actor ? RULE_MESSAGES.forbidden : RULE_MESSAGES.unauthenticated,
      );
    }
    assert.equal(await count("signer_profile"), 1);
  });
});
