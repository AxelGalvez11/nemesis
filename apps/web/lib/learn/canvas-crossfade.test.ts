import assert from "node:assert/strict";
import { test } from "node:test";

import { fadeSettle, fadeStyle, fadeSwap, fadeTo, initialFade } from "./canvas-crossfade";

// Every test here is a way a cross-fade gets STUCK — showing nothing, or showing the wrong thing,
// with no error and no way to reproduce it by hand.

test("🟢 the ordinary swap: leave, then arrive, then rest", () => {
  let state = initialFade("a");
  state = fadeTo(state, "b");
  assert.deepEqual(state, { phase: "leaving", showing: "a" }, "the OLD content must still be on screen");
  state = fadeSwap(state, "b");
  assert.deepEqual(state, { phase: "entering", showing: "b" });
  state = fadeSettle(state);
  assert.deepEqual(state, { phase: "settled", showing: "b" });
});

test("🔴🔴 an unchanged key is not a transition", () => {
  // React re-renders for reasons unrelated to content. Without this the same sentence fades out and
  // back in on every hover, which reads as the page flickering.
  const settled = initialFade("a");
  assert.equal(fadeTo(settled, "a"), settled, "a re-render restarted the animation");
});

test("🔴🔴 content changing mid-fade does not restart the fade", () => {
  // Whatever is on screen is already fading down. Restarting snaps it back to full opacity first,
  // which is a visible flash exactly when the canvas is busiest.
  let state = fadeTo(initialFade("a"), "b");
  const during = fadeTo(state, "c");
  assert.deepEqual(during, { phase: "leaving", showing: "a" }, "the fade restarted");
});

test("🔴🔴 the LAST thing asked for is what arrives", () => {
  // a → b → c in quick succession must end on c. Landing on b would leave the canvas showing
  // content the runtime has already moved past, with nothing to correct it.
  let state = fadeTo(initialFade("a"), "b");
  state = fadeTo(state, "c");
  state = fadeSwap(state, "c");
  assert.equal(state.showing, "c");
});

test("🔴 a swap that arrives when nothing is leaving is ignored", () => {
  // A stale timer firing after the transition already completed. Applying it would replace settled
  // content with whatever that timer was carrying.
  const settled = initialFade("a");
  assert.equal(fadeSwap(settled, "b"), settled);
});

test("🔴 settling something that is not entering is ignored", () => {
  const leaving = fadeTo(initialFade("a"), "b");
  assert.equal(fadeSettle(leaving), leaving, "a stale timer ended a fade that had not started");
});

test("🔴🔴 while leaving, the wrapper is told to hold the PREVIOUS children", () => {
  // The caller's `children` are already the new content by then. Painting those would fade the new
  // thing out and then in — the right animation on the wrong element.
  assert.equal(fadeStyle(fadeTo(initialFade("a"), "b")).holdPrevious, true);
  assert.equal(fadeStyle(initialFade("a")).holdPrevious, false);
  assert.equal(fadeStyle(fadeSwap(fadeTo(initialFade("a"), "b"), "b")).holdPrevious, false);
});

test("🔴 settled content is fully opaque and has no transition to sit through", () => {
  const style = fadeStyle(initialFade("a"));
  assert.equal(style.opacity, 1);
  assert.equal(style.ms, 0, "settled content must not carry a transition, or the first paint fades");
});

test("a full cycle returns to a resting state that accepts the next change", () => {
  let state = initialFade("a");
  for (const key of ["b", "c", "d"]) {
    state = fadeTo(state, key);
    state = fadeSwap(state, key);
    state = fadeSettle(state);
    assert.deepEqual(state, { phase: "settled", showing: key });
  }
});
