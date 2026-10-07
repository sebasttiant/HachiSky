import { crc32 } from "node:zlib";
import sharp from "sharp";
import { type ImageDecoder, sharpDecoder } from "../../src/billing/image.ts";

// Synthetic images only, generated on the fly: never a real signature or logo.

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function solidPng(width = 300, height = 100, background = "#123456") {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

export function solidJpeg(width = 300, height = 100, background = "#123456") {
  return sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer();
}

export function jpegWithExif(marker: string) {
  return sharp({
    create: { width: 120, height: 60, channels: 3, background: "#654321" },
  })
    .jpeg()
    .withExif({ IFD0: { Copyright: marker, ImageDescription: marker } })
    .toBuffer();
}

export interface Chunk {
  type: string;
  data: Buffer;
}

export function readChunks(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    chunks.push({
      type: png.subarray(offset + 4, offset + 8).toString("latin1"),
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += 12 + length;
  }
  return chunks;
}

export function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

// A valid PNG with a tEXt chunk carrying `marker` before the image data.
export async function pngWithText(marker: string) {
  const chunks = readChunks(await solidPng(120, 60));
  return Buffer.concat([
    PNG_SIGNATURE,
    ...chunks.flatMap((c) =>
      c.type === "IDAT" && c === chunks.find((x) => x.type === "IDAT")
        ? [
            chunk("tEXt", Buffer.from(`Comment\0${marker}`, "latin1")),
            chunk(c.type, c.data),
          ]
        : [chunk(c.type, c.data)],
    ),
  ]);
}

function frameControl(sequence: number, width: number, height: number) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(width, 4);
  data.writeUInt32BE(height, 8);
  data.writeUInt16BE(1, 20); // delay 1/2 s
  data.writeUInt16BE(2, 22);
  return data;
}

// A real two-frame animated PNG (APNG spec: acTL + fcTL before IDAT, then
// fcTL + fdAT for the second frame). It starts with the PNG signature, so it
// passes the signature filter.
export async function animatedPng(width = 60, height = 30) {
  const first = readChunks(await solidPng(width, height, "#cc0000"));
  const second = readChunks(await solidPng(width, height, "#00cc00"));
  const ihdr = first.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("no IHDR");
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(2, 0); // frames
  animationControl.writeUInt32BE(0, 4); // loop forever
  const sequence = Buffer.alloc(4);
  sequence.writeUInt32BE(2);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr.data),
    chunk("acTL", animationControl),
    chunk("fcTL", frameControl(0, width, height)),
    ...first.filter((c) => c.type === "IDAT").map((c) => chunk("IDAT", c.data)),
    chunk("fcTL", frameControl(1, width, height)),
    chunk(
      "fdAT",
      Buffer.concat([
        sequence,
        ...second.filter((c) => c.type === "IDAT").map((c) => c.data),
      ]),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function twoFrames() {
  return [await solidPng(40, 20, "#cc0000"), await solidPng(40, 20, "#00cc00")];
}

export async function animatedGif() {
  return sharp(await twoFrames(), { join: { animated: true } })
    .gif()
    .toBuffer();
}

export async function animatedWebp() {
  return sharp(await twoFrames(), { join: { animated: true } })
    .webp()
    .toBuffer();
}

// Random noise compresses badly: a small JPEG becomes a large PNG.
export function noiseJpeg(size: number) {
  const raw = Buffer.alloc(size * size * 3);
  let seed = 42;
  for (let i = 0; i < raw.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = seed & 0xff;
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);

// Wraps the real decoder and counts calls, to prove what never reached sharp.
export function spyDecoder(overrides: Partial<ImageDecoder> = {}) {
  const calls = { metadata: 0, toPng: 0 };
  const decoder: ImageDecoder = {
    metadata: (input) => {
      calls.metadata += 1;
      return (overrides.metadata ?? sharpDecoder.metadata)(input);
    },
    toPng: (input) => {
      calls.toPng += 1;
      return (overrides.toPng ?? sharpDecoder.toPng)(input);
    },
  };
  return { decoder, calls };
}
