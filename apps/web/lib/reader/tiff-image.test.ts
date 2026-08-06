import assert from "node:assert/strict";
import { test } from "node:test";

import { makeTiff } from "./tiff-fixture";
import { decodeTiffPixels, drawnSize, isTiff, MAX_DRAWN_EDGE } from "./tiff-image";

test("a .tif or .tiff is recognised, whatever the case", () => {
  assert.equal(isTiff("ppt/media/image31.tiff"), true);
  assert.equal(isTiff("ppt/media/IMAGE.TIF"), true);
  assert.equal(isTiff("ppt/media/image1.png"), false);
  assert.equal(isTiff("ppt/media/drawing.emf"), false);
  assert.equal(isTiff("noextension"), false);
});

test("an uncompressed RGB TIFF decodes to the pixels it was written with", () => {
  // 🔴 All 57 TIFFs in the real immunology deck are uncompressed baseline, so
  // this is the exact shape that matters.
  const bytes = makeTiff({
    width: 4,
    height: 3,
    pixel: (x, y) => [x === 0 ? 255 : 0, y === 0 ? 255 : 0, 7, 255],
  });
  const decoded = decodeTiffPixels(bytes);
  assert.ok(decoded, "expected the TIFF to decode");
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 3);
  assert.equal(decoded.rgba.length, 4 * 3 * 4);
  // Top-left pixel is red-and-green, blue 7, fully opaque.
  assert.deepEqual([...decoded.rgba.slice(0, 4)], [255, 255, 7, 255]);
  // Second pixel of the top row: x != 0 so red drops out.
  assert.deepEqual([...decoded.rgba.slice(4, 8)], [0, 255, 7, 255]);
});

test("transparency survives decoding", () => {
  // The owner's constraint: a figure with a transparent background must not
  // gain a black or white box behind it.
  const bytes = makeTiff({
    width: 2,
    height: 1,
    samples: 4,
    pixel: (x) => [10, 20, 30, x === 0 ? 0 : 255],
  });
  const decoded = decodeTiffPixels(bytes);
  assert.ok(decoded);
  assert.equal(decoded.rgba[3], 0, "first pixel should be fully transparent");
  assert.equal(decoded.rgba[7], 255, "second pixel should be fully opaque");
});

test("bytes that are not a TIFF return null instead of throwing", () => {
  // The caller has an honest placeholder for this; a throw would take the whole
  // slide view down with it.
  assert.equal(decodeTiffPixels(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
  assert.equal(decodeTiffPixels(new Uint8Array(0)), null);
  // A valid header with a truncated body must also fail safely.
  const truncated = makeTiff({ width: 8, height: 8 }).slice(0, 40);
  assert.equal(decodeTiffPixels(truncated), null);
});

test("an absurdly large image is refused rather than decoded", () => {
  // Width and height are read from the header, so a hostile file can claim any
  // size it likes. 80 megapixels is ~320 MB of RGBA.
  const bytes = makeTiff({ width: 2, height: 2 });
  const view = new DataView(bytes.buffer);
  view.setUint32(8 + 2 + 8, 40_000, true); // ImageWidth value field
  view.setUint32(8 + 2 + 12 + 8, 40_000, true); // ImageLength value field
  assert.equal(decodeTiffPixels(bytes), null);
});

test("pictures are shrunk to fit, never enlarged", () => {
  // A real deck holds 2560x1810 scans; drawing them at full size is 18 MB of
  // RGBA each and pointless inside a slide-sized frame.
  assert.deepEqual(drawnSize(2560, 1810), { width: MAX_DRAWN_EDGE, height: Math.round(1810 * (MAX_DRAWN_EDGE / 2560)) });
  assert.deepEqual(drawnSize(400, 300), { width: 400, height: 300 }, "small pictures are left alone");
  assert.deepEqual(drawnSize(100, 4000, 1000), { width: 25, height: 1000 }, "the LONG edge governs");
  // Never rounds away to nothing.
  assert.deepEqual(drawnSize(1, 4000, 100), { width: 1, height: 100 });
});
