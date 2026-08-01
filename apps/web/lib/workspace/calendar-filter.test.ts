import assert from "node:assert/strict";
import { test } from "node:test";

import type { CalendarEvent, CalendarEventKind } from "./calendar-model";
import {
  describeFilter,
  parseHiddenKinds,
  serializeHiddenKinds,
  toggleKind,
  visibleEvents,
} from "./calendar-filter";

function event(id: string, kind: CalendarEventKind): CalendarEvent {
  return { date: "2026-08-11", id, kind, source: "manual", title: id };
}

const EVENTS = [
  event("midterm", "exam"),
  event("essay", "assignment"),
  event("lecture", "class"),
  event("dentist", "other"),
];

const label = (kind: CalendarEventKind) => kind[0]!.toUpperCase() + kind.slice(1);

test("nothing hidden shows everything", () => {
  assert.equal(visibleEvents(EVENTS, new Set()).length, 4);
});

test("hiding a kind removes only that kind", () => {
  const shown = visibleEvents(EVENTS, new Set<CalendarEventKind>(["exam"]));
  assert.deepEqual(shown.map((e) => e.id), ["essay", "lecture", "dentist"]);
});

test("hiding every kind shows nothing, and is recoverable", () => {
  const all = new Set<CalendarEventKind>(["assignment", "class", "exam", "other", "rotation"]);
  assert.equal(visibleEvents(EVENTS, all).length, 0);
  // Switching one back on brings its events straight back — nothing was deleted.
  assert.deepEqual(visibleEvents(EVENTS, toggleKind(all, "exam")).map((e) => e.id), ["midterm"]);
});

test("toggling does not mutate the set it was given", () => {
  const before = new Set<CalendarEventKind>(["exam"]);
  const after = toggleKind(before, "class");
  assert.deepEqual([...before], ["exam"]);
  assert.equal(after.has("class"), true);
  assert.equal(toggleKind(after, "exam").has("exam"), false);
});

test("a stored preference round-trips", () => {
  const hidden = new Set<CalendarEventKind>(["exam", "class"]);
  assert.deepEqual([...parseHiddenKinds(serializeHiddenKinds(hidden))].sort(), ["class", "exam"]);
});

test("the same selection always serialises identically", () => {
  // Two tabs with the same filter must not keep overwriting each other with
  // differently-ordered JSON.
  const a = new Set<CalendarEventKind>(["exam", "class"]);
  const b = new Set<CalendarEventKind>(["class", "exam"]);
  assert.equal(serializeHiddenKinds(a), serializeHiddenKinds(b));
});

test("junk in storage hides nothing rather than hiding everything", () => {
  // This value is reachable by another tab, an older build, or the student.
  // Trusting it would hide events with no way back, because the filter UI only
  // lists real kinds.
  for (const raw of [null, "", "not json", "{}", '"exam"', "[1,2,3]", '["nonsense"]']) {
    assert.equal(parseHiddenKinds(raw).size, 0, `raw: ${raw}`);
  }
  assert.deepEqual([...parseHiddenKinds('["exam","nonsense"]')], ["exam"]);
});

test("the control says when a filter is on", () => {
  assert.equal(describeFilter(new Set(), label), "All events");
  assert.equal(describeFilter(new Set<CalendarEventKind>(["exam"]), label), "Exam hidden");
  assert.equal(describeFilter(new Set<CalendarEventKind>(["exam", "class"]), label), "2 kinds hidden");
});
