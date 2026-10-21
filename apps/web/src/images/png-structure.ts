import { crc32 } from "node:zlib";

// PNG chunk-structure detector (owner exception, 2026-10-01): a walk over
// the chunk list, NOT a decoder. It never interprets image data; it only
// decides whether the byte stream is a well-formed sequence of PNG chunks
// without animation. sharp 0.35.5 / libvips 8.18.7 decode only the default
// image of an APNG and report no `pages`, so without this an animated PNG
// would pass as a still image.
//
// Rules: PNG signature; every chunk header + data + CRC fits in the buffer;
// declared length <= 2^31 - 1; type is four ASCII letters; first chunk is
// IHDR with 13 bytes of data; every CRC matches (node:zlib crc32, no extra
// dependency); at most MAX_PNG_CHUNKS chunks; the stream ends exactly with
// an empty IEND (no trailing bytes); any acTL, fcTL or fdAT (wherever it is)
// means animated.

export type PngStructure = "still" | "animated" | "malformed";

// A 1 MB upload split into the smallest legal chunks would be ~87,000 of
// them; ordinary encoders write a handful (libpng splits IDAT at 8 KB, so
// ~128 for 1 MB). 4096 leaves ample room and bounds the walk.
export const MAX_PNG_CHUNKS = 4096;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_CHUNK_LENGTH = 0x7fffffff;
const IHDR_LENGTH = 13;
const ANIMATION_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);

function isLetter(byte: number) {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

export function inspectPngStructure(png: Buffer): PngStructure {
  if (png.length < SIGNATURE.length || !png.subarray(0, 8).equals(SIGNATURE)) {
    return "malformed";
  }
  let offset = SIGNATURE.length;
  let chunks = 0;
  let animated = false;
  while (offset < png.length) {
    chunks += 1;
    if (chunks > MAX_PNG_CHUNKS) return "malformed";
    // Length (4) + type (4) must be present before reading them.
    if (png.length - offset < 8) return "malformed";
    const length = png.readUInt32BE(offset);
    if (length > MAX_CHUNK_LENGTH) return "malformed";
    // Header (8) + data + CRC (4) must fit in what is left.
    if (png.length - offset - 12 < length) return "malformed";
    for (let i = offset + 4; i < offset + 8; i += 1) {
      if (!isLetter(png[i])) return "malformed";
    }
    const type = png.toString("latin1", offset + 4, offset + 8);
    const typeAndData = png.subarray(offset + 4, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    if (crc32(typeAndData) >>> 0 !== crc) return "malformed";
    if (chunks === 1 && (type !== "IHDR" || length !== IHDR_LENGTH)) {
      return "malformed";
    }
    if (chunks > 1 && type === "IHDR") return "malformed";
    if (ANIMATION_CHUNKS.has(type)) animated = true;
    offset += 12 + length;
    if (type === "IEND") {
      // IEND carries no data and nothing may follow it.
      if (length !== 0 || offset !== png.length) return "malformed";
      return animated ? "animated" : "still";
    }
  }
  return "malformed";
}
