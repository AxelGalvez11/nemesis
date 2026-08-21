// The eyebrows exist only inside a gesture, and every way that goes wrong is a boundary.
//
// Flat filename on purpose: `scripts/run-tests.mjs` reads `src` non-recursively, so a test
// beside `character/brow.ts` would never run. Same reason `character.test.ts` sits here.

import assert from "node:assert/strict";
import test from "node:test";

import { browFrame, WAGGLE_TIME } from "./character/brow";

test("there are no brows outside the gesture", () => {
  assert.equal(browFrame(-0.01), null);
  assert.equal(browFrame(WAGGLE_TIME + 0.01), null);
  // 🔴 THE ENDS THEMSELVES CLOSE TOO. A brow still on screen at the last frame would be left
  // behind when the loop stops asking, because nothing draws a frame after that to remove it.
  assert.equal(browFrame(0), null);
  assert.equal(browFrame(WAGGLE_TIME), null);
});

test("a hung or absent clock draws nothing rather than something wrong", () => {
  assert.equal(browFrame(Number.NaN), null);
  assert.equal(browFrame(Number.POSITIVE_INFINITY), null);
});

test("the brows open and close within the window", () => {
  const open = browFrame(WAGGLE_TIME * 0.5);
  const opening = browFrame(WAGGLE_TIME * 0.06);
  const closing = browFrame(WAGGLE_TIME * 0.94);
  assert.ok(open && opening && closing);
  assert.ok(opening.w < open.w, "still growing at 6%");
  assert.ok(closing.w < open.w, "already shrinking at 94%");
  // Height never animates — a brow that got thicker as it rose would read as a stroke weight
  // change rather than as movement.
  assert.equal(opening.h, open.h);
  assert.equal(closing.h, open.h);
});

test("every brow sits ABOVE the eye it belongs to, at every instant", () => {
  // 🔴 THE SIGN IS THE BUG THAT WOULD BE INVISIBLE IN A UNIT TEST OTHERWISE. SVG's y grows
  // downward, so "up the face" is negative; getting it backwards puts two bars across the
  // cheeks, which still animates perfectly and is still wrong.
  for (let i = 1; i < 60; i += 1) {
    const frame = browFrame((WAGGLE_TIME * i) / 60);
    if (!frame) continue;
    assert.ok(frame.dy < 0, `dy ${frame.dy} at step ${i}`);
  }
});

test("it waggles twice — not once, which would read as a question", () => {
  // Count the turning points of the lift by sampling dy: two full up-and-downs means the
  // brows reach their highest point exactly twice inside the window.
  const samples: number[] = [];
  for (let i = 0; i <= 400; i += 1) {
    const frame = browFrame((WAGGLE_TIME * i) / 400);
    samples.push(frame ? frame.dy : Number.NaN);
  }
  let peaks = 0;
  for (let i = 1; i < samples.length - 1; i += 1) {
    const [previous, here, next] = [samples[i - 1]!, samples[i]!, samples[i + 1]!];
    if (Number.isNaN(previous) || Number.isNaN(here) || Number.isNaN(next)) continue;
    // Highest = most negative.
    if (here < previous && here <= next) peaks += 1;
  }
  assert.equal(peaks, 2);
});
