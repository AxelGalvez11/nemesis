// Where the character stands relative to the composer.
//
// 🔴 THIS EXISTS BECAUSE THE ANSWER USED TO BE UNCHECKABLE. The placement was arithmetic inside
// a layout effect, so "is it beside the composer or on top of it?" could only be answered by
// opening a browser — and a placement that is obviously wrong on screen is invisible in a diff.

import assert from "node:assert/strict";
import test from "node:test";

import { placeBeside, placeUnder } from "./character-place";

/** A wide window: centred composer column with real margin either side. */
const WIDE = {
  anchor: { left: 320, top: 700, height: 64 },
  coveredTop: 700,
  floor: 820,
  size: 60,
  gap: 14,
  bottom: 24,
};

test("on a wide page it stands to the LEFT of the composer, clear of it", () => {
  const at = placeBeside(WIDE);
  assert.equal(at.beside, true);
  // Its right edge sits `gap` clear of the composer's left edge — beside, not overlapping.
  assert.equal(at.inset + WIDE.size + WIDE.gap, WIDE.anchor.left);
  assert.ok(at.inset < WIDE.anchor.left, "it is not to the left of the composer at all");
});

test("beside means LEVEL with it, not floating above it", () => {
  const at = placeBeside(WIDE);
  // Both centres measured off the same floor.
  const mine = at.offset + WIDE.size / 2;
  const composer = WIDE.floor - WIDE.anchor.top - WIDE.anchor.height / 2;
  assert.equal(mine, composer);
  // Calibration: this is the half of the change that is easy to forget. Moving sideways while
  // still measuring from the composer's TOP edge leaves it hanging in space above nothing.
  const above = WIDE.floor - WIDE.coveredTop + WIDE.gap;
  assert.notEqual(at.offset, above, "it is still using the old above-the-composer offset");
});

test("a narrow window has no margin to stand in, so it goes back on top", () => {
  // The composer runs nearly the full width: there is no room to its left.
  const at = placeBeside({ ...WIDE, anchor: { ...WIDE.anchor, left: 16 } });
  assert.equal(at.beside, false);
  assert.equal(at.offset, WIDE.floor - WIDE.coveredTop + WIDE.gap, "it is not above the composer");
  assert.ok(at.inset >= 8, "it is off the edge of its container");
});

test("an open menu counts as part of the composer in the fall-back", () => {
  // The + menu opens INSIDE the composer, so the composer's own rect never grows. Only the
  // fall-back placement can collide with it, and only the fall-back consults it.
  const at = placeBeside({ ...WIDE, anchor: { ...WIDE.anchor, left: 16 }, coveredTop: 560 });
  assert.equal(at.offset, WIDE.floor - 560 + WIDE.gap);
});

test("it never sinks below the caller's own floor", () => {
  // A composer at the very bottom would compute a negative offset and drop the character off
  // the surface entirely.
  const at = placeBeside({ ...WIDE, anchor: { left: 320, top: 815, height: 64 }, floor: 820 });
  assert.ok(at.offset >= WIDE.bottom, `offset ${at.offset} is under the ${WIDE.bottom} floor`);
});

// ── Under the answer ───────────────────────────────────────────────────────────────────────────
//
// Owner 2026-08-26: *"make the mascot sit under the answer"*. Measured off claude.ai at a 1470px
// viewport: their mark is 32x32, left-aligned with the answer's own text column, and its row
// carries `margin-top: 24px`.

/** A 76px character in a 800px-tall surface, resting 24px under an answer that ended at y=300. */
const UNDER = { anchor: { left: 340, bottom: 300 }, floor: 800, size: 76, gap: 24, bottom: 24 } as const;

test("🔴 it stands a measured 24px under where the answer ended, left-aligned with it", () => {
  const at = placeUnder(UNDER);
  assert.equal(at.inset, 340, "the character no longer lines up with the answer's left edge");
  // `offset` is a CSS bottom: 800 - 300 - 24 - 76.
  assert.equal(at.offset, 400);
  // Restated as the thing a person can see: its top edge is 24px below the answer's last line.
  assert.equal(UNDER.floor - at.offset - UNDER.size, UNDER.anchor.bottom + UNDER.gap);
});

test("🔴🔴 it scrolls away with its answer, but never out of its own container", () => {
  // The anchor is inside a scroller, so it can be anywhere. Without the clamps the character rides
  // the scroll straight out of the surface and is simply gone, which reads as a bug rather than as
  // a character that scrolled away with the answer it belongs to.
  const scrolledFar = placeUnder({ ...UNDER, anchor: { left: 340, bottom: 2000 } });
  assert.equal(scrolledFar.offset, UNDER.bottom, "the character sank below the composer's shoulder");
  const scrolledUp = placeUnder({ ...UNDER, anchor: { left: 340, bottom: -500 } });
  assert.equal(scrolledUp.offset, UNDER.floor - UNDER.size - 8, "the character rose out of the top of the surface");
});

test("a cramped container still yields a placement rather than a negative one", () => {
  // A surface shorter than the character itself: every clamp fights, and the answer must still be
  // a number the dock can write.
  const at = placeUnder({ ...UNDER, floor: 40 });
  assert.ok(Number.isFinite(at.offset) && at.offset >= 0, `offset was ${at.offset}`);
  assert.ok(at.inset >= 8, "the character is outside the left edge of its container");
});
