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
  MAX_IMAGES_PER_SECTION,
  moveImage,
  readImageBytes,
  removeImage,
  type StoredImage,
  updateImageText,
} from "../../src/reports/images.ts";
import {
  createReport,
  deleteReport,
  type ReportActor,
  ReportRuleError,
  ReportValidationError,
} from "../../src/reports/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// Images belong to a section, not to the report, so they print where they
// were meant to: a step carries its own screenshot. Access follows the
// report exactly — an image is only as reachable as the report holding it.
//
// The bytes handed in here are already validated and re-encoded by
// src/images/pipeline.ts; this service stores what it is given. Synthetic
// data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: ReportActor;
let staff: ReportActor;
let otherStaff: ReportActor;
let clientId: string;

const TABLES = "report, work_activity, client";

// A section every seeded manual has, used as the attachment point.
const SECTION = "steps";

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

function text(overrides: Record<string, unknown> = {}) {
  return {
    title: "Pantalla de ingreso",
    caption: "Menú principal",
    ...overrides,
  };
}

async function makeReport(actor: ReportActor) {
  return createReport(deps, actor, {
    type: "manual",
    clientId,
    periodStart: null,
    periodEnd: null,
    title: "Manual de entrega",
  });
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

after(async () => {
  await closeDb();
  await pool.end();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${TABLES} cascade`);
  const a = await createTestUser(auth, "image-admin@example.test", {
    role: "admin",
  });
  const s = await createTestUser(auth, "image-staff@example.test", {
    role: "staff",
  });
  const o = await createTestUser(auth, "image-other@example.test", {
    role: "staff",
  });
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.8",
    userAgent: "node-test",
  };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente de prueba",
      identificationType: "NIT",
      identificationNumber: "900333444",
      createdBy: admin.id,
      updatedBy: admin.id,
    })
    .returning({ id: schema.client.id });
  if (!row) throw new Error("client insert returned no row");
  clientId = row.id;
});

describe("report images: storing", () => {
  it("adds an image to a section and lists it in order", async () => {
    const reportId = await makeReport(staff);
    await addImage(deps, staff, reportId, SECTION, text(), png("a"));
    await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "Segunda", caption: null }),
      png("b"),
    );

    const images = await listImages(deps, staff, reportId);
    assert.equal(images.length, 2);
    assert.deepEqual(
      images.map((image) => [image.position, image.title, image.caption]),
      [
        [0, "Pantalla de ingreso", "Menú principal"],
        [1, "Segunda", null],
      ],
    );
    assert.equal(images[0].sectionKey, SECTION);
    assert.equal(images[0].width, 800);
    assert.equal(images[0].height, 600);
  });

  it("refuses a section the template never seeded", async () => {
    const reportId = await makeReport(staff);
    await assert.rejects(
      () => addImage(deps, staff, reportId, "no-existe", text(), png("a")),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "section_not_found",
    );
  });

  it("stops at the limit of images a section may hold", async () => {
    const reportId = await makeReport(staff);
    for (let index = 0; index < MAX_IMAGES_PER_SECTION; index += 1) {
      await addImage(
        deps,
        staff,
        reportId,
        SECTION,
        text({ title: `Imagen ${index}` }),
        png(`fill-${index}`),
      );
    }
    await assert.rejects(
      () => addImage(deps, staff, reportId, SECTION, text(), png("over")),
      (error: unknown) =>
        error instanceof ReportRuleError &&
        error.code === "image_limit_reached",
    );
    assert.equal(
      (await listImages(deps, staff, reportId)).length,
      MAX_IMAGES_PER_SECTION,
    );
  });
});

describe("report images: who may reach them", () => {
  it("answers not found when the report belongs to somebody else", async () => {
    const reportId = await makeReport(staff);
    await assert.rejects(
      () => addImage(deps, otherStaff, reportId, SECTION, text(), png("a")),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "not_found",
    );
  });

  it("lets an administrator add an image to somebody else's report", async () => {
    const reportId = await makeReport(staff);
    await addImage(deps, admin, reportId, SECTION, text(), png("a"));
    assert.equal((await listImages(deps, admin, reportId)).length, 1);
  });

  it("refuses to serve the bytes of an image inside an unreachable report", async () => {
    const reportId = await makeReport(staff);
    const id = await addImage(deps, staff, reportId, SECTION, text(), png("a"));
    await assert.rejects(
      () => readImageBytes(deps, otherStaff, id),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "image_not_found",
    );
  });

  it("answers the same way for an image id that does not exist", async () => {
    await assert.rejects(
      () => readImageBytes(deps, staff, "00000000-0000-4000-8000-000000000000"),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "image_not_found",
    );
  });

  it("serves the exact stored bytes to somebody who may reach the report", async () => {
    const reportId = await makeReport(staff);
    const source = png("exact");
    const id = await addImage(deps, staff, reportId, SECTION, text(), source);
    const stored = await readImageBytes(deps, staff, id);
    assert.deepEqual(stored.data, source.png);
    assert.equal(stored.sha256, source.sha256);
  });
});

describe("report images: correcting them", () => {
  it("rewrites the title and the caption", async () => {
    const reportId = await makeReport(staff);
    const id = await addImage(deps, staff, reportId, SECTION, text(), png("a"));
    await updateImageText(deps, staff, reportId, id, {
      title: "Título corregido",
      caption: null,
    });

    const [image] = await listImages(deps, staff, reportId);
    assert.equal(image.title, "Título corregido");
    assert.equal(image.caption, null);
  });

  it("refuses a blank title and a caption past its limit", async () => {
    const reportId = await makeReport(staff);
    await assert.rejects(
      () =>
        addImage(
          deps,
          staff,
          reportId,
          SECTION,
          text({ title: "  " }),
          png("a"),
        ),
      (error: unknown) =>
        error instanceof ReportValidationError && "title" in error.fieldErrors,
    );
    await assert.rejects(
      () =>
        addImage(
          deps,
          staff,
          reportId,
          SECTION,
          text({ caption: "x".repeat(501) }),
          png("a"),
        ),
      (error: unknown) =>
        error instanceof ReportValidationError &&
        "caption" in error.fieldErrors,
    );
    assert.equal((await listImages(deps, staff, reportId)).length, 0);
  });

  it("removes an image and closes the gap it left in the order", async () => {
    const reportId = await makeReport(staff);
    const first = await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "A" }),
      png("a"),
    );
    await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "B" }),
      png("b"),
    );
    await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "C" }),
      png("c"),
    );

    await removeImage(deps, staff, reportId, first);

    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => [
        i.position,
        i.title,
      ]),
      [
        [0, "B"],
        [1, "C"],
      ],
    );
  });

  it("moves an image within its section", async () => {
    const reportId = await makeReport(staff);
    await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "A" }),
      png("a"),
    );
    const second = await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "B" }),
      png("b"),
    );

    await moveImage(deps, staff, reportId, second, "up");

    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => i.title),
      ["B", "A"],
    );
  });

  it("leaves the order untouched when a move would fall off the end", async () => {
    const reportId = await makeReport(staff);
    const first = await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "A" }),
      png("a"),
    );
    await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({ title: "B" }),
      png("b"),
    );

    await moveImage(deps, staff, reportId, first, "up");

    assert.deepEqual(
      (await listImages(deps, staff, reportId)).map((i) => i.title),
      ["A", "B"],
    );
  });

  it("answers image not found for an image of another report", async () => {
    const mine = await makeReport(staff);
    const theirs = await makeReport(staff);
    const id = await addImage(deps, staff, theirs, SECTION, text(), png("a"));
    await assert.rejects(
      () => removeImage(deps, staff, mine, id),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "image_not_found",
    );
  });
});

describe("report images: what survives", () => {
  it("disappears with the report that held it", async () => {
    const reportId = await makeReport(staff);
    await addImage(deps, staff, reportId, SECTION, text(), png("a"));
    await deleteReport(deps, staff, reportId);

    const { rows } = await pool.query("select id from report_image");
    assert.equal(rows.length, 0);
  });

  it("records ids and the section key, never the title or the caption", async () => {
    const reportId = await makeReport(staff);
    const id = await addImage(
      deps,
      staff,
      reportId,
      SECTION,
      text({
        title: "Secreto del cliente",
        caption: "No debe quedar en auditoría",
      }),
      png("a"),
    );
    await updateImageText(deps, staff, reportId, id, {
      title: "Otro secreto",
      caption: null,
    });
    await removeImage(deps, staff, reportId, id);

    const rows = await auditActions();
    const imageRows = rows.filter((row) =>
      row.action.startsWith("report.image_"),
    );
    assert.deepEqual(
      imageRows.map((row) => row.action),
      ["report.image_add", "report.image_update", "report.image_remove"],
    );
    const serialised = JSON.stringify(imageRows);
    assert.ok(!serialised.includes("Secreto del cliente"));
    assert.ok(!serialised.includes("No debe quedar en auditoría"));
    assert.ok(!serialised.includes("Otro secreto"));
    for (const row of imageRows) {
      const details = row.details as Record<string, unknown>;
      assert.equal(details.reportId, reportId);
      assert.equal(details.sectionKey, SECTION);
      assert.equal(typeof details.imageId, "string");
    }
  });

  it("refuses an unauthenticated actor before touching the database", async () => {
    const reportId = await makeReport(staff);
    await assert.rejects(
      () => addImage(deps, null, reportId, SECTION, text(), png("a")),
      (error: unknown) =>
        error instanceof ReportRuleError && error.code === "unauthenticated",
    );
  });
});
