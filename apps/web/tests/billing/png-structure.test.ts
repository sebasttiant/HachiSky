import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { processImage } from "../../src/billing/image.ts";
import {
  inspectPngStructure,
  MAX_PNG_CHUNKS,
} from "../../src/billing/png-structure.ts";
import {
  animatedPng,
  chunk,
  PNG_SIGNATURE,
  pngWithText,
  readChunks,
  solidPng,
  spyDecoder,
} from "./image-fixtures.ts";

// The PNG chunk detector: a structure walk (not a decoder) that refuses
// animation chunks and any malformed chunk stream before sharp sees it.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

async function still() {
  return solidPng(40, 20);
}

// Rebuilds a PNG from its chunks, letting a test replace or add some.
function build(chunks: Buffer[], signature = PNG_SIGNATURE) {
  return Buffer.concat([signature, ...chunks]);
}

async function stillChunks() {
  return readChunks(await still()).map((c) => chunk(c.type, c.data));
}

function withLength(raw: Buffer, length: number) {
  const copy = Buffer.from(raw);
  copy.writeUInt32BE(length, 0);
  return copy;
}

async function expectMalformed(input: Buffer, label: string) {
  assert.equal(inspectPngStructure(input), "malformed", label);
  const { decoder, calls } = spyDecoder();
  const result = await processImage(input, "signature", decoder);
  assert.deepEqual(result, { ok: false, reason: "unreadable" }, label);
  assert.deepEqual(calls, { metadata: 0, toPng: 0 }, label);
}

describe("PNG structure detector: accepted", () => {
  it("accepts generated still PNGs, with and without text chunks", async () => {
    assert.equal(inspectPngStructure(await still()), "still");
    assert.equal(inspectPngStructure(await solidPng(1200, 800)), "still");
    assert.equal(inspectPngStructure(await pngWithText("marca")), "still");
  });

  it("accepts the project's own PNG assets", () => {
    for (const file of [
      "public/brand/hachisky-mark-96.png",
      "public/brand/hachisky-mark-144.png",
      "app/icon.png",
      "app/apple-icon.png",
    ]) {
      assert.equal(
        inspectPngStructure(readFileSync(join(ROOT, file))),
        "still",
        file,
      );
    }
  });
});

describe("PNG structure detector: animation", () => {
  it("rejects a real two-frame APNG before the decoder", async () => {
    const input = await animatedPng();
    assert.equal(inspectPngStructure(input), "animated");
    const { decoder, calls } = spyDecoder();
    assert.deepEqual(await processImage(input, "signature", decoder), {
      ok: false,
      reason: "animated",
    });
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
  });

  it("rejects fcTL or fdAT on their own, without acTL", async () => {
    for (const type of ["acTL", "fcTL", "fdAT"]) {
      const chunks = await stillChunks();
      // After IHDR, before the image data.
      chunks.splice(1, 0, chunk(type, Buffer.alloc(26)));
      assert.equal(inspectPngStructure(build(chunks)), "animated", type);
    }
  });

  it("rejects an animation chunk placed after the image data", async () => {
    const chunks = await stillChunks();
    chunks.splice(chunks.length - 1, 0, chunk("fdAT", Buffer.alloc(8)));
    assert.equal(inspectPngStructure(build(chunks)), "animated");
  });
});

describe("PNG structure detector: malformed", () => {
  it("rejects a declared length above 2^31 - 1", async () => {
    const chunks = await stillChunks();
    chunks[1] = withLength(chunks[1], 0x80000000);
    await expectMalformed(build(chunks), "oversized length");
  });

  it("rejects a declared length running past the end of the buffer", async () => {
    const chunks = await stillChunks();
    chunks[1] = withLength(chunks[1], chunks[1].length * 4);
    await expectMalformed(build(chunks), "length past the end");
  });

  it("rejects a truncated chunk and a truncated header", async () => {
    const full = await still();
    await expectMalformed(full.subarray(0, full.length - 20), "cut IDAT");
    await expectMalformed(full.subarray(0, 8 + 6), "cut IHDR header");
    await expectMalformed(PNG_SIGNATURE, "signature only");
  });

  it("rejects a stream without IEND", async () => {
    const chunks = await stillChunks();
    await expectMalformed(build(chunks.slice(0, -1)), "no IEND");
  });

  it("rejects bytes after IEND", async () => {
    const chunks = await stillChunks();
    await expectMalformed(
      Buffer.concat([build(chunks), Buffer.from([0])]),
      "one trailing byte",
    );
    await expectMalformed(
      Buffer.concat([build(chunks), chunk("tEXt", Buffer.from("a\0b"))]),
      "a chunk after IEND",
    );
  });

  it("rejects an IEND that carries data", async () => {
    const chunks = await stillChunks();
    chunks[chunks.length - 1] = chunk("IEND", Buffer.from([1]));
    await expectMalformed(build(chunks), "IEND with data");
  });

  it("rejects a bad CRC on any chunk", async () => {
    const chunks = await stillChunks();
    for (const index of [0, 1, chunks.length - 1]) {
      const copy = chunks.map((c) => Buffer.from(c));
      const target = copy[index];
      target[target.length - 1] ^= 0xff;
      await expectMalformed(build(copy), `bad CRC at chunk ${index}`);
    }
  });

  it("rejects a missing, misplaced or wrongly sized IHDR", async () => {
    const chunks = await stillChunks();
    await expectMalformed(build(chunks.slice(1)), "no IHDR");
    const text = chunk("tEXt", Buffer.from("a\0b"));
    await expectMalformed(build([text, ...chunks]), "IHDR not the first chunk");
    const ihdr = readChunks(await still())[0].data;
    await expectMalformed(
      build([
        chunk("IHDR", Buffer.concat([ihdr, Buffer.from([0])])),
        ...chunks.slice(1),
      ]),
      "IHDR of 14 bytes",
    );
    await expectMalformed(
      build([chunk("IHDR", ihdr.subarray(0, 12)), ...chunks.slice(1)]),
      "IHDR of 12 bytes",
    );
  });

  it("rejects chunk types that are not four ASCII letters", async () => {
    for (const type of ["I1DR", "tE T", "teét", "ab@d"]) {
      const chunks = await stillChunks();
      chunks.splice(1, 0, chunk(type, Buffer.from("x")));
      await expectMalformed(build(chunks), `type ${JSON.stringify(type)}`);
    }
  });

  it("rejects more chunks than the limit", async () => {
    const chunks = await stillChunks();
    const filler = chunk("tEXt", Buffer.from("a\0b"));
    const many = Array.from(
      { length: MAX_PNG_CHUNKS - chunks.length + 1 },
      () => filler,
    );
    const input = build([chunks[0], ...many, ...chunks.slice(1)]);
    assert.equal(readChunks(input).length, MAX_PNG_CHUNKS + 1);
    await expectMalformed(input, "chunk limit");
    // Exactly at the limit is still a valid structure.
    const atLimit = build([chunks[0], ...many.slice(1), ...chunks.slice(1)]);
    assert.equal(inspectPngStructure(atLimit), "still");
  });

  it("rejects a buffer without the PNG signature", async () => {
    assert.equal(
      inspectPngStructure(Buffer.from("not a png at all")),
      "malformed",
    );
  });
});
