import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarEvent } from "./calendar-model";
import { conflictSummary, eventsOverlap, splitCalendarConflicts } from "./calendar-conflicts";

function event(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "title" | "date">): CalendarEvent {
  return { id: overrides.id ?? overrides.title, kind: "class", ...overrides };
}

test("same name on the same day is a duplicate, whatever the case or spacing", () => {
  const split = splitCalendarConflicts(
    [event({ title: "  pharmacology   EXAM ", date: "2026-09-12" })],
    [event({ title: "Pharmacology Exam", date: "2026-09-12" })],
  );
  assert.equal(split.duplicates.length, 1);
  assert.equal(split.toSave.length, 0);
});

test("the same name on a different day is not a duplicate", () => {
  const split = splitCalendarConflicts(
    [event({ title: "Quiz", date: "2026-09-13" })],
    [event({ title: "Quiz", date: "2026-09-12" })],
  );
  assert.equal(split.duplicates.length, 0);
  assert.equal(split.toSave.length, 1);
});

test("timed events that cross count as a clash and are still saved", () => {
  const incoming = event({ title: "Contracts lecture", date: "2026-09-12", time: "10:30" });
  const split = splitCalendarConflicts(
    [incoming],
    [event({ title: "Thermodynamics lab", date: "2026-09-12", time: "10:00", endTime: "12:00" })],
  );
  assert.equal(split.clashes.length, 1);
  assert.equal(split.toSave.length, 1, "a clash is flagged, never blocked");
});

test("events without a time never clash — a due date does not occupy the hour", () => {
  const a = event({ title: "Essay due", date: "2026-09-12" });
  const b = event({ title: "Problem set due", date: "2026-09-12" });
  assert.equal(eventsOverlap(a, b), false);
});

test("back-to-back events do not clash", () => {
  const a = event({ title: "First", date: "2026-09-12", time: "09:00", endTime: "10:00" });
  const b = event({ title: "Second", date: "2026-09-12", time: "10:00", endTime: "11:00" });
  assert.equal(eventsOverlap(a, b), false);
});

test("conflictSummary is silent when there is nothing to say", () => {
  const split = splitCalendarConflicts([event({ title: "New thing", date: "2026-09-14" })], []);
  assert.equal(conflictSummary(split), "");
});

test("conflictSummary names the skip count and one clash example", () => {
  const split = splitCalendarConflicts(
    [
      event({ title: "Repeat", date: "2026-09-12" }),
      event({ title: "Studio crit", date: "2026-09-12", time: "14:00" }),
    ],
    [
      event({ title: "Repeat", date: "2026-09-12" }),
      event({ title: "Clinic shift", date: "2026-09-12", time: "13:30", endTime: "15:00" }),
    ],
  );
  const summary = conflictSummary(split);
  assert.ok(summary.includes("Skipped 1 already on your calendar"));
  assert.ok(summary.includes("Studio crit"));
  assert.ok(summary.includes("Clinic shift"));
});
