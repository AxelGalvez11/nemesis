// A boundary with nothing behind it, held to saying so.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `the gap is named, never an empty success`. An assessment
// that returned `{ ok: true, evidence: {} }` would be read downstream as "measured, and everything
// was fine" — a confident zero in a learner's record for something nobody measured.

import assert from "node:assert/strict";
import test from "node:test";

import { assessPronunciation, pronunciationTeachingAvailable } from "./pronunciation-evidence";

test("🔴 the gap is named, never an empty success", () => {
  const result = assessPronunciation();
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "no-provider");
  assert.match(result.ok === false ? result.detail : "", /hear what was said, not how/);
});

test("🔴 no surface may claim to teach pronunciation while that holds", () => {
  assert.equal(pronunciationTeachingAvailable(), false);
});
