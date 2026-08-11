import assert from "node:assert/strict";
import { test } from "node:test";

import { calendarEventFromRow } from "./calendar-agent-range";
import {
  decodeCalendarEvent,
  encodeCalendarEvent,
  type DecodedCalendarEvent,
} from "./calendar-codec";

/** Everything a calendar event can carry, so a dropped field has somewhere to show up. */
function fullEvent(): DecodedCalendarEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Exam 1",
    date: "2026-09-12",
    time: "09:00",
    endTime: "11:00",
    kind: "exam",
    course: "PHCY 2105",
    note: "Bring a calculator",
    source: "agent",
    recurrence: { days: [2, 4], until: "2026-12-10", except: ["2026-10-14"] },
    origin: "source_extraction",
    canvasId: "canvas-9",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e3" }],
    confidence: 0.92,
    originalExpression: "next Thursday",
    resolvedAgainst: "2026-09-02T14:00:00.000Z",
  };
}

/** The fields that must survive. Named explicitly so adding one to the model and forgetting it
 *  here is a visible omission rather than an invisible one. */
const MEANINGFUL: (keyof DecodedCalendarEvent)[] = [
  "id",
  "title",
  "date",
  "time",
  "endTime",
  "kind",
  "course",
  "note",
  "source",
  "recurrence",
  "origin",
  "canvasId",
  "sourceRefs",
  "confidence",
  "originalExpression",
  "resolvedAgainst",
];

test("🔴 an event survives BOTH production read paths without losing a field", () => {
  // The required test. Not a unit test of the decoder — a round trip through the two readers
  // that previously diverged: the cloud path (calendarEventFromRow) and the cache path
  // (decodeCalendarEvent, which sanitizeEvent now is).
  const before = fullEvent();
  const row = encodeCalendarEvent(before, "user-1", "agent");

  const viaCloud = calendarEventFromRow(row as never) as DecodedCalendarEvent | null;
  const viaCache = decodeCalendarEvent(row);

  assert.ok(viaCloud, "cloud path decoded nothing");
  assert.ok(viaCache, "cache path decoded nothing");

  for (const field of MEANINGFUL) {
    assert.deepEqual(viaCloud[field], before[field], `cloud path lost ${String(field)}`);
    assert.deepEqual(viaCache[field], before[field], `cache path lost ${String(field)}`);
  }
  // And the two agree with each other, which is the property that failed before.
  for (const field of MEANINGFUL) {
    assert.deepEqual(viaCloud[field], viaCache[field], `the two readers disagree about ${String(field)}`);
  }
});

test("🔴 a field the build does not recognise is carried, not destroyed", () => {
  // The failure this prevents: a newer deploy adds a field, an older tab reads and re-saves,
  // and the field is gone from the database permanently with no error anywhere.
  const row = {
    ...encodeCalendarEvent(fullEvent(), "user-1", "manual"),
    somethingNewerAdded: { nested: true },
    another_new_column: 7,
  };

  const decoded = decodeCalendarEvent(row)!;
  assert.deepEqual(decoded.extra?.somethingNewerAdded, { nested: true });
  assert.equal(decoded.extra?.another_new_column, 7);

  // …and it goes back out on the next write, so the re-save does not destroy it.
  const rewritten = encodeCalendarEvent(decoded, "user-1", "manual") as Record<string, unknown>;
  const carried = rewritten.extra as Record<string, unknown>;
  assert.deepEqual(carried.somethingNewerAdded, { nested: true });
  assert.equal(carried.another_new_column, 7);
});

test("a full round trip is stable — encode(decode(encode(x))) does not drift", () => {
  const once = encodeCalendarEvent(fullEvent(), "user-1", "agent");
  const twice = encodeCalendarEvent(decodeCalendarEvent(once)!, "user-1", "agent");
  assert.deepEqual(twice, once, "a second save must not change what the first one wrote");
});

test("rows written before provenance existed still decode", () => {
  // Every row already in the database predates these fields. "Additive" has to mean this.
  const legacy = {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Lecture",
    date: "2026-09-01",
    kind: "class",
    source: "manual",
  };
  const decoded = decodeCalendarEvent(legacy)!;
  assert.equal(decoded.title, "Lecture");
  assert.equal(decoded.origin, undefined, "absent, not invented");
  assert.equal(decoded.canvasId, undefined);
  assert.equal(decoded.sourceRefs, undefined);
});

test("both readers reject the same malformed rows", () => {
  for (const bad of [null, {}, { id: "a" }, { id: "a", title: "t", date: "not-a-date" }, "nope"]) {
    assert.equal(decodeCalendarEvent(bad), null, `cache path accepted ${JSON.stringify(bad)}`);
    assert.equal(calendarEventFromRow(bad as never), null, `cloud path accepted ${JSON.stringify(bad)}`);
  }
});

test("an unrecognised kind degrades rather than dropping somebody's exam", () => {
  const decoded = decodeCalendarEvent({ id: "a", title: "Exam", date: "2026-09-12", kind: "wat" })!;
  assert.equal(decoded.kind, "other");
});

test("confidence is clamped, and a non-number is ignored", () => {
  assert.equal(decodeCalendarEvent({ id: "a", title: "t", date: "2026-09-12", confidence: 5 })!.confidence, 1);
  assert.equal(decodeCalendarEvent({ id: "a", title: "t", date: "2026-09-12", confidence: -2 })!.confidence, 0);
  assert.equal(
    decodeCalendarEvent({ id: "a", title: "t", date: "2026-09-12", confidence: "high" })!.confidence,
    undefined,
  );
});

test("source refs survive in either naming, and malformed ones are dropped", () => {
  const snake = decodeCalendarEvent({
    id: "a",
    title: "t",
    date: "2026-09-12",
    source_refs: [{ source_id: "s1", excerpt_id: "s1:e1" }, { source_id: "s2" }],
  })!;
  assert.deepEqual(snake.sourceRefs, [{ sourceId: "s1", excerptId: "s1:e1" }]);
});
