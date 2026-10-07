import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  IMAGE_LIMITS,
  IMAGE_REJECTION_MESSAGES,
  type ImagePurpose,
  processImage,
} from "../../src/billing/image.ts";
import {
  animatedGif,
  animatedPng,
  animatedWebp,
  jpegWithExif,
  noiseJpeg,
  PNG_SIGNATURE,
  pngWithText,
  SVG,
  solidJpeg,
  solidPng,
  spyDecoder,
} from "./image-fixtures.ts";

async function rejection(input: Buffer, purpose: ImagePurpose = "signature") {
  const result = await processImage(input, purpose);
  return result.ok ? "accepted" : result.reason;
}

describe("image limits", () => {
  it("documents the chosen limits", () => {
    assert.equal(IMAGE_LIMITS.maxInputBytes, 1024 * 1024);
    assert.equal(IMAGE_LIMITS.maxInputPixels, 4_000_000);
    assert.equal(IMAGE_LIMITS.maxOutputBytes, 512 * 1024);
    assert.deepEqual(IMAGE_LIMITS.dimensions.signature, {
      maxWidth: 2000,
      maxHeight: 1000,
    });
    assert.deepEqual(IMAGE_LIMITS.dimensions.issuer_logo, {
      maxWidth: 2000,
      maxHeight: 2000,
    });
  });

  it("has a Spanish message for every rejection", () => {
    for (const message of Object.values(IMAGE_REJECTION_MESSAGES)) {
      assert.match(message, /[a-zá-ú]/);
    }
    assert.match(IMAGE_REJECTION_MESSAGES.too_large, /1 MB/);
  });
});

describe("accepted images", () => {
  it("accepts a valid PNG and stores a PNG with its sha256, size and dimensions", async () => {
    const input = await solidPng(300, 100);
    const result = await processImage(input, "signature");
    assert.ok(result.ok);
    const { png, sha256, byteSize, width, height } = result.image;
    assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
    assert.equal(sha256, createHash("sha256").update(png).digest("hex"));
    assert.equal(byteSize, png.length);
    assert.equal(width, 300);
    assert.equal(height, 100);
    const meta = await sharp(png).metadata();
    assert.equal(meta.format, "png");
  });

  it("accepts a valid JPEG and re-encodes it to PNG", async () => {
    const result = await processImage(await solidJpeg(400, 200), "signature");
    assert.ok(result.ok);
    assert.deepEqual(result.image.png.subarray(0, 8), PNG_SIGNATURE);
    const meta = await sharp(result.image.png).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 200);
  });

  it("accepts a logo taller than a signature may be", async () => {
    assert.equal(
      await rejection(await solidPng(800, 1500), "signature"),
      "dimensions",
    );
    const logo = await processImage(await solidPng(800, 1500), "issuer_logo");
    assert.ok(logo.ok);
  });
});

describe("metadata", () => {
  it("strips EXIF from a JPEG", async () => {
    const input = await jpegWithExif("SYNTHETIC-EXIF-MARKER");
    assert.ok((await sharp(input).metadata()).exif, "input carries EXIF");
    const result = await processImage(input, "signature");
    assert.ok(result.ok);
    const meta = await sharp(result.image.png).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.xmp, undefined);
    assert.equal(meta.icc, undefined);
    assert.equal(result.image.png.includes("SYNTHETIC-EXIF-MARKER"), false);
  });

  it("strips PNG text chunks", async () => {
    const input = await pngWithText("SYNTHETIC-TEXT-MARKER");
    assert.deepEqual((await sharp(input).metadata()).comments, [
      { keyword: "Comment", text: "SYNTHETIC-TEXT-MARKER" },
    ]);
    const result = await processImage(input, "signature");
    assert.ok(result.ok);
    assert.equal(
      (await sharp(result.image.png).metadata()).comments,
      undefined,
    );
    assert.equal(result.image.png.includes("SYNTHETIC-TEXT-MARKER"), false);
  });
});

describe("rejected before decoding", () => {
  it("rejects an empty upload", async () => {
    const { decoder, calls } = spyDecoder();
    const result = await processImage(Buffer.alloc(0), "signature", decoder);
    assert.deepEqual(result, { ok: false, reason: "empty" });
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
  });

  it("rejects an input over the byte limit without calling sharp", async () => {
    const { decoder, calls } = spyDecoder();
    const input = Buffer.concat([
      await solidPng(),
      Buffer.alloc(IMAGE_LIMITS.maxInputBytes),
    ]);
    const result = await processImage(input, "signature", decoder);
    assert.deepEqual(result, { ok: false, reason: "too_large" });
    assert.deepEqual(calls, { metadata: 0, toPng: 0 });
  });

  it("rejects SVG content, whatever name or type it was sent with, without calling sharp", async () => {
    for (const input of [
      SVG,
      Buffer.concat([Buffer.from("﻿  "), SVG]),
      Buffer.from(`<?xml version="1.0"?>${SVG.toString()}`),
    ]) {
      const { decoder, calls } = spyDecoder();
      const result = await processImage(input, "signature", decoder);
      assert.deepEqual(result, { ok: false, reason: "unsupported_type" });
      assert.deepEqual(calls, { metadata: 0, toPng: 0 });
    }
  });

  it("rejects GIF and WebP (animated or not) without calling sharp", async () => {
    for (const input of [await animatedGif(), await animatedWebp()]) {
      const { decoder, calls } = spyDecoder();
      const result = await processImage(input, "signature", decoder);
      assert.deepEqual(result, { ok: false, reason: "unsupported_type" });
      assert.deepEqual(calls, { metadata: 0, toPng: 0 });
    }
  });

  it("rejects an animated PNG (APNG) that passes the signature filter", async () => {
    const input = await animatedPng();
    assert.deepEqual(input.subarray(0, 8), PNG_SIGNATURE);
    // sharp/libvips alone would accept it and keep only the first frame.
    assert.equal((await sharp(input).metadata()).format, "png");
    const { decoder, calls } = spyDecoder();
    const result = await processImage(input, "signature", decoder);
    assert.deepEqual(result, { ok: false, reason: "animated" });
    assert.equal(calls.toPng, 0);
  });
});

describe("rejected by the decoder", () => {
  it("rejects a fake file that only starts with a PNG or JPEG signature", async () => {
    assert.equal(
      await rejection(
        Buffer.concat([PNG_SIGNATURE, Buffer.from("not an image at all")]),
      ),
      "unreadable",
    );
    assert.equal(
      await rejection(
        Buffer.concat([
          Buffer.from([0xff, 0xd8, 0xff]),
          Buffer.from("not a jpeg"),
        ]),
      ),
      "unreadable",
    );
  });

  it("rejects a truncated PNG and a truncated JPEG", async () => {
    const png = await solidPng(300, 100);
    assert.equal(
      await rejection(png.subarray(0, png.length - 20)),
      "unreadable",
    );
    const jpeg = await noiseJpeg(200);
    assert.equal(
      await rejection(jpeg.subarray(0, Math.floor(jpeg.length / 2))),
      "unreadable",
    );
  });

  it("rejects an input over the pixel limit", async () => {
    // 2100 x 2000 = 4.2 million pixels, a few KB as PNG.
    assert.equal(
      await rejection(await solidPng(2100, 2000), "issuer_logo"),
      "too_many_pixels",
    );
  });

  it("rejects dimensions over the limits for each purpose", async () => {
    assert.equal(await rejection(await solidPng(2001, 100)), "dimensions");
    assert.equal(await rejection(await solidPng(500, 1001)), "dimensions");
    assert.equal(
      await rejection(await solidPng(2001, 100), "issuer_logo"),
      "dimensions",
    );
  });

  it("rejects a decoder format that does not match the signature", async () => {
    const { decoder, calls } = spyDecoder({
      metadata: async () => ({ format: "webp", width: 10, height: 10 }),
    });
    const result = await processImage(await solidPng(), "signature", decoder);
    assert.deepEqual(result, { ok: false, reason: "format_mismatch" });
    assert.equal(calls.toPng, 0);
  });

  it("rejects an input the decoder reports as multi-page", async () => {
    const { decoder, calls } = spyDecoder({
      metadata: async () => ({
        format: "png",
        width: 10,
        height: 10,
        pages: 2,
      }),
    });
    const result = await processImage(await solidPng(), "signature", decoder);
    assert.deepEqual(result, { ok: false, reason: "animated" });
    assert.equal(calls.toPng, 0);
  });

  it("rejects a stored output over the size limit", async () => {
    // A noisy 600 x 600 JPEG is ~230 KB but ~1 MB as PNG.
    const input = await noiseJpeg(600);
    assert.ok(input.length < IMAGE_LIMITS.maxInputBytes);
    assert.equal(await rejection(input, "issuer_logo"), "output_too_large");
  });
});

describe("existing brand images", () => {
  it("still decode with sharp 0.35.5", async () => {
    assert.equal(sharp.versions.sharp, "0.35.5");
    for (const file of [
      "public/brand/hachisky-mark-96.png",
      "public/brand/hachisky-mark-144.png",
      "app/icon.png",
      "app/apple-icon.png",
    ]) {
      const input = readFileSync(new URL(`../../${file}`, import.meta.url));
      const meta = await sharp(input, { failOn: "error" }).metadata();
      assert.equal(meta.format, "png", file);
      const { info } = await sharp(input, { failOn: "error" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.width, meta.width, file);
    }
  });
});
