// The one part of the immersive claim that can strand a learner, as a test.
//
// The registry hides the nav rail on first paint when the URL already names a canvas, so a deep
// link does not flash the reopen toggle and then jump the `×` 30px when the real claim lands a
// frame later. That seed is handed over in the provider's own mount effect, which React runs AFTER
// its children's — so a canvas has always registered its real claim by then, and if nothing
// claimed, the seed goes and the rail comes back.
//
// 🔴 THE DANGEROUS DIRECTION IS A SEED THAT IS TRUE WHERE NO `×` RENDERS. The rail would be hidden
// on a page that has no exit, which is the dead end arriving through the optimisation meant to
// smooth it. Every case below that must be `false` is that failure.

import assert from "node:assert/strict";
import test from "node:test";

import { immersiveSeed } from "./immersive-surface";

test("a canvas URL is immersive from the first frame", () => {
  for (const search of [
    "?c=3be94cc6-0000-0000-0000-000000000000",
    "?c=3be94cc6-0000-0000-0000-000000000000&policy=off", // the sign-in round trip replays the whole query
    "?ask=how%20insulin%20works",
    "?new=1",
  ]) {
    assert.equal(immersiveSeed("/learn", search), true, `${search} should seed immersive`);
  }
  assert.equal(immersiveSeed("/learn/", "?c=abc"), true, "a trailing slash is the same surface");
});

test("🔴 nothing else is, and the front door least of all", () => {
  // The front door keeps its navigation: it is not "inside a canvas", and it renders no `×`.
  assert.equal(immersiveSeed("/learn", ""), false);
  assert.equal(immersiveSeed("/learn", "?foo=bar"), false);
  // Other workspace surfaces, including the one the extension actually links to.
  for (const path of ["/library", "/calendar", "/stats", "/sessions", "/settings", "/"]) {
    assert.equal(immersiveSeed(path, "?c=abc"), false, `${path} must never seed immersive, whatever the query`);
  }
  assert.equal(immersiveSeed("/library", "?import=coursework"), false, "the extension's link is not a canvas");
});
