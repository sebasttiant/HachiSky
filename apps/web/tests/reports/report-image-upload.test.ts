import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  handleReportImageUpload,
  MAX_UPLOAD_BYTES,
  type ReportUploadAccess,
} from "../../src/reports/image-upload.ts";
import { listImages } from "../../src/reports/images.ts";
import { createReport, type ReportActor } from "../../src/reports/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";
import { animatedPng, SVG, solidJpeg, solidPng } from "../images/fixtures.ts";

// The dedicated upload route for the figures of a report section: a
// multipart body carrying the image plus its title and description.
//
// Multipart is parsed only from an already-bounded buffer, never from the
// live stream, because `request.formData()` has no size limit of its own.
// The order is the same discipline the billing upload follows: origin, then
// session, then role, then media type, then the declared length, then a
// streamed read that is abandoned past the limit, and only then the shared
// pipeline and the report service.
//
// Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

const APP_ORIGIN = "http://127.0.0.1:3100";
const SECTION = "steps";
const TABLES = "report, work_activity, client";

let admin: ReportActor;
let staff: ReportActor;
let otherStaff: ReportActor;
let clientId: string;
let reportId: string;

function allowed(actor: ReportActor): ReportUploadAccess {
  return { status: "authenticated", actor };
}

/** A browser-shaped multipart request: FormData sets its own boundary. */
async function upload(
  parts: {
    image?: Buffer | null;
    filename?: string;
    type?: string;
    title?: string | null;
    caption?: string | null;
    extra?: Buffer;
  } = {},
  init: { origin?: string | null; site?: string; headers?: HeadersInit } = {},
) {
  const form = new FormData();
  if (parts.image !== null) {
    const bytes = parts.image ?? (await solidPng());
    form.set(
      "image",
      new Blob([new Uint8Array(bytes)], {
        type: parts.type ?? "image/png",
      }),
      parts.filename ?? "captura.png",
    );
  }
  if (parts.extra) {
    form.set(
      "image2",
      new Blob([new Uint8Array(parts.extra)], { type: "image/png" }),
      "otra.png",
    );
  }
  if (parts.title !== null) form.set("title", parts.title ?? "Pantalla uno");
  if (parts.caption !== undefined && parts.caption !== null) {
    form.set("caption", parts.caption);
  }
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? APP_ORIGIN : init.origin;
  if (origin !== null) headers.set("origin", origin);
  if (init.site) headers.set("sec-fetch-site", init.site);
  return new Request(`${APP_ORIGIN}/api/reports/x/sections/${SECTION}/images`, {
    method: "POST",
    body: form,
    headers,
  });
}

async function run(
  request: Request,
  access: ReportUploadAccess,
  overrides: { reportId?: string; sectionKey?: string } = {},
) {
  return handleReportImageUpload(deps, {
    request,
    access,
    appOrigin: APP_ORIGIN,
    reportId: overrides.reportId ?? reportId,
    sectionKey: overrides.sectionKey ?? SECTION,
  });
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
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
  const a = await createTestUser(auth, "up-admin@example.test", {
    role: "admin",
  });
  const s = await createTestUser(auth, "up-staff@example.test", {
    role: "staff",
  });
  const o = await createTestUser(auth, "up-other@example.test", {
    role: "staff",
  });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: "node-test" };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name: "Cliente Subidas",
      identificationType: "NIT",
      identificationNumber: "900555666",
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
    title: "Manual con capturas",
  });
});

describe("report image upload: refused before the body is read", () => {
  it("refuses a request from another origin", async () => {
    const response = await run(
      await upload({}, { origin: "http://evil.test" }),
      {
        status: "authenticated",
        actor: staff,
      },
    );
    assert.equal(response.status, 403);
    assert.equal((await body(response)).error, "cross_origin");
  });

  it("refuses a missing Origin header", async () => {
    const response = await run(
      await upload({}, { origin: null }),
      allowed(staff),
    );
    assert.equal(response.status, 403);
    assert.equal((await body(response)).error, "cross_origin");
  });

  it("refuses a cross-site Sec-Fetch-Site even with a matching Origin", async () => {
    const response = await run(
      await upload({}, { site: "cross-site" }),
      allowed(staff),
    );
    assert.equal(response.status, 403);
    assert.equal((await body(response)).error, "cross_origin");
  });

  it("answers 401 without a session and 403 for a refused module", async () => {
    const anonymous = await run(await upload(), { status: "unauthenticated" });
    assert.equal(anonymous.status, 401);
    assert.equal((await body(anonymous)).error, "unauthenticated");

    const refused = await run(await upload(), { status: "forbidden" });
    assert.equal(refused.status, 403);
    assert.equal((await body(refused)).error, "forbidden");
  });

  it("refuses a body that is not multipart", async () => {
    const request = new Request(
      `${APP_ORIGIN}/api/reports/x/sections/${SECTION}/images`,
      {
        method: "POST",
        body: new Uint8Array(await solidPng()),
        headers: { origin: APP_ORIGIN, "content-type": "image/png" },
      },
    );
    const response = await run(request, allowed(staff));
    assert.equal(response.status, 415);
    assert.equal((await body(response)).error, "unsupported_type");
  });

  it("refuses a declared length that is not a plain integer", async () => {
    const response = await run(
      await upload({}, { headers: { "content-length": "1e6" } }),
      allowed(staff),
    );
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "bad_request");
  });

  it("refuses a declared length over the bound", async () => {
    const response = await run(
      await upload(
        {},
        { headers: { "content-length": String(MAX_UPLOAD_BYTES + 1) } },
      ),
      allowed(staff),
    );
    assert.equal(response.status, 413);
    assert.equal((await body(response)).error, "too_large");
  });

  it("abandons an undeclared body once it passes the bound", async () => {
    // No Content-Length: the stream itself has to stop. A chunked client must
    // not be able to make the server hold an unbounded body in memory.
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(256 * 1024));
      },
    });
    const request = new Request(
      `${APP_ORIGIN}/api/reports/x/sections/${SECTION}/images`,
      {
        method: "POST",
        body: oversized,
        duplex: "half",
        headers: {
          origin: APP_ORIGIN,
          "content-type": "multipart/form-data; boundary=xyz",
        },
      } as RequestInit,
    );
    const response = await run(request, allowed(staff));
    assert.equal(response.status, 413);
    assert.equal((await body(response)).error, "too_large");
  });

  it("writes nothing for any refusal before the pipeline", async () => {
    await run(await upload({}, { origin: "http://evil.test" }), allowed(staff));
    await run(await upload(), { status: "unauthenticated" });
    assert.equal((await listImages(deps, staff, reportId)).length, 0);
  });
});

describe("report image upload: the parts themselves", () => {
  it("refuses a malformed multipart body", async () => {
    const request = new Request(
      `${APP_ORIGIN}/api/reports/x/sections/${SECTION}/images`,
      {
        method: "POST",
        body: "not really multipart",
        headers: {
          origin: APP_ORIGIN,
          "content-type": "multipart/form-data; boundary=xyz",
        },
      },
    );
    const response = await run(request, allowed(staff));
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "bad_request");
  });

  it("refuses a request with no image part", async () => {
    const response = await run(await upload({ image: null }), allowed(staff));
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "bad_request");
  });

  it("refuses more than one file part", async () => {
    const response = await run(
      await upload({ extra: await solidPng(40, 40) }),
      allowed(staff),
    );
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "bad_request");
  });

  it("refuses an empty image part", async () => {
    const response = await run(
      await upload({ image: Buffer.alloc(0) }),
      allowed(staff),
    );
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "empty");
  });
});

describe("report image upload: the shared pipeline decides the bytes", () => {
  it("stores a PNG and answers with its id", async () => {
    const response = await run(await upload(), allowed(staff));
    assert.equal(response.status, 201);
    const payload = await body(response);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.imageId, "string");

    const [image] = await listImages(deps, staff, reportId);
    assert.equal(image.sectionKey, SECTION);
    assert.equal(image.title, "Pantalla uno");
  });

  it("re-encodes a JPEG instead of storing the upload", async () => {
    const response = await run(
      await upload({
        image: await solidJpeg(),
        type: "image/jpeg",
        filename: "foto.jpg",
      }),
      allowed(staff),
    );
    assert.equal(response.status, 201);
    const [image] = await listImages(deps, staff, reportId);
    assert.ok(image.byteSize > 0);
  });

  it("refuses an SVG dressed as a PNG by its filename and type", async () => {
    const response = await run(
      await upload({ image: SVG, filename: "captura.png", type: "image/png" }),
      allowed(staff),
    );
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "unsupported_type");
    assert.equal((await listImages(deps, staff, reportId)).length, 0);
  });

  it("refuses an animated PNG", async () => {
    const response = await run(
      await upload({ image: await animatedPng() }),
      allowed(staff),
    );
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "animated");
  });

  it("refuses an image past the allowed dimensions", async () => {
    const response = await run(
      await upload({ image: await solidPng(2400, 100) }),
      allowed(staff),
    );
    assert.equal(response.status, 400);
    assert.equal((await body(response)).error, "dimensions");
  });
});

describe("report image upload: the report rules still hold", () => {
  it("refuses a report the uploader may not reach, as not found", async () => {
    const response = await run(await upload(), allowed(otherStaff));
    assert.equal(response.status, 404);
    assert.equal((await body(response)).error, "not_found");
    assert.equal((await listImages(deps, staff, reportId)).length, 0);
  });

  it("lets an administrator upload into a colleague's report", async () => {
    const response = await run(await upload(), allowed(admin));
    assert.equal(response.status, 201);
    assert.equal((await listImages(deps, admin, reportId)).length, 1);
  });

  it("refuses a section the template never seeded", async () => {
    const response = await run(await upload(), allowed(staff), {
      sectionKey: "no-existe",
    });
    assert.equal(response.status, 404);
    assert.equal((await body(response)).error, "section_not_found");
  });

  it("reports a blank title as a field error and stores nothing", async () => {
    const response = await run(await upload({ title: "   " }), allowed(staff));
    assert.equal(response.status, 422);
    const payload = await body(response);
    assert.equal(payload.error, "invalid");
    assert.ok(
      (payload.fieldErrors as Record<string, string>).title,
      "the title field carries its own message",
    );
    assert.equal((await listImages(deps, staff, reportId)).length, 0);
  });

  it("reports a caption past its limit as a field error", async () => {
    const response = await run(
      await upload({ caption: "x".repeat(501) }),
      allowed(staff),
    );
    assert.equal(response.status, 422);
    assert.ok(
      ((await body(response)).fieldErrors as Record<string, string>).caption,
    );
  });

  it("keeps the description when one is sent", async () => {
    await run(await upload({ caption: "Menú principal" }), allowed(staff));
    const [image] = await listImages(deps, staff, reportId);
    assert.equal(image.caption, "Menú principal");
  });

  it("answers 409 once the section is full", async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await run(
        await upload({ title: `Imagen ${index}` }),
        allowed(staff),
      );
      assert.equal(response.status, 201);
    }
    const response = await run(
      await upload({ title: "Una más" }),
      allowed(staff),
    );
    assert.equal(response.status, 409);
    assert.equal((await body(response)).error, "image_limit_reached");
  });

  it("never echoes the title or the description back in an error", async () => {
    const response = await run(
      await upload({ image: SVG, title: "Secreto", caption: "No repetir" }),
      allowed(staff),
    );
    const text = JSON.stringify(await body(response));
    assert.ok(!text.includes("Secreto"));
    assert.ok(!text.includes("No repetir"));
  });
});
