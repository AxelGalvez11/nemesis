// Stage 1 of Google parity: what an event can say about WHEN it happens.
//
// Multi-day runs, all-day said outright, timezones, real repeat rules and moved
// occurrences — all of it through the paths that actually store and expand
// events, not through the pure helpers alone.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeCalendarEvent, encodeCalendarEvent } from "./calendar-codec";
import {
  type CalendarEvent,
  eventsByDate,
  expandRecurringEvents,
  isAllDay,
  recurrenceSpecOf,
  spanLengthOf,
} from "./calendar-model";

const base = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  date: "2026-03-02",
  id: "e1",
  kind: "class",
  title: "Contracts",
  ...over,
});

// ------------------------------------------------------------ multi-day

test("🔴 a three-day event appears on all three days", () => {
  // It used to have to be entered as three separate events, which could not be
  // moved or deleted together.
  const days = expandRecurringEvents([base({ endDate: "2026-03-04", allDay: true })]);
  assert.deepEqual(days.map((e) => e.date), ["2026-03-02", "2026-03-03", "2026-03-04"]);
  assert.deepEqual(days.map((e) => e.spanIndex), [1, 2, 3]);
  assert.ok(days.every((e) => e.spanLength === 3));
});

test("only the first day keeps a start time, only the last an end", () => {
  // A conference that begins at 2pm on Monday does not begin at 2pm on Tuesday.
  const days = expandRecurringEvents([base({ endDate: "2026-03-04", endTime: "17:00", time: "14:00" })]);
  assert.deepEqual(days.map((e) => e.time), ["14:00", undefined, undefined]);
  assert.deepEqual(days.map((e) => e.endTime), [undefined, undefined, "17:00"]);
});

test("a one-day event is untouched, and each extra day gets its own id", () => {
  const [single] = expandRecurringEvents([base()]);
  assert.equal(single!.id, "e1");
  assert.equal(single!.spanIndex, undefined);
  const ids = expandRecurringEvents([base({ endDate: "2026-03-03" })]).map((e) => e.id);
  assert.deepEqual(ids, ["e1", "e1~2026-03-03"], "two days sharing one id would collide as React keys");
});

test("a nonsense span cannot run away", () => {
  assert.equal(spanLengthOf(base({ endDate: "2026-03-01" })), 1, "an end before the start is not a span");
  assert.equal(spanLengthOf(base({ endDate: "3026-03-01" })), 366, "a typo produced a thousand-year event");
});

// ------------------------------------------------------------ all day

test("🔴 all-day is said outright, and the old guess is still the default", () => {
  assert.equal(isAllDay(base()), true, "no time still reads as all-day, as it always did");
  assert.equal(isAllDay(base({ time: "09:00" })), false);
  // The case the guess could not tell apart: a lecture whose time was never
  // captured is NOT an all-day item, and now it can say so.
  assert.equal(isAllDay(base({ allDay: false })), false);
  assert.equal(isAllDay(base({ allDay: true, time: "09:00" })), true);
});

// ------------------------------------------------------------ repeats

test("🔴 a fortnightly seminar expands fortnightly", () => {
  const events = expandRecurringEvents([
    base({ rrule: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20260330"] }),
  ]);
  assert.deepEqual(events.map((e) => e.date), ["2026-03-02", "2026-03-16", "2026-03-30"]);
});

test("a first-Monday-of-the-month lab expands to first Mondays", () => {
  const events = expandRecurringEvents([base({ rrule: ["RRULE:FREQ=MONTHLY;BYDAY=1MO;COUNT=3"] })]);
  assert.deepEqual(events.map((e) => e.date), ["2026-03-02", "2026-04-06", "2026-05-04"]);
});

test("rows written before RRULE still expand, and the new rule wins when both exist", () => {
  const legacyOnly = expandRecurringEvents([
    base({ recurrence: { days: [1], until: "2026-03-16" } }),
  ]);
  assert.deepEqual(legacyOnly.map((e) => e.date), ["2026-03-02", "2026-03-09", "2026-03-16"]);

  // A row saved by a new client carries both. The standard rule is the truth,
  // because it is the only one that can express what was meant.
  const both = expandRecurringEvents([
    base({
      recurrence: { days: [1], until: "2026-03-30" },
      rrule: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20260330"],
    }),
  ]);
  assert.deepEqual(both.map((e) => e.date), ["2026-03-02", "2026-03-16", "2026-03-30"]);
});

test("a malformed rule falls back rather than dropping the event", () => {
  const events = expandRecurringEvents([base({ rrule: ["RRULE:FREQ=NONSENSE"] })]);
  assert.deepEqual(events.map((e) => e.date), ["2026-03-02"], "the event vanished entirely");
  assert.equal(recurrenceSpecOf(base({ rrule: ["nope"] })), null);
});

// ------------------------------------------------------------ moved occurrences

test("🔴 this week's lecture moved to Friday, and the rest did not", () => {
  // Before this, the only thing that could be done to one meeting was cancel it,
  // so a moved class lost its link to the series.
  const events = expandRecurringEvents([
    base({ id: "series", rrule: ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260316"] }),
    base({ date: "2026-03-13", id: "moved", originalDate: "2026-03-09", overrideOf: "series", title: "Contracts (moved)" }),
  ]);
  const dates = events.map((e) => e.date).sort();
  assert.deepEqual(dates, ["2026-03-02", "2026-03-13", "2026-03-16"]);
  assert.ok(!dates.includes("2026-03-09"), "the lecture is drawn twice — once from the rule and once where it moved to");
});

test("an override whose series is gone is just an ordinary event", () => {
  const events = expandRecurringEvents([
    base({ date: "2026-03-13", id: "moved", originalDate: "2026-03-09", overrideOf: "deleted-series" }),
  ]);
  assert.deepEqual(events.map((e) => e.date), ["2026-03-13"]);
});

test("the order rows arrive in does not matter", () => {
  const series = base({ id: "series", rrule: ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260316"] });
  const moved = base({ date: "2026-03-13", id: "moved", originalDate: "2026-03-09", overrideOf: "series" });
  const forwards = expandRecurringEvents([series, moved]).map((e) => e.date).sort();
  const backwards = expandRecurringEvents([moved, series]).map((e) => e.date).sort();
  assert.deepEqual(forwards, backwards);
});

// ------------------------------------------------------------ storage

test("🔴 every new field survives a write and a read", () => {
  const event: CalendarEvent = base({
    allDay: false,
    endDate: "2026-03-04",
    endTime: "10:00",
    originalDate: "2026-03-09",
    overrideOf: "series",
    rrule: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", "EXDATE:20260316"],
    time: "09:00",
    timeZone: "Europe/London",
  });
  const row = encodeCalendarEvent(event, "user-1", "manual");
  const back = decodeCalendarEvent(row);
  assert.ok(back);
  for (const key of ["endDate", "allDay", "timeZone", "rrule", "overrideOf", "originalDate"] as const) {
    assert.deepEqual(back[key], event[key], `${key} did not survive storage`);
  }
});

test("the decoder refuses halves it cannot use", () => {
  // An override with no date suppresses nothing, so the moved lecture would be
  // drawn twice. Neither half is kept.
  const orphan = decodeCalendarEvent({ date: "2026-03-02", id: "x", kind: "class", override_of: "s", title: "T" });
  assert.equal(orphan?.overrideOf, undefined);
  assert.equal(orphan?.originalDate, undefined);
  // An end before the start would give a negative length.
  const backwards = decodeCalendarEvent({ date: "2026-03-02", end_date: "2026-03-01", id: "x", kind: "class", title: "T" });
  assert.equal(backwards?.endDate, undefined);
  // Empty arrays are not a rule.
  const empty = decodeCalendarEvent({ date: "2026-03-02", id: "x", kind: "class", rrule: [], title: "T" });
  assert.equal(empty?.rrule, undefined);
});

test("new fields are not swept into `extra` and written back twice", () => {
  const back = decodeCalendarEvent({
    all_day: true,
    date: "2026-03-02",
    end_date: "2026-03-04",
    id: "x",
    kind: "class",
    rrule: ["RRULE:FREQ=DAILY"],
    time_zone: "UTC",
    title: "T",
  });
  assert.equal(back?.extra, undefined, "recognised columns leaked into the unknown-key bag");
});

// ------------------------------------------------------------ the views

test("a multi-day run reaches every day's bucket", () => {
  const map = eventsByDate([base({ allDay: true, endDate: "2026-03-04" })]);
  for (const day of ["2026-03-02", "2026-03-03", "2026-03-04"]) {
    assert.equal(map.get(day)?.length, 1, `nothing on ${day}`);
  }
});

test("🔴 a multi-day run sits in the all-day strip on every day it covers", () => {
  const grid = readFileSync(new URL("../../components/workspace/calendar/time-grid.ts", import.meta.url), "utf8");
  // Drawn as a timed block it would be a bar floating at 2pm on a day it merely
  // spans, which says the wrong thing about every day but the first.
  assert.match(grid, /isAllDay\(event\) \|\| \(event\.spanLength \?\? 1\) > 1/);
});

test("🔴 the migration is written but not applied", () => {
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/20260901T10_calendar_google_parity_time.sql", import.meta.url),
    "utf8",
  );
  // This repo's rule: a production database change waits for the owner. The code
  // above must work without it, which every test in this file exercises.
  assert.match(sql, /NOT YET APPLIED/, "the migration lost the note saying it is unapplied");
  for (const column of ["end_date", "all_day", "time_zone", "rrule", "override_of", "original_date"]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}\\b`), `${column} is missing from the migration`);
  }
});
