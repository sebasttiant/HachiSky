import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  addImage,
  listImages,
  readImageBytes,
  type StoredImage,
} from "../../src/reports/images.ts";
import {
  createReport,
  deleteReport,
  getReport,
  issueReport,
  type ReportActor,
  ReportRuleError,
  setActivities,
  updateReport,
  updateSection,
} from "../../src/reports/service.ts";
import {
  createActivity,
  deleteActivity,
  updateActivity,
} from "../../src/work/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// Issuing freezes the report as it went out: afterwards nothing that happens
// to the draft sources — the activities, the author, the figures — may
// rewrite what the client received. Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: ReportActor;
let staff: ReportActor;
let otherStaff: ReportActor;
let staffUserId: string;
let clientId: string;

const TABLES = "report, work_activity, client";

const base = {
  type: "follow_up",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  title: "Seguimiento de octubre",
};

async function makeActivity(actor: ReportActor, title: string) {
  const { id } = await createActivity(deps, actor, {
    clientId,
    performedOn: "2026-10-05",
    startedAt: null,
    endedAt: null,
    title,
    description: null,
    outcome: "Resuelto",
    status: "completed",
    nextSteps: null,
  });
  return id;
}

function png(seed: string): StoredImage {
  const data = Buffer.from(`fake-png-${seed}`);
  return {
    png: data,
    sha256: createHash("sha256").update(data).digest("hex"),
    byteSize: data.byteLength,
    width: 800,
    height: 600,
  };
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", {
    role: "staff",
    name: "Autora Original",
  });
  const o = await createTestUser(auth, "other@example.test", { role: "staff" });
  staffUserId = s.id;
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

describe("issuing a report", () => {
  it("freezes activities, author and title as they were on the day", async () => {
    const activityId = await makeActivity(staff, "Revisión inicial");
    const id = await createReport(deps, staff, { ...base, clientId });
    await setActivities(deps, staff, id, [activityId]);
    const sectionKey = (await getReport(deps, staff, id))?.sections[0]
      ?.key as string;
    await updateSection(deps, staff, id, sectionKey, {
      heading: "Período",
      body: "Se revisó el alcance acordado.",
    });

    const issued = await issueReport(deps, staff, id);
    assert.equal(issued.version, 1);
    assert.ok(issued.issuedAt instanceof Date);

    // The sources move on afterwards; the issued report must not.
    await updateActivity(deps, staff, activityId, {
      clientId,
      performedOn: "2026-10-05",
      startedAt: null,
      endedAt: null,
      title: "Título corregido después",
      description: null,
      outcome: "Otro resultado",
      status: "completed",
      nextSteps: null,
    });
    await pool.query(
      'update "user" set name = $1, job_title = $2 where id = $3',
      ["Nombre Cambiado", "Cargo nuevo", staffUserId],
    );
    await pool.query("update client set name = $1 where id = $2", [
      "Cliente Renombrado",
      clientId,
    ]);

    const saved = await getReport(deps, staff, id);
    assert.ok(saved);
    assert.equal(saved.status, "issued");
    assert.equal(saved.activities[0]?.title, "Revisión inicial");
    assert.equal(saved.activities[0]?.outcome, "Resuelto");
    assert.equal(saved.authorName, "Autora Original");
    assert.equal(saved.clientName, "Cliente Informes");
    assert.equal(saved.sections[0]?.body, "Se revisó el alcance acordado.");
    assert.equal(saved.issuedVersion, 1);
    assert.ok(saved.issuedAt instanceof Date);

    // Deleting the activity afterwards does not rewrite it either.
    await deleteActivity(deps, staff, activityId);
    const afterDelete = await getReport(deps, staff, id);
    assert.equal(afterDelete?.activities.length, 1);
  });

  it("freezes figures: the issued bytes survive losing the draft figure", async () => {
    const id = await createReport(deps, staff, { ...base, clientId });
    const report = await getReport(deps, staff, id);
    const sectionKey = report?.sections[0]?.key as string;
    const draftImageId = await addImage(
      deps,
      staff,
      id,
      sectionKey,
      { title: "Evidencia", caption: null },
      png("issued"),
    );

    await issueReport(deps, staff, id);
    await pool.query("delete from report_image where id = $1", [draftImageId]);

    const images = await listImages(deps, staff, id);
    assert.equal(images.length, 1);
    assert.equal(images[0]?.title, "Evidencia");
    assert.notEqual(images[0]?.id, draftImageId);
    const bytes = await readImageBytes(deps, staff, images[0]?.id as string);
    assert.equal(bytes.data.toString(), "fake-png-issued");
    // A colleague still cannot read them.
    await assert.rejects(
      readImageBytes(deps, otherStaff, images[0]?.id as string),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "image_not_found",
    );
  });

  it("refuses a second issue and every later edit", async () => {
    const id = await createReport(deps, staff, { ...base, clientId });
    await issueReport(deps, staff, id);

    await assert.rejects(
      issueReport(deps, staff, id),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "already_issued",
    );
    await assert.rejects(
      updateReport(deps, staff, id, { ...base, clientId }),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "report_issued",
    );
    const sectionKey = (await getReport(deps, staff, id))?.sections[0]
      ?.key as string;
    await assert.rejects(
      updateSection(deps, staff, id, sectionKey, {
        heading: "Período",
        body: "tarde",
      }),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "report_issued",
    );
    await assert.rejects(
      deleteReport(deps, staff, id),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "report_issued",
    );
    await assert.rejects(
      addImage(
        deps,
        staff,
        id,
        sectionKey,
        { title: "Tarde", caption: null },
        png("late"),
      ),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "report_issued",
    );
  });

  it("keeps the same reach rules and writes a content-free audit row", async () => {
    const id = await createReport(deps, staff, { ...base, clientId });
    await assert.rejects(
      issueReport(deps, otherStaff, id),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "not_found",
    );
    await issueReport(deps, admin, id);

    const rows = await pool.query<{ details: Record<string, unknown> }>(
      "select details from audit_log where action = 'report.issue'",
    );
    assert.equal(rows.rows.length, 1);
    assert.deepEqual(Object.keys(rows.rows[0]?.details ?? {}).sort(), [
      "reportId",
      "version",
    ]);
  });
});
