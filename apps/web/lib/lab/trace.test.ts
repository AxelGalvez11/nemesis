import assert from "node:assert/strict";
import { test } from "node:test";

import { labTrace, labTraceOn, resetLabTrace, subscribeLabTrace, type LabTraceEvent } from "./trace";

/**
 * 🔴 CALIBRATED BOTH WAYS. A guard that only proves "tracing is off in production" passes just as
 * happily when the sink is broken and never fires at all — and an empty debug panel is
 * indistinguishable from a working system. So one test proves inertness and the next proves the
 * trace really reaches a listener with the real payload.
 */
test("🔴 with nobody listening, tracing does no work at all", () => {
  resetLabTrace();
  assert.equal(labTraceOn(), false);
  let built = 0;
  labTrace("note", "should not fire", () => {
    built += 1;
    return { anything: true };
  });
  assert.equal(built, 0, "the payload thunk must not even be called when nothing is listening");
});

test("🔴 with a listener, the trace fires and carries the real payload", () => {
  resetLabTrace();
  const seen: LabTraceEvent[] = [];
  const stop = subscribeLabTrace((event) => seen.push(event));
  assert.equal(labTraceOn(), true);
  labTrace("judge", "verdict", () => ({ verdict: "partial" }), 412);
  stop();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.kind, "judge");
  assert.equal(seen[0]!.label, "verdict");
  assert.deepEqual(seen[0]!.detail, { verdict: "partial" });
  assert.equal(seen[0]!.ms, 412);
});

test("unsubscribing really stops it", () => {
  resetLabTrace();
  const seen: LabTraceEvent[] = [];
  const stop = subscribeLabTrace((event) => seen.push(event));
  stop();
  labTrace("note", "after unsubscribe", () => ({}));
  assert.equal(seen.length, 0);
});

test("🔴 a broken listener cannot break the caller", () => {
  resetLabTrace();
  const seen: string[] = [];
  const stopBad = subscribeLabTrace(() => {
    throw new Error("the debug panel is broken");
  });
  const stopGood = subscribeLabTrace((event) => seen.push(event.label));
  assert.doesNotThrow(() => labTrace("note", "still fine", () => ({})));
  assert.deepEqual(seen, ["still fine"], "a healthy listener still receives it");
  stopBad();
  stopGood();
});

test("🔴 a payload thunk that throws is reported, never swallowed and never rethrown", () => {
  resetLabTrace();
  const seen: LabTraceEvent[] = [];
  const stop = subscribeLabTrace((event) => seen.push(event));
  assert.doesNotThrow(() =>
    labTrace("model_call", "bad payload", () => {
      throw new Error("cannot serialise");
    }),
  );
  stop();
  assert.equal(seen.length, 1, "the panel is told the payload failed rather than seeing nothing");
  assert.match(String(seen[0]!.detail.error), /cannot serialise/);
});

test("ms is omitted rather than zeroed when nothing measured it", () => {
  resetLabTrace();
  const seen: LabTraceEvent[] = [];
  const stop = subscribeLabTrace((event) => seen.push(event));
  labTrace("note", "untimed", () => ({}));
  stop();
  assert.ok(!("ms" in seen[0]!), "absent means nobody timed it, and 0 would be a lie");
});
