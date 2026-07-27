import assert from "node:assert/strict";
import { test } from "node:test";

import { imageSize } from "./image-dimensions";

/** A minimal but real PNG header: signature, then an IHDR carrying the size. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG with one segment ahead of the frame marker, so the walk is exercised. */
function jpeg(width: number, height: number, marker = 0xc0): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  bytes.push(0xff, 0xe0, 0x00, 0x06, 1, 2, 3, 4); // APP0, length 6
  bytes.push(0xff, marker, 0x00, 0x11, 0x08);
  bytes.push((height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff);
  return new Uint8Array(bytes);
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"
  bytes[6] = width & 0xff;
  bytes[7] = (width >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >> 8) & 0xff;
  return bytes;
}

test("a PNG states its size in the IHDR", () => {
  assert.deepEqual(imageSize(png(1408, 523)), { height: 523, width: 1408 });
});

test("a JPEG's size comes from its frame header, not the first segment", () => {
  assert.deepEqual(imageSize(jpeg(1017, 788)), { height: 788, width: 1017 });
});

test("a progressive JPEG is read too", () => {
  assert.deepEqual(imageSize(jpeg(640, 480, 0xc2)), { height: 480, width: 640 });
});

test("a Huffman table is not mistaken for a frame", () => {
  // DHT (0xC4) sits in the same numeric range as the frame markers. Reading it as
  // one would report a wildly wrong size for a perfectly ordinary photo.
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc4, 0x00, 0x08, 1, 2, 3, 4, 5, 6,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58,
  ]);
  assert.deepEqual(imageSize(bytes), { height: 300, width: 600 });
});

test("a GIF states its size in the screen descriptor", () => {
  assert.deepEqual(imageSize(gif(691, 528)), { height: 528, width: 691 });
});

test("an unrecognised or truncated file reports unknown, never zero", () => {
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
  assert.equal(imageSize(new Uint8Array(0)), null);
  assert.equal(imageSize(png(0, 0)), null, "a zero dimension is not a size");
});

test("a metafile is not an image here", () => {
  assert.equal(imageSize(new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x6c, 0x00])), null);
});
