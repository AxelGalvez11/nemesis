import assert from "node:assert/strict";
import test from "node:test";

import { MIN_OCCLUSION_SIZE } from "./study-occlusion.ts";
import {
  droppedSummary,
  jsonFrom,
  looksNormalized,
  MAX_SUGGESTED_BOXES,
  OCCLUSION_VISION_PROMPT,
  parseSuggestedBoxes,
  scaleBoxes,
} from "./occlusion-suggest.ts";

const id = (i: number) => `m${i}`;
const box = (x: number, y: number, w: number, h: number, label = "part") => ({ h, label, w, x, y });

// 🔴 THE UNITS BUG THIS MODULE EXISTS TO PREVENT. Masks are stored in natural
// image pixels; a model asked for pixels invents the image size and every box
// lands somewhere wrong. The contract is fractions in, real pixels out.
test("boxes scale against the REAL image size, never one the model reported", () => {
  const { shapes } = scaleBoxes([box(0.5, 0.25, 0.25, 0.5)], 4000, 2000, id);
  assert.deepEqual(shapes, [{ h: 1000, id: "m0", label: "part", w: 1000, x: 2000, y: 500 }]);
});

test("a response in percentages is refused, not rescaled", () => {
  // 0–100 and 0–1000 are both scales models actually return. Guessing which one
  // and dividing would confidently misplace every mask on the rare genuinely
  // tiny set of boxes; a refusal costs one retry.
  assert.equal(looksNormalized([box(12, 34, 8, 5)]), false);
  assert.equal(looksNormalized([box(120, 340, 80, 50)]), false);
  assert.equal(looksNormalized([box(0.12, 0.34, 0.08, 0.05)]), true);
});

test("a hair outside 0–1 is rounding, not a different scale", () => {
  assert.equal(looksNormalized([box(-0.01, 0, 1.01, 1)]), true);
  assert.equal(looksNormalized([box(-0.4, 0, 1, 1)]), false);
});

test("an empty or non-numeric response is not normalized", () => {
  assert.equal(looksNormalized([]), false);
  assert.equal(looksNormalized([{ h: 1, label: "", w: 1, x: Number.NaN, y: 0 }]), false);
});

test("the model's JSON is read in either shape it comes back in", () => {
  const wrapped = parseSuggestedBoxes({ boxes: [{ h: 0.2, label: "aorta", w: 0.1, x: 0.1, y: 0.1 }] });
  const bare = parseSuggestedBoxes([{ height: 0.2, label: "aorta", width: 0.1, x: 0.1, y: 0.1 }]);
  assert.equal(wrapped.length, 1);
  assert.deepEqual(bare, wrapped);
});

test("rows missing a coordinate are dropped, not defaulted to zero", () => {
  // A box defaulted to 0,0 covers the corner of the slide and asks about nothing.
  const parsed = parseSuggestedBoxes({ boxes: [{ label: "no coords" }, { h: 0.1, w: 0.1, x: 0.1, y: 0.1 }] });
  assert.equal(parsed.length, 1);
});

test("a box hanging off the edge is trimmed, not thrown away", () => {
  // Usually a good box the model nudged past the border.
  const { dropped, shapes } = scaleBoxes([box(0.9, 0.9, 0.5, 0.5)], 1000, 1000, id);
  assert.equal(shapes.length, 1);
  assert.deepEqual({ h: shapes[0]!.h, w: shapes[0]!.w, x: shapes[0]!.x, y: shapes[0]!.y }, { h: 100, w: 100, x: 900, y: 900 });
  assert.equal(dropped.offImage, 0);
});

test("a box entirely outside the image is dropped", () => {
  const { dropped, shapes } = scaleBoxes([box(1.5, 1.5, 0.2, 0.2)], 1000, 1000, id);
  assert.equal(shapes.length, 0);
  assert.equal(dropped.offImage, 1);
});

test("a mask too small to see is dropped, same floor the hand editor uses", () => {
  const tiny = MIN_OCCLUSION_SIZE / 2 / 1000;
  const { dropped, shapes } = scaleBoxes([box(0.1, 0.1, tiny, tiny)], 1000, 1000, id);
  assert.equal(shapes.length, 0);
  assert.equal(dropped.tooSmall, 1);
});

test("two masks over the same label become one", () => {
  // Otherwise the student reviews two cards with identical answers.
  const { dropped, shapes } = scaleBoxes(
    [box(0.1, 0.1, 0.2, 0.2, "aorta"), box(0.11, 0.11, 0.2, 0.2, "the aorta")],
    1000,
    1000,
    id,
  );
  assert.equal(shapes.length, 1);
  assert.equal(dropped.overlapping, 1);
});

test("boxes that merely touch are both kept", () => {
  const { shapes } = scaleBoxes([box(0.1, 0.1, 0.2, 0.2), box(0.3, 0.1, 0.2, 0.2)], 1000, 1000, id);
  assert.equal(shapes.length, 2);
});

test("the count is capped, and what was skipped is reported", () => {
  const many = Array.from({ length: MAX_SUGGESTED_BOXES + 5 }, (_, i) => box(0, i * 0.04, 0.03, 0.03));
  const { dropped, shapes } = scaleBoxes(many, 2000, 2000, id);
  assert.equal(shapes.length, MAX_SUGGESTED_BOXES);
  assert.equal(dropped.overLimit, 5);
  // Silent truncation reads as "it covered everything".
  assert.match(droppedSummary(dropped), /Skipped 5 suggested boxes/);
});

test("nothing skipped says nothing at all", () => {
  assert.equal(droppedSummary({ offImage: 0, overLimit: 0, overlapping: 0, tooSmall: 0 }), "");
});

test("every mask gets its own id", () => {
  const { shapes } = scaleBoxes([box(0, 0, 0.2, 0.2), box(0.5, 0.5, 0.2, 0.2)], 1000, 1000, id);
  assert.equal(new Set(shapes.map((s) => s.id)).size, shapes.length);
});

test("a zero-sized image yields nothing rather than dividing by it", () => {
  assert.deepEqual(scaleBoxes([box(0.1, 0.1, 0.2, 0.2)], 0, 500, id).shapes, []);
});

test("the prompt actually states the contract it depends on", () => {
  // The whole module assumes fractions. If the prompt stops saying so, this is
  // the only place that would notice.
  assert.match(OCCLUSION_VISION_PROMPT, /FRACTIONS OF THE IMAGE, BETWEEN 0 AND 1/);
  assert.match(OCCLUSION_VISION_PROMPT, /Do NOT use pixels/);
  assert.match(OCCLUSION_VISION_PROMPT, /Do NOT use percentages/);
  assert.match(OCCLUSION_VISION_PROMPT, /TOP-LEFT/);
});

// ── the seam ────────────────────────────────────────────────────────────────
// Every test above exercises one pure function. This one runs the path a REAL
// request takes, end to end: model reply → jsonFrom → parseSuggestedBoxes →
// looksNormalized → scaleBoxes → the shapes the editor renders. That chain is
// where a working set of parts still adds up to a broken feature.

test("SEAM: a realistic fenced model reply becomes masks on a real slide", () => {
  // Gemini fences its JSON and sometimes writes a line first. Both here.
  const reply = [
    "Here are the labelled parts I found:",
    "```json",
    '{"boxes":[',
    '  {"label":"mitochondrion","x":0.10,"y":0.20,"w":0.15,"h":0.06},',
    '  {"label":"nucleus","x":0.55,"y":0.42,"w":0.12,"h":0.05},',
    '  {"label":"ribosome","x":0.30,"y":0.70,"w":0.18,"h":0.07}',
    "]}",
    "```",
  ].join("\n");

  const boxes = parseSuggestedBoxes(jsonFrom(reply));
  assert.equal(boxes.length, 3);
  assert.equal(looksNormalized(boxes), true);

  // 1600×1200 is the MEASURED slide, not anything the model claimed.
  const { dropped, shapes } = scaleBoxes(boxes, 1600, 1200, (i) => `m${i}`);
  assert.equal(shapes.length, 3);
  assert.deepEqual(droppedSummary(dropped), "");
  assert.deepEqual(shapes[0], { h: 72, id: "m0", label: "mitochondrion", w: 240, x: 160, y: 240 });
  // Every mask lands inside the slide, which is the thing a units bug breaks.
  for (const shape of shapes) {
    assert.ok(shape.x >= 0 && shape.y >= 0, "mask starts inside the image");
    assert.ok(shape.x + shape.w <= 1600, "mask ends inside the width");
    assert.ok(shape.y + shape.h <= 1200, "mask ends inside the height");
  }
});

test("SEAM: a reply with no fence and no prose still parses", () => {
  const boxes = parseSuggestedBoxes(jsonFrom('{"boxes":[{"label":"aorta","x":0.1,"y":0.1,"w":0.2,"h":0.2}]}'));
  assert.equal(boxes.length, 1);
});

test("SEAM: an empty answer is a real answer, not a crash", () => {
  // Plenty of images genuinely have nothing worth hiding.
  assert.deepEqual(parseSuggestedBoxes(jsonFrom('{"boxes":[]}')), []);
});

test("SEAM: unparseable prose yields nothing rather than throwing", () => {
  assert.equal(jsonFrom("I could not find any labels in this image."), null);
  assert.deepEqual(parseSuggestedBoxes(jsonFrom("no json here")), []);
});

test("SEAM: a percentage reply is caught before it reaches scaleBoxes", () => {
  // The failure this whole module exists to stop, checked at the seam.
  const boxes = parseSuggestedBoxes(jsonFrom('{"boxes":[{"label":"x","x":10,"y":20,"w":15,"h":6}]}'));
  assert.equal(boxes.length, 1);
  assert.equal(looksNormalized(boxes), false);
});
