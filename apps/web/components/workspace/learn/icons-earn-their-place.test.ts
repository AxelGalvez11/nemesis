import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴 OWNER RULING, 2026-08-30: "Why are there so many icons? ... they should only show up when
// they are actually needed." — and, hours later, the second half of the same instinct: *"remove
// this entire panel … remove the 'progress' map since the course map is pretty much the same
// thing."* This file pins the canvas header's side of both rulings; the sidebar's side is pinned
// in lib/workspace/sidebar-nav.test.ts. The row is now AT MOST two gated glyphs — Sources &
// outputs, and the course map — and a brand-new canvas shows none at all.

const HEADER = readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");

test("🔴 Sources renders only when the panel has something to say", () => {
  assert.match(
    HEADER,
    /\{\(canvas\.sources\.length > 0 \|\| \(canvas\.outputs \?\? \[\]\)\.length > 0 \|\| modelKnowledge\) && \(/,
    "the Sources glyph is unconditional again — a fresh canvas is back to a full toolbar",
  );
});

test("🔴 the map still appears only where there is something to map — and it is the ONLY map", () => {
  // The owner's 2026-08-24 gate, kept; his 2026-08-30 merge, enforced. One `planTitle` gate for
  // one control. A second gate reappearing is `MinimapControl` ("Progress") growing back.
  const gates = HEADER.match(/minimap\.planTitle !== null/g) ?? [];
  assert.equal(gates.length, 1, "the corner holds a second course panel again");
  assert.ok(!/<MinimapControl/.test(HEADER), "Progress is mounted again");
});

test("🔴🔴 there is NO unconditional control left — no `⋯`, no menu, nothing on a bare canvas", () => {
  // Owner, 2026-08-30, on the open panel: *"remove this entire panel."* Its three rows died with
  // their features (teaching style, read-aloud autoplay, the view switch); the tombstone in
  // canvas-controls.tsx says where each went. A fresh canvas shows a bare title.
  assert.ok(!/<OptionsMenu/.test(HEADER), "the `⋯` menu is mounted again");
  assert.ok(!/export function OptionsMenu/.test(CONTROLS), "the options menu came back to the controls file");
  assert.ok(!/"ellipsis"/.test(CONTROLS), "an ellipsis glyph is back in the controls file");
});

test("🔴 the map keeps the way back OUT of a narrowed focus", () => {
  // Progress carried the only widening row; the map absorbed it. Cutting this strands a learner
  // narrowed for ever — see course-map.tsx's `onWhole` prop comment for the full account.
  const map = readFileSync(new URL("./course-map.tsx", import.meta.url), "utf8");
  assert.match(map, /Whole course/, "the Whole course row is gone from the map");
  assert.match(map, /onWhole: \(\) => void/, "the map lost its widening callback");
  const canvas = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /onClearCourseScope: \(\) => policy\.setFocus\(WHOLE_CANVAS\)/, "widening no longer reaches setFocus");
});
