import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";


// ── The frame fits the drawing, and the pipeline stops talking to the learner ─────────────────

test("🔴🔴 the emitted viewBox is refitted to what was actually drawn", () => {
  // 🔴 TWO REPORTED DEFECTS, ONE CAUSE. Owner, 2026-08-20: "ethanol did not render the 'H' in
  // '-OH'" and "why are the figures unneccesarily big?"
  //
  // The library computes its viewBox from ATOM COORDINATES and then draws terminal labels anchored
  // OUTSIDE the last atom. Read off the live page: viewBox x started at 62.99 while the "HO" label
  // ended at 77.67, so the H hung off the left edge and was clipped to a sliver. The same mismatch
  // leaves dead space elsewhere, which is the panel that reads as too big.
  //
  // Calibration: delete the fitViewBoxToInk call and this reddens.
  const source = readFileSync(new URL("./chemical-structure.tsx", import.meta.url), "utf8");
  assert.match(source, /fitViewBoxToInk\(element\);/, "the viewBox is no longer refitted after the draw");
  assert.match(source, /element\.getBBox\(\)/, "the fit is not derived from what the browser laid out");
  assert.match(source, /if \(!\(ink\.width > 0\) \|\| !\(ink\.height > 0\)\) return;/, "an empty box would blank a good drawing");
});

test("🔴 the pipeline's own words are not printed under a molecule", () => {
  // "not resolved: this notation was asserted, not looked up" is a sentence for whoever built the
  // pipeline, printed under a drawing for someone learning chemistry.
  const source = readFileSync(new URL("./chemical-structure.tsx", import.meta.url), "utf8");
  const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(!/>not resolved: this notation was asserted/.test(code), "the pipeline is talking to the learner again");
  // 🔴 BUT IT IS NOT SILENT. Silence is the one wrong answer: a model-written structure and a
  // looked-up one look identical, and only one can be checked. It rides on hover now.
  assert.match(code, /title=\{visual\.resolvedFrom \? undefined :/, "an asserted structure no longer discloses anything");
  // ...and a LOOKED-UP one still says so in the open, because that is the stronger claim.
  assert.match(code, /visual\.resolvedFrom\.provider/);
});
