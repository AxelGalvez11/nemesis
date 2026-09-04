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

import { WITHDRAWN_VISUAL_KINDS } from "@/lib/learn/canvas-visual";

const kindsIn = (file: string): readonly string[] => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/kind: "([a-z]+)"/g)].map((match) => match[1]!))].sort();
};

/** Read from the renderers' own type files, never a list here — a copy would drift. */
const ALL_KINDS = [
  ...new Set([...kindsIn("../../../lib/learn/canvas-visual.ts"), ...kindsIn("../../../lib/learn/subject-visuals.ts")]),
].sort();

/**
 * Kinds that still parse but are deliberately never offered and never drawn.
 *
 * 🔴 KEPT IN STEP WITH `visuals-are-told.test.ts`'s own WITHDRAWN, and the last test in this file
 * asserts the two agree — a kind withdrawn from the prompt but still drawn here, or the reverse, is
 * the same class of half-change this whole file exists to catch.
 *
 * 🔴🔴 THE INTERACTIVE 3D PAIR, WITHDRAWN 2026-09-04 (owner: *"let's just skip the interactive
 * visual, honestly it's mostly fluff … what matters most is that we have visuals, bottom line"*).
 * A stored canvas may still hold one, so the TYPE keeps them; nothing draws them.
 */
const WITHDRAWN = new Set(WITHDRAWN_VISUAL_KINDS);

const RENDERABLE = ALL_KINDS.filter((kind) => !WITHDRAWN.has(kind));

const SEMANTIC = readFileSync(new URL("./semantic-visual.tsx", import.meta.url), "utf8");

test("🔴 the kinds are read from the renderers, not from a list in this file", () => {
  assert.ok(ALL_KINDS.length >= 15, `only ${ALL_KINDS.length} kinds found — the source files moved or changed shape`);
  // 🔴 "anatomy" WAS IN THIS SAMPLE AND IS RETIRED (2026-09-01). It is not replaced here by another
  // name: the sample exists to prove the READER still works, and `figure` is now the shape anatomy
  // travels as, which this list already checks.
  for (const expected of ["figure", "circuit", "score", "surface"]) {
    assert.ok(ALL_KINDS.includes(expected), `${expected} is no longer discoverable from the renderer files`);
  }
});

test("🔴🔴🔴 every kind the model may ask for is actually drawn by SemanticVisual", () => {
  // Calibration: delete the `figure` branch and this reddens naming `figure` — which is exactly the
  // production defect it was written for.
  // 🔴 `case "kind"` OR THE `figure` EARLY RETURN. The sixteen sibling ternaries became a `switch`
  // in `drawingFor` on 2026-09-04, so that the body is chosen BEFORE the frame is drawn and a kind
  // nothing claims renders no frame at all. `figure` is still handled above that switch, because
  // `ReferenceFigure` brings its own <figure>.
  const undrawn = RENDERABLE.filter(
    (kind) => !new RegExp(`case "${kind}":`).test(SEMANTIC) && !new RegExp(`visual\\.kind === "${kind}"`).test(SEMANTIC),
  );
  assert.deepEqual(
    undrawn,
    [],
    "these kinds reach SemanticVisual and nothing renders them, so the learner gets NOTHING where the " +
      "drawing should be — add a case for each in drawingFor in semantic-visual.tsx",
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

test("🔴🔴 no kind can ever draw a frame with nothing in it", () => {
  // 🔴 THE STRUCTURAL FIX FOR THE 2026-09-04 DEFECT, AND IT IS NOT THE SAME AS "every kind has a
  // branch". `macromolecule` HAD a branch and still drew nothing: its viewer returns null when
  // Mol* cannot load. Any renderer may legitimately decline, so the rule has to live on the
  // WRAPPER — no body, no frame — rather than on the completeness of the branch list.
  //
  // Calibration: move `const body = drawingFor(visual)` back inside the <figure> and this reddens.
  const code = SEMANTIC.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    code,
    /const body = drawingFor\(visual\);\s*if \(!body\) return null;/,
    "SemanticVisual draws its frame before knowing whether there is anything to put in it. That is " +
      "what put an empty 38px bordered box in the middle of a production answer on 2026-09-04, with " +
      "the prose either side of it describing the picture that was not there.",
  );
  for (const kind of WITHDRAWN) {
    assert.ok(!new RegExp(`case "${kind}":`).test(code), `"${kind}" was withdrawn but is drawn again`);
  }
});

test("🔴 the withdrawn set comes from the source, not from a copy in a test", () => {
  // Two guards, one decision. Both read `WITHDRAWN_VISUAL_KINDS` from `canvas-visual.ts`, which is
  // also what the validator refuses on — so the prompt half, the render half and the parse half
  // cannot disagree about which kinds are gone.
  const told = readFileSync(new URL("../../../lib/learn/visuals-are-told.test.ts", import.meta.url), "utf8");
  assert.match(told, /WITHDRAWN_VISUAL_KINDS/, "the prompt-side guard restated the list instead of importing it");
  assert.ok(WITHDRAWN.size > 0, "nothing is withdrawn — this guard is pointed at an empty set");
});

console.log("every-kind-renders.test.ts OK");
