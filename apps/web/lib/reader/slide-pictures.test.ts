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
