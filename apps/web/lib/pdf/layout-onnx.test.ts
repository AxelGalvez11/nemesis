/**
 * The layout model's contract, tested without the 171 MB model.
 *
 * 🔴 THE TEST THAT MATTERS IS THE TRANSPOSED-BOX GUARD. `orig_target_sizes` is
 * (width, height) for this export, not the (height, width) HuggingFace's
 * reference RT-DETR post-processing documents. Getting it wrong throws nothing
 * and looks fine — right labels, high scores, plausible rectangles — and only
 * shows up as coordinates that exceed the page. A citation that points at the
 * wrong part of a page is exactly what the coverage contract exists to prevent,
 * so the check has to be a hard failure rather than a clamp.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { boxToRect, LAYOUT_LABELS, readRegions, toChwUint8 } from "./layout-onnx";

/** Shape the three output tensors the way the graph returns them. */
function outputs(rows: { label: number; score: number; box: number[] }[]) {
  return {
    boxes: { data: rows.flatMap((r) => r.box) },
    labels: { data: rows.map((r) => r.label) },
    scores: { data: rows.map((r) => r.score) },
  };
}

test("detections above the threshold become labelled regions", () => {
  const regions = readRegions(
    outputs([
      { box: [10, 20, 500, 400], label: 8, score: 0.98 },   // table
      { box: [10, 5, 200, 18], label: 5, score: 0.9 },      // page_header
      { box: [0, 0, 10, 10], label: 9, score: 0.1 },        // below threshold
    ]),
    600, 800,
  );
  assert.equal(regions.length, 2);
  assert.equal(regions[0]!.label, "table");
  assert.equal(regions[1]!.label, "page_header");
});

test("regions come back strongest first", () => {
  const regions = readRegions(
    outputs([
      { box: [0, 0, 10, 10], label: 9, score: 0.6 },
      { box: [0, 0, 10, 10], label: 8, score: 0.95 },
    ]),
    600, 800,
  );
  assert.deepEqual(regions.map((r) => r.score), [0.95, 0.6]);
});

test("🔴 boxes that fall outside the page are a hard error, not a clamp", () => {
  // Exactly the shape of the real bug: a 600x800 page whose boxes run to y=1100
  // because width and height were supplied the other way round. Clamping would
  // hide it and every locator on the page would be quietly wrong.
  assert.throws(
    () => readRegions(outputs([{ box: [10, 20, 500, 1100], label: 8, score: 0.9 }]), 600, 800),
    /orig_target_sizes is \(width, height\)/,
  );
});

test("a box a rounding error over the edge is tolerated, not thrown on", () => {
  const regions = readRegions(outputs([{ box: [0, 0, 602, 801], label: 8, score: 0.9 }]), 600, 800);
  assert.equal(regions.length, 1);
  assert.deepEqual(regions[0]!.box, [0, 0, 600, 800], "clipped to the page");
});

test("an unknown label id is dropped rather than guessed at", () => {
  const regions = readRegions(outputs([{ box: [0, 0, 10, 10], label: 99, score: 0.9 }]), 600, 800);
  assert.equal(regions.length, 0);
  assert.equal(LAYOUT_LABELS.length, 17, "the label list must match the model's config.json");
});

test("non-finite geometry is skipped instead of poisoning a rect", () => {
  const regions = readRegions(outputs([{ box: [0, 0, Number.NaN, 10], label: 8, score: 0.9 }]), 600, 800);
  assert.equal(regions.length, 0);
});

// ── preprocessing ──────────────────────────────────────────────────────────

test("the tensor is channel-first uint8, which is what the graph accepts", () => {
  // 2x2 image, RGB interleaved.
  const rgb = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const chw = toChwUint8(rgb, 2);
  assert.ok(chw instanceof Uint8Array, "float32 is rejected by the graph outright");
  assert.deepEqual([...chw.slice(0, 4)], [1, 4, 7, 10], "R plane");
  assert.deepEqual([...chw.slice(4, 8)], [2, 5, 8, 11], "G plane");
  assert.deepEqual([...chw.slice(8, 12)], [3, 6, 9, 12], "B plane");
});

// ── rects ──────────────────────────────────────────────────────────────────

test("a pixel box becomes a unit-relative rect", () => {
  const rect = boxToRect([100, 200, 300, 600], 400, 800);
  assert.deepEqual(rect, { height: 0.5, width: 0.5, x: 0.25, y: 0.25 });
});

test("a degenerate box yields no rect at all", () => {
  assert.equal(boxToRect([100, 200, 100, 600], 400, 800), undefined);
  assert.equal(boxToRect([0, 0, 10, 10], 0, 800), undefined);
});
