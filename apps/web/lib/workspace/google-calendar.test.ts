import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeCalendarEvent, encodeCalendarEvent } from "./calendar-codec";
import type { CalendarEvent } from "./calendar-model";
import {
  durationFor,
  eventsFromListResult,
  fromGoogleEvent,
  fromGoogleEvents,
  shiftDateKey,
  toGoogleCreateArgs,
  fromGoogleCalendars,
  toGooglePatchArgs,
} from "./google-calendar";
import { calendarColorOf } from "./calendar-colors";

// Guards the Google Calendar mapping (owner 2026-09-02: "be able to map events to Nemesis
// Calendar and the Google Calendar").
//
// 🔴 THE PAYLOAD SHAPES BELOW ARE REAL, THE CONTENTS ARE NOT. Every field name, every nesting and
// every asymmetry here was read off a live `GOOGLECALENDAR_EVENTS_LIST` against the owner's own
// connected account on 2026-09-02 — including the exclusive all-day end date, which is the single
// thing this file exists to pin. The titles and addresses are invented, because this repo is
// public and the owner's actual calendar is not a test fixture.

/** An all-day event, exactly the way Google returns one. */
function allDayEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    created: "2026-08-17T19:38:55.000Z",
    end: { date: "2026-08-18" },
    etag: '"3573991072049598"',
    eventType: "default",
    id: "li7usplmsuebv2lop4kdvb40g4",
    kind: "calendar#event",
    start: { date: "2026-08-17" },
    status: "confirmed",
    summary: "Composite Exam 1",
    updated: "2026-08-17T19:38:56.024Z",
    ...overrides,
  };
}

/** A timed event, with the offset and the named zone Google sends together. */
function timedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    end: { dateTime: "2026-08-24T13:00:00-05:00", timeZone: "America/Chicago" },
    etag: '"3574131060135454"',
    id: "gogq73fggqeieq0dkt34okasog",
    start: { dateTime: "2026-08-24T11:00:00-05:00", timeZone: "America/Chicago" },
    status: "confirmed",
    summary: "Seminar",
    ...overrides,
  };
}

// ── The exclusive end date ─────────────────────────────────────────────────────────────────────

test("a one-day all-day event stays one day", () => {
  // 🔴 GOOGLE'S ALL-DAY END IS EXCLUSIVE: the 17th ends on the 18th. Copied across unchanged this
  // becomes a two-day event, and EVERY all-day thing a student imports grows a day and bleeds into
  // the next morning. This is the shape of a real event on the owner's calendar.
  const mapped = fromGoogleEvent(allDayEvent());
  assert.ok(mapped);
  assert.equal(mapped.event.date, "2026-08-17");
  assert.equal(mapped.event.allDay, true);
  assert.equal(mapped.event.endDate, undefined, "one day, so no end date at all");
});

test("a multi-day all-day event ends on the last day it actually covers", () => {
  // A three-day conference: Google says start 10th, end 13th. It covers the 10th, 11th and 12th.
  const mapped = fromGoogleEvent(allDayEvent({ end: { date: "2026-09-13" }, start: { date: "2026-09-10" } }));
  assert.equal(mapped?.event.endDate, "2026-09-12");
  assert.notEqual(mapped?.event.endDate, "2026-09-13", "the end date Google sends is the day AFTER");
});

test("an all-day event written back out is exclusive again", () => {
  // The same asymmetry in reverse. Writing an inclusive end makes every all-day event one day
  // SHORT in Google, so the last day of a conference quietly disappears.
  //
  // 🔴 MOVED, NOT WEAKENED (2026-09-02). This used to assert on Google's own `{start:{date},
  // end:{date}}` resource, because that is what the read side returns and the symmetry looked
  // obvious. Composio does not accept that shape: its create action takes `start_datetime` plus a
  // DURATION, and only PATCH speaks about whole days. The invariant is unchanged — the end date
  // sent is the day AFTER the last day covered — it is now pinned on the arguments that actually
  // reach the API, which is the only place it can be wrong.
  const args = toGooglePatchArgs({ allDay: true, date: "2026-09-10", endDate: "2026-09-12", id: "x", kind: "other", title: "Conference" }, "evt");
  assert.equal(args.start_time, "2026-09-10");
  assert.equal(args.end_time, "2026-09-13");
});

test("an all-day event survives a round trip unchanged", () => {
  // Out through the patch arguments and back through the reader, as a Google payload would come.
  const original = fromGoogleEvent(allDayEvent())!.event;
  const args = toGooglePatchArgs(original, original.externalId);
  const back = fromGoogleEvent({ end: { date: args.end_time }, id: original.externalId, start: { date: args.start_time } })!.event;
  assert.equal(back.date, original.date);
  assert.equal(back.endDate, original.endDate);
  assert.equal(back.allDay, true);
});

// ── The wall clock ─────────────────────────────────────────────────────────────────────────────

test("the clock time is the one Google wrote, not the one this machine is in", () => {
  // 🔴 THIS IS WHY THE PARSE IS A REGEX AND NOT `new Date()`. "11:00:00-05:00" is eleven in the
  // morning in Chicago. Read it through a Date and ask for the hours and you get the hour in
  // whichever zone the code happens to run in: a server in UTC turns this into 16:00, and the bug
  // is invisible to anyone testing in the same zone they wrote it in.
  //
  // The suite is run under two different TZ values in CI for exactly this assertion.
  const mapped = fromGoogleEvent(timedEvent());
  assert.equal(mapped?.event.time, "11:00");
  assert.equal(mapped?.event.endTime, "13:00");
  assert.equal(mapped?.event.timeZone, "America/Chicago");
  assert.equal(mapped?.event.allDay, undefined, "a timed event is not all-day");
});

test("a timed event goes back out as a naive wall clock plus its zone", () => {
  // 🔴 MOVED WITH THE ONE ABOVE, AND THE SHAPE IS NOT A CHOICE HERE: Composio's schema says
  // "Naive date/time (YYYY-MM-DDTHH:MM:SS) with NO offsets or Z", and requires the zone alongside.
  // That happens to be exactly what Nemesis stores, so no offset arithmetic is needed either way.
  const args = toGoogleCreateArgs(fromGoogleEvent(timedEvent())!.event);
  assert.equal(args.start_datetime, "2026-08-24T11:00:00");
  assert.equal(args.timezone, "America/Chicago");
  assert.ok(!String(args.start_datetime).match(/[Z+]|-\d\d:\d\d$/), "no offset and no Z");
  // Two hours, expressed the only way this API accepts.
  assert.equal(args.event_duration_hour, 2);
  assert.equal(args.event_duration_minutes, 0);
});

test("a duration is never sent as sixty or more minutes", () => {
  // 🔴 THE SCHEMA SAYS SO TWICE, IN CAPITALS: "NEVER use 60+ minutes - use event_duration_hour=1".
  // A 90-minute lecture sent as {hour: 0, minutes: 90} is a rejected request, and writing it that
  // way is the obvious thing to do.
  const ninety = durationFor({ date: "2026-09-10", endTime: "10:30", id: "x", kind: "other", time: "09:00", title: "Lecture" });
  assert.deepEqual(ninety, { event_duration_hour: 1, event_duration_minutes: 30 });
  for (const [time, endTime] of [["09:00", "10:00"], ["09:00", "09:45"], ["08:00", "17:00"], ["09:00", "09:01"]]) {
    const d = durationFor({ date: "2026-09-10", endTime, id: "x", kind: "other", time, title: "x" });
    assert.ok(d.event_duration_minutes < 60, `${time}-${endTime} minutes stay under 60`);
    assert.ok(d.event_duration_hour <= 24, `${time}-${endTime} hours stay within range`);
  }
});

test("an event with a start and no end still gets a length Google will accept", () => {
  // "Seminar, 2pm" is most of what students actually write down. The hour used here is the one
  // calendar-conflicts.ts already assumes such an event occupies.
  const args = toGoogleCreateArgs({ date: "2026-09-10", id: "x", kind: "other", time: "14:00", timeZone: "Europe/London", title: "Seminar" });
  assert.equal(args.event_duration_hour, 1);
  assert.equal(args.event_duration_minutes, 0);
});

test("a late event's invented end does not roll past midnight", () => {
  // Google refuses an end before its start, which is what 23:30 + an hour would produce.
  const args = toGooglePatchArgs({ date: "2026-09-10", id: "x", kind: "other", time: "23:30", title: "Late" }, "evt");
  assert.equal(args.end_time, "2026-09-10T23:59:00");
});

test("a send never asks Google to email anybody, in either of the two spellings", () => {
  // 🔴🔴 COMPOSIO DEFAULTS `send_updates` TO TRUE. Left unset, adding a guest list to an event
  // mails every person on it, so a student pressing sync mails their supervisor.
  //
  // 🔴🔴 REPOINTED 2026-09-02, AND THE REASON IS THE BUG ITSELF. This asserted `false` on BOTH
  // calls, because that is the obvious thing and it is what the code did. Validating the generated
  // arguments against the live schema showed that the same field name carries two different types
  // in the same toolkit: create takes a BOOLEAN, patch takes a STRING of "all" | "externalOnly" |
  // "none" and "uses default user behavior if unspecified". So `false` on the patch was a type
  // error on the one field that decides whether other people get emailed, and the fallback is to
  // notify them. The invariant has not moved; the spelling it has to be written in has.
  const event: CalendarEvent = { date: "2026-09-10", id: "x", kind: "other", time: "09:00", title: "x" };
  assert.equal(toGoogleCreateArgs(event).send_updates, false);
  assert.equal(toGooglePatchArgs(event, "e").send_updates, "none");
});

// ── What Google carries and Nemesis does not ───────────────────────────────────────────────────

test("an imported event is 'other', never a kind guessed from its title", () => {
  // 🔴 CLAUDE.md: a rule that only makes sense for one field is wrong. Reading "Exam" out of a
  // title is a keyword list in disguise — wrong for every student who does not write their
  // calendar in English. Google has no kind field and this says so rather than inventing one.
  assert.equal(fromGoogleEvent(allDayEvent())?.event.kind, "other");
  assert.equal(fromGoogleEvent(allDayEvent({ summary: "Final Exam" }))?.event.kind, "other");
});

test("an imported event says where it came from", () => {
  // The whole point of the owner's request: an event Nemesis is MIRRORING must be distinguishable
  // from one the agent invented. Every row in the table before this said 'agent' or 'manual'.
  const mapped = fromGoogleEvent(allDayEvent());
  assert.equal(mapped?.event.origin, "google_calendar");
  assert.equal(mapped?.event.externalProvider, "google");
  assert.equal(mapped?.event.externalId, "li7usplmsuebv2lop4kdvb40g4");
  assert.equal(mapped?.event.externalCalendar, "primary");
  assert.equal(mapped?.event.externalEtag, '"3573991072049598"');
});

test("the colour the student chose in Google comes across", () => {
  // It is what makes an imported calendar readable despite every event being kind 'other'.
  assert.equal(fromGoogleEvent(allDayEvent({ colorId: "5" }))?.event.colorId, "5");
  // An id this build cannot paint would override the kind's colour with nothing.
  assert.equal(fromGoogleEvent(allDayEvent({ colorId: "97" }))?.event.colorId, undefined);
});

test("a repeating event arrives as one row carrying its rule", () => {
  // 🔴 NOT FIFTY ROWS. Asking Google with singleEvents:true expands a weekly seminar into every
  // meeting, and importing those turns one class into fifty unrelated rows that cannot be moved
  // together — the exact defect the rrule field was added to fix.
  const mapped = fromGoogleEvent(
    timedEvent({ recurrence: ["DTSTART;TZID=America/Chicago:20260824T110000", "RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;VALUE=DATE:20260907"] }),
  );
  assert.deepEqual(mapped?.event.rrule, ["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;VALUE=DATE:20260907"]);
  // 🔴 DTSTART IS DROPPED. Nemesis reads `rrule` as the repeat rule alone, and a DTSTART surviving
  // into it is a second, contradictory opinion about when the series starts next to the `date`
  // column that already says.
  assert.ok(!mapped?.event.rrule?.some((line) => line.startsWith("DTSTART")));
});

test("a changed meeting of a series reports its parent rather than guessing one", () => {
  // `overrideOf` is a Nemesis uuid and Google hands over a Google id. They cannot be the same
  // string, so the parent is reported for the caller to resolve.
  const mapped = fromGoogleEvent(
    timedEvent({ originalStartTime: { dateTime: "2026-08-24T11:00:00-05:00" }, recurringEventId: "parent_series_id" }),
  );
  assert.deepEqual(mapped?.pendingOverride, { originalDate: "2026-08-24", recurringExternalId: "parent_series_id" });
  assert.equal(mapped?.event.overrideOf, undefined, "never a Google id in a uuid column");
});

test("the video link wins over the dial-in number", () => {
  // 🔴 `entryPoints[0]` IS SOMETIMES THE PHONE. Taking the first one puts a tel: link where the
  // Join button goes, and it looks like a working link right up until somebody clicks it.
  const mapped = fromGoogleEvent(
    timedEvent({
      conferenceData: {
        conferenceId: "abc-defg-hij",
        conferenceSolution: { name: "Google Meet" },
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+1-555-0100" },
          { entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" },
        ],
      },
    }),
  );
  assert.equal(mapped?.event.conference?.url, "https://meet.google.com/abc-defg-hij");
  assert.equal(mapped?.event.conference?.label, "Google Meet");
});

test("guests, reminders and a location all come across", () => {
  const mapped = fromGoogleEvent(
    timedEvent({
      attendees: [{ email: "tutor@example.edu", organizer: true, responseStatus: "accepted" }],
      location: "Room 4.12",
      reminders: { overrides: [{ method: "popup", minutes: 420 }], useDefault: false },
    }),
  );
  assert.equal(mapped?.event.location, "Room 4.12");
  assert.equal(mapped?.event.attendees?.[0]?.email, "tutor@example.edu");
  assert.deepEqual(mapped?.event.reminders?.overrides, [{ method: "popup", minutes: 420 }]);
});

test("a guest list is never sent back to Google", () => {
  // 🔴🔴 PUTTING A GUEST LIST ON A GOOGLE EVENT EMAILS EVERY PERSON ON IT. calendar-model.ts
  // already calls the attendee list "a record, never an instruction"; sending it here would turn a
  // student pressing sync into a student mailing their supervisor. A deliberate refusal, so it is
  // pinned rather than left to be helpfully "completed" later.
  const withGuests: CalendarEvent = {
    attendees: [{ email: "supervisor@example.edu" }],
    date: "2026-09-10",
    id: "x",
    kind: "other",
    time: "10:00",
    title: "Supervision",
  };
  assert.equal(toGoogleCreateArgs(withGuests).attendees, undefined);
  assert.equal(toGooglePatchArgs(withGuests, "evt").attendees, undefined);
});

// ── Refusing what cannot be placed ─────────────────────────────────────────────────────────────

test("an event that cannot be identified or placed is skipped, not invented", () => {
  // A fabricated date on a student's calendar is worse in every way than one row not arriving.
  assert.equal(fromGoogleEvent(allDayEvent({ id: "" })), null, "no id, nothing to link to");
  assert.equal(fromGoogleEvent({ id: "x", summary: "No start" }), null, "no start, nowhere to put it");
  assert.equal(fromGoogleEvent(null), null);
  assert.equal(fromGoogleEvent("not an event"), null);
});

test("one unreadable event does not lose the rest of the page", () => {
  const mapped = fromGoogleEvents([allDayEvent(), { summary: "broken" }, timedEvent()]);
  assert.equal(mapped.length, 2);
});

test("the events are found wherever the broker put them", () => {
  // 🔴 A live call returned them at data.items; the documented envelope also describes
  // data.response_data.items. Reading one path only is how this dies on a day nobody deployed.
  assert.equal(eventsFromListResult({ data: { items: [allDayEvent()] } }).length, 1);
  assert.equal(eventsFromListResult({ data: { response_data: { items: [allDayEvent()] } } }).length, 1);
  assert.deepEqual(eventsFromListResult({ data: {} }), [], "an unknown shape is no events, not a throw");
  assert.deepEqual(eventsFromListResult(null), []);
});

test("shifting a date key never touches a timezone", () => {
  assert.equal(shiftDateKey("2026-08-17", 1), "2026-08-18");
  assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDateKey("2028-02-28", 1), "2028-02-29", "leap year");
});

// ── The link has to survive the database ───────────────────────────────────────────────────────

test("an imported event's link survives being saved and read back", () => {
  // 🔴 THE FAILURE THIS CATCHES IS SILENT AND PERMANENT. The codec drops every key it does not
  // name, so a link written by the importer and unknown to the decoder would be gone on the first
  // read — and the next save would write the row back WITHOUT it, cutting the event loose from
  // Google for good, with no error anywhere.
  const imported = fromGoogleEvent(allDayEvent())!.event;
  const row = encodeCalendarEvent({ ...imported, id: "11111111-1111-4111-8111-111111111111" }, "user-1", "manual");
  assert.equal(row.external_provider, "google");
  assert.equal(row.external_id, "li7usplmsuebv2lop4kdvb40g4");
  assert.equal(row.origin, "google_calendar");

  const back = decodeCalendarEvent(row);
  assert.equal(back?.externalProvider, "google");
  assert.equal(back?.externalId, "li7usplmsuebv2lop4kdvb40g4");
  assert.equal(back?.externalCalendar, "primary");
  assert.equal(back?.externalEtag, '"3573991072049598"');
  // The marker itself. `ORIGINS` is a closed set and a value missing from it is dropped on read,
  // so widening the database's CHECK constraint alone would not have been enough.
  assert.equal(back?.origin, "google_calendar", "the origin is not silently dropped as unknown");
});

test("a half-filled link is dropped rather than half-kept", () => {
  // A row claiming to be linked but unable to say to what is worse than one that admits it is
  // local, and the database's `calendar_events_external_pair` refuses it outright.
  const orphan = decodeCalendarEvent({ date: "2026-09-10", external_id: "abc", id: "1", kind: "other", title: "x" });
  assert.equal(orphan?.externalId, undefined);
  const noId = decodeCalendarEvent({ date: "2026-09-10", external_provider: "google", id: "1", kind: "other", title: "x" });
  assert.equal(noId?.externalProvider, undefined);
  // And nothing half-filled is ever written back out, or every save of that row would fail.
  const row = encodeCalendarEvent({ date: "2026-09-10", externalId: "abc", id: "1", kind: "other", title: "x" }, "u", "manual");
  assert.equal(row.external_id, null);
  assert.equal(row.external_provider, null);
});

test("the cloud query asks for the link columns", () => {
  // 🔴 A COLUMN MISSING FROM THE SELECT IS A FIELD THAT DOES NOT EXIST as far as the product is
  // concerned: the decoder can only decode what was asked for, and an imported event would load
  // back looking exactly like one somebody typed.
  const model = readFileSync(new URL("./calendar-model.ts", import.meta.url), "utf8");
  const columns = /const CALENDAR_EVENT_COLUMNS =\s*\n?\s*"([^"]+)"/.exec(model)?.[1] ?? "";
  for (const column of ["external_provider", "external_id", "external_calendar", "external_etag", "external_updated", "origin"]) {
    assert.ok(columns.split(",").includes(column), `${column} is selected`);
  }
});

// ── Conformance with the real API ──────────────────────────────────────────────────────────────

/**
 * The two write actions' schemas, as Composio really published them on 2026-09-02.
 *
 * 🔴🔴 THIS FIXTURE IS THE ONLY REASON TWO REAL BUGS WERE CAUGHT, AND NEITHER WAS VISIBLE BY
 * READING THE CODE. The first: Composio does not accept Google's own event resource at all, so a
 * mapping written from Google's documentation produced a request this API ignores. The second is
 * worse and is pinned below — `send_updates` is a BOOLEAN on create and a STRING on patch, in the
 * same toolkit, on a field whose whole job is deciding whether other people get emailed.
 *
 * Trimmed to types, enums and bounds. Re-fetch it from
 * `GET /api/v3/tools/<slug>` if Composio changes the contract; a red test here means the request
 * this product sends has stopped being one the API accepts, which is a failure that is otherwise
 * completely silent.
 */
const SCHEMAS = JSON.parse(
  readFileSync(new URL("./google-calendar-schema.fixture.json", import.meta.url), "utf8"),
) as Record<string, { required: string[]; properties: Record<string, { type?: string; enum?: unknown[]; maximum?: number; minimum?: number }> }>;

function conformance(args: Record<string, unknown>, action: string): string[] {
  const schema = SCHEMAS[action]!;
  const problems: string[] = [];
  for (const required of schema.required) if (!(required in args)) problems.push(`missing required ${required}`);
  for (const [key, value] of Object.entries(args)) {
    const spec = schema.properties[key];
    if (!spec) {
      problems.push(`unknown field ${key}`);
      continue;
    }
    const actual = Array.isArray(value) ? "array" : typeof value;
    const wanted = spec.type === "integer" ? "number" : spec.type;
    if (wanted && actual !== wanted) problems.push(`${key} is ${actual}, schema wants ${spec.type}`);
    if (spec.enum && !spec.enum.includes(value)) problems.push(`${key}=${String(value)} is not in ${spec.enum.join("|")}`);
    if (typeof value === "number" && spec.maximum !== undefined && value > spec.maximum) problems.push(`${key} over max`);
    if (typeof value === "number" && spec.minimum !== undefined && value < spec.minimum) problems.push(`${key} under min`);
  }
  return problems;
}

/** The shapes a student's calendar actually contains. */
const WRITE_CASES: [string, CalendarEvent][] = [
  ["a 90-minute lecture", { date: "2026-09-10", endTime: "10:30", id: "x", kind: "class", location: "Room 4.12", note: "Bring the reader", time: "09:00", timeZone: "America/Chicago", title: "Lecture" }],
  ["a three-day conference", { allDay: true, date: "2026-09-10", endDate: "2026-09-12", id: "x", kind: "other", title: "Conference" }],
  ["a seminar with no end", { date: "2026-09-10", id: "x", kind: "exam", time: "14:00", title: "Seminar" }],
  ["a weekly lab", { date: "2026-09-10", endTime: "10:00", id: "x", kind: "class", rrule: ["RRULE:FREQ=WEEKLY;BYDAY=MO"], time: "09:00", timeZone: "Europe/London", title: "Lab" }],
  ["a three-week placement", { allDay: true, date: "2026-09-10", endDate: "2026-09-30", id: "x", kind: "rotation", title: "Placement" }],
  ["a late one, marked private", { date: "2026-09-10", id: "x", kind: "other", time: "23:30", title: "Late", transparency: "transparent", visibility: "private" }],
];

test("every write this product sends is one the API actually accepts", () => {
  for (const [label, event] of WRITE_CASES) {
    assert.deepEqual(
      conformance(toGoogleCreateArgs(event, { timeZone: "UTC" }), "GOOGLECALENDAR_CREATE_EVENT"),
      [],
      `create: ${label}`,
    );
    assert.deepEqual(
      conformance(toGooglePatchArgs(event, "evt_1", { timeZone: "UTC" }), "GOOGLECALENDAR_PATCH_EVENT"),
      [],
      `patch: ${label}`,
    );
  }
});

// ── The calendar list, and the colours that ride on it ────────────────────────────────────────
//
// 🔴 THE FIXTURE IS THE REAL PAYLOAD. Called live through `GOOGLECALENDAR_LIST_CALENDARS` against
// the owner's own account on 2026-09-03; these three entries are his, trimmed to the fields this
// reads. An invented fixture here would be inventing the very shape the code has to survive.
const CALENDAR_LIST = {
  calendars: [
    {
      accessRole: "owner", backgroundColor: "#cd74e6", colorId: "23",
      foregroundColor: "#000000", id: "family18281144437862189208@group.calendar.google.com",
      kind: "calendar#calendarListEntry", selected: true, summary: "Family", timeZone: "UTC",
    },
    {
      accessRole: "reader", backgroundColor: "#16a765", colorId: "8",
      description: "Holidays and Observances in United States", foregroundColor: "#000000",
      id: "en.usa#holiday@group.v.calendar.google.com", kind: "calendar#calendarListEntry",
      selected: true, summary: "Holidays in United States", timeZone: "America/Chicago",
    },
    {
      accessRole: "owner", backgroundColor: "#9fe1e7", colorId: "14", foregroundColor: "#000000",
      id: "axelgalvez1121@gmail.com", kind: "calendar#calendarListEntry", primary: true,
      selected: true, summary: "axelgalvez1121@gmail.com", timeZone: "America/Chicago",
    },
  ],
};

test("🔴🔴 a Google calendar arrives with the colour it has in Google", () => {
  const read = fromGoogleCalendars(CALENDAR_LIST);
  assert.equal(read.length, 3);
  // 🔴 OUR PALETTE IS GOOGLE'S, BYTE FOR BYTE, so this is a pass-through and not a mapping table:
  // 23 is Grape #cd74e6, 8 is Basil #16a765, 14 is Peacock #9fe1e7 in `calendar-colors.ts`.
  assert.deepEqual(read.map((c) => c.colorId), ["23", "8", "14"]);
  assert.equal(calendarColorOf(read[0]!.colorId)?.hex, "#cd74e6");
  assert.equal(calendarColorOf(read[1]!.colorId)?.name, "Basil");
  assert.equal(read[0]!.name, "Family");
  assert.equal(read[1]!.timeZone, "America/Chicago");
});

test("🔴🔴 Google's PRIMARY becomes ours, under the empty id", () => {
  // Nemesis files a local event under `""` and a synced one under nothing at all — `fromGoogleEvent`
  // records `externalCalendar` and leaves `calendarId` unset, so both resolve to the primary.
  // Giving Google's primary that same id is the whole reason a synced event comes out in the colour
  // it has in Google.
  const primary = fromGoogleCalendars(CALENDAR_LIST).find((c) => c.id === "");
  assert.ok(primary, "Google's primary calendar did not map onto ours");
  assert.equal(primary.colorId, "14", "the primary arrived without its colour");
  assert.ok(!fromGoogleCalendars(CALENDAR_LIST).some((c) => c.id === "axelgalvez1121@gmail.com"), "the primary was also stored under its Google id, so it exists twice");
});

test("🔴 `selected: false` is hidden, not deleted", () => {
  const off = fromGoogleCalendars({ calendars: [{ colorId: "8", id: "x", selected: false, summary: "Muted" }] });
  assert.equal(off[0]?.hidden, true);
  // The row still ARRIVES: unticking a calendar in Google and ticking it back must not lose its
  // colour on the way through.
  assert.equal(off[0]?.colorId, "8");
});

test("🔴 the hex is the fallback, and only when there is no id", () => {
  // A colour id survives Google changing its hexes and is what a write back would send. The
  // background is consulted only for an entry that has no id — a calendar carrying a custom colour.
  const byHex = fromGoogleCalendars({ calendars: [{ backgroundColor: "#16A765", id: "y", summary: "Custom" }] });
  assert.equal(byHex[0]?.colorId, "8", "an entry with only a background colour lost it");
  const unknown = fromGoogleCalendars({ calendars: [{ backgroundColor: "#123456", id: "z", summary: "Odd" }] });
  assert.equal(unknown[0]?.colorId, undefined, "a hex that is not Google's was forced onto the nearest swatch");
  assert.equal(unknown[0]?.name, "Odd", "the calendar itself was dropped along with its unknown colour");
});

test("🔴 a payload that is not a list comes back empty rather than throwing", () => {
  // This runs inside a sync that must not fail because a colour could not be read.
  for (const junk of [null, undefined, {}, { calendars: "no" }, { calendars: [null, 7] }]) {
    assert.deepEqual(fromGoogleCalendars(junk), [], `${JSON.stringify(junk)} did not come back empty`);
  }
  // Google's own REST shape uses `items`; Composio re-keys it to `calendars`. Both are read.
  assert.equal(fromGoogleCalendars({ items: [{ colorId: "8", id: "a", summary: "A" }] }).length, 1);
});
