import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  createReport,
  deleteReport,
  getReport,
  listReports,
  type ReportActor,
  ReportRuleError,
  ReportValidationError,
  replaceItems,
  selectableActivities,
  setActivities,
  updateReport,
  updateSection,
} from "../../src/reports/service.ts";
import { REPORT_TEMPLATES } from "../../src/reports/templates.ts";
import { createActivity } from "../../src/work/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// A report is personal like recorded work, and it may only ever describe
// activities its author could open. Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: ReportActor;
let staff: ReportActor;
let otherStaff: ReportActor;
let clientId: string;

const TABLES = "report, work_activity, client";

const base = {
  type: "follow_up",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  title: "Seguimiento de octubre",
};

function form(overrides: Record<string, unknown> = {}) {
  return { ...base, clientId, ...overrides };
}

async function makeActivity(actor: ReportActor, title: string) {
  const { id } = await createActivity(deps, actor, {
    clientId,
    performedOn: "2026-10-05",
    startedAt: null,
    endedAt: null,
    title,
    description: null,
    outcome: null,
    status: "completed",
    nextSteps: null,
  });
  return id;
}

async function auditActions() {
  const rows = await pool.query<{ action: string; details: unknown }>(
    "select action, details from audit_log order by id",
  );
  return rows.rows;
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
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
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

describe("creating a report", () => {
  it("seeds exactly the sections of its template, in order", async () => {
    const id = await createReport(deps, staff, form());
    const saved = await getReport(deps, staff, id);
    assert.ok(saved);
    assert.deepEqual(
      saved.sections.map((section) => section.key),
      REPORT_TEMPLATES.follow_up.map((section) => section.key),
    );
    assert.equal(saved.status, "draft");
    assert.equal(saved.authorUserId, staff.id);
    assert.equal(saved.clientName, "Cliente Informes");
    // Nothing is pre-written: the author has not said anything yet.
    assert.ok(saved.sections.every((section) => section.body === null));
  });

  it("seeds every template kind with its structured sections", async () => {
    for (const type of [
      "diagnostic",
      "general",
      "infrastructure",
      "manual",
    ] as const) {
      const id = await createReport(deps, admin, form({ type }));
      const saved = await getReport(deps, admin, id);
      assert.ok(saved, type);
      assert.deepEqual(
        saved.sections.map((section) => [section.key, section.kind]),
        REPORT_TEMPLATES[type].map((section) => [section.key, section.kind]),
      );
    }
  });

  it("refuses an unknown type, a missing client and a backwards period", async () => {
    for (const [overrides, field] of [
      [{ type: "informe_libre" }, "type"],
      [{ clientId: "not-a-uuid" }, "clientId"],
      [{ title: "   " }, "title"],
      [{ periodStart: "2026-10-31", periodEnd: "2026-10-01" }, "periodEnd"],
    ] as const) {
      await assert.rejects(
        () => createReport(deps, staff, form(overrides)),
        (error: unknown) => {
          assert.ok(error instanceof ReportValidationError);
          assert.ok(error.fieldErrors[field], `expected ${field}`);
          return true;
        },
      );
    }
    assert.equal(
      (await pool.query("select count(*) from report")).rows[0].count,
      "0",
    );
  });

  it("refuses a client that does not exist", async () => {
    await assert.rejects(
      () =>
        createReport(
          deps,
          staff,
          form({ clientId: "11111111-1111-4111-8111-111111111111" }),
        ),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "client_not_found",
    );
  });

  it("refuses an unauthenticated caller and writes nothing", async () => {
    await assert.rejects(
      () => createReport(deps, null, form()),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "unauthenticated",
    );
    assert.equal(
      (await pool.query("select count(*) from report")).rows[0].count,
      "0",
    );
  });
});

describe("reaching a report", () => {
  it("hides another author's report from staff and shows it to an admin", async () => {
    const id = await createReport(deps, otherStaff, form());
    assert.equal(await getReport(deps, staff, id), null);
    assert.ok(await getReport(deps, admin, id));
    assert.deepEqual(await listReports(deps, staff), []);
    assert.equal((await listReports(deps, admin)).length, 1);
    assert.equal((await listReports(deps, otherStaff)).length, 1);
  });

  it("carries who signs it, so the document can say so", async () => {
    const signer = await createTestUser(auth, "firma@example.test", {
      role: "staff",
      name: "Sebasti\u00e1n Amaya Rivera",
      jobTitle: "Director TIC",
    });
    const actor: ReportActor = {
      id: signer.id,
      role: "staff",
      ipAddress: null,
      userAgent: null,
    };
    const id = await createReport(deps, actor, form());
    const saved = await getReport(deps, actor, id);
    assert.equal(saved?.authorName, "Sebasti\u00e1n Amaya Rivera");
    assert.equal(saved?.authorJobTitle, "Director TIC");
  });

  it("still carries the author when there is no job title", async () => {
    const id = await createReport(deps, staff, form());
    const saved = await getReport(deps, staff, id);
    assert.equal(saved?.authorName, "Test User");
    assert.equal(saved?.authorJobTitle, null);
  });

  it("answers null for an id that does not exist", async () => {
    assert.equal(
      await getReport(deps, admin, "11111111-1111-4111-8111-111111111111"),
      null,
    );
  });

  it("refuses writes on another author's report as not found", async () => {
    const id = await createReport(deps, otherStaff, form());
    for (const run of [
      () => updateReport(deps, staff, id, form({ title: "Robado" })),
      () =>
        updateSection(deps, staff, id, "results", { heading: "R", body: "x" }),
      () => deleteReport(deps, staff, id),
    ]) {
      await assert.rejects(
        run,
        (error: unknown) =>
          error instanceof ReportRuleError && error.code === "not_found",
      );
    }
    const saved = await getReport(deps, otherStaff, id);
    assert.equal(saved?.title, base.title);
  });
});

describe("writing sections", () => {
  it("saves a heading and a body and records only the key", async () => {
    const id = await createReport(deps, staff, form());
    await updateSection(deps, staff, id, "results", {
      heading: "Resultados obtenidos",
      body: "Quedó operativo el respaldo nocturno.",
    });
    const saved = await getReport(deps, staff, id);
    const section = saved?.sections.find((s) => s.key === "results");
    assert.equal(section?.heading, "Resultados obtenidos");
    assert.equal(section?.body, "Quedó operativo el respaldo nocturno.");

    const entry = (await auditActions()).find(
      (row) => row.action === "report.section_update",
    );
    const details = entry?.details as Record<string, unknown>;
    assert.equal(details.sectionKey, "results");
    // The body is never in the trail: an audit row cannot be taken back.
    assert.ok(!JSON.stringify(details).includes("respaldo"));
  });

  it("refuses a section the template does not have", async () => {
    const id = await createReport(deps, staff, form());
    await assert.rejects(
      () =>
        updateSection(deps, staff, id, "hallazgos", {
          heading: "X",
          body: null,
        }),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "section_not_found",
    );
  });

  it("refuses a blank heading", async () => {
    const id = await createReport(deps, staff, form());
    await assert.rejects(
      () =>
        updateSection(deps, staff, id, "results", { heading: " ", body: "x" }),
      (error: unknown) =>
        error instanceof ReportValidationError && !!error.fieldErrors.heading,
    );
  });
});

describe("structured sections", () => {
  it("stores findings with impact and priority, in the order given", async () => {
    const id = await createReport(deps, staff, form({ type: "diagnostic" }));
    await replaceItems(deps, staff, id, "findings", [
      {
        label: "Disco con falla",
        body: "El arreglo reporta errores.",
        priority: "high",
        impact: "Pérdida de datos",
      },
      { label: "Enlace saturado", body: null, priority: "low", impact: null },
    ]);
    const saved = await getReport(deps, staff, id);
    const findings = saved?.sections.find((s) => s.key === "findings");
    assert.deepEqual(
      findings?.items.map((item) => [item.label, item.priority]),
      [
        ["Disco con falla", "high"],
        ["Enlace saturado", "low"],
      ],
    );
    assert.equal(findings?.items[0].impact, "Pérdida de datos");
  });

  it("refuses a classification the section does not carry", async () => {
    const id = await createReport(deps, staff, form({ type: "manual" }));
    // A step has no priority: storing one would invent a meaning.
    await assert.rejects(
      () =>
        replaceItems(deps, staff, id, "steps", [
          { label: "Abrir el navegador", priority: "high" },
        ]),
      (error: unknown) =>
        error instanceof ReportValidationError &&
        !!error.fieldErrors["items.0.priority"],
    );
  });

  it("refuses rows on a prose section", async () => {
    const id = await createReport(deps, staff, form());
    await assert.rejects(
      () => replaceItems(deps, staff, id, "results", [{ label: "x" }]),
      (error: unknown) =>
        error instanceof ReportValidationError && !!error.fieldErrors.items,
    );
  });

  it("drops a wholly blank row instead of rejecting the save", async () => {
    const id = await createReport(
      deps,
      staff,
      form({ type: "infrastructure" }),
    );
    await replaceItems(deps, staff, id, "status", [
      { label: "Respaldos", status: "risk" },
      { label: "", body: null, status: null },
    ]);
    const saved = await getReport(deps, staff, id);
    const status = saved?.sections.find((s) => s.key === "status");
    assert.equal(status?.items.length, 1);
    assert.equal(status?.items[0].status, "risk");
  });

  it("replaces the whole list rather than appending", async () => {
    const id = await createReport(
      deps,
      staff,
      form({ type: "infrastructure" }),
    );
    await replaceItems(deps, staff, id, "status", [
      { label: "Red", status: "ok" },
    ]);
    await replaceItems(deps, staff, id, "status", [
      { label: "Respaldos", status: "watch" },
    ]);
    const saved = await getReport(deps, staff, id);
    assert.deepEqual(
      saved?.sections
        .find((s) => s.key === "status")
        ?.items.map((item) => item.label),
      ["Respaldos"],
    );
  });
});

describe("attaching recorded activities", () => {
  it("links activities and reads them live from work", async () => {
    const id = await createReport(deps, staff, form());
    const first = await makeActivity(staff, "Revisión de respaldos");
    const second = await makeActivity(staff, "Cambio de disco");
    await setActivities(deps, staff, id, [second, first]);

    const saved = await getReport(deps, staff, id);
    assert.deepEqual(
      saved?.activities.map((activity) => activity.title),
      ["Cambio de disco", "Revisión de respaldos"],
    );
  });

  it("refuses an activity its author could not open", async () => {
    const id = await createReport(deps, staff, form());
    const foreign = await makeActivity(otherStaff, "Trabajo de un colega");
    await assert.rejects(
      () => setActivities(deps, staff, id, [foreign]),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "activity_not_found",
    );
    const saved = await getReport(deps, staff, id);
    assert.deepEqual(saved?.activities, []);
  });

  it("gives the same answer for an activity that does not exist", async () => {
    const id = await createReport(deps, staff, form());
    await assert.rejects(
      () =>
        setActivities(deps, staff, id, [
          "11111111-1111-4111-8111-111111111111",
        ]),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "activity_not_found",
    );
  });

  it("lets an administrator attach a colleague's activity", async () => {
    const id = await createReport(deps, admin, form());
    const foreign = await makeActivity(otherStaff, "Trabajo de un colega");
    await setActivities(deps, admin, id, [foreign]);
    const saved = await getReport(deps, admin, id);
    assert.equal(saved?.activities.length, 1);
  });

  it("offers only reachable activities for selection", async () => {
    await makeActivity(staff, "Propia");
    await makeActivity(otherStaff, "Ajena");
    assert.deepEqual(
      (await selectableActivities(deps, staff, clientId)).map((a) => a.title),
      ["Propia"],
    );
    assert.equal((await selectableActivities(deps, admin, clientId)).length, 2);
  });

  it("drops the link when the activity is deleted, without touching the report", async () => {
    const id = await createReport(deps, staff, form());
    const activityId = await makeActivity(staff, "Se va a borrar");
    await setActivities(deps, staff, id, [activityId]);
    await pool.query("delete from work_activity where id = $1", [activityId]);
    const saved = await getReport(deps, staff, id);
    assert.ok(saved);
    assert.deepEqual(saved.activities, []);
  });
});

describe("changing and deleting a report", () => {
  it("refuses to change the type of an existing report", async () => {
    const id = await createReport(deps, staff, form());
    await assert.rejects(
      () => updateReport(deps, staff, id, form({ type: "diagnostic" })),
      (error: unknown) =>
        error instanceof ReportValidationError && !!error.fieldErrors.type,
    );
  });

  it("keeps the author when an administrator corrects a draft", async () => {
    const id = await createReport(deps, staff, form());
    await updateReport(deps, admin, id, form({ title: "Corregido" }));
    const saved = await getReport(deps, admin, id);
    assert.equal(saved?.title, "Corregido");
    assert.equal(saved?.authorUserId, staff.id);
    assert.equal(saved?.updatedBy, admin.id);
  });

  it("writes no audit row when nothing changed", async () => {
    const id = await createReport(deps, staff, form());
    const before = (await auditActions()).length;
    await updateReport(deps, staff, id, form());
    assert.equal((await auditActions()).length, before);
  });

  it("deletes the report and its sections, leaving the activities alone", async () => {
    const id = await createReport(deps, staff, form());
    const activityId = await makeActivity(staff, "Sigue existiendo");
    await setActivities(deps, staff, id, [activityId]);
    await deleteReport(deps, staff, id);

    assert.equal(await getReport(deps, staff, id), null);
    assert.equal(
      (await pool.query("select count(*) from report_section")).rows[0].count,
      "0",
    );
    assert.equal(
      (await pool.query("select count(*) from work_activity")).rows[0].count,
      "1",
    );
  });
});
