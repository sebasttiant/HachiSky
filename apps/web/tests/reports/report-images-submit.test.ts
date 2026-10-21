import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { processImage } from "../../src/images/pipeline.ts";
import { addImage, listImages } from "../../src/reports/images.ts";
import { createReport, type ReportActor } from "../../src/reports/service.ts";
import {
  REPORT_RULE_MESSAGES,
  submitMoveImage,
  submitRemoveImage,
  submitUpdateImageText,
} from "../../src/reports/submit.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";
import { solidPng } from "../images/fixtures.ts";

// The form layer for the figures of a section, against the real database.
// The Server Function only adds the session guard on top of this; the
// service already owns ownership, validation and audit.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

const SECTION = "steps";
const TABLES = "report, work_activity, client";

let admin: ReportActor;
let staff: ReportActor;
let otherStaff: ReportActor;
let clientId: string;
let reportId: string;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function addFigure(title: string) {
  const processed = await processImage(await solidPng(60, 40), "report_figure");
  if (!processed.ok) throw new Error(`fixture rejected: ${processed.reason}`);
  return addImage(
    deps,
    staff,
    reportId,
    SECTION,
    { title, caption: null },
    processed.image,
  );
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

after(async () => {
  await closeDb();
  await pool.end();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${TABLES} cascade`);
  const a = await createTestUser(auth, "sub-admin@example.test", {
    role: "admin",
  });
  const s = await createTestUser(auth, "sub-staff@example.test", {
    role: "staff",
  });
  const o = await createTestUser(auth, "sub-other@example.test", {
    role: "staff",
  });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: "node-test" };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente Formularios",
      identificationType: "NIT",
      identificationNumber: "900999000",
      createdBy: admin.id,
      updatedBy: admin.id,
    })
    .returning({ id: schema.client.id });
  if (!row) throw new Error("client insert returned no row");
  clientId = row.id;
  reportId = await createReport(deps, staff, {
    type: "manual",
    clientId,
    periodStart: null,
    periodEnd: null,
    title: "Manual de formularios",
  });
});

describe("correcting the text of a figure", () => {
  it("saves a new title and description", async () => {
    const imageId = await addFigure("Original");
    const state = await submitUpdateImageText(
      deps,
      staff,
      reportId,
      form({ imageId, title: "Corregido", caption: "Con detalle" }),
    );
    assert.equal(state.status, "success");

    const [image] = await listImages(deps, staff, reportId);
    assert.equal(image.title, "Corregido");
    assert.equal(image.caption, "Con detalle");
  });

  it("clears the description when the field is sent empty", async () => {
    const imageId = await addFigure("Original");
    await submitUpdateImageText(
      deps,
      staff,
      reportId,
      form({ imageId, title: "Original", caption: "" }),
    );
    const [image] = await listImages(deps, staff, reportId);
    assert.equal(image.caption, null);
  });

  it("returns the field error of a blank title", async () => {
    const imageId = await addFigure("Original");
    const state = await submitUpdateImageText(
      deps,
      staff,
      reportId,
      form({ imageId, title: "  ", caption: "" }),
    );
    assert.equal(state.status, "error");
    assert.ok(state.fieldErrors?.title);

    const [image] = await listImages(deps, staff, reportId);
    assert.equal(image.title, "Original");
  });

  it("answers the image-not-found message with no imageId at all", async () => {
    const state = await submitUpdateImageText(
      deps,
      staff,
      reportId,
      form({ title: "Sin id", caption: "" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.image_not_found);
  });

  it("answers the same way for a figure of somebody else's report", async () => {
    const imageId = await addFigure("Original");
    const state = await submitUpdateImageText(
      deps,
      otherStaff,
      reportId,
      form({ imageId, title: "Ajeno", caption: "" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.not_found);
  });
});

describe("removing a figure", () => {
  it("removes it and keeps the rest in order", async () => {
    const first = await addFigure("A");
    await addFigure("B");
    const state = await submitRemoveImage(
      deps,
      staff,
      reportId,
      form({ imageId: first }),
    );
    assert.equal(state.status, "success");
    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => [
        i.position,
        i.title,
      ]),
      [[0, "B"]],
    );
  });

  it("answers not found for a figure that is not there", async () => {
    const state = await submitRemoveImage(
      deps,
      staff,
      reportId,
      form({ imageId: "00000000-0000-4000-8000-000000000000" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.image_not_found);
  });

  it("answers not found for a malformed id instead of failing", async () => {
    const state = await submitRemoveImage(
      deps,
      staff,
      reportId,
      form({ imageId: "no-es-uuid" }),
    );
    assert.equal(state.status, "error");
    assert.equal(state.message, REPORT_RULE_MESSAGES.image_not_found);
  });
});

describe("reordering figures", () => {
  it("moves a figure up", async () => {
    await addFigure("A");
    const second = await addFigure("B");
    const state = await submitMoveImage(
      deps,
      staff,
      reportId,
      form({ imageId: second, direction: "up" }),
    );
    assert.equal(state.status, "success");
    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => i.title),
      ["B", "A"],
    );
  });

  it("moves a figure down", async () => {
    const first = await addFigure("A");
    await addFigure("B");
    await submitMoveImage(
      deps,
      staff,
      reportId,
      form({ imageId: first, direction: "down" }),
    );
    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => i.title),
      ["B", "A"],
    );
  });

  it("refuses a direction it does not know and changes nothing", async () => {
    const first = await addFigure("A");
    await addFigure("B");
    const state = await submitMoveImage(
      deps,
      staff,
      reportId,
      form({ imageId: first, direction: "sideways" }),
    );
    assert.equal(state.status, "error");
    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => i.title),
      ["A", "B"],
    );
  });

  it("lets an administrator reorder a colleague's figures", async () => {
    await addFigure("A");
    const second = await addFigure("B");
    const state = await submitMoveImage(
      deps,
      admin,
      reportId,
      form({ imageId: second, direction: "up" }),
    );
    assert.equal(state.status, "success");
  });
});
