import assert from "node:assert/strict";
import { test } from "node:test";
import { unzlibSync } from "fflate";

import { imageSize } from "./image-dimensions";
import { isTiff, tiffImage } from "./tiff-image";

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

test("a compressed TIFF is reported unreadable rather than decoded wrongly", () => {
  const pixels = new Uint8Array(12);
  assert.equal(tiffImage(tiff({ compression: 5, height: 2, pixels, width: 2 })), null, "LZW");
  assert.equal(tiffImage(tiff({ compression: 32773, height: 2, pixels, width: 2 })), null, "PackBits");
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
