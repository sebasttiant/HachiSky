import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { ClientActor } from "../../src/clients/service.ts";
import {
  RULE_MESSAGES,
  submitCreate,
  submitSetActive,
  submitUpdate,
} from "../../src/clients/submit.ts";
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

let admin: ClientActor;
let staff: ClientActor;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  name: "Cliente Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.001-1",
  address: "",
  city: "Ciudad Demo",
  email: "",
  phone: "",
};

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
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count(table: "client" | "audit_log") {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return rows[0]?.n ?? -1;
}

describe("submitCreate", () => {
  it("answers Spanish field errors and saves nothing for missing fields", async () => {
    const { state, id } = await submitCreate(deps, staff, form({}));
    assert.equal(id, undefined);
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.equal(state.fieldErrors?.name, "Escribe el nombre o razón social.");
    assert.equal(
      state.fieldErrors?.identificationNumber,
      "Escribe el número de identificación.",
    );
    assert.equal(await count("client"), 0);
    assert.equal(await count("audit_log"), 0);
  });

  it("creates the client and returns its id", async () => {
    const { state, id } = await submitCreate(deps, staff, form(valid));
    assert.equal(state.status, "success");
    assert.ok(id);
    const { rows } = await pool.query(
      "select identification_number, created_by from client where id = $1",
      [id],
    );
    assert.deepEqual(rows, [
      { identification_number: "9000000011", created_by: staff.id },
    ]);
  });

  it("explains a duplicate identification", async () => {
    await submitCreate(deps, staff, form(valid));
    const { state } = await submitCreate(deps, admin, form(valid));
    assert.equal(state.status, "error");
    assert.equal(state.message, RULE_MESSAGES.duplicate_identification);
    assert.match(state.message ?? "", /Ya existe un cliente/);
    assert.equal(await count("client"), 1);
  });

  it("answers a session error for a missing actor and saves nothing", async () => {
    const { state } = await submitCreate(deps, null, form(valid));
    assert.equal(state.message, RULE_MESSAGES.unauthenticated);
    assert.equal(await count("client"), 0);
  });
});

describe("submitUpdate", () => {
  it("saves the change and confirms in Spanish", async () => {
    const { id } = await submitCreate(deps, admin, form(valid));
    const state = await submitUpdate(
      deps,
      staff,
      id ?? "",
      form({ ...valid, city: "Otra Ciudad" }),
    );
    assert.deepEqual(state, {
      status: "success",
      message: "Cambios guardados.",
    });
  });

  it("answers field errors and keeps the stored data", async () => {
    const { id } = await submitCreate(deps, admin, form(valid));
    const state = await submitUpdate(
      deps,
      staff,
      id ?? "",
      form({ ...valid, email: "nope" }),
    );
    assert.equal(state.fieldErrors?.email, "Escribe un correo válido.");
    const { rows } = await pool.query(
      "select email from client where id = $1",
      [id],
    );
    assert.deepEqual(rows, [{ email: null }]);
  });

  it("answers that an unknown client no longer exists", async () => {
    const state = await submitUpdate(
      deps,
      admin,
      "11111111-1111-4111-8111-111111111111",
      form(valid),
    );
    assert.equal(state.message, RULE_MESSAGES.not_found);
  });
});

describe("submitSetActive", () => {
  it("lets an admin deactivate and reactivate", async () => {
    const { id } = await submitCreate(deps, admin, form(valid));
    assert.equal(
      (await submitSetActive(deps, admin, id ?? "", false)).status,
      "success",
    );
    assert.equal(
      (await submitSetActive(deps, admin, id ?? "", true)).status,
      "success",
    );
  });

  it("refuses a forged staff deactivation in Spanish, without changes or audit", async () => {
    const { id } = await submitCreate(deps, admin, form(valid));
    const audits = await count("audit_log");
    const state = await submitSetActive(deps, staff, id ?? "", false);
    assert.deepEqual(state, {
      status: "error",
      message: RULE_MESSAGES.forbidden,
    });
    const { rows } = await pool.query(
      "select active from client where id = $1",
      [id],
    );
    assert.deepEqual(rows, [{ active: true }]);
    assert.equal(await count("audit_log"), audits);
  });

  it("refuses a forged staff reactivation, leaving the client inactive", async () => {
    const { id } = await submitCreate(deps, admin, form(valid));
    await submitSetActive(deps, admin, id ?? "", false);
    const audits = await count("audit_log");
    const state = await submitSetActive(deps, staff, id ?? "", true);
    assert.equal(state.message, RULE_MESSAGES.forbidden);
    const { rows } = await pool.query(
      "select active from client where id = $1",
      [id],
    );
    assert.deepEqual(rows, [{ active: false }]);
    assert.equal(await count("audit_log"), audits);
  });

  it("refuses without a session", async () => {
    const { id } = await submitCreate(deps, admin, form(valid));
    const state = await submitSetActive(deps, null, id ?? "", false);
    assert.equal(state.message, RULE_MESSAGES.unauthenticated);
  });
});
