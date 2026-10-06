import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  handleBillingImageUpload,
  type UploadAccess,
  type UploadTarget,
} from "../../src/billing/image-upload.ts";
import {
  createIssuer,
  getIssuer,
  setIssuerActive,
} from "../../src/billing/issuers.ts";
import type { BillingActor } from "../../src/billing/service.ts";
import { createSigner, getSigner } from "../../src/billing/signers.ts";
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
import {
  animatedPng,
  SVG,
  solidJpeg,
  solidPng,
  spyDecoder,
} from "./image-fixtures.ts";

// The dedicated upload route (raw image body, not a Server Function): origin
// and session checks, media type, byte limits enforced up front and while
// streaming, then the same pipeline and service as before. JSON answers with
// Spanish messages.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

const APP_ORIGIN = "http://127.0.0.1:3100";
const LIMIT = 1024 * 1024;

let admin: BillingActor;
let staff: BillingActor;
let signerId: string;

const BILLING_TABLES =
  "bank_account, issuer_logo, issuer_profile, signer_profile, billing_image";

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${BILLING_TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  admin = { id: a.id, role: "admin", ipAddress: null, userAgent: "node-test" };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  signerId = (
    await createSigner(deps, admin, {
      fullName: "Firmante Demo",
      identificationType: "CC",
      identificationNumber: "1000000009",
      jobTitle: "Representante legal",
      email: "firmante@example.test",
    })
  ).id;
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

// A body that counts how many bytes were pulled from it. highWaterMark 0:
// the stream pulls only when the handler reads (no eager prefill), so
// `pulled` measures what the handler consumed.
function countingBody(chunks: Iterable<Uint8Array>) {
  const iterator = chunks[Symbol.iterator]();
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const next = iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        state.pulled += next.value.length;
        controller.enqueue(next.value);
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

function* endless(size = 64 * 1024) {
  while (true) yield new Uint8Array(size);
}

function request(
  body: BodyInit | null,
  headers: Record<string, string | null> = {},
) {
  const base: Record<string, string | null> = {
    origin: APP_ORIGIN,
    "sec-fetch-site": "same-origin",
    "content-type": "image/png",
    ...headers,
  };
  const clean = Object.fromEntries(
    Object.entries(base).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  return new Request(`${APP_ORIGIN}/api/billing/uploads/x`, {
    method: "POST",
    headers: clean,
    body,
    duplex: "half",
  } as RequestInit);
}

const signature = (): UploadTarget => ({ kind: "signature", signerId });

async function upload(
  req: Request,
  options: {
    access?: UploadAccess;
    target?: UploadTarget;
    decoder?: ReturnType<typeof spyDecoder>["decoder"];
  } = {},
) {
  const response = await handleBillingImageUpload(deps, {
    request: req,
    access: options.access ?? { status: "authenticated", actor: admin },
    appOrigin: APP_ORIGIN,
    target: options.target ?? signature(),
    decoder: options.decoder,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: JSON.parse(text) as {
      ok: boolean;
      imageId?: string;
      error?: string;
      message: string;
    },
  };
}

describe("accepted uploads", () => {
  it("stores a PNG signature and answers 201 with JSON in Spanish", async () => {
    const bytes = await solidPng();
    const result = await upload(
      request(new Uint8Array(bytes), {
        "content-length": String(bytes.length),
      }),
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.message, "Firma guardada.");
    assert.match(
      result.headers.get("content-type") ?? "",
      /^application\/json/,
    );
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    const saved = await getSigner(deps, admin, signerId);
    assert.equal(saved?.signature?.id, result.body.imageId);
    assert.equal(await count("billing_image"), 1);
  });

  it("accepts a JPEG and a streamed body without Content-Length", async () => {
    const jpeg = await solidJpeg();
    const first = await upload(
      request(new Uint8Array(jpeg), { "content-type": "image/jpeg" }),
    );
    assert.equal(first.status, 201);
    const png = await solidPng();
    const { stream } = countingBody([png.subarray(0, 100), png.subarray(100)]);
    const second = await upload(request(stream));
    assert.equal(second.status, 201);
    assert.equal(await count("billing_image"), 2);
  });

  it("uploads a logo to the chosen issuer only, refusing unknown (404) and inactive (409) issuers", async () => {
    const bytes = new Uint8Array(await solidPng());
    const issuer = {
      legalName: "Emisor Demo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "9000000022",
      address: "Calle Falsa 123",
      city: "Ciudad Demo",
    };
    const a = await createIssuer(deps, admin, issuer);
    const b = await createIssuer(deps, admin, {
      ...issuer,
      identificationNumber: "9000000033",
    });
    const missing = await upload(request(bytes), {
      target: {
        kind: "issuer_logo",
        issuerId: "11111111-1111-4111-8111-111111111111",
      },
    });
    assert.equal(missing.status, 404);
    assert.match(missing.body.message, /Ese emisor ya no existe/);
    const saved = await upload(request(bytes), {
      target: { kind: "issuer_logo", issuerId: a.id },
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.message, "Logo guardado.");
    assert.equal(
      (await getIssuer(deps, admin, a.id))?.logo?.id,
      saved.body.imageId,
    );
    assert.equal((await getIssuer(deps, admin, b.id))?.logo, null);
    await setIssuerActive(deps, admin, b.id, false);
    const inactive = await upload(request(bytes), {
      target: { kind: "issuer_logo", issuerId: b.id },
    });
    assert.equal(inactive.status, 409);
    assert.equal(inactive.body.error, "issuer_inactive");
    assert.equal(await count("issuer_logo"), 1);
  });
});

describe("refused before the body is read", () => {
  it("answers 401 without a session and 403 for a forbidden session or a staff role", async () => {
    const cases: [UploadAccess, number][] = [
      [{ status: "unauthenticated" }, 401],
      [{ status: "forbidden" }, 403],
      [{ status: "authenticated", actor: staff }, 403],
    ];
    for (const [access, status] of cases) {
      const { stream, state } = countingBody(endless());
      const result = await upload(request(stream), { access });
      assert.equal(result.status, status);
      assert.equal(result.body.ok, false);
      assert.equal(state.pulled, 0);
    }
    const anonymous = await upload(request(new Uint8Array(await solidPng())), {
      access: { status: "unauthenticated" },
    });
    assert.match(anonymous.body.message, /Inicia sesión de nuevo/);
    assert.equal(await count("billing_image"), 0);
  });

  it("refuses a missing or foreign Origin and any cross-site fetch (403)", async () => {
    const cases: Record<string, string | null>[] = [
      { origin: null },
      { origin: "null" },
      { origin: "https://evil.example" },
      { origin: "http://127.0.0.1:3101" },
      { origin: "http://localhost:3100" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "none" },
    ];
    for (const headers of cases) {
      const { stream, state } = countingBody(endless());
      const result = await upload(request(stream, headers));
      assert.equal(result.status, 403, JSON.stringify(headers));
      assert.equal(result.body.error, "cross_origin");
      assert.equal(state.pulled, 0);
    }
    assert.equal(await count("billing_image"), 0);
  });

  it("accepts a same-origin request from a browser that omits Sec-Fetch-Site", async () => {
    const result = await upload(
      request(new Uint8Array(await solidPng()), { "sec-fetch-site": null }),
    );
    assert.equal(result.status, 201);
  });

  it("answers 415 for any media type other than PNG or JPEG", async () => {
    for (const type of [
      null,
      "image/svg+xml",
      "multipart/form-data; boundary=x",
      "application/octet-stream",
      "image/gif",
      "text/plain",
    ]) {
      const { stream, state } = countingBody(endless());
      const result = await upload(request(stream, { "content-type": type }));
      assert.equal(result.status, 415, String(type));
      assert.match(result.body.message, /Solo se aceptan imágenes PNG o JPG/);
      assert.equal(state.pulled, 0);
    }
  });

  it("answers 413 when Content-Length is over 1 MB, without reading the body", async () => {
    const { decoder, calls } = spyDecoder();
    const { stream, state } = countingBody(endless());
    const result = await upload(
      request(stream, { "content-length": String(LIMIT + 1) }),
      { decoder },
    );
    assert.equal(result.status, 413);
    assert.match(result.body.message, /más de 1 MB/);
    assert.equal(state.pulled, 0);
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
  });

  it("answers 400 for an invalid Content-Length", async () => {
    for (const value of ["abc", "-1", "1.5", "1e3"]) {
      const { stream, state } = countingBody(endless());
      const result = await upload(request(stream, { "content-length": value }));
      assert.equal(result.status, 400, value);
      assert.equal(state.pulled, 0);
    }
  });
});

describe("limits while streaming", () => {
  it("stops reading as soon as the body passes 1 MB (413), storing nothing", async () => {
    const { decoder, calls } = spyDecoder();
    const chunkSize = 64 * 1024;
    const { stream, state } = countingBody(endless(chunkSize));
    const result = await upload(request(stream), { decoder });
    assert.equal(result.status, 413);
    assert.match(result.body.message, /más de 1 MB/);
    assert.ok(
      state.pulled <= LIMIT + 2 * chunkSize,
      `pulled ${state.pulled} bytes`,
    );
    assert.equal(state.cancelled, true);
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
    assert.equal(await count("billing_image"), 0);
  });

  it("accepts exactly 1 MB as far as the byte limit goes", async () => {
    // Exactly the limit is not "too large"; these zero bytes then fail the
    // signature check (400), proving the limit is inclusive.
    const result = await upload(request(new Uint8Array(LIMIT)));
    assert.equal(result.status, 400);
    assert.match(result.body.message, /Solo se aceptan imágenes PNG o JPG/);
  });

  it("answers 400 for an empty body", async () => {
    const result = await upload(request(null));
    assert.equal(result.status, 400);
    assert.match(result.body.message, /Elige una imagen PNG o JPG/);
  });
});

describe("pipeline and service answers", () => {
  it("rejects SVG sent as image/png before decoding (400)", async () => {
    const { decoder, calls } = spyDecoder();
    const result = await upload(request(new Uint8Array(SVG)), { decoder });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "unsupported_type");
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
  });

  it("rejects an animated PNG (400) with a Spanish message", async () => {
    const result = await upload(request(new Uint8Array(await animatedPng())));
    assert.equal(result.status, 400);
    assert.match(result.body.message, /animad/i);
    assert.equal(await count("billing_image"), 0);
  });

  it("answers 404 for an unknown or malformed signer", async () => {
    const bytes = new Uint8Array(await solidPng());
    for (const id of ["44444444-4444-4444-8444-444444444444", "nope"]) {
      const result = await upload(request(bytes), {
        target: { kind: "signature", signerId: id },
      });
      assert.equal(result.status, 404, id);
      assert.equal(result.body.message, "Ese firmante ya no existe.");
    }
    assert.equal(await count("billing_image"), 0);
  });

  it("writes one audit row per stored upload and none for refusals", async () => {
    await upload(request(new Uint8Array(await solidPng())));
    await upload(request(new Uint8Array(SVG)));
    await upload(request(new Uint8Array(await solidPng())), {
      access: { status: "authenticated", actor: staff },
    });
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from audit_log
        where action = 'billing.signer_signature_upload'`,
    );
    assert.equal(rows[0]?.n, 1);
  });
});
