import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { createClient } from "../../src/clients/service.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { getActivity, type WorkActor } from "../../src/work/service.ts";
import {
  submitCreateActivity,
  submitDeleteActivity,
  submitUpdateActivity,
  WORK_RULE_MESSAGES,
} from "../../src/work/submit.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// What the Server Functions do with a work activity form: Spanish validation,
// service-backed persistence, ownership refusal and no hidden writes.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: WorkActor;
let staff: WorkActor;
let otherStaff: WorkActor;
let clientId: string;

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
  await pool.query("truncate table work_activity, client cascade");
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  const o = await createTestUser(auth, "other@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  clientId = (
    await createClient(deps, admin, {
      name: "Cliente Trabajo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "900.555.001-1",
    })
  ).id;
});

after(async () => {
  await pool.query("truncate table work_activity, client cascade");
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function count() {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from work_activity",
  );
  return rows[0]?.n ?? -1;
}

function activityForm(extra: Record<string, string> = {}) {
  return form({
    clientId,
    performedOn: "2026-10-01",
    startedAt: "08:30",
    endedAt: "12:00",
    title: "Revisión contable",
    description: "Se revisaron movimientos y soportes del mes.",
    outcome: "Soportes conciliados.",
    status: "completed",
    nextSteps: "Solicitar dos facturas faltantes.",
    ...extra,
  });
}

async function createdActivity(actor: WorkActor = staff) {
  const { state, id } = await submitCreateActivity(deps, actor, activityForm());
  assert.equal(state.status, "success");
  assert.ok(id);
  return id;
}

describe("activity forms", () => {
  it("creates an activity and returns its id", async () => {
    const { state, id } = await submitCreateActivity(
      deps,
      staff,
      activityForm(),
    );
    assert.equal(state.status, "success");
    assert.ok(id);
    const saved = await getActivity(deps, staff, id);
    assert.equal(saved?.title, "Revisión contable");
    assert.equal(saved?.clientName, "Cliente Trabajo S.A.S.");
  });

  it("answers Spanish field errors and writes nothing", async () => {
    const { state, id } = await submitCreateActivity(
      deps,
      staff,
      activityForm({ clientId: "", performedOn: "2026-02-30", title: "" }),
    );
    assert.equal(id, undefined);
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.match(state.fieldErrors?.clientId ?? "", /cliente/i);
    assert.match(state.fieldErrors?.performedOn ?? "", /fecha/i);
    assert.match(state.fieldErrors?.title ?? "", /qué se hizo/i);
    assert.equal(await count(), 0);
  });

  it("updates an activity and confirms in Spanish", async () => {
    const id = await createdActivity();
    const state = await submitUpdateActivity(
      deps,
      staff,
      id,
      activityForm({ title: "Cierre contable", status: "in_progress" }),
    );
    assert.deepEqual(state, {
      status: "success",
      message: "Actividad guardada.",
    });
    const saved = await getActivity(deps, staff, id);
    assert.equal(saved?.title, "Cierre contable");
    assert.equal(saved?.status, "in_progress");
  });

  it("deletes an activity", async () => {
    const id = await createdActivity();
    const state = await submitDeleteActivity(deps, staff, id);
    assert.deepEqual(state, {
      status: "success",
      message: "Actividad eliminada.",
    });
    assert.equal(await getActivity(deps, staff, id), null);
    assert.equal(await count(), 0);
  });

  it("refuses a staff actor on another author's activity and changes nothing", async () => {
    const id = await createdActivity(admin);
    const updated = await submitUpdateActivity(
      deps,
      staff,
      id,
      activityForm({ title: "No debe guardarse" }),
    );
    assert.equal(updated.status, "error");
    assert.equal(updated.message, WORK_RULE_MESSAGES.not_found);

    const deleted = await submitDeleteActivity(deps, staff, id);
    assert.equal(deleted.status, "error");
    assert.equal(deleted.message, WORK_RULE_MESSAGES.not_found);

    const saved = await getActivity(deps, admin, id);
    assert.equal(saved?.title, "Revisión contable");
    assert.equal(await count(), 1);
  });

  it("keeps one colleague out of another colleague's activity", async () => {
    // The case that matters most: not staff against an administrator, but one
    // colleague against another, where neither outranks the other.
    const id = await createdActivity(otherStaff);
    const updated = await submitUpdateActivity(
      deps,
      staff,
      id,
      activityForm({ title: "No debe guardarse" }),
    );
    assert.equal(updated.status, "error");
    assert.equal(updated.message, WORK_RULE_MESSAGES.not_found);

    const saved = await getActivity(deps, otherStaff, id);
    assert.equal(saved?.title, "Revisión contable");
    assert.equal(await count(), 1);
  });

  it("refuses a missing session in Spanish and writes nothing", async () => {
    const result = await submitCreateActivity(deps, null, activityForm());
    assert.equal(result.state.status, "error");
    assert.equal(result.state.message, WORK_RULE_MESSAGES.unauthenticated);
    assert.equal(await count(), 0);
  });

  it("rejects an unknown client without writing", async () => {
    const result = await submitCreateActivity(
      deps,
      staff,
      activityForm({ clientId: "00000000-0000-4000-8000-000000000000" }),
    );
    assert.equal(result.state.status, "error");
    assert.equal(result.state.message, WORK_RULE_MESSAGES.client_not_found);
    assert.equal(await count(), 0);
  });
});
