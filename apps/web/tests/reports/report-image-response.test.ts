import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { processImage } from "../../src/images/pipeline.ts";
import { reportImageResponse } from "../../src/reports/image-response.ts";
import { addImage, readImageBytes } from "../../src/reports/images.ts";
import { createReport, type ReportActor } from "../../src/reports/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";
import { solidPng } from "../images/fixtures.ts";

// The response of app/api/reports/images/[id]: one stored figure, served
// only to somebody who may reach the report holding it. Framework-free so it
// runs against a real database; the route adds the session guard.
//
// Nothing from the request reaches a header, the bytes are never cached by a
// shared cache, and a figure that cannot be reached is indistinguishable
// from one that does not exist. Synthetic data only.

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
let imageId: string;
let storedBytes: Buffer;

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
  const a = await createTestUser(auth, "srv-admin@example.test", {
    role: "admin",
  });
  const s = await createTestUser(auth, "srv-staff@example.test", {
    role: "staff",
  });
  const o = await createTestUser(auth, "srv-other@example.test", {
    role: "staff",
  });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: "node-test" };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente Servido",
      identificationType: "NIT",
      identificationNumber: "900777888",
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
    title: "Manual servido",
  });
  const processed = await processImage(
    await solidPng(120, 80),
    "report_figure",
  );
  if (!processed.ok) throw new Error(`fixture rejected: ${processed.reason}`);
  storedBytes = processed.image.png;
  imageId = await addImage(
    deps,
    staff,
    reportId,
    SECTION,
    { title: "Pantalla servida", caption: null },
    processed.image,
  );
});

describe("serving a stored figure", () => {
  it("answers the exact stored bytes with private headers", async () => {
    const response = await reportImageResponse(deps, staff, imageId);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(
      response.headers.get("Content-Length"),
      String(storedBytes.length),
    );
    assert.equal(
      response.headers.get("Content-Disposition"),
      'inline; filename="imagen.png"',
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");

    const served = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(served, storedBytes);
  });

  it("serves a colleague's figure to an administrator", async () => {
    const response = await reportImageResponse(deps, admin, imageId);
    assert.equal(response.status, 200);
  });

  it("carries no filename from the upload, only the fixed one", async () => {
    const response = await reportImageResponse(deps, staff, imageId);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    assert.ok(!disposition.includes("Pantalla"));
    assert.ok(disposition.endsWith('filename="imagen.png"'));
  });
});

describe("refusing a figure", () => {
  it("answers 404 with no body for a report the actor cannot reach", async () => {
    const response = await reportImageResponse(deps, otherStaff, imageId);
    assert.equal(response.status, 404);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("answers the same 404 for an id that does not exist", async () => {
    const response = await reportImageResponse(
      deps,
      staff,
      "00000000-0000-4000-8000-000000000000",
    );
    assert.equal(response.status, 404);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  });

  it("answers 404 rather than 500 for an id that is not a uuid", async () => {
    const response = await reportImageResponse(deps, staff, "not-a-uuid");
    assert.equal(response.status, 404);
  });

  it("answers 401 without a session", async () => {
    const response = await reportImageResponse(deps, null, imageId);
    assert.equal(response.status, 401);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  });

  it("never sets a shared-cache header on a refusal", async () => {
    for (const actor of [null, otherStaff]) {
      const response = await reportImageResponse(deps, actor, imageId);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    }
  });

  it("keeps the service answer indistinguishable for both refusals", async () => {
    // The response layer must not widen what the service deliberately
    // narrowed in S2: unreachable and absent are the same answer.
    await assert.rejects(() => readImageBytes(deps, otherStaff, imageId));
    await assert.rejects(() =>
      readImageBytes(deps, staff, "00000000-0000-4000-8000-000000000000"),
    );
  });
});
