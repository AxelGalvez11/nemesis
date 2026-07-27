import assert from "node:assert/strict";
import { test } from "node:test";
import { unzlibSync } from "fflate";

import { downscaleRgb, emfEmbeddedImage, encodePng, findSoleDib, isEmf, MAX_PIXELS } from "./emf-bitmap";
import { imageSize } from "./image-dimensions";

const EMR_HEADER = 1;
const EMR_POLYGON = 3;
const EMR_STRETCHDIBITS = 81;
const EMR_EOF = 14;

function u32(view: DataView, at: number, value: number) {
  view.setUint32(at, value, true);
}

/** A believable EMF header record: the type, its own length, and the " EMF" signature
 *  a reader checks before trusting any offset. */
function headerRecord(): Uint8Array {
  const bytes = new Uint8Array(88);
  const view = new DataView(bytes.buffer);
  u32(view, 0, EMR_HEADER);
  u32(view, 4, 88);
  u32(view, 40, 0x464d4520);
  return bytes;
}

/** A BITMAPINFOHEADER plus pixels, as EMR_STRETCHDIBITS stores them. */
function dibRecord(options: {
  width: number;
  height: number;
  bitCount: number;
  pixels: Uint8Array;
  compression?: number;
  topDown?: boolean;
}): Uint8Array {
  const { bitCount, compression = 0, height, pixels, topDown = false, width } = options;
  const headerSize = 80; // record fields up to cyDest
  const bmiSize = 40;
  const bytes = new Uint8Array(headerSize + bmiSize + pixels.length);
  const view = new DataView(bytes.buffer);
  u32(view, 0, EMR_STRETCHDIBITS);
  u32(view, 4, bytes.length);
  u32(view, 48, headerSize); // offBmiSrc
  u32(view, 52, bmiSize); // cbBmiSrc
  u32(view, 56, headerSize + bmiSize); // offBitsSrc
  u32(view, 60, pixels.length); // cbBitsSrc

  const bmi = headerSize;
  u32(view, bmi, 40);
  view.setInt32(bmi + 4, width, true);
  view.setInt32(bmi + 8, topDown ? -height : height, true);
  view.setUint16(bmi + 12, 1, true);
  view.setUint16(bmi + 14, bitCount, true);
  u32(view, bmi + 16, compression);
  bytes.set(pixels, headerSize + bmiSize);
  return bytes;
}

function eofRecord(): Uint8Array {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  u32(view, 0, EMR_EOF);
  u32(view, 4, 20);
  return bytes;
}

function drawingRecord(): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  u32(view, 0, EMR_POLYGON);
  u32(view, 4, 32);
  return bytes;
}

function emf(...records: Uint8Array[]): Uint8Array {
  const total = records.reduce((sum, record) => sum + record.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const record of records) {
    bytes.set(record, at);
    at += record.length;
  }
  return bytes;
}

/** 32-bit DIB pixels are stored blue, green, red, unused — bottom row first. */
function bgraRows(rows: Array<Array<[number, number, number]>>): Uint8Array {
  const height = rows.length;
  const width = rows[0]!.length;
  const out = new Uint8Array(width * height * 4);
  rows.forEach((row, y) => {
    // Bottom-up storage: the LAST row of the picture is written first.
    const target = height - 1 - y;
    row.forEach(([r, g, b], x) => {
      const at = (target * width + x) * 4;
      out[at] = b;
      out[at + 1] = g;
      out[at + 2] = r;
      out[at + 3] = 0; // Windows leaves this zero; honouring it as alpha loses the picture.
    });
  });
  return out;
}

/** Pull the raw RGB back out of a PNG this module wrote. */
function decodePng(png: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
  const size = imageSize(png);
  assert.ok(size, "the PNG must state its own size");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let idat: Uint8Array | null = null;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!);
    if (type === "IDAT") idat = png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  assert.ok(idat, "a PNG with no pixel data is not a picture");
  const raw = unzlibSync(idat);
  const stride = size.width * 3;
  const rgb = new Uint8Array(size.width * size.height * 3);
  for (let y = 0; y < size.height; y += 1) {
    assert.equal(raw[y * (stride + 1)], 0, "every scanline must carry its filter byte");
    rgb.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
  }
  return { height: size.height, rgb, width: size.width };
}

// ── Recognising the shape ────────────────────────────────────────────────────

test("a file without the EMF signature is not opened at all", () => {
  assert.equal(isEmf(new Uint8Array(200)), false);
  assert.equal(emfEmbeddedImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
});

test("a metafile that only blits a bitmap is recognised", () => {
  const pixels = bgraRows([[[10, 20, 30], [40, 50, 60]], [[70, 80, 90], [100, 110, 120]]]);
  const file = emf(headerRecord(), dibRecord({ bitCount: 32, height: 2, pixels, width: 2 }), eofRecord());
  assert.ok(findSoleDib(file));
});

test("a metafile that draws is left alone rather than half-read", () => {
  const pixels = bgraRows([[[1, 2, 3]]]);
  const file = emf(
    headerRecord(),
    drawingRecord(),
    dibRecord({ bitCount: 32, height: 1, pixels, width: 1 }),
    eofRecord(),
  );
  assert.equal(findSoleDib(file), null);
  assert.equal(emfEmbeddedImage(file), null, "reporting it unreadable beats inventing half a figure");
});

test("a metafile holding two pictures is not reduced to one of them", () => {
  const pixels = bgraRows([[[1, 2, 3]]]);
  const file = emf(
    headerRecord(),
    dibRecord({ bitCount: 32, height: 1, pixels, width: 1 }),
    dibRecord({ bitCount: 32, height: 1, pixels, width: 1 }),
    eofRecord(),
  );
  assert.equal(findSoleDib(file), null);
});

test("a truncated record chain returns nothing instead of reading past the end", () => {
  const pixels = bgraRows([[[1, 2, 3]]]);
  const file = emf(headerRecord(), dibRecord({ bitCount: 32, height: 1, pixels, width: 1 }));
  assert.equal(emfEmbeddedImage(file.subarray(0, file.length - 20)), null);
});

// ── The picture comes back the right way up and the right colour ─────────────

test("colours survive: a DIB stores blue first, a PNG stores red first", () => {
  const pixels = bgraRows([[[200, 100, 50], [1, 2, 3]]]);
  const file = emf(headerRecord(), dibRecord({ bitCount: 32, height: 1, pixels, width: 2 }), eofRecord());
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  const decoded = decodePng(image.bytes);
  assert.deepEqual([...decoded.rgb.subarray(0, 6)], [200, 100, 50, 1, 2, 3]);
});

test("the picture is not upside down — a bottom-up DIB is flipped", () => {
  const top: [number, number, number] = [255, 0, 0];
  const bottom: [number, number, number] = [0, 0, 255];
  const pixels = bgraRows([[top], [bottom]]);
  const file = emf(headerRecord(), dibRecord({ bitCount: 32, height: 2, pixels, width: 1 }), eofRecord());
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  const decoded = decodePng(image.bytes);
  assert.deepEqual([...decoded.rgb.subarray(0, 3)], top, "the first row out must be the top of the picture");
});

test("a top-down DIB is not flipped a second time", () => {
  const width = 1;
  const pixels = new Uint8Array(8);
  pixels.set([0, 0, 255, 0], 0); // first stored row = top row, red
  pixels.set([255, 0, 0, 0], 4); // second = bottom, blue
  const file = emf(
    headerRecord(),
    dibRecord({ bitCount: 32, height: 2, pixels, topDown: true, width }),
    eofRecord(),
  );
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes).rgb.subarray(0, 3)], [255, 0, 0]);
});

test("the unused fourth byte is not treated as transparency", () => {
  // Windows writes zero there. Reading it as alpha renders a fully invisible figure —
  // which looks exactly like a working import right up until a student opens the note.
  const pixels = bgraRows([[[12, 34, 56]]]);
  const file = emf(headerRecord(), dibRecord({ bitCount: 32, height: 1, pixels, width: 1 }), eofRecord());
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  assert.deepEqual([...decodePng(image.bytes).rgb.subarray(0, 3)], [12, 34, 56]);
});

test("24-bit rows padded to a 4-byte boundary are read at the right offsets", () => {
  // Three pixels of 24-bit colour is 9 bytes, which DIB pads to 12. Ignoring the pad
  // shifts every row after the first and shears the picture.
  const pixels = new Uint8Array(12 * 2);
  pixels.set([3, 2, 1, 6, 5, 4, 9, 8, 7], 0); // bottom row (BGR)
  pixels.set([30, 20, 10, 60, 50, 40, 90, 80, 70], 12); // top row
  const file = emf(headerRecord(), dibRecord({ bitCount: 24, height: 2, pixels, width: 3 }), eofRecord());
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  const decoded = decodePng(image.bytes);
  assert.deepEqual([...decoded.rgb.subarray(0, 9)], [10, 20, 30, 40, 50, 60, 70, 80, 90]);
});

test("a bitmap already stored as PNG is handed straight back", () => {
  const inner = encodePng(new Uint8Array([1, 2, 3]), 1, 1);
  const file = emf(
    headerRecord(),
    dibRecord({ bitCount: 32, compression: 5, height: 1, pixels: inner, width: 1 }),
    eofRecord(),
  );
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  assert.equal(image.mime, "image/png");
  assert.deepEqual([...image.bytes], [...inner], "re-encoding a PNG only loses time and quality");
});

test("a compression this cannot decode is reported unreadable, not guessed at", () => {
  const pixels = new Uint8Array(64);
  const file = emf(
    headerRecord(),
    dibRecord({ bitCount: 8, compression: 1, height: 2, pixels, width: 2 }),
    eofRecord(),
  );
  assert.equal(emfEmbeddedImage(file), null);
});

// ── Size ─────────────────────────────────────────────────────────────────────

test("an oversized screenshot is scaled down before it is sent anywhere", () => {
  const width = 2400;
  const height = 1200;
  const pixels = new Uint8Array(width * height * 4);
  const file = emf(headerRecord(), dibRecord({ bitCount: 32, height, pixels, width }), eofRecord());
  const image = emfEmbeddedImage(file);
  assert.ok(image);
  assert.ok(image.width * image.height <= MAX_PIXELS, `${image.width}x${image.height} is still over the ceiling`);
  assert.ok(image.width > 1000, "scaled down, not thrown away");
});

test("downscaling averages rather than dropping pixels", () => {
  // A one-pixel-wide line survives averaging as a grey trace; nearest-neighbour
  // sampling would delete it outright, and thin plot lines are the whole figure.
  const rgb = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const out = downscaleRgb(rgb, 2, 2, 2);
  assert.equal(out.width, 1);
  assert.equal(out.height, 1);
  assert.deepEqual([...out.rgb], [191, 191, 191]);
});

test("a scale factor of one leaves the pixels untouched", () => {
  const rgb = new Uint8Array([1, 2, 3]);
  assert.equal(downscaleRgb(rgb, 1, 1, 1).rgb, rgb);
});

// ── The PNG this writes is a real PNG ────────────────────────────────────────

test("the encoder writes a file other readers can parse", () => {
  const png = encodePng(new Uint8Array([10, 20, 30, 40, 50, 60]), 2, 1);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(imageSize(png), { height: 1, width: 2 });
  assert.deepEqual([...decodePng(png).rgb], [10, 20, 30, 40, 50, 60]);
});
