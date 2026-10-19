export type BodyResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "too_large" };

// Reads a request body counting bytes; cancels the stream as soon as the
// count passes the limit, so at most one chunk beyond the limit is ever
// held. A client that declares no Content-Length, or lies about it, still
// cannot make the server hold an unbounded body in memory.
//
// Shared because every image upload needs the same bound: billing reads a
// raw image body, reports read a multipart body that is parsed only after
// this returns. `Request.formData()` has no limit of its own, so parsing a
// live stream directly is exactly what this exists to prevent.
export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<BodyResult> {
  if (!body) return { ok: true, bytes: Buffer.alloc(0) };
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    parts.push(value);
  }
  return { ok: true, bytes: Buffer.concat(parts, total) };
}
