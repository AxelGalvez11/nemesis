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
  // 🔴 THE `×` WAS THE OTHER HALF OF EVERY PAIR IN THIS FILE, and it was removed on 2026-08-31
  // (owner: *"since chat is default, the '×' should be gone from the chats"*). Each assertion
  // against `surface` measured that one control; the `controls` half still measures the header
  // row the reference was taken from, and the 28px floor still covers both files.
  assert.match(controls, /h-\[36px\] w-\[36px\]/, "the sources/progress/options controls are not the reference size");
  assert.ok(!/h-\[28px\] w-\[28px\]/.test(controls + surface), "a 28px control is back in the header");
});

test("🔴 the glyphs are 20px, not the old 14–15", () => {
  // 🔴 PINNED IN PX, NEVER REM. `html{font-size:112.5%}` means every rem here paints 1.125× its
  // number, which is how `0.8125rem` was ever chosen and how it silently painted 14.6px.
  assert.match(controls, /size="20px"/);
  assert.ok(!/size="0\.8125rem"/.test(controls), "a rem-sized glyph is back, and it will not measure what it says");
});

test("🔴🔴 the radius is a rounded SQUARE, not a pill", () => {
  // At 28px `rounded-lg` resolved to 13.5px — half the box — so these were circles. The reference
  // is 8px at 36px. Pinned in px so it cannot drift with the box size again.
  assert.match(controls, /rounded-\[8px\]/);
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
});

// ── every panel on this row shares one right edge ────────────────────────────
//
// Owner, 2026-08-30: *"Can you make sure source panel and map are both right side aligned?"*
//
// 🔴🔴 THEY DID NOT, AND THE CAUSE WAS INVISIBLE IN EITHER FILE ON ITS OWN. `PANEL` is `absolute`,
// so its inset resolves against the nearest POSITIONED ancestor. Each control's wrapper was
// `relative`, which made every control its own ancestor — so a panel's right edge was its own
// BUTTON's right edge, and the buttons sit at different places in the row. Measured at 1470px on a
// canvas with a course: Sources' button ends at 1338 and the map's at 1418, so the two boxes opened
// **80px apart** and jumped sideways as you moved between them.
//
// Nothing about that is visible in `canvas-controls.tsx`, where the panels look identical, or in
// `canvas-header.tsx`, where the row looks fine. It is a fact about which element is positioned,
// which is why it is asserted here rather than left to be noticed.

test("🔴🔴 the glyph row is the positioning context, so no panel hangs off its own button", () => {
  const controls = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("./course-map.tsx", import.meta.url), "utf8");

  // The row, right-anchored with the header, is the one positioned ancestor.
  assert.match(header, /<div className="relative flex h-full shrink-0 items-center gap-1">/, "the glyph row is not a positioning context");

  // 🔴 AND NO CONTROL MAY BE ONE. This is the half that actually broke; calibration: put `relative`
  // back on any wrapper and that control's panel goes back to tracking its own glyph.
  for (const [name, src] of [["canvas-controls", controls], ["course-map", map]] as const) {
    const wrappers = [...src.matchAll(/ref=\{holder\}/g)];
    assert.ok(wrappers.length > 0, `${name} has no dismissable wrapper to check`);
    assert.ok(
      !/className="[^"]*\brelative\b[^"]*"[^>]*ref=\{holder\}/.test(src),
      `${name} makes a control its own positioning context again, so its panel will track its glyph`,
    );
  }

  // 🔴 THE BADGE HAD TO MOVE WITH IT. Two glyphs carry a 5px dot at their own top-right; it used to
  // land correctly only because the wrapper was `relative` AND exactly button-sized. Without this
  // the dots fly to the corner of the whole row.
  assert.match(controls, /export const CONTROL =[\s\S]{0,600}?"pointer-events-auto relative flex/, "the badge lost its anchor");

  // 🔴 `right-0`, NOT A NEGATIVE INSET. Against a 36px button `-right-2` let a panel overhang that
  // button's padding; against the row it pushed every box 9px past the header, to 3px from the edge
  // of the window (measured 1467 of 1470).
  assert.match(controls, /export const PANEL =\s*\n\s*"absolute right-0 top-full/, "the panels no longer align with the row's edge");
});
