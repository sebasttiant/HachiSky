import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadBillingImage } from "../../src/billing/image-upload-client.ts";

// The browser side of the upload route: what it sends and how it turns each
// answer into the form state (Spanish messages under the file field).

const URL_ = "/api/billing/uploads/issuers/x/logo";

function file(size: number, type = "image/png") {
  return new File([new Uint8Array(size)], "logo.png", { type });
}

function fakeFetch(answer: () => Promise<Response> | Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  };
  return { fetchFn, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("upload request", () => {
  it("posts the raw file same-origin with its type, never following redirects", async () => {
    const { fetchFn, calls } = fakeFetch(() =>
      json(201, { ok: true, imageId: "x", message: "Logo guardado." }),
    );
    const image = file(10, "image/jpeg");
    const state = await uploadBillingImage(URL_, image, fetchFn);
    assert.deepEqual(state, { status: "success", message: "Logo guardado." });
    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(url, URL_);
    assert.equal(init.method, "POST");
    assert.equal(init.body, image);
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.redirect, "manual");
    assert.equal(new Headers(init.headers).get("content-type"), "image/jpeg");
  });

  it("does not send a missing, empty or oversized file", async () => {
    const { fetchFn, calls } = fakeFetch(() => json(201, { ok: true }));
    const none = await uploadBillingImage(URL_, null, fetchFn);
    assert.equal(none.status, "error");
    assert.match(none.fieldErrors?.image ?? "", /Elige una imagen PNG o JPG/);
    const empty = await uploadBillingImage(URL_, file(0), fetchFn);
    assert.match(empty.fieldErrors?.image ?? "", /Elige una imagen/);
    const big = await uploadBillingImage(URL_, file(1024 * 1024 + 1), fetchFn);
    assert.match(big.fieldErrors?.image ?? "", /más de 1 MB/);
    assert.equal(calls.length, 0);
  });
});

describe("upload answers", () => {
  it("shows the server's Spanish message under the file field", async () => {
    const message = "No se aceptan imágenes animadas ni de varias páginas.";
    const { fetchFn } = fakeFetch(() =>
      json(400, { ok: false, error: "animated", message }),
    );
    assert.deepEqual(await uploadBillingImage(URL_, file(10), fetchFn), {
      status: "error",
      message,
      fieldErrors: { image: message },
    });
  });

  it("treats a redirect (the session ended) as an expired session", async () => {
    const { fetchFn } = fakeFetch(
      () =>
        ({
          type: "opaqueredirect",
          status: 0,
          ok: false,
          json: async () => {
            throw new Error("no body");
          },
        }) as unknown as Response,
    );
    const state = await uploadBillingImage(URL_, file(10), fetchFn);
    assert.equal(state.status, "error");
    assert.match(state.message ?? "", /Inicia sesión de nuevo/);
  });

  it("falls back to a generic message for a non-JSON answer or a network error", async () => {
    const html = fakeFetch(() => new Response("<html>", { status: 500 }));
    const broken = await uploadBillingImage(URL_, file(10), html.fetchFn);
    assert.equal(broken.status, "error");
    assert.match(broken.message ?? "", /No se pudo subir la imagen/);
    const offline = fakeFetch(() => Promise.reject(new TypeError("fetch")));
    const failed = await uploadBillingImage(URL_, file(10), offline.fetchFn);
    assert.match(failed.message ?? "", /No se pudo subir la imagen/);
  });
});
