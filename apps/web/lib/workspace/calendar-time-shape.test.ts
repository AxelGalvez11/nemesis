// Stage 1 of Google parity: what an event can say about WHEN it happens.
//
// Multi-day runs, all-day said outright, timezones, real repeat rules and moved
// occurrences — all of it through the paths that actually store and expand
// events, not through the pure helpers alone.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeCalendarEvent, encodeCalendarEvent } from "./calendar-codec";
import { findCalendarIssues } from "./calendar-conflicts";
import { EVENT_COLORS, paintFor } from "./event-colors";
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

test("🔴 both migrations record every column the decoder reads", () => {
  // Applied 2026-09-01 on the owner's go-ahead. The record of WHEN matters: this
  // repo's rule is that a production change waits, and a migration that does not
  // say which side of that line it is on cannot be checked against the database.
  const dir = new URL("../../../../supabase/migrations/", import.meta.url);
  const time = readFileSync(new URL("20260901T10_calendar_google_parity_time.sql", dir), "utf8");
  const fields = readFileSync(new URL("20260901T20_calendar_google_parity_fields.sql", dir), "utf8");

  for (const sql of [time, fields]) assert.match(sql, /APPLIED 2026-09-01/, "a migration does not say when it was applied");

  // Every column the decoder reads has to exist somewhere in the migrations, or
  // it silently reads null forever and nobody finds out.
  const both = `${time}\n${fields}`;
  for (const column of [
    "end_date", "all_day", "time_zone", "rrule", "override_of", "original_date",
    "location", "color_id", "status", "transparency", "visibility",
  ]) {
    assert.match(both, new RegExp(`add column if not exists ${column}\\b`), `${column} is in the code but not the schema`);
  }
});

// ------------------------------------------------------------ stage 2: the fields

test("🔴 a chosen colour overrides the kind colour, and only a real one", () => {
  assert.equal(paintFor(undefined), null, "no colour must leave the kind's own paint alone");
  assert.equal(paintFor("99"), null, "an unknown id would paint nothing and lose the kind colour");
  const paint = paintFor("11");
  assert.equal(paint?.bar.backgroundColor, "#d50000", "Tomato is not Google's Tomato");
  assert.equal(paint?.block.borderLeftColor, "#d50000");
});

test("the palette is Google's eleven, by Google's own ids", () => {
  assert.equal(EVENT_COLORS.length, 11);
  assert.deepEqual(EVENT_COLORS.map((c) => c.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  // The names are Google's too: a student sees "Tomato" in both apps or the same
  // colour has two names in two places they use.
  assert.deepEqual(
    EVENT_COLORS.map((c) => c.name),
    ["Lavender", "Sage", "Grape", "Flamingo", "Banana", "Tangerine", "Peacock", "Graphite", "Blueberry", "Basil", "Tomato"],
  );
});

test("location, colour, status, busy and visibility all survive storage", () => {
  const event: CalendarEvent = base({
    colorId: "5",
    location: "Room 3.14",
    status: "tentative",
    transparency: "transparent",
    visibility: "private",
  });
  const back = decodeCalendarEvent(encodeCalendarEvent(event, "user-1", "manual"));
  assert.ok(back);
  for (const key of ["location", "colorId", "status", "transparency", "visibility"] as const) {
    assert.equal(back[key], event[key], `${key} did not survive storage`);
  }
});

test("a value outside the allowed set is dropped rather than half-kept", () => {
  const row = { date: "2026-03-02", id: "x", kind: "class", status: "maybe", title: "T", visibility: "whoever" };
  const back = decodeCalendarEvent(row);
  assert.equal(back?.status, undefined, "an unbranchable status reached the app");
  assert.equal(back?.visibility, undefined);
});

test("🔴 a cancelled event is drawn but never reported as a problem", () => {
  const grid = readFileSync(new URL("../../components/workspace/calendar/month-grid.tsx", import.meta.url), "utf8");
  // Drawn: "this was here and is off" is exactly what a student needs on the day.
  assert.match(grid, /cancelled && "line-through opacity-50"/, "a cancelled event stopped being struck through");

  const conflicts = readFileSync(new URL("./calendar-conflicts.ts", import.meta.url), "utf8");
  // Not reported: a clash with something that is not happening is not a clash.
  assert.match(conflicts, /event\.status !== "cancelled"/, "cancelled events are being reported as conflicts again");
});

test("a cancelled lecture stops colliding with what replaced it", () => {
  const issues = findCalendarIssues([
    base({ id: "a", status: "cancelled", time: "09:00", title: "Contracts" }),
    base({ id: "b", time: "09:00", title: "Contracts" }),
  ]);
  assert.equal(issues.exact_duplicates.length, 0, "the cancelled one is still being counted as a duplicate");
});

// ------------------------------------------------------------ stage 4: people

test("🔴 guests, reminders, permissions and extras all survive storage", () => {
  const event: CalendarEvent = base({
    attachments: [{ fileUrl: "https://drive.example/x", title: "Reading list" }],
    attendees: [{ email: "supervisor@uni.example", responseStatus: "accepted" }],
    conference: { label: "Join", url: "https://meet.example/abc" },
    eventType: "focusTime",
    guestsCanInviteOthers: false,
    guestsCanModify: true,
    reminders: { overrides: [{ method: "popup", minutes: 30 }] },
    sourceTitle: "Module handbook",
    sourceUrl: "https://uni.example/handbook",
  });
  const back = decodeCalendarEvent(encodeCalendarEvent(event, "user-1", "manual"));
  assert.ok(back);
  for (const key of [
    "attendees", "reminders", "guestsCanModify", "guestsCanInviteOthers",
    "conference", "attachments", "eventType", "sourceTitle", "sourceUrl",
  ] as const) {
    assert.deepEqual(back[key], event[key], `${key} did not survive storage`);
  }
});

test("🔴 a guest with no email address is dropped, not stored blank", () => {
  // An address is the only thing identifying a guest. A blank one cannot be
  // matched to a reply, cannot be removed by the person it names, and would
  // eventually be handed to Google as an invitation to nobody.
  const back = decodeCalendarEvent({
    attendees: [{ displayName: "Somebody" }, { email: "real@uni.example" }],
    date: "2026-03-02", id: "x", kind: "class", title: "T",
  });
  assert.deepEqual(back?.attendees, [{ email: "real@uni.example" }]);
});

test("🔴 an attachment or a call link that is not http is refused", () => {
  // These are rendered as links a student clicks in their own calendar, so a
  // javascript: url would be a script they run on themselves.
  const back = decodeCalendarEvent({
    attachments: [{ fileUrl: "javascript:alert(1)" }, { fileUrl: "https://ok.example/f" }],
    conference: { url: "javascript:alert(2)" },
    date: "2026-03-02", id: "x", kind: "class",
    source_url: "data:text/html,<script>",
    title: "T",
  });
  assert.deepEqual(back?.attachments?.map((f) => f.fileUrl), ["https://ok.example/f"]);
  assert.equal(back?.conference, undefined, "a non-http call link was kept");
  assert.equal(back?.sourceUrl, undefined, "a non-http source link was kept");
});

test("a reminder outside what any calendar accepts is dropped", () => {
  const back = decodeCalendarEvent({
    date: "2026-03-02", id: "x", kind: "class",
    reminders: { overrides: [
      { method: "popup", minutes: -5 },
      { method: "carrier-pigeon", minutes: 10 },
      { method: "popup", minutes: 999_999 },
      { method: "email", minutes: 60 },
    ] },
    title: "T",
  });
  assert.deepEqual(back?.reminders?.overrides, [{ method: "email", minutes: 60 }]);
});

test("runaway lists are cut to what the database will accept", () => {
  const back = decodeCalendarEvent({
    attachments: Array.from({ length: 40 }, (_, i) => ({ fileUrl: `https://x.example/${i}` })),
    attendees: Array.from({ length: 300 }, (_, i) => ({ email: `p${i}@x.example` })),
    date: "2026-03-02", id: "x", kind: "class", title: "T",
  });
  assert.equal(back?.attendees?.length, 200);
  assert.equal(back?.attachments?.length, 25);
});

test("🔴 nothing in the calendar sends an email", () => {
  // Adding a guest in Google mails them immediately. Nemesis has never sent
  // anything, and the guest editor that said so out loud was deleted on
  // 2026-09-01 with the rest of the fields the owner cut ("I don't think we need
  // guess ... I don't think we even have a function for that" — he was right).
  //
  // The invariant outlived the screen, so it is asserted across the whole
  // calendar now rather than against one file: attendees still ride on the row,
  // still come back from an import, and still must never be mailed.
  const dir = new URL("../../components/workspace/calendar/", import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsx") && !name.endsWith(".ts")) continue;
    if (name.endsWith(".test.ts")) continue;
    const source = readFileSync(new URL(name, dir), "utf8");
    assert.ok(!/sendUpdates|mailto:/i.test(source), `${name} gained a way to send something`);
  }
});

test("🔴 every column the codec writes exists in a migration", () => {
  const dir = new URL("../../../../supabase/migrations/", import.meta.url);
  const all = ["20260901T10_calendar_google_parity_time.sql", "20260901T20_calendar_google_parity_fields.sql",
    "20260901T30_calendars.sql", "20260901T40_calendar_people_and_extras.sql"]
    .map((name) => readFileSync(new URL(name, dir), "utf8")).join("\n");
  for (const column of [
    "attendees", "reminders", "guests_can_modify", "guests_can_invite_others",
    "guests_can_see_other_guests", "conference", "attachments", "event_type",
    "source_title", "source_url", "calendar_id",
  ]) {
    assert.match(all, new RegExp(`add column if not exists ${column}\\b`), `${column} is in the code but not the schema`);
  }
});
