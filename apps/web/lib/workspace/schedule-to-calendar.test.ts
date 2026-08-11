import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScheduleCandidate } from "@/lib/learn/schedule-candidates";

import { decodeCalendarEvent, encodeCalendarEvent } from "./calendar-codec";
import { isRefusal, toCalendarEvent } from "./schedule-to-calendar";

function candidate(over: Partial<ScheduleCandidate> = {}): ScheduleCandidate {
  return {
    id: "sc1",
    canvasId: "canvas-9",
    kind: "exam",
    title: "Exam 1",
    startAt: "2026-09-12T14:00:00.000Z",
    sourceRefs: [{ sourceId: "syllabus", excerptId: "s1:e3" }],
    confidence: 0.92,
    status: "candidate",
    origin: "source_extraction",
    resolvedAgainst: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

test("a clear, well-sourced syllabus date becomes a calendar event", () => {
  const result = toCalendarEvent(candidate(), EVENT_ID);
  assert.ok(!isRefusal(result));
  assert.equal(result.event.kind, "exam");
  assert.equal(result.event.title, "Exam 1");
  assert.equal(result.event.origin, "source_extraction");
  assert.equal(result.event.canvasId, "canvas-9");
});

test("🔴 provenance travels with the event, or it should not be shown at all", () => {
  const result = toCalendarEvent(candidate(), EVENT_ID);
  assert.ok(!isRefusal(result));
  // §14: a date the learner cannot trace back to a sentence is one they take on faith.
  assert.deepEqual(result.event.sourceRefs, [{ sourceId: "syllabus", excerptId: "s1:e3" }]);
  assert.equal(result.event.confidence, 0.92);
  assert.equal(result.event.resolvedAgainst, "2026-08-01T00:00:00.000Z");
});

test("🔴 the original wording survives all the way onto the calendar row", () => {
  const spoken = candidate({ originalExpression: "next Friday", confidence: 0.85 });
  const result = toCalendarEvent(spoken, EVENT_ID);
  assert.ok(!isRefusal(result));
  assert.equal(result.event.originalExpression, "next Friday");

  // And survives the write/read round trip, which is where it would previously have been lost.
  const row = encodeCalendarEvent(result.event, "user-1", "agent");
  assert.equal(decodeCalendarEvent(row)!.originalExpression, "next Friday");
});

test("🔴 speculative language never becomes a calendar entry", () => {
  // "We'll probably test this sometime next month" is a remark, not a deadline.
  const vague = candidate({
    originalExpression: "we'll probably test this sometime next month",
    confidence: 0.9,
  });
  const result = toCalendarEvent(vague, EVENT_ID);
  assert.ok(isRefusal(result));
  assert.equal(result.reason, "hedged");
});

test("a low-confidence reading is refused rather than placed", () => {
  const result = toCalendarEvent(candidate({ confidence: 0.4 }), EVENT_ID);
  assert.ok(isRefusal(result));
  assert.equal(result.reason, "not_confident_enough");
});

test("a date with no provenance is refused", () => {
  const result = toCalendarEvent(candidate({ sourceRefs: [] }), EVENT_ID);
  assert.ok(isRefusal(result));
  assert.equal(result.reason, "no_provenance");
});

test("🔴 a plan Nemesis invented never appears as an obligation", () => {
  // §19/§20: a review block is a suggestion. An exam is not. The calendar must be able to tell
  // them apart, and this door is where that is enforced.
  const plan = candidate({ origin: "nemesis_plan", title: "20-minute calculus review" });
  const result = toCalendarEvent(plan, EVENT_ID);
  assert.ok(isRefusal(result));
  assert.equal(result.reason, "is_a_plan_not_an_obligation");
});

test("a candidate with no resolvable date is refused", () => {
  const result = toCalendarEvent(candidate({ startAt: undefined, dueAt: undefined }), EVENT_ID);
  assert.ok(isRefusal(result));
  assert.equal(result.reason, "no_date");
});

test("a learner who confirmed it overrides the automatic bar", () => {
  // They looked at it and said yes, which beats any threshold we could pick.
  const confirmed = candidate({ status: "confirmed", confidence: 0.3, sourceRefs: [] });
  const result = toCalendarEvent(confirmed, EVENT_ID);
  assert.ok(!isRefusal(result));
});

test("🔴 the date is the learner's local day, not the UTC one", () => {
  // calendar-agent-range.ts already documents this bug: toISOString().slice(0,10) says tomorrow
  // every evening in the Americas, which silently moved same-day deadlines.
  // 23:00 on Oct 4 in Chicago is 04:00 on Oct 5 UTC.
  const late = candidate({
    kind: "assignment",
    title: "Project",
    startAt: undefined,
    dueAt: "2026-10-05T04:00:00.000Z",
    timezone: "America/Chicago",
  });
  const result = toCalendarEvent(late, EVENT_ID);
  assert.ok(!isRefusal(result));
  assert.equal(result.event.date, "2026-10-04", "the learner's Sunday, not UTC's Monday");
});

test("schedule kinds collapse into the calendar's vocabulary without losing the event", () => {
  for (const [kind, expected] of [
    ["quiz", "exam"],
    ["project", "assignment"],
    ["deadline", "assignment"],
    ["meeting", "other"],
    ["class", "class"],
  ] as const) {
    const result = toCalendarEvent(candidate({ kind }), EVENT_ID);
    assert.ok(!isRefusal(result), `${kind} was refused`);
    assert.equal(result.event.kind, expected, `${kind} mapped wrong`);
  }
});
