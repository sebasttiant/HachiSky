import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { getReport, type ReportActor } from "../../src/reports/service.ts";
import {
  REPORT_RULE_MESSAGES,
  submitCreateReport,
  submitDeleteReport,
  submitReplaceItems,
  submitSetActivities,
  submitUpdateReport,
  submitUpdateSection,
} from "../../src/reports/submit.ts";
import { createActivity } from "../../src/work/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// The form layer against the real database: the Server Function only adds the
// session guard on top of this.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: ReportActor;
let staff: ReportActor;
let otherStaff: ReportActor;
let clientId: string;

const TABLES = "report, work_activity, client";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

function reportForm(overrides: Record<string, string> = {}) {
  return form({
    type: "follow_up",
    clientId,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    title: "Seguimiento de octubre",
    ...overrides,
  });
}

async function created(actor: ReportActor) {
  const { state, id } = await submitCreateReport(deps, actor, reportForm());
  assert.equal(state.status, "success");
  assert.ok(id);
  return id;
}

async function count(table: string) {
  const rows = await pool.query(`select count(*)::int as n from ${table}`);
  return rows.rows[0].n as number;
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  const o = await createTestUser(auth, "other@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: null };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente Informes",
      identificationType: "NIT",
      identificationNumber: "900111222",
      createdBy: admin.id,
      updatedBy: admin.id,
    })
    .returning({ id: schema.client.id });
  if (!row) throw new Error("client insert returned no row");
  clientId = row.id;
});

after(async () => {
  await closeDb();
  await pool.end();
});

describe("creating a report from a form", () => {
  it("creates it with its sections and returns the id", async () => {
    const id = await created(staff);
    const saved = await getReport(deps, staff, id);
    assert.equal(saved?.title, "Seguimiento de octubre");
    assert.equal(saved?.sections.length, 4);
  });

  it("answers Spanish field errors and writes nothing", async () => {
    const { state, id } = await submitCreateReport(
      deps,
      staff,
      reportForm({ title: "  ", type: "inventado" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, "Revisa los campos marcados.");
    assert.ok(state.fieldErrors?.title);
    assert.ok(state.fieldErrors?.type);
    assert.equal(id, undefined);
    assert.equal(await count("report"), 0);
  });

  it("refuses a missing session in Spanish and writes nothing", async () => {
    const { state } = await submitCreateReport(deps, null, reportForm());
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.unauthenticated);
    assert.equal(await count("report"), 0);
  });
});

describe("writing content from a form", () => {
  it("saves a prose section and confirms in Spanish", async () => {
    const id = await created(staff);
    const state = await submitUpdateSection(
      deps,
      staff,
      id,
      form({ key: "results", heading: "Resultados", body: "Todo operativo." }),
    );
    assert.equal(state.status, "success");
    assert.equal(state.message, "Sección guardada.");
    const saved = await getReport(deps, staff, id);
    assert.equal(
      saved?.sections.find((s) => s.key === "results")?.body,
      "Todo operativo.",
    );
  });

  it("reads indexed rows in order and keeps their positions", async () => {
    const { id } = await submitCreateReport(
      deps,
      staff,
      reportForm({ type: "infrastructure" }),
    );
    assert.ok(id);
    const data = form({ key: "status" });
    data.append("items.0.label", "Respaldos");
    data.append("items.0.status", "risk");
    data.append("items.1.label", "Red");
    data.append("items.1.status", "ok");
    const state = await submitReplaceItems(deps, staff, id, data);
    assert.equal(state.status, "success");

    const saved = await getReport(deps, staff, id);
    assert.deepEqual(
      saved?.sections
        .find((s) => s.key === "status")
        ?.items.map((item) => [item.label, item.status]),
      [
        ["Respaldos", "risk"],
        ["Red", "ok"],
      ],
    );
  });

  it("reports a row error against its own field name", async () => {
    const { id } = await submitCreateReport(
      deps,
      staff,
      reportForm({ type: "manual" }),
    );
    assert.ok(id);
    const data = form({ key: "steps" });
    data.append("items.0.label", "Abrir el navegador");
    data.append("items.0.priority", "high");
    const state = await submitReplaceItems(deps, staff, id, data);
    assert.equal(state.status, "error");
    assert.ok(state.fieldErrors?.["items.0.priority"]);
  });

  it("refuses a section that is not in the template", async () => {
    const id = await created(staff);
    const state = await submitUpdateSection(
      deps,
      staff,
      id,
      form({ key: "hallazgos", heading: "X", body: "" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.section_not_found);
  });
});

describe("attaching activities from a form", () => {
  it("stores the checked activities", async () => {
    const id = await created(staff);
    const { id: activityId } = await createActivity(deps, staff, {
      clientId,
      performedOn: "2026-10-05",
      startedAt: null,
      endedAt: null,
      title: "Revisión de respaldos",
      description: null,
      outcome: null,
      status: "completed",
      nextSteps: null,
    });
    const data = new FormData();
    data.append("activityIds", activityId);
    const state = await submitSetActivities(deps, staff, id, data);
    assert.equal(state.status, "success");
    const saved = await getReport(deps, staff, id);
    assert.equal(saved?.activities.length, 1);
  });

  it("refuses a colleague's activity without saying it exists", async () => {
    const id = await created(staff);
    const { id: foreign } = await createActivity(deps, otherStaff, {
      clientId,
      performedOn: "2026-10-05",
      startedAt: null,
      endedAt: null,
      title: "Trabajo de un colega",
      description: null,
      outcome: null,
      status: "completed",
      nextSteps: null,
    });
    const data = new FormData();
    data.append("activityIds", foreign);
    const state = await submitSetActivities(deps, staff, id, data);
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.activity_not_found);
    const saved = await getReport(deps, staff, id);
    assert.deepEqual(saved?.activities, []);
  });
});

describe("another author's report", () => {
  it("refuses every write as not found and changes nothing", async () => {
    const id = await created(otherStaff);
    for (const run of [
      () =>
        submitUpdateReport(deps, staff, id, reportForm({ title: "Robado" })),
      () =>
        submitUpdateSection(
          deps,
          staff,
          id,
          form({ key: "results", heading: "R", body: "x" }),
        ),
      () => submitDeleteReport(deps, staff, id),
    ]) {
      const state = await run();
      assert.equal(state.status, "error");
      assert.equal(state.message, REPORT_RULE_MESSAGES.not_found);
    }
    const saved = await getReport(deps, otherStaff, id);
    assert.equal(saved?.title, "Seguimiento de octubre");
    assert.equal(await count("report"), 1);
  });

  it("lets an administrator correct it and keeps the author", async () => {
    const id = await created(otherStaff);
    const state = await submitUpdateReport(
      deps,
      admin,
      id,
      reportForm({ title: "Corregido" }),
    );
    assert.equal(state.status, "success");
    const saved = await getReport(deps, admin, id);
    assert.equal(saved?.title, "Corregido");
    assert.equal(saved?.authorUserId, otherStaff.id);
  });
});

describe("deleting a report", () => {
  it("deletes it and confirms in Spanish", async () => {
    const id = await created(staff);
    const state = await submitDeleteReport(deps, staff, id);
    assert.equal(state.status, "success");
    assert.equal(state.message, "Informe eliminado.");
    assert.equal(await count("report"), 0);
    assert.equal(await count("report_section"), 0);
  });
});
