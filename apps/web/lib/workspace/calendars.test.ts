// Stage 3 of Google parity: calendars are things, and things can be coloured.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CALENDAR_COLORS, calendarColorOf, inkOn } from "./calendar-colors";
import { monthGrid, startOfWeek, weekGrid, type WeekStart } from "./calendar-model";
import {
  type Calendar,
  calendarById,
  calendarList,
  decodeCalendar,
  encodeCalendar,
  hiddenCalendarIds,
  PRIMARY_CALENDAR,
} from "./calendars";
import { paintForEvent } from "./event-colors";

// ------------------------------------------------------------ the palette

test("the calendar palette is Google's twenty-four, and separate from the event eleven", () => {
  assert.equal(CALENDAR_COLORS.length, 24);
  assert.deepEqual(CALENDAR_COLORS.map((c) => c.id), Array.from({ length: 24 }, (_, i) => String(i + 1)));
  assert.equal(calendarColorOf("16")?.name, "Blueberry");
  assert.equal(calendarColorOf("25"), null, "an id outside the palette must not resolve");
  assert.equal(calendarColorOf(undefined), null);
});

test("🔴 ink on a pastel is dark, ink on a deep colour is white", () => {
  // This palette is mostly pastel, which is why the ink is computed rather than
  // set to white everywhere. Citron would be unreadable.
  assert.equal(inkOn("#fbe983"), "#1a1a1a", "Citron needs dark ink");
  assert.equal(inkOn("#b3dc6c"), "#1a1a1a", "Avocado needs dark ink");
  assert.equal(inkOn("#4986e7"), "#ffffff", "Blueberry needs white ink");
  assert.equal(inkOn("#ac725e"), "#ffffff", "Cocoa needs white ink");
});

// ------------------------------------------------------------ resolution order

const hexOf = (calendars: Calendar[]) => (id: string | undefined) =>
  calendarColorOf(calendars.find((c) => c.id === id)?.colorId)?.hex ?? null;

test("🔴 event colour beats calendar colour beats the kind's own", () => {
  const calendars: Calendar[] = [{ colorId: "16", id: "cal-1", name: "Timetable" }];
  const hex = hexOf(calendars);

  // Nothing set anywhere: null, so the kind's classes paint it — which is why a
  // student who colours nothing still sees exams in orange.
  assert.equal(paintForEvent({}, hex), null);

  // On a coloured calendar: the calendar's colour.
  assert.equal(paintForEvent({ calendarId: "cal-1" }, hex)?.bar.backgroundColor, "#4986e7");

  // With its own colour: the event's wins, exactly as in Google.
  assert.equal(paintForEvent({ calendarId: "cal-1", colorId: "11" }, hex)?.bar.backgroundColor, "#d50000");
});

test("an event on a calendar with no colour still falls through to its kind", () => {
  const hex = hexOf([{ id: "cal-1", name: "Personal" }]);
  assert.equal(paintForEvent({ calendarId: "cal-1" }, hex), null);
});

test("ink on a calendar-coloured bar is readable", () => {
  const hex = hexOf([{ colorId: "11", id: "cal-1", name: "Citron" }]);
  // Colour 11 is Citron, the lightest in the palette.
  assert.equal(paintForEvent({ calendarId: "cal-1" }, hex)?.bar.color, "#1a1a1a");
});

// ------------------------------------------------------------ the list

test("🔴 the primary calendar is always there and is never a row", () => {
  const list = calendarList([]);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, "", "the primary calendar must have no id — null means primary in the database");
  // A brand-new account and an account whose calendar rows failed to load look
  // the same: one calendar, holding everything.
  assert.equal(calendarById([], undefined).name, PRIMARY_CALENDAR.name);
  assert.equal(calendarById([], "gone-away").name, PRIMARY_CALENDAR.name, "a deleted calendar falls back to primary");
});

test("hidden calendars are collected for filtering", () => {
  const calendars: Calendar[] = [
    { hidden: true, id: "a", name: "Off" },
    { id: "b", name: "On" },
  ];
  assert.deepEqual([...hiddenCalendarIds(calendars)], ["a"]);
});

// ------------------------------------------------------------ storage

test("a calendar survives a write and a read", () => {
  const calendar: Calendar = {
    colorId: "16",
    defaultReminders: [{ method: "popup", minutes: 10 }],
    hidden: true,
    id: "cal-1",
    name: "Timetable",
    timeZone: "Europe/London",
  };
  const back = decodeCalendar(encodeCalendar(calendar, "user-1"));
  assert.deepEqual(back, calendar);
});

test("malformed calendars are dropped rather than half-kept", () => {
  assert.equal(decodeCalendar(null), null);
  assert.equal(decodeCalendar({ id: "x" }), null, "a calendar with no name is not a calendar");
  assert.equal(decodeCalendar({ id: "", name: "X" }), null, "an empty id would collide with the primary calendar");
  // An unknown colour paints nothing and would silently lose the fall-through.
  assert.equal(decodeCalendar({ color_id: "99", id: "x", name: "X" })?.colorId, undefined);
  // A reminder with a method nothing can act on is not a reminder.
  assert.equal(decodeCalendar({ default_reminders: [{ method: "carrier-pigeon", minutes: 5 }], id: "x", name: "X" })?.defaultReminders, undefined);
});

// ------------------------------------------------------------ week start

test("🔴 the week can start on Monday, which it could not before", () => {
  // Both grids were built on `-date.getDay()`, which can only mean Sunday —
  // and most of the world starts on Monday.
  const wednesday = new Date(2026, 2, 4);
  assert.equal(startOfWeek(wednesday, 0).getDay(), 0);
  assert.equal(startOfWeek(wednesday, 1).getDay(), 1);

  for (const weekStart of [0, 1] as WeekStart[]) {
    const week = weekGrid(wednesday, wednesday, weekStart);
    assert.equal(week.length, 7);
    assert.equal(week[0]!.date.getDay(), weekStart, "the week does not start where it was asked to");

    const month = monthGrid(2026, 2, wednesday, weekStart);
    assert.equal(month.length, 42);
    assert.equal(month[0]!.date.getDay(), weekStart, "the month grid does not start where it was asked to");
    // Whatever it starts on, the 1st has to be in there.
    assert.ok(month.some((day) => day.key === "2026-03-01"));
  }
});

test("🔴 the headings are derived from the grid, not from a Sunday-first list", () => {
  // A fixed list would have labelled the Monday column "Sun". A calendar that is
  // wrong about which day is which is worse than one starting on the wrong day.
  const grid = readFileSync(new URL("../../components/workspace/calendar/month-grid.tsx", import.meta.url), "utf8");
  assert.match(grid, /visibleDays\.slice\(0, 7\)/, "the month headings went back to a fixed list");
  assert.match(grid, /WEEKDAY_LABELS\[headDay\.date\.getDay\(\)\]/);

  const year = readFileSync(new URL("../../components/workspace/calendar/year-grid.tsx", import.meta.url), "utf8");
  assert.match(year, /days\.slice\(0, 7\)/, "the mini-month letters went back to a fixed list");
});

// ------------------------------------------------------------ the schema

test("🔴 deleting a calendar keeps its events", () => {
  const sql = readFileSync(new URL("../../../../supabase/migrations/20260901T30_calendars.sql", import.meta.url), "utf8");
  // ON DELETE CASCADE here would delete the exams that were on it. A student who
  // deletes a colour grouping has said nothing about whether their finals exist.
  assert.match(sql, /on delete set null/, "the calendar link cascades, which would delete events");
  assert.ok(!/references public\.calendars \(id\) on delete cascade/.test(sql));
  assert.match(sql, /APPLIED 2026-09-01/);
  assert.match(sql, /enable row level security/, "the calendars table is readable by anyone");
});
