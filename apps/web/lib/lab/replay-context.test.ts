import assert from "node:assert/strict";
import { test } from "node:test";

import { isTracedContext, replayContext, type TracedContext } from "./replay-context";

const traced: TracedContext = {
  actedOn: [],
  attention: { activeMs: 1000, availableMs: null },
  correctionsShown: ["a", "b"],
  evidence: [],
  modelled: ["c"],
  now: "2026-08-18T12:00:00.000Z",
  objectives: [],
  recentActs: [],
  uid: "traced-uid",
};

test("🔴 the Sets come back as Sets, because nemesis_policy calls .has() on them", () => {
  // The harness bug this file exists to prevent: arrays here made the structured arm throw
  // `corrected.has is not a function` on every run while the model arm worked, so the comparison
  // reported a difference between the two controllers that did not exist.
  const context = replayContext(traced, "real-uid", new AbortController().signal);
  assert.ok(context.correctionsShown instanceof Set);
  assert.ok(context.modelled instanceof Set);
  assert.equal(context.correctionsShown.has("a"), true);
  assert.equal(context.correctionsShown.has("nope"), false);
  assert.equal(context.modelled.has("c"), true);
});

test("🔴 the original instant is restored, not the current clock", () => {
  const context = replayContext(traced, "real-uid", new AbortController().signal);
  assert.equal(context.now.toISOString(), "2026-08-18T12:00:00.000Z");
});

test("the caller's session wins over whatever the trace recorded", () => {
  const context = replayContext(traced, "real-uid", new AbortController().signal);
  assert.equal(context.uid, "real-uid");
});

test("🔴 it survives a JSON round trip, because a saved case is a file", () => {
  // A `Set` serialises as `{}`. If the trace kept live Sets, every regression case written to disk
  // would silently lose both fields and replay against inputs production never saw.
  const roundTripped = JSON.parse(JSON.stringify(traced)) as TracedContext;
  assert.ok(isTracedContext(roundTripped));
  const context = replayContext(roundTripped, "real-uid", new AbortController().signal);
  assert.equal(context.correctionsShown?.has("b"), true);
});

test("something that is not a traced context is rejected rather than replayed", () => {
  assert.equal(isTracedContext(null), false);
  assert.equal(isTracedContext({}), false);
  assert.equal(isTracedContext({ ...traced, correctionsShown: undefined }), false);
});
