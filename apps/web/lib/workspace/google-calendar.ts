// Google Calendar events, in and out.
//
// Owner 2026-09-02, verbatim: "be able to use Google Calendar and also be able to map events to
// Nemesis Calendar and the Google Calendar. And be able to resolve discrepancies with
// scheduling. Those are pretty much the core functional features."
//
// 🔴🔴 THE CONNECTION ALREADY WORKED. THIS IS WHAT WAS MISSING. Google Calendar has been an
// offered app since #929, the owner's account has had two ACTIVE connections since 2026-09-01,
// and a live `GOOGLECALENDAR_EVENTS_LIST` returns their real events today. What did not exist was
// any code that could turn one of those events into a Nemesis row, or a Nemesis row back into
// one. The whole feature was a door with nothing behind it: `calendar_events` held 172 rows and
// every one of them said `source` 'agent' or 'manual'. Not one had ever come from Google.
//
// 🔴 PURE. No React, no network, no Supabase. Every function here is a shape change over plain
// objects, which is what lets the whole thing be tested against real captured payloads rather
// than against a mock of what we hope Google sends.
//
// ── THE FOUR THINGS GOOGLE DOES THAT A NAIVE MAPPING GETS WRONG ────────────────────────────────
//
// 🔴🔴 1. AN ALL-DAY EVENT'S `end.date` IS EXCLUSIVE. A one-day exam on the 17th comes back as
// `start.date: "2026-08-17", end.date: "2026-08-18"`. Copied across as-is it becomes a TWO-DAY
// event, and every all-day thing a student imports silently grows a day and bleeds into the next
// morning. This is not hypothetical: it is exactly the shape of "Composite Exam 1" on the owner's
// own calendar, read live on 2026-09-02. Timed events have an inclusive end. The two halves of
// one API disagree, so the conversion has to know which half it is looking at.
//
// 🔴🔴 2. THE WALL CLOCK IS IN THE STRING, AND `new Date()` THROWS IT AWAY. Google sends
// `"2026-08-24T11:00:00-05:00"` with `timeZone: "America/Chicago"`, meaning eleven in the
// morning in Chicago. Nemesis stores a local time plus its zone, which is the same fact. Parsing
// that through a Date and reading the hours back gives the hour in whatever zone the CODE happens
// to run in: a server in UTC turns an 11am class into 4pm, and the bug only shows up for people
// in a different zone from the machine. So the wall clock is read straight out of the text and
// never passes through a Date at all.
//
// 🔴 3. A REPEATING EVENT IS ONE ROW, NOT FIFTY. Ask Google with `singleEvents: true` and a weekly
// seminar arrives as every individual meeting, each with its own id. Import those and one class
// becomes fifty unrelated rows that cannot be edited or moved together, which is the same defect
// the `rrule` field was added to fix. So the pull asks for the SERIES (`singleEvents: false`) and
// this maps Google's RRULE lines onto the field Nemesis already speaks.
//
// 🔴 4. GOOGLE HAS NO IDEA WHAT AN EXAM IS. Nemesis events carry a `kind` — exam, assignment,
// class — and there is no Google field that holds it. The tempting fix is to read the title for
// words like "exam" or "due", and that is a keyword list wearing a disguise: it is wrong for
// every student who does not write their calendar in English, and CLAUDE.md rules it out. So an
// imported event is `other` and says so. It is not left colourless, though: Google carries the
// colour the student chose THEMSELVES, and `colorId` is a field both sides already have, so an
// imported calendar arrives looking the way its owner painted it.

import type { DecodedCalendarEvent, ExternalProvider } from "./calendar-codec";
import type { CalendarEvent, EventAttachment, EventAttendee, EventReminders } from "./calendar-model";
import { eventColorOf } from "./event-colors";

// 🔴 THE LINK FIELDS LIVE IN `calendar-codec.ts`, NOT HERE, and that is this codebase's own
// hardest-won rule. The codec is the one place an event crosses the schema boundary; a second
// definition of the same fields beside it is exactly the two-decoders arrangement whose header
// explains how a field gets silently deleted from the database. Re-exported so a caller working
// with Google events still has one import site.
export type { ExternalLink, ExternalProvider } from "./calendar-codec";

/**
 * A Nemesis event that definitely lives somewhere else too.
 *
 * 🔴 THE THREE IDENTITY FIELDS ARE REQUIRED HERE AND OPTIONAL IN THE CODEC, ON PURPOSE. The codec
 * describes any row, most of which are local. This describes the output of reading a Google event,
 * where "we could not work out which event this is" is not a state that can exist — so the type
 * makes it unrepresentable rather than leaving every caller to check.
 */
export type LinkedCalendarEvent = DecodedCalendarEvent & {
  externalProvider: ExternalProvider;
  externalId: string;
  externalCalendar: string;
};

/**
 * A series instance that overrides one meeting, before its parent has been resolved.
 *
 * 🔴 `overrideOf` IS A NEMESIS UUID, AND GOOGLE HANDS US A GOOGLE ID. The two cannot be the same
 * string, so the mapper reports the Google id it was given and the caller looks up which local row
 * that is. Guessing here would write a foreign key to a row that does not exist.
 */
export interface PendingOverride {
  /** The Google id of the series this row is one changed meeting of. */
  recurringExternalId: string;
  /** The date in that series this row stands in for. */
  originalDate: string;
}

export interface MappedGoogleEvent {
  event: LinkedCalendarEvent;
  /** Present only when this row is a changed meeting of a series. */
  pendingOverride?: PendingOverride;
}

// ── Reading Google ─────────────────────────────────────────────────────────────────────────────

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;
// The wall clock, read out of the text. Anything after the seconds (a Z, a +01:00, a fraction) is
// the offset that ALREADY produced these digits, and re-applying it is how a time moves.
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

const STATUSES = new Set(["confirmed", "tentative", "cancelled"]);
const TRANSPARENCIES = new Set(["opaque", "transparent"]);
const VISIBILITIES = new Set(["default", "public", "private", "confidential"]);
const EVENT_TYPES = new Set(["default", "outOfOffice", "focusTime", "workingLocation"]);
const RESPONSES = new Set(["needsAction", "declined", "tentative", "accepted"]);
const REMINDER_METHODS = new Set(["popup", "email"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Shift a yyyy-mm-dd key by whole days, without going near a timezone. */
export function shiftDateKey(key: string, days: number): string {
  const at = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  const moved = new Date(at + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

interface Endpoint {
  date: string;
  time?: string;
  timeZone?: string;
  allDay: boolean;
}

/** One end of a Google event, read without letting a Date near the wall clock. */
function readEndpoint(raw: unknown): Endpoint | null {
  const point = obj(raw);
  if (!point) return null;
  const dateOnly = DATE_ONLY.exec(text(point.date));
  if (dateOnly) return { allDay: true, date: dateOnly[1]! };
  const stamp = DATE_TIME.exec(text(point.dateTime));
  if (!stamp) return null;
  const zone = text(point.timeZone);
  return { allDay: false, date: stamp[1]!, time: `${stamp[2]}:${stamp[3]}`, ...(zone ? { timeZone: zone } : {}) };
}

function readAttendees(raw: unknown): EventAttendee[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: EventAttendee[] = [];
  for (const entry of raw) {
    const row = obj(entry);
    const email = text(row?.email);
    if (!row || !email) continue;
    const attendee: EventAttendee = { email };
    const displayName = text(row.displayName);
    if (displayName) attendee.displayName = displayName;
    if (row.optional === true) attendee.optional = true;
    if (row.organizer === true) attendee.organizer = true;
    if (row.self === true) attendee.self = true;
    const response = text(row.responseStatus);
    if (RESPONSES.has(response)) attendee.responseStatus = response as EventAttendee["responseStatus"];
    const comment = text(row.comment);
    if (comment) attendee.comment = comment;
    out.push(attendee);
  }
  return out.length > 0 ? out : undefined;
}

function readReminders(raw: unknown): EventReminders | undefined {
  const row = obj(raw);
  if (!row) return undefined;
  const reminders: EventReminders = {};
  if (row.useDefault === true) reminders.useDefault = true;
  if (Array.isArray(row.overrides)) {
    const overrides = row.overrides
      .map((entry) => obj(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({ method: text(entry.method), minutes: Number(entry.minutes) }))
      .filter((entry) => REMINDER_METHODS.has(entry.method) && Number.isInteger(entry.minutes) && entry.minutes >= 0)
      .map((entry) => ({ method: entry.method as "popup" | "email", minutes: entry.minutes }));
    if (overrides.length > 0) reminders.overrides = overrides;
  }
  return reminders.useDefault || reminders.overrides ? reminders : undefined;
}

function readAttachments(raw: unknown): EventAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: EventAttachment[] = [];
  for (const entry of raw) {
    const row = obj(entry);
    const fileUrl = text(row?.fileUrl);
    if (!row || !fileUrl) continue;
    const attachment: EventAttachment = { fileUrl };
    const title = text(row.title);
    if (title) attachment.title = title;
    const mimeType = text(row.mimeType);
    if (mimeType) attachment.mimeType = mimeType;
    const iconLink = text(row.iconLink);
    if (iconLink) attachment.iconLink = iconLink;
    const fileId = text(row.fileId);
    if (fileId) attachment.fileId = fileId;
    out.push(attachment);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * The video call on an event, if it has one.
 *
 * 🔴 THE VIDEO ENTRY POINT, NOT THE FIRST ONE. `entryPoints` also carries the dial-in phone number
 * and, on some events, that sorts first. Taking `[0]` puts a `tel:` link where the Join button
 * goes, and it looks like a working link right up until somebody clicks it.
 */
function readConference(raw: unknown): CalendarEvent["conference"] | undefined {
  const data = obj(raw);
  if (!data) return undefined;
  const points = Array.isArray(data.entryPoints) ? data.entryPoints : [];
  const video = points
    .map((entry) => obj(entry))
    .find((entry) => entry !== null && text(entry.entryPointType) === "video");
  const url = text(video?.uri);
  const solution = obj(data.conferenceSolution);
  const label = text(solution?.name);
  const id = text(data.conferenceId);
  if (!url && !label && !id) return undefined;
  return { ...(url ? { url } : {}), ...(label ? { label } : {}), ...(id ? { id } : {}) };
}

/**
 * Only the RRULE/RDATE/EXDATE lines.
 *
 * 🔴 GOOGLE PUTS `DTSTART` IN HERE ON SOME EVENTS and Nemesis's parser reads `rrule` as the repeat
 * rule alone. A DTSTART line surviving into that field is a second, contradictory opinion about
 * when the series begins, sitting next to the `date` column that already says.
 */
function readRecurrence(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lines = raw
    .map((line) => text(line))
    // 🔴 `;` AS WELL AS `:`. An iCalendar line may carry parameters before its value, and Google
    // uses them constantly: `EXDATE;VALUE=DATE:20260907`, `RDATE;TZID=America/Chicago:...`.
    // Requiring a colon straight after the keyword throws away every cancelled meeting of a
    // series, so a lecture the student was told was cancelled goes on showing up. Caught by the
    // test below, which was written from a real Google payload rather than from this regex.
    .filter((line) => /^(RRULE|RDATE|EXDATE)[;:]/i.test(line));
  return lines.length > 0 ? lines : undefined;
}

export interface FromGoogleOptions {
  /** The calendar it was read from. Defaults to Google's own name for the default calendar. */
  calendar?: string;
  provider?: ExternalProvider;
}

/**
 * One Google event → one Nemesis row, or null when it is not an event we can place.
 *
 * 🔴 NULL RATHER THAN A GUESS. An event with no id cannot be linked, and one with no usable start
 * cannot be put on a day. Both come back as null so the caller skips them; inventing today's date
 * for an unreadable event puts a fabricated thing on a student's calendar, which is worse in every
 * way than one row not arriving.
 */
export function fromGoogleEvent(raw: unknown, options: FromGoogleOptions = {}): MappedGoogleEvent | null {
  const row = obj(raw);
  if (!row) return null;
  const externalId = text(row.id);
  if (!externalId) return null;

  const start = readEndpoint(row.start);
  if (!start) return null;
  const end = readEndpoint(row.end);

  const event: LinkedCalendarEvent = {
    // 🔴 NOT GOOGLE'S ID. `calendar_events.id` is a uuid the database mints, and Google's ids are
    // not uuids. The link lives in `externalId`; the caller supplies the local id (a fresh one for
    // an import, the existing one for an update).
    date: start.date,
    externalCalendar: options.calendar ?? "primary",
    externalId,
    externalProvider: options.provider ?? "google",
    id: "",
    // Google does not have this idea; see the header for why it is not guessed from the title.
    kind: "other",
    // Why this row exists, in the vocabulary the rest of the calendar already uses.
    origin: "google_calendar",
    title: text(row.summary) || "(no title)",
  };

  if (start.allDay) {
    event.allDay = true;
    // 🔴 EXCLUSIVE → INCLUSIVE. See the header. A one-day event's end is the next morning, so the
    // last day it actually covers is the day before that, and when that IS the start day the event
    // is simply one day long and carries no end date at all.
    if (end?.allDay) {
      const lastDay = shiftDateKey(end.date, -1);
      if (lastDay > start.date) event.endDate = lastDay;
    }
  } else {
    event.time = start.time;
    if (start.timeZone) event.timeZone = start.timeZone;
    if (end && !end.allDay) {
      event.endTime = end.time;
      // A meeting that runs past midnight ends on a later day, and that day is inclusive here.
      if (end.date > start.date) event.endDate = end.date;
    }
  }

  const description = text(row.description);
  if (description) event.note = description;
  const location = text(row.location);
  if (location) event.location = location;

  // Only an id this build can paint. An unknown one silently overrides the kind's colour with
  // nothing, leaving an event that reads as deliberately colourless.
  const colorId = text(row.colorId);
  if (colorId && eventColorOf(colorId)) event.colorId = colorId;

  const status = text(row.status);
  if (STATUSES.has(status)) event.status = status as CalendarEvent["status"];
  const transparency = text(row.transparency);
  if (TRANSPARENCIES.has(transparency)) event.transparency = transparency as CalendarEvent["transparency"];
  const visibility = text(row.visibility);
  if (VISIBILITIES.has(visibility)) event.visibility = visibility as CalendarEvent["visibility"];
  const eventType = text(row.eventType);
  if (EVENT_TYPES.has(eventType)) event.eventType = eventType as CalendarEvent["eventType"];

  const attendees = readAttendees(row.attendees);
  if (attendees) event.attendees = attendees;
  const reminders = readReminders(row.reminders);
  if (reminders) event.reminders = reminders;
  const attachments = readAttachments(row.attachments);
  if (attachments) event.attachments = attachments;
  const conference = readConference(row.conferenceData);
  if (conference) event.conference = conference;
  const rrule = readRecurrence(row.recurrence);
  if (rrule) event.rrule = rrule;

  if (row.guestsCanModify === true) event.guestsCanModify = true;
  if (row.guestsCanInviteOthers === false) event.guestsCanInviteOthers = false;
  if (row.guestsCanSeeOtherGuests === false) event.guestsCanSeeOtherGuests = false;

  const source = obj(row.source);
  const sourceTitle = text(source?.title);
  if (sourceTitle) event.sourceTitle = sourceTitle;
  const sourceUrl = text(source?.url);
  if (sourceUrl) event.sourceUrl = sourceUrl;

  const etag = text(row.etag);
  if (etag) event.externalEtag = etag;
  const updated = text(row.updated);
  if (updated) event.externalUpdated = updated;

  const mapped: MappedGoogleEvent = { event };
  const recurringExternalId = text(row.recurringEventId);
  if (recurringExternalId) {
    const original = readEndpoint(row.originalStartTime);
    if (original) mapped.pendingOverride = { originalDate: original.date, recurringExternalId };
  }
  return mapped;
}

/** A whole page of Google events, dropping the ones that cannot be placed rather than failing. */
export function fromGoogleEvents(raw: unknown, options: FromGoogleOptions = {}): MappedGoogleEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: MappedGoogleEvent[] = [];
  for (const entry of raw) {
    const mapped = fromGoogleEvent(entry, options);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * The events out of a `GOOGLECALENDAR_EVENTS_LIST` result, wherever Composio put them.
 *
 * 🔴 THE BROKER WRAPS THE PAYLOAD AND HAS MOVED IT BEFORE. A live call on 2026-09-02 returned the
 * events under `data.items`; the documented envelope also describes `data.response_data.items`.
 * Reading one path only is how this feature dies quietly on a day nobody deployed anything, so
 * both are tried and an unrecognised shape yields no events rather than an exception.
 */
export function eventsFromListResult(result: unknown): unknown[] {
  const body = obj(result);
  if (!body) return [];
  const data = obj(body.data) ?? body;
  if (Array.isArray(data.items)) return data.items;
  const nested = obj(data.response_data);
  if (nested && Array.isArray(nested.items)) return nested.items;
  return [];
}

// ── Writing Google ─────────────────────────────────────────────────────────────────────────────
//
// 🔴🔴🔴 COMPOSIO DOES NOT TAKE GOOGLE'S OWN EVENT SHAPE, AND ASSUMING IT DID WOULD HAVE SHIPPED A
// SEND BUTTON THAT SILENTLY DID NOTHING. This was written first against Google's documented
// resource — `{ start: { dateTime, timeZone }, end: {...} }` — because that is what the read side
// returns and the symmetry is obvious. Then the live schemas were fetched (2026-09-02) and every
// field name was wrong:
//
//     GOOGLECALENDAR_EVENTS_LIST   camelCase: calendarId, timeMin, singleEvents
//     GOOGLECALENDAR_CREATE_EVENT  snake_case: calendar_id, start_datetime — and NO end at all
//
// One toolkit, two conventions, and a create action that takes a START PLUS A DURATION rather than
// a start and an end. Nothing about the read side hints at it. This is the file header's own
// warning about writing against documentation instead of a live response, caught the only way it
// can be caught: by asking the API what it actually wants.
//
// 🔴🔴 AND `send_updates` DEFAULTS TO TRUE, WHICH MEANS COMPOSIO EMAILS THE GUESTS UNLESS TOLD NOT
// TO. Combined with an `attendees` list that is plain email strings rather than objects, the
// obvious mapping — copy the attendees across — would have had a student's sync button quietly
// mail their supervisor and their whole seminar group. It is turned off explicitly below, in
// writing, next to the reason.

/** How long an event with no stated end is assumed to run. The hour `calendar-conflicts.ts`
 *  already assumes, so the two agree rather than each inventing a length. */
const DEFAULT_DURATION_MINUTES = 60;

function minutesOfTime(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function withSeconds(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return "00:00:00";
  return `${match[1]!.padStart(2, "0")}:${match[2]}:00`;
}

/** Whole days between two date keys, without going near a timezone. */
function daysBetweenKeys(from: string, to: string): number {
  const at = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * How long an event runs, in the two fields Composio insists on.
 *
 * 🔴 MINUTES ARE 0-59 AND NOTHING ELSE. The schema says so twice, in capitals: "NEVER use 60+
 * minutes - use event_duration_hour=1 instead." A 90-minute lecture sent as
 * `{hour: 0, minutes: 90}` is a rejected request, and the obvious way to write this is exactly
 * that. Hours cap at 24, so anything longer is clamped rather than sent to be refused.
 */
export function durationFor(event: CalendarEvent): { event_duration_hour: number; event_duration_minutes: number } {
  const start = minutesOfTime(event.time);
  const end = minutesOfTime(event.endTime);
  let total = DEFAULT_DURATION_MINUTES;
  if (start !== null && end !== null) {
    const dayShift = event.endDate && event.endDate > event.date ? daysBetweenKeys(event.date, event.endDate) * 1440 : 0;
    const span = end + dayShift - start;
    if (span > 0) total = span;
  }
  const capped = Math.min(total, 24 * 60);
  return { event_duration_hour: Math.floor(capped / 60), event_duration_minutes: capped % 60 };
}

export interface ToGoogleOptions {
  /**
   * The zone a timed event is written in when it does not carry one.
   *
   * 🔴 COMPOSIO REQUIRES IT FOR A NAIVE DATETIME, and a naive datetime is the only kind its schema
   * accepts ("YYYY-MM-DDTHH:MM:SS with NO offsets or Z"). Most Nemesis events have no zone because
   * they were typed by somebody who never left home, so without a fallback every one of them is
   * rejected at the point of sending — the least useful place to find out.
   */
  timeZone?: string;
  /** Which Google calendar. "primary" is the student's own. */
  calendarId?: string;
}

/**
 * One Nemesis event → the arguments `GOOGLECALENDAR_CREATE_EVENT` actually takes.
 *
 * 🔴 THE WALL CLOCK GOES OUT AS A WALL CLOCK, which is what the schema demands anyway: a naive
 * timestamp plus an IANA zone says "eleven in the morning, in Chicago" without this code owning a
 * timezone database or getting daylight saving wrong twice a year.
 *
 * 🔴 AN ALL-DAY EVENT CANNOT BE CREATED BY THIS ACTION AT ALL — there is no date-only field on it.
 * It is created as a timed event at midnight and then converted by `toGooglePatchArgs`, which does
 * have one. Two calls, and the alternative is an all-day exam landing in Google as a midnight
 * appointment.
 */
export function toGoogleCreateArgs(event: CalendarEvent, options: ToGoogleOptions = {}): Record<string, unknown> {
  const allDay = event.allDay ?? !event.time;
  const args: Record<string, unknown> = {
    calendar_id: options.calendarId ?? "primary",
    // 🔴 NEVER TRUE. Composio defaults this to true, which mails every attendee on the event.
    // Nemesis holds a guest list as a record and mails nobody; see the attendees note below.
    send_updates: false,
    start_datetime: `${event.date}T${allDay ? "00:00:00" : withSeconds(event.time!)}`,
    summary: event.title,
    ...(allDay ? { event_duration_hour: 24, event_duration_minutes: 0 } : durationFor(event)),
  };
  const zone = event.timeZone ?? options.timeZone;
  if (zone) args.timezone = zone;
  if (event.note) args.description = event.note;
  if (event.location) args.location = event.location;
  if (event.transparency) args.transparency = event.transparency;
  if (event.visibility) args.visibility = event.visibility;
  // 'birthday' exists in Composio's enum and not in ours; ours are all in theirs.
  if (event.eventType) args.eventType = event.eventType;
  if (event.rrule && event.rrule.length > 0) args.recurrence = [...event.rrule];
  if (event.guestsCanModify !== undefined) args.guests_can_modify = event.guestsCanModify;
  if (event.guestsCanInviteOthers !== undefined) args.guestsCanInviteOthers = event.guestsCanInviteOthers;
  if (event.guestsCanSeeOtherGuests !== undefined) args.guestsCanSeeOtherGuests = event.guestsCanSeeOtherGuests;

  // 🔴🔴 ATTENDEES ARE NEVER SENT, AND THAT IS A DELIBERATE REFUSAL RATHER THAN AN OVERSIGHT.
  // Putting a guest list on a Google event emails every person on it — and Composio's own
  // `send_updates` defaults to true, so it would do it eagerly. `calendar-model.ts` already calls
  // the attendee list "a record, never an instruction"; sending it here would turn a student
  // pressing sync into a student mailing their supervisor. If inviting people is ever wanted, it
  // is its own feature with its own confirmation, not a side effect of a calendar refresh.

  return args;
}

/**
 * One Nemesis event → the arguments `GOOGLECALENDAR_PATCH_EVENT` takes.
 *
 * 🔴 THIS ACTION IS THE ONE THAT CAN SPEAK ABOUT WHOLE DAYS. Its `start_time`/`end_time` accept
 * either an RFC3339 timestamp or a bare YYYY-MM-DD, and its own documentation confirms the end
 * date is EXCLUSIVE — the same asymmetry the read side has to undo, stated by the API itself.
 *
 * 🔴 AND WRITING AN INCLUSIVE END MAKES EVERY ALL-DAY EVENT ONE DAY SHORT IN GOOGLE, so the last
 * day of a conference quietly disappears. That is the read-side bug run backwards, and it is the
 * single most likely thing for a future edit here to get wrong.
 */
export function toGooglePatchArgs(
  event: CalendarEvent,
  eventId: string,
  options: ToGoogleOptions = {},
): Record<string, unknown> {
  const allDay = event.allDay ?? !event.time;
  const args: Record<string, unknown> = {
    calendar_id: options.calendarId ?? "primary",
    event_id: eventId,
    // 🔴🔴 A STRING HERE AND A BOOLEAN ON CREATE. THE SAME FIELD NAME, THE SAME TOOLKIT, TWO TYPES.
    // `CREATE_EVENT` takes `send_updates: boolean`; this one takes "all" | "externalOnly" | "none"
    // and says it "uses default user behavior if unspecified". So the obvious thing — reusing
    // `false` because it worked on the other call — is a type error on a field whose entire job is
    // deciding whether other people get emailed, and falling through to the default means the
    // student's supervisor and seminar group hear about every edit. Found by validating the
    // generated arguments against the live schema rather than by reading either of them.
    send_updates: "none",
    summary: event.title,
  };

  if (allDay) {
    const lastDay = event.endDate && event.endDate > event.date ? event.endDate : event.date;
    args.start_time = event.date;
    args.end_time = shiftDateKey(lastDay, 1);
  } else {
    const endDate = event.endDate && event.endDate > event.date ? event.endDate : event.date;
    const duration = durationFor(event);
    const endClock = event.endTime
      ? withSeconds(event.endTime)
      : withSeconds(minutesToClock(minutesOfTime(event.time)! + duration.event_duration_hour * 60 + duration.event_duration_minutes));
    args.start_time = `${event.date}T${withSeconds(event.time!)}`;
    args.end_time = `${endDate}T${endClock}`;
    const zone = event.timeZone ?? options.timeZone;
    if (zone) args.timezone = zone;
  }

  if (event.note) args.description = event.note;
  if (event.location) args.location = event.location;
  return args;
}

/** Minutes past midnight → "HH:MM", never rolling past the end of the day. Google refuses an end
 *  before its start, which is exactly what a rolled-over end would be. */
function minutesToClock(minutes: number): string {
  const capped = Math.min(minutes, 23 * 60 + 59);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(capped / 60))}:${pad(capped % 60)}`;
}
