import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveSlidePictures } from "./slide-pictures";

const MAX = 3;
const url = (name: string) => `blob:${name}`;

test("drawable pictures are shown and nothing is reported missing", () => {
  const images = new Map([
    ["ppt/media/image1.png", url("a")],
    ["ppt/media/image2.jpeg", url("b")],
  ]);
  const result = resolveSlidePictures([{ target: "ppt/media/image1.png" }, { target: "ppt/media/image2.jpeg" }], images, MAX);
  assert.deepEqual(result.shown, [url("a"), url("b")]);
  assert.equal(result.missing, 0);
  assert.equal(result.overflow, 0);
  assert.deepEqual(result.missingFormats, []);
});

test("a picture the browser cannot draw is COUNTED, not dropped", () => {
  // 🔴 The regression this pins. A real immunology lecture stores 61 of its 71
  // pictures as TIFF; 25 of its 37 slides had every picture silently removed,
  // leaving captions floating under nothing. A slide must never look complete
  // when it is not.
  const images = new Map([["ppt/media/image1.png", url("a")]]);
  const result = resolveSlidePictures(
    [{ target: "ppt/media/image1.png" }, { target: "ppt/media/image31.tiff" }, { target: "ppt/media/image9.emf" }],
    images,
    MAX,
  );
  assert.deepEqual(result.shown, [url("a")]);
  assert.equal(result.missing, 2);
  assert.deepEqual(result.missingFormats, ["TIFF", "EMF"]);
});

test("a slide whose every picture is undrawable still says so", () => {
  const result = resolveSlidePictures([{ target: "ppt/media/a.tiff" }, { target: "ppt/media/b.tiff" }], new Map(), MAX);
  assert.deepEqual(result.shown, []);
  assert.equal(result.missing, 2);
  // One entry, not two — the label reads "(TIFF)", never "(TIFF, TIFF)".
  assert.deepEqual(result.missingFormats, ["TIFF"]);
});

test("pictures past what the column holds are counted, never truncated in silence", () => {
  const images = new Map(["a", "b", "c", "d", "e"].map((name) => [`ppt/media/${name}.png`, url(name)]));
  const result = resolveSlidePictures(
    ["a", "b", "c", "d", "e"].map((name) => ({ target: `ppt/media/${name}.png` })),
    images,
    MAX,
  );
  assert.equal(result.shown.length, MAX);
  assert.equal(result.overflow, 2);
  assert.equal(result.missing, 0);
});

test("an unresolved relationship is not reported as a missing picture", () => {
  // Nothing useful can be said about a picture with no target, so claiming one
  // is missing would be worse than staying quiet about it.
  const result = resolveSlidePictures([{ target: null }], new Map(), MAX);
  assert.equal(result.missing, 0);
  assert.deepEqual(result.missingFormats, []);
});

test("a picture with no extension is counted without inventing a format", () => {
  const result = resolveSlidePictures([{ target: "ppt/media/image7" }], new Map(), MAX);
  assert.equal(result.missing, 1);
  assert.deepEqual(result.missingFormats, []);
});

test("a picture still decoding is PENDING, not missing", () => {
  // 🔴 The two must never share a label. TIFF is decoded asynchronously now, so
  // between a slide appearing and its figure arriving there is a moment where
  // the picture has no URL yet — saying "cannot be shown" there and then
  // replacing it with the picture a moment later is worse than saying nothing.
  const result = resolveSlidePictures(
    [{ target: "ppt/media/image31.tiff" }, { target: "ppt/media/drawing.emf" }],
    new Map(),
    MAX,
    { decodable: (target) => target.endsWith(".tiff") },
  );
  assert.equal(result.pending, 1);
  assert.equal(result.missing, 1);
  assert.deepEqual(result.missingFormats, ["EMF"], "the pending TIFF must not be named as missing");
});

test("once decoded, a pending picture becomes a shown one", () => {
  const target = "ppt/media/image31.tiff";
  const decodable = (name: string) => name.endsWith(".tiff");
  const before = resolveSlidePictures([{ target }], new Map(), MAX, { decodable });
  assert.deepEqual([before.shown.length, before.pending, before.missing], [0, 1, 0]);
  const after = resolveSlidePictures([{ target }], new Map([[target, url("a")]]), MAX, { decodable });
  assert.deepEqual([after.shown.length, after.pending, after.missing], [1, 0, 0]);
});

test("with no decodable formats, nothing is ever pending", () => {
  // The default has to stay the old behaviour: callers that cannot decode
  // anything must still get the honest "cannot be shown" count.
  const result = resolveSlidePictures([{ target: "ppt/media/a.tiff" }], new Map(), MAX);
  assert.equal(result.pending, 0);
  assert.equal(result.missing, 1);
  assert.deepEqual(result.missingFormats, ["TIFF"]);
});
