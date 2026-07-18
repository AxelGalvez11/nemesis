// Deno unit tests (repo convention) for the agenda pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/agenda.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  agendaDays,
  eventsForDay,
  labelForDay,
  monthMatrix,
  parseCalendarDoc,
  shiftDayKey,
  stepMonth,
  weekDays,
  type AgendaEvent,
} from "./agenda.ts";

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

Deno.test("eventsForDay: one day's events, time-sorted, empty for no matches", () => {
  const doc = parseCalendarDoc(docJson)!;
  // Same day as the agendaDays "Today" bucket — same order: 09:00, 14:00, untimed-last.
  assertEquals(eventsForDay(doc.events, "2026-07-17").map((e) => e.id), ["e3", "e2", "e4"]);
  assertEquals(eventsForDay(doc.events, "2026-07-20").map((e) => e.id), ["e1"]);
  assertEquals(eventsForDay(doc.events, "2099-01-01"), []);
});

Deno.test("shiftDayKey rolls months and years over in both directions", () => {
  assertEquals(shiftDayKey("2026-07-17", 1), "2026-07-18");
  assertEquals(shiftDayKey("2026-07-17", -1), "2026-07-16");
  assertEquals(shiftDayKey("2026-07-17", 0), "2026-07-17");
  assertEquals(shiftDayKey("2026-07-31", 1), "2026-08-01");
  assertEquals(shiftDayKey("2026-01-01", -1), "2025-12-31");
});

Deno.test("weekDays: Sunday-first week containing the date, every day present, time-sorted", () => {
  // 2026-07-17 is a Friday (Jul 1 2026 is a Wednesday) — its week is Jul 12 (Sun) .. Jul 18 (Sat).
  const events: AgendaEvent[] = [
    { id: "mon", title: "Mon class", date: "2026-07-13", kind: "class" },
    { id: "fri-late", title: "Fri late", date: "2026-07-17", time: "14:00", kind: "class" },
    { id: "fri-early", title: "Fri early", date: "2026-07-17", time: "09:00", kind: "assignment" },
    { id: "sat", title: "Sat exam", date: "2026-07-18", kind: "exam" },
    { id: "outside", title: "Next week", date: "2026-07-20", kind: "other" },
  ];
  const week = weekDays(events, "2026-07-17", "2026-07-17");

  assertEquals(week.length, 7);
  assertEquals(
    week.map((d) => d.key),
    ["2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18"],
  );
  assertEquals(week.map((d) => d.label), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assertEquals(week[6].day, 18);
  assertEquals(week[5].isToday, true); // Friday = todayKey
  assertEquals(week[0].isToday, false);
  assertEquals(week[1].events.map((e) => e.id), ["mon"]);
  assertEquals(week[5].events.map((e) => e.id), ["fri-early", "fri-late"]); // time-sorted within the day
  assertEquals(week[6].events.map((e) => e.id), ["sat"]);
  assertEquals(week[2].events, []); // Tuesday: present, just empty
  // Next week's event must not leak into this week's cells.
  assert(week.every((d) => d.events.every((e) => e.id !== "outside")));
});
