import assert from "node:assert/strict";
import { test } from "node:test";

import { EYE_H, EYE_W } from "@/lib/bloub/face";

import { browFrame, raisedBrow, WAGGLE_TIME } from "./brow";
import { annulusPath, arrival, BRIDGE, FACE_IN, LENS_ARM, LENS_RING, LENS_RX, LENS_RY, SMIRK } from "./face";

// The face layer is geometry in body-radius units, drawn as holes in the body's own mask.
// These tests pin the proportions that make each feature read as WHAT IT IS at the 52px the
// dock actually renders — the difference between "glasses" and "outlined eyes" is numbers.

test("a lens clears its eye on both axes, and two lenses stay apart", () => {
  // The eye capsule is EYE_W×EYE_H, tall and narrow, and the pair sits ~0.46 body-radii
  // apart. If the ring's inner edge touches the eye, the lens reads as an outline OF the eye;
  // if two outer edges meet, the pair reads as one white mass — the vendored "big eyes" the
  // owner removed by name. Both failures were seen on the preview board before these numbers.
  assert.ok(LENS_RX - LENS_RING > EYE_W / 2 + 0.03, "the ring hugs the eye's sides");
  assert.ok(LENS_RY - LENS_RING > EYE_H / 2 + 0.03, "the ring hugs the eye's top");
  assert.ok(LENS_RX * 2 < 0.46, `two lenses ${LENS_RX * 2} wide merge across a 0.46 gap`);
  assert.ok(LENS_RING < EYE_W, "the ring reads as a frame, not a second body");
});

test("an annulus is one even-odd path with exactly two rings", () => {
  const d = annulusPath(10, 14, 3);
  assert.equal(d.split("M ").length - 1, 2, "outer and inner ellipse, nothing else");
  assert.ok(d.includes("A 10 14") && d.includes("A 7 11"), "outer and ring-inset radii present");
});

test("the sigma brow IS the waggle's own peak, so the two can never drift apart", () => {
  // The waggle lifts twice per window; its first peak is at a quarter of it. The sigma holds
  // a brow at exactly that height and width — borrowed geometry, not copied numbers.
  const peak = browFrame(WAGGLE_TIME / 4);
  const held = raisedBrow();
  assert.ok(peak, "the waggle has no readable peak");
  assert.ok(Math.abs(peak.dy - held.dy) < 1e-9, `held ${held.dy} vs waggle peak ${peak.dy}`);
  assert.ok(held.w >= peak.w, "the held brow is at least the peak's width (no reveal on a held face)");
});

test("the smirk sits below the eye, on the face, tilted", () => {
  assert.ok(SMIRK.dy > EYE_H / 2, "the mouth overlaps the eye it hangs from");
  assert.ok(Math.abs(SMIRK.rot) >= 6, "a level-ish mouth is a mouth, not a smirk");
  assert.ok(SMIRK.w > SMIRK.h * 3, "reads as a mouth line, not a dot");
});

test("the waggle closes its own window — nothing to un-draw when the gesture ends", () => {
  assert.equal(browFrame(-0.01), null);
  assert.equal(browFrame(WAGGLE_TIME + 0.01), null);
  assert.equal(browFrame(Number.NaN), null);
});

test("a face arrives smoothly and is simply there on stills", () => {
  assert.equal(arrival(null), 1, "a still has no clock and wears the finished face");
  assert.equal(arrival(0), 0);
  assert.equal(arrival(FACE_IN), 1);
  assert.ok(arrival(FACE_IN / 2) > 0.5, "ease-OUT: most of the arrival happens early");
  assert.ok(arrival(FACE_IN / 4) < arrival(FACE_IN / 2), "monotonic on the way in");
});

test("the frame is one object: the bridge welds the rims and the arms leave from them", () => {
  // A bridge narrower than the gap floats between the lenses; one that reaches past each
  // inner rim reads as a single pair of glasses. Same wire thickness everywhere.
  assert.ok(BRIDGE.dx - BRIDGE.w / 2 < LENS_RX, "the bridge does not reach the first rim");
  assert.ok(BRIDGE.dx + BRIDGE.w / 2 > 0.48 - LENS_RX, "the bridge does not reach the second rim");
  assert.ok(Math.abs(LENS_ARM.h - LENS_RING) <= 0.01, "the temple wire differs from the ring wire");
  assert.ok(LENS_ARM.len >= 0.1, "a stub temple reads as a smudge, not a frame");
});

test("the sigma brow lifts from rest height to the waggle's peak", async () => {
  const { raisedBrow } = await import("./brow");
  assert.ok(raisedBrow(0).dy > raisedBrow(1).dy, "no lift should sit LOWER (less negative) than full lift");
  assert.ok(Math.abs(raisedBrow(0.5).dy - (raisedBrow(0).dy + raisedBrow(1).dy) / 2) < 1e-9, "the lift is linear in between");
});
