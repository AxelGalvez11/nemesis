import assert from "node:assert/strict";
import { test } from "node:test";

import { clampScale, formatZoom, MAX_SCALE, MIN_SCALE, rasterScale, resolveScale, zoomIn, zoomOut } from "./reader-zoom";

test("zoom steps land on the numbers a person expects", () => {
  assert.equal(zoomIn(1), 1.1);
  assert.equal(zoomIn(1.1), 1.25);
  assert.equal(zoomOut(1), 0.9);
  assert.equal(zoomOut(0.9), 0.75);
});

test("zoom stops at the ends instead of running away", () => {
  assert.equal(zoomIn(MAX_SCALE), MAX_SCALE);
  assert.equal(zoomOut(MIN_SCALE), MIN_SCALE);
  assert.equal(zoomIn(99), MAX_SCALE);
});

test("a scale between steps moves to the next real step", () => {
  assert.equal(zoomIn(1.13), 1.25);
  assert.equal(zoomOut(1.13), 1.1);
});

test("fit-width fills the container", () => {
  const scale = resolveScale({ kind: "fit-width" }, { pageWidth: 612, pageHeight: 792, containerWidth: 918, containerHeight: 400 });
  assert.equal(scale, 1.5);
});

test("fit-page respects whichever dimension runs out first", () => {
  const fit = { pageWidth: 612, pageHeight: 792, containerWidth: 918, containerHeight: 396 };
  assert.equal(resolveScale({ kind: "fit-page" }, fit), 0.5);
});

test("an unmeasured container resolves to 1 rather than infinity", () => {
  assert.equal(resolveScale({ kind: "fit-width" }, { pageWidth: 612, pageHeight: 792, containerWidth: 0, containerHeight: 0 }), 1);
  assert.equal(resolveScale({ kind: "fit-width" }, { pageWidth: 0, pageHeight: 0, containerWidth: 900, containerHeight: 600 }), 1);
});

test("fit-page falls back to fit-width when the height is unknown", () => {
  const scale = resolveScale({ kind: "fit-page" }, { pageWidth: 600, pageHeight: 800, containerWidth: 300, containerHeight: 0 });
  assert.equal(scale, 0.5);
});

test("a fixed scale is clamped, not trusted", () => {
  assert.equal(resolveScale({ kind: "fixed", scale: 100 }, { pageWidth: 1, pageHeight: 1, containerWidth: 1, containerHeight: 1 }), MAX_SCALE);
  assert.equal(clampScale(Number.NaN), 1);
});

test("formatZoom reads as a percentage", () => {
  assert.equal(formatZoom(1), "100%");
  assert.equal(formatZoom(1.25), "125%");
  assert.equal(formatZoom(0.6667), "67%");
});

test("raster scale follows the device pixel ratio for a normal page", () => {
  assert.equal(rasterScale(1, 612, 792, 2), 2);
  assert.equal(rasterScale(1, 612, 792, 1), 1);
});

test("raster scale backs off before the canvas gets too big to allocate", () => {
  // 612x792 at 6x zoom on a 3x display would be ~78M pixels — far past what a
  // browser will hand back, and it fails by returning a BLANK canvas.
  const scale = rasterScale(6, 612, 792, 3);
  assert.ok(scale < 6 * 3, "expected the request to be reduced");
  assert.ok(612 * scale * (792 * scale) <= 8_000_001, "expected the canvas to fit the budget");
});
