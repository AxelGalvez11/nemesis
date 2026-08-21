import assert from "node:assert/strict";
import { test } from "node:test";

import { eyePoses, REST_GAZE } from "./face";

// 🔴🔴 THE RESTING HEAD IS LEVEL, AND IT IS A PRODUCT DECISION RATHER THAN A TASTE.
//
// Owner, 2026-08-21: *"can you make the mascot not be tilted? because that reads too much like
// xai grok bot."* The vendored character was fitted frame by frame to a reference video in which
// the head leans -13deg, and every comment in `face.ts` and `engine.ts` treats that lean as the
// signature to protect. It is also the single feature that made two dark capsules on a pale disc
// resemble a competitor's mark, which is the first thing a learner sees and the one thing a mascot
// cannot afford to be.
//
// This file exists because the lean lives in ONE number inside third-party code with no tests of
// its own. Re-fitting to the reference, or taking a newer copy of the vendored engine, would put
// -13 back silently and nothing else in this repository would notice.

/** The angle of the line through both eyes, in degrees. 0 is level. */
function eyeLine(gaze: typeof REST_GAZE): number {
  const [left, right] = eyePoses(gaze, 100);
  return (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI;
}

test("🔴 the resting face is level, not leaning", () => {
  assert.equal(REST_GAZE.roll, 0, "the resting roll came back");
  assert.ok(Math.abs(eyeLine(REST_GAZE)) < 0.01, `the eyes sit at ${eyeLine(REST_GAZE).toFixed(2)}deg`);
  // Calibration: this is what it used to be, so the test above is measuring something real.
  assert.ok(Math.abs(eyeLine({ ...REST_GAZE, roll: -13 })) > 13, "roll no longer tilts the eye line at all");
});

test("🔴 only the ROLL went, so the face is still a head rather than a logo", () => {
  // The eyes are painted on a sphere: yaw and pitch put them off-centre, and the near eye comes
  // back narrower than the far one because of it. That depth is what stops the character reading
  // as two shapes stamped flat on a circle, and zeroing the whole gaze would have taken it.
  const [left, right] = eyePoses(REST_GAZE, 100);
  const nearWidth = Math.hypot(right.a, right.b);
  const farWidth = Math.hypot(left.a, left.b);
  assert.ok(nearWidth < farWidth * 0.85, `the eyes are the same width (${nearWidth} vs ${farWidth}), so the head went flat`);
  assert.ok(REST_GAZE.yaw > 20 && REST_GAZE.pitch > 20, "the head no longer turns away from the viewer at all");
  // Both eyes face the viewer. A negative depth means one has gone round the back of the sphere.
  assert.ok(left.depth > 0 && right.depth > 0, "an eye rotated out of sight");
});

console.log("rest-is-level.test.ts OK");
