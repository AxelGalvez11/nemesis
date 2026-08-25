// Every kind the model may ask for has something that draws it.
//
// 🔴🔴🔴 THIS IS THE MISSING HALF OF `visuals-are-told.test.ts`, AND `figure` FELL THROUGH THE GAP
// BETWEEN THEM. That file guards the PROMPT side: is each kind named to the model, and is its shape
// stated? Both were true for `figure`. Nothing guarded the RENDER side, and `SemanticVisual` — the
// component every REPLY visual goes through — had no `figure` branch at all.
//
// So a retrieved picture fell past all fifteen tests and produced the wrapper with no child.
// Measured on production 2026-08-25: `<figure class="my-4 …">` with `innerHTML: ""`, 38px tall, in
// the middle of a meiosis answer, and zero `<img>` anywhere on the page. `ReferenceFigure` existed
// and worked the whole time — its only caller was `canvas-document.tsx`, the DOCUMENT lane.
//
// The full chain for one picture is: named to the model → shape stated → model asks (or code fills
// in) → marker parsed → asset resolved → RENDERED. Five of those six had a guard.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const kindsIn = (file: string): readonly string[] => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/kind: "([a-z]+)"/g)].map((match) => match[1]!))].sort();
};

/** Read from the renderers' own type files, never a list here — a copy would drift. */
const RENDERABLE = [
  ...new Set([...kindsIn("../../../lib/learn/canvas-visual.ts"), ...kindsIn("../../../lib/learn/subject-visuals.ts")]),
].sort();

const SEMANTIC = readFileSync(new URL("./semantic-visual.tsx", import.meta.url), "utf8");

test("🔴 the kinds are read from the renderers, not from a list in this file", () => {
  assert.ok(RENDERABLE.length >= 15, `only ${RENDERABLE.length} kinds found — the source files moved or changed shape`);
  for (const expected of ["figure", "anatomy", "circuit", "score", "surface"]) {
    assert.ok(RENDERABLE.includes(expected), `${expected} is no longer discoverable from the renderer files`);
  }
});

test("🔴🔴🔴 every kind the model may ask for is actually drawn by SemanticVisual", () => {
  // Calibration: delete the `figure` branch and this reddens naming `figure` — which is exactly the
  // production defect it was written for.
  const undrawn = RENDERABLE.filter((kind) => !new RegExp(`visual\\.kind === "${kind}"`).test(SEMANTIC));
  assert.deepEqual(
    undrawn,
    [],
    "these kinds reach SemanticVisual and nothing renders them, so the learner gets an EMPTY FRAMED BOX " +
      "where the drawing should be — add a branch for each in semantic-visual.tsx",
  );
});

test("🔴🔴 a figure with no asset renders NOTHING, not an empty frame", () => {
  // The ordinary refusal every other visual already degrades to: the prose stands on its own.
  // A bordered box around an absence is strictly worse than silence, and is what the bug looked
  // like from the learner's chair.
  const branch = SEMANTIC.slice(SEMANTIC.indexOf('if (visual.kind === "figure")'), SEMANTIC.indexOf("return (", SEMANTIC.indexOf('if (visual.kind === "figure")')));
  assert.ok(branch.length > 0, "the figure branch is gone — this guard is pointed at nothing");
  assert.match(branch, /if \(!visual\.asset\) return null;/, "a figure with no picture renders a frame again");
  assert.match(branch, /<ReferenceFigure asset=\{visual\.asset\}/, "the figure branch stopped mounting the real renderer");
});

test("🔴 the figure branch returns BEFORE the shared wrapper", () => {
  // `ReferenceFigure` brings its own <figure> and its own credit line. Nesting one inside the
  // other frames the frame, and a <figure> inside a <figure> is not what either of them means.
  // 🔴 ANCHORED ON THE REAL JSX, NOT ON THE STRING "<figure". The first draft used `indexOf`, which
  // matched a `<figure>` written inside the comment ABOVE the branch and reported a nesting bug that
  // did not exist. A guard that fires on prose is a guard nobody will trust.
  const figureAt = SEMANTIC.indexOf('if (visual.kind === "figure")');
  const wrapperAt = SEMANTIC.search(/<figure\s*\n\s*className=/);
  assert.ok(figureAt > 0 && wrapperAt > 0, "one of the two anchors is gone");
  assert.ok(figureAt < wrapperAt, "the figure branch moved inside the shared wrapper, so figures are now nested");
});

console.log("every-kind-renders.test.ts OK");
