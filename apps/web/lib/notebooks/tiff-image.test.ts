import assert from "node:assert/strict";
import { test } from "node:test";
import { unzlibSync } from "fflate";

import { imageSize } from "./image-dimensions";
import { isTiff, tiffImage, tiffLzwDecode } from "./tiff-image";

interface TiffOptions {
  width: number;
  height: number;
  samples?: number;
  photometric?: number;
  compression?: number;
  planar?: number;
  bitsPerSample?: number;
  pixels: Uint8Array;
  strips?: number;
}

/** A little-endian baseline TIFF, built field by field so the decoder is exercised
 *  against the real layout rather than a fixture it agrees with by construction. */
function tiff(options: TiffOptions): Uint8Array {
  const {
    bitsPerSample = 8,
    compression = 1,
    height,
    photometric = 2,
    pixels,
    planar = 1,
    samples = 3,
    strips = 1,
    width,
  } = options;
  const rowBytes = width * samples;
  const rowsPerStrip = Math.ceil(height / strips);
  const stripCount = Math.ceil(height / rowsPerStrip);

  const entries: Array<[number, number, number[]]> = [
    [256, 4, [width]],
    [257, 4, [height]],
    [258, 3, Array.from({ length: samples }, () => bitsPerSample)],
    [259, 3, [compression]],
    [262, 3, [photometric]],
    [277, 3, [samples]],
    [278, 4, [rowsPerStrip]],
    [284, 3, [planar]],
    [273, 4, []], // strip offsets, filled below
    [279, 4, []], // strip byte counts, filled below
  ];

  // Layout: header (8) · IFD · out-of-line values · pixels.
  const ifdAt = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let extraAt = ifdAt + ifdSize;
  const extras: Array<{ at: number; values: number[]; size: number }> = [];
  const stripOffsets: number[] = [];
  const stripCounts: number[] = [];
  for (let s = 0; s < stripCount; s += 1) {
    const rows = Math.min(rowsPerStrip, height - s * rowsPerStrip);
    stripCounts.push(rows * rowBytes);
  }

  const resolved = entries.map(([tag, type, values]) => {
    const list = tag === 273 ? stripOffsets : tag === 279 ? stripCounts : values;
    return { list, tag, type };
  });
  for (const entry of resolved) {
    const size = entry.type === 3 ? 2 : 4;
    if (entry.list.length * size > 4 && entry.tag !== 273) {
      extras.push({ at: extraAt, size, values: entry.list });
      extraAt += entry.list.length * size;
    }
  }
  // Strip offsets must be resolved last: they point past everything else.
  const stripOffsetsInline = stripCount * 4 <= 4;
  const stripOffsetsAt = stripOffsetsInline ? 0 : extraAt;
  if (!stripOffsetsInline) extraAt += stripCount * 4;
  const pixelsAt = extraAt;
  let running = pixelsAt;
  for (const count of stripCounts) {
    stripOffsets.push(running);
    running += count;
  }

  const total = pixelsAt + pixels.length;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdAt, true);
  view.setUint16(ifdAt, resolved.length, true);

  resolved.forEach((entry, index) => {
    const at = ifdAt + 2 + index * 12;
    const size = entry.type === 3 ? 2 : 4;
    view.setUint16(at, entry.tag, true);
    view.setUint16(at + 2, entry.type, true);
    view.setUint32(at + 4, entry.list.length, true);
    const write = (offset: number, value: number) =>
      size === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value, true);
    if (entry.list.length * size <= 4) {
      entry.list.forEach((value, i) => write(at + 8 + i * size, value));
    } else if (entry.tag === 273) {
      view.setUint32(at + 8, stripOffsetsAt, true);
      entry.list.forEach((value, i) => view.setUint32(stripOffsetsAt + i * 4, value, true));
    } else {
      const extra = extras.find((candidate) => candidate.values === entry.list)!;
      view.setUint32(at + 8, extra.at, true);
      entry.list.forEach((value, i) => write(extra.at + i * size, value));
    }
  });

  bytes.set(pixels, pixelsAt);
  return bytes;
}

function decodePng(png: Uint8Array): Uint8Array {
  const size = imageSize(png)!;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let idat: Uint8Array | null = null;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!);
    if (type === "IDAT") idat = png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  const raw = unzlibSync(idat!);
  const stride = size.width * 3;
  const rgb = new Uint8Array(stride * size.height);
  for (let y = 0; y < size.height; y += 1) {
    rgb.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
  }
  return rgb;
}

test("a file that is not a TIFF is not opened", () => {
  assert.equal(isTiff(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(tiffImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
});

test("an uncompressed RGB TIFF comes back with its colours in order", () => {
  const pixels = new Uint8Array([10, 20, 30, 40, 50, 60]);
  const image = tiffImage(tiff({ height: 1, pixels, width: 2 }));
  assert.ok(image);
  assert.equal(image.mime, "image/png");
  assert.deepEqual([...decodePng(image.bytes)], [10, 20, 30, 40, 50, 60]);
});

test("the rows stay in order — a TIFF is stored top row first", () => {
  const pixels = new Uint8Array([255, 0, 0, 0, 0, 255]);
  const image = tiffImage(tiff({ height: 2, pixels, width: 1 }));
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes).subarray(0, 3)], [255, 0, 0]);
});

test("a fourth sample is dropped rather than shifting every pixel after it", () => {
  const pixels = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
  const image = tiffImage(tiff({ height: 1, pixels, samples: 4, width: 2 }));
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes)], [10, 20, 30, 40, 50, 60]);
});

test("a picture split across several strips is reassembled in the right order", () => {
  const pixels = new Uint8Array([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  const image = tiffImage(tiff({ height: 4, pixels, strips: 4, width: 1 }));
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes)], [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
});

test("a greyscale scan becomes grey, not a single channel of colour", () => {
  const image = tiffImage(tiff({ height: 1, photometric: 1, pixels: new Uint8Array([90, 200]), samples: 1, width: 2 }));
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes)], [90, 90, 90, 200, 200, 200]);
});

test("a white-is-zero scan is inverted, not rendered as a negative", () => {
  const image = tiffImage(tiff({ height: 1, photometric: 0, pixels: new Uint8Array([0, 255]), samples: 1, width: 2 }));
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes).subarray(0, 3)], [255, 255, 255]);
});

// ── What it refuses, and why refusing is right ───────────────────────────────

test("a compression this decoder does not implement is refused, not guessed at", () => {
  const pixels = new Uint8Array(12);
  assert.equal(tiffImage(tiff({ compression: 32773, height: 2, pixels, width: 2 })), null, "PackBits");
  // LZW is implemented now — but a strip whose BYTES are not LZW at all must
  // still refuse rather than shear: zeroed "compressed" data is not a stream.
  assert.equal(tiffImage(tiff({ compression: 5, height: 2, pixels, width: 2 })), null, "not-actually-LZW bytes");
});

test("16-bit samples and planar layouts are refused", () => {
  const pixels = new Uint8Array(24);
  assert.equal(tiffImage(tiff({ bitsPerSample: 16, height: 2, pixels, width: 2 })), null);
  assert.equal(tiffImage(tiff({ height: 2, pixels, planar: 2, width: 2 })), null);
});

test("CMYK is refused rather than read as if it were RGB", () => {
  const pixels = new Uint8Array(16);
  assert.equal(tiffImage(tiff({ height: 1, photometric: 5, pixels, samples: 4, width: 2 })), null);
});

test("a header promising more rows than the file holds returns nothing", () => {
  const file = tiff({ height: 4, pixels: new Uint8Array(12), width: 1 });
  assert.equal(tiffImage(file.subarray(0, file.length - 6)), null);
});

// ── LZW, proven against a real encoder rather than a mirror of ourselves ─────
//
// The fixture below is a 12x8 RGB TIFF written by macOS `sips` with LZW and the
// horizontal-differencing predictor — big-endian, out-of-line tag values, the
// exact shape of the Mac-authored lecture decks that carried real figures this
// decoder used to refuse. Its pixels follow a generative pattern, so the test
// asserts every byte against the FORMULA, not against a second copy of the
// decoder's own output: a decode that shears, swaps channels, or mishandles the
// early-change boundary cannot pass by construction.
const LZW_FIXTURE = Buffer.from(
  "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",
  "base64",
);

test("a real encoder's LZW strip with predictor decodes to the exact source pixels", () => {
  const image = tiffImage(new Uint8Array(LZW_FIXTURE));
  assert.ok(image, "the LZW fixture was refused");
  assert.equal(image.width, 12);
  assert.equal(image.height, 8);
  const rgb = decodePng(image.bytes);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const at = (y * 12 + x) * 3;
      assert.deepEqual(
        [rgb[at], rgb[at + 1], rgb[at + 2]],
        [(x * 20 + y * 3) % 256, (y * 30) % 256, (x * 10 + y * 17) % 256],
        `pixel ${x},${y}`,
      );
    }
  }
});

// The fixture's single strip: offset 0x26, 76 bytes, ending where the IFD
// begins at 0x72 — read off its own StripOffsets/StripByteCounts tags.
const FIXTURE_STRIP = new Uint8Array(LZW_FIXTURE.subarray(0x26, 0x72));
const FIXTURE_STRIP_BYTES = 12 * 8 * 3;

test("a truncated LZW stream is refused, never sheared into a partial picture", () => {
  const decoded = tiffLzwDecode(FIXTURE_STRIP, FIXTURE_STRIP_BYTES);
  assert.ok(decoded, "the intact strip must decode");
  const cut = tiffLzwDecode(FIXTURE_STRIP.subarray(0, FIXTURE_STRIP.length / 2), FIXTURE_STRIP_BYTES);
  assert.equal(cut, null);
});

test("a stream that does not open with a Clear code is not LZW and is refused", () => {
  const broken = new Uint8Array(FIXTURE_STRIP);
  broken[0] = 0x00; // The leading Clear code's high bits live in the first byte.
  assert.equal(tiffLzwDecode(broken, FIXTURE_STRIP_BYTES), null);
});
