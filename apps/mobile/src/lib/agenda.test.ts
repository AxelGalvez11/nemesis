// Deno unit tests (repo convention) for the agenda pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/agenda.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { agendaDays, labelForDay, parseCalendarDoc } from "./agenda.ts";

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
