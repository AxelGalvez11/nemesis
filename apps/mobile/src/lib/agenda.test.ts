// Deno unit tests (repo convention) for the agenda pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/agenda.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { agendaDays, labelForDay, monthMatrix, parseCalendarDoc, stepMonth, type AgendaEvent } from "./agenda.ts";

const docJson = JSON.stringify({
  v: 1,
  asOf: "2026-07-17T06:00:00Z",
  feedUrl: "https://x.supabase.co/functions/v1/nemesis-ics?token=abc",
  events: [
    { id: "e1", title: "Exam 2", date: "2026-07-20", kind: "exam", course: "PHCY 1205" },
    { id: "e2", title: "Lab", date: "2026-07-17", time: "14:00", kind: "class" },
    { id: "e3", title: "Quiz", date: "2026-07-17", time: "09:00", kind: "assignment", note: "ch 4" },
    { id: "e4", title: "Untimed", date: "2026-07-17", kind: "other" },
    { id: "old", title: "Past", date: "2026-07-10", kind: "other" },
    { id: "bad", title: "No date", date: "someday", kind: "other" },
    { id: "far", title: "Beyond horizon", date: "2027-07-01", kind: "other" },
  ],
});

Deno.test("parseCalendarDoc: envelope + per-event validation", () => {
  const doc = parseCalendarDoc(docJson);
  assertEquals(doc?.feedUrl, "https://x.supabase.co/functions/v1/nemesis-ics?token=abc");
  assertEquals(doc?.events.length, 6); // "bad" dropped
  assertEquals(parseCalendarDoc("nope"), null);
  assertEquals(parseCalendarDoc('{"v":3}'), null);
  assertEquals(parseCalendarDoc('{"v":1}')?.events, []);
});

Deno.test("agendaDays: today-first grouping, time-sorted within a day, past + beyond-horizon excluded", () => {
  const doc = parseCalendarDoc(docJson)!;
  const days = agendaDays(doc.events, "2026-07-17", 90);

  assertEquals(days.map((day) => day.key), ["2026-07-17", "2026-07-20"]);
  assertEquals(days[0].label, "Today");
  assertEquals(days[0].events.map((event) => event.id), ["e3", "e2", "e4"]);
  assertEquals(days[1].events[0].course, "PHCY 1205");
});

Deno.test("labelForDay: Today / Tomorrow / weekday + date", () => {
  assertEquals(labelForDay("2026-07-17", "2026-07-17"), "Today");
  assertEquals(labelForDay("2026-07-18", "2026-07-17"), "Tomorrow");
  // 2026-07-20 is a Monday.
  assertEquals(labelForDay("2026-07-20", "2026-07-17"), "Monday, Jul 20");
});

const ev = (id: string, date: string, kind: AgendaEvent["kind"]): AgendaEvent => ({ id, title: id, date, kind });

Deno.test("monthMatrix builds whole Sunday-first weeks covering the month", () => {
  // July 2026: the 1st is a Wednesday (getDay 3), 31 days.
  const view = monthMatrix(2026, 6, [], "2026-07-15");
  assertEquals(view.label, "July 2026");
  assertEquals(view.weeks.length, 5); // 3 lead + 31 = 34 cells → 5 weeks (35)
  for (const week of view.weeks) assertEquals(week.length, 7);
  // First cell is the Sunday before Jul 1 = Jun 28; first in-month cell is Jul 1 at index 3.
  assertEquals(view.weeks[0][0].inMonth, false);
  assertEquals(view.weeks[0][3].inMonth, true);
  assertEquals(view.weeks[0][3].day, 1);
  assertEquals(view.weeks[0][3].key, "2026-07-01");
});

Deno.test("monthMatrix marks today and counts events with the top kind per day", () => {
  const events = [
    ev("a", "2026-07-20", "class"),
    ev("b", "2026-07-20", "exam"), // exam outranks class for the dot color
    ev("c", "2026-07-20", "assignment"),
    ev("d", "2026-08-05", "other"), // different month — ignored in July grid counts
  ];
  const view = monthMatrix(2026, 6, events, "2026-07-15");
  const cells = view.weeks.flat();
  const today = cells.find((cell) => cell.key === "2026-07-15");
  assert(today?.isToday);
  const the20th = cells.find((cell) => cell.key === "2026-07-20");
  assertEquals(the20th?.eventCount, 3);
  assertEquals(the20th?.topKind, "exam");
  // A trailing August day may appear as padding, but must read inMonth:false and uncounted.
  const aug5 = cells.find((cell) => cell.key === "2026-08-05");
  if (aug5) {
    assertEquals(aug5.inMonth, false);
    assertEquals(aug5.eventCount, 0);
  }
});

Deno.test("stepMonth rolls the year over in both directions", () => {
  assertEquals(stepMonth(2026, 11, 1), { year: 2027, month: 0 });
  assertEquals(stepMonth(2026, 0, -1), { year: 2025, month: 11 });
  assertEquals(stepMonth(2026, 6, 0), { year: 2026, month: 6 });
});
