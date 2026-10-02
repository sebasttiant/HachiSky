import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  IMAGE_LIMITS,
  type ImagePurpose,
  type ImageRejection,
} from "./image-limits.ts";
import { inspectPngStructure } from "./png-structure.ts";

// Validation pipeline for the images stored with billing settings: a signer's
// graphic signature and the issuer logo. Every accepted upload is fully
// decoded and re-encoded to a fresh PNG; only that PNG is stored (in the
// database, as an immutable version) and served.
//
// Order (cheapest and most restrictive first):
//   1. byte limit on the raw upload, before anything else;
//   2. exact PNG/JPEG signature, before sharp ever sees the bytes;
//   3. PNG only: chunk-structure walk (png-structure.ts) refusing animation
//      chunks and malformed chunk streams before sharp sees them;
//   4. sharp metadata with a pixel limit and failOn "error": the detected
//      format must equal the signature's, one page only, dimension limits;
//   5. full decode + re-encode to PNG without metadata, then a limit on the
//      stored size.

export {
  describeLimits,
  IMAGE_LIMITS,
  IMAGE_REJECTION_MESSAGES,
  type ImagePurpose,
  type ImageRejection,
} from "./image-limits.ts";

export class BillingImageError extends Error {
  readonly reason: ImageRejection;
  constructor(reason: ImageRejection) {
    super(reason);
    this.name = "BillingImageError";
    this.reason = reason;
  }
}

export interface DecodedMetadata {
  format?: string;
  width?: number;
  height?: number;
  // Number of pages/frames when the decoder reports it.
  pages?: number;
  // Display size after EXIF orientation, when it differs.
  orientedWidth?: number;
  orientedHeight?: number;
}

// The seam that touches sharp, so tests can prove what never reached it.
export interface ImageDecoder {
  metadata(input: Buffer): Promise<DecodedMetadata>;
  toPng(
    input: Buffer,
  ): Promise<{ data: Buffer; width: number; height: number }>;
}

const SHARP_OPTIONS = {
  limitInputPixels: IMAGE_LIMITS.maxInputPixels,
  failOn: "error",
} as const;

export const sharpDecoder: ImageDecoder = {
  async metadata(input) {
    const meta = await sharp(input, SHARP_OPTIONS).metadata();
    return {
      format: meta.format,
      width: meta.width,
      height: meta.height,
      pages: meta.pages,
      orientedWidth: meta.autoOrient?.width,
      orientedHeight: meta.autoOrient?.height,
    };
  },
  async toPng(input) {
    // Full decode (failOn "error" makes truncated data fail here) and a new
    // PNG. Neither withMetadata nor keepMetadata is called, so EXIF, XMP,
    // ICC and text chunks are not copied. Re-encoding reduces risk; it does
    // not guarantee that every kind of hidden content is gone (pixels
    // themselves can carry data).
    const { data, info } = await sharp(input, SHARP_OPTIONS)
      .autoOrient()
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  },
};

type Signature = "png" | "jpeg";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(input: Buffer, magic: readonly number[]) {
  return (
    input.length >= magic.length &&
    magic.every((byte, index) => input[index] === byte)
  );
}

// A filter, not a security guarantee: it only keeps sharp from ever being
// handed SVG, GIF, WebP, TIFF and the rest (whatever name or MIME type the
// upload claimed). The decoder below still has to accept the content.
export function detectSignature(input: Buffer): Signature | null {
  if (startsWith(input, PNG_MAGIC)) return "png";
  if (startsWith(input, JPEG_MAGIC)) return "jpeg";
  return null;
}

export interface ProcessedImage {
  png: Buffer;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
}

export type ImageResult =
  | { ok: true; image: ProcessedImage }
  | { ok: false; reason: ImageRejection };

function reject(reason: ImageRejection): ImageResult {
  return { ok: false, reason };
}

function isPixelLimitError(error: unknown) {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

export async function processImage(
  input: Buffer,
  purpose: ImagePurpose,
  decoder: ImageDecoder = sharpDecoder,
): Promise<ImageResult> {
  if (input.length === 0) return reject("empty");
  if (input.length > IMAGE_LIMITS.maxInputBytes) return reject("too_large");

  const signature = detectSignature(input);
  if (!signature) return reject("unsupported_type");
  if (signature === "png") {
    const structure = inspectPngStructure(input);
    if (structure === "animated") return reject("animated");
    if (structure === "malformed") return reject("unreadable");
  }

  let meta: DecodedMetadata;
  try {
    meta = await decoder.metadata(input);
  } catch (error) {
    return reject(isPixelLimitError(error) ? "too_many_pixels" : "unreadable");
  }
  if (meta.format !== signature) return reject("format_mismatch");
  if ((meta.pages ?? 1) !== 1) return reject("animated");
  const limits = IMAGE_LIMITS.dimensions[purpose];
  const width = meta.orientedWidth ?? meta.width;
  const height = meta.orientedHeight ?? meta.height;
  if (!width || !height) return reject("unreadable");
  if (width > limits.maxWidth || height > limits.maxHeight) {
    return reject("dimensions");
  }

  let output: Awaited<ReturnType<ImageDecoder["toPng"]>>;
  try {
    output = await decoder.toPng(input);
  } catch (error) {
    return reject(isPixelLimitError(error) ? "too_many_pixels" : "unreadable");
  }
  if (output.width > limits.maxWidth || output.height > limits.maxHeight) {
    return reject("dimensions");
  }
  if (output.data.length > IMAGE_LIMITS.maxOutputBytes) {
    return reject("output_too_large");
  }
  return {
    ok: true,
    image: {
      png: output.data,
      sha256: createHash("sha256").update(output.data).digest("hex"),
      byteSize: output.data.length,
      width: output.width,
      height: output.height,
    },
  };
}
