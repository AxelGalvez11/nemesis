import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴 THE CANVAS HEADER IS THE ONE ROW IN THIS PRODUCT WITH A MEASURED EXTERNAL REFERENCE.
//
// Owner, 2026-08-20: *"make sure the canvas icons in upper header also match sizing and colour of
// chatgpt."* Measured in his own browser, on both products, the same afternoon:
//
//     ChatGPT header button   36×36, radius 8px, glyph 20×20, #0d0d0d / #8f8f8f
//     Nemesis (before)        28×28, radius 13.5px, glyph 14–15px, ≈#969696
//
// The box was 78% of the reference and the glyph 75% of it, and at 28px `rounded-lg` computes to
// half the box — so ours read as small circles where the reference is rounded squares.
//
// 🔴🔴 THIS REVERSES A DELIBERATE DECISION, AND THE REVERSAL IS THE POINT. The 2026-08-12 compact
// pass took this row to 28/32 by design judgement, and its own comment ended: "not measured against
// anything external, this row has no ChatGPT equivalent to match." A judgement made in the absence
// of a reference is exactly the kind a reference should overturn — but only ONCE it exists, which
// is why the numbers below are pinned rather than left to taste.

const SURFACE = readFileSync(new URL("./canvas-surface.tsx", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");

/** Comments stripped: this file's own notes quote every number it checks for. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const surface = code(SURFACE);
const controls = code(CONTROLS);

test("🔴 every header control is 36×36, the reference's box", () => {
  // Calibration: put either back to `h-[28px] w-[28px]` and this reddens.
  assert.match(controls, /h-\[36px\] w-\[36px\]/, "the sources/progress/options controls are not the reference size");
  assert.match(surface, /h-\[36px\] w-\[36px\]/, "the exit is not the reference size");
  assert.ok(!/h-\[28px\] w-\[28px\]/.test(controls + surface), "a 28px control is back in the header");
});

test("🔴 the glyphs are 20px, not the old 14–15", () => {
  // 🔴 PINNED IN PX, NEVER REM. `html{font-size:112.5%}` means every rem here paints 1.125× its
  // number, which is how `0.8125rem` was ever chosen and how it silently painted 14.6px.
  assert.match(controls, /size="20px"/);
  assert.ok(!/size="0\.8125rem"/.test(controls), "a rem-sized glyph is back, and it will not measure what it says");
  assert.match(surface, /height="20"[\s\S]{0,200}?width="20"/, "the exit glyph is not 20px");
});

test("🔴🔴 the radius is a rounded SQUARE, not a pill", () => {
  // At 28px `rounded-lg` resolved to 13.5px — half the box — so these were circles. The reference
  // is 8px at 36px. Pinned in px so it cannot drift with the box size again.
  assert.match(controls, /rounded-\[8px\]/);
  assert.match(surface, /rounded-\[8px\]/);
});

test("🔴 the row is tall enough to hold them", () => {
  // A 36px control inside a 32px row is clipped or forces the row to grow silently.
  assert.match(surface, /h-\[36px\] items-center/);
});

test("🔴 the colour is UNCHANGED, and that is a finding rather than an omission", () => {
  // `--ui-text-tertiary` composites to ≈#969696; the reference's secondary header glyph is #8f8f8f.
  // Within a hair, and both go to full-strength text on hover. Chasing three units of grey would be
  // a change nobody could see, and a guard that demanded a new token would be inventing work.
  assert.match(controls, /text-\(--ui-text-tertiary\)[\s\S]{0,160}?hover:text-\(--ui-text-primary\)/);
  assert.match(surface, /text-\(--ui-text-tertiary\)[\s\S]{0,200}?hover:text-\(--ui-text-primary\)/);
});
