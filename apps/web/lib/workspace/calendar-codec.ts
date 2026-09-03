// The ONE place a calendar event crosses the schema boundary.
//
// 🔴 THE BUG CLASS THIS EXISTS TO END. There were two hand-written decoders — `sanitizeEvent`
// for the browser's cache and `calendarEventFromRow` for the cloud — each naming the keys it
// knew and rebuilding the object from them. Both therefore DELETED anything they did not
// recognise, and the failure is silent in the worst way:
//
//     a writer adds a field  →  the other reader does not know it
//     →  that reader drops it  →  the next save writes the object back WITHOUT it
//     →  the field is gone from the database, permanently, with no error anywhere
//
// Everything looks like it saved correctly the entire time. `parseRecurrence` was already
// pulled out for exactly this reason; this finishes the job for the whole event.
//
// The invariant, stated so a test can check it:
//
//     an event written by any supported writer survives every supported read path
//     without losing a recognised field
//
// 🔴 AND UNRECOGNISED FIELDS SURVIVE TOO. `extra` carries keys this build does not know about
// back out on write. A tab running last week's deploy can therefore read, re-save, and not
// destroy something this week's deploy added. Strict decoding would need version negotiation to
// be safe; carrying the unknown is cheaper and fails in the harmless direction.

import type { SourceRef } from "@/lib/learn/canvas-model";

import { type CalendarEvent, type CalendarEventKind, parseRecurrence } from "./calendar-model";
import { eventColorOf } from "./event-colors";

/** Why this event exists (§19). Distinct from `source`, which says who may edit it:
 *  `source: "agent"` is read-only in the UI, and that is a permissions fact, not a semantic one.
 *
 *  🔴 An exam has a date because the world says so. A review block exists because Nemesis
 *  suggested it. Rendering them as peers is what makes a calendar untrustworthy, so the
 *  distinction is stored rather than inferred.
 *
 *  🔴 `google_calendar` IS NOT A FOURTH FLAVOUR OF THE SAME IDEA — it is the answer none of the
 *  other three could give. An event on somebody's Google Calendar exists because they put it
 *  there, which is not `user` (that means typed into Nemesis), not `source_extraction` (nothing
 *  was read off a document), and certainly not `nemesis_plan`. Without it an imported event has to
 *  claim to be one of those, and the calendar can no longer tell a student which of their events
 *  Nemesis is merely mirroring. */
export type CalendarOrigin = "user" | "source_extraction" | "nemesis_plan" | "google_calendar";

const ORIGINS: ReadonlySet<string> = new Set<CalendarOrigin>([
  "user",
  "source_extraction",
  "nemesis_plan",
  // 🔴 LISTED HERE OR THE DATABASE COLUMN IS POINTLESS. The decoder below drops an origin this set
  // does not contain, so widening the CHECK constraint alone would let the value be WRITTEN and
  // then silently lose it on the very next read — this file's own headline failure mode, and the
  // reason the migration that widened the constraint says to come and look here.
  "google_calendar",
]);
const KINDS: ReadonlySet<string> = new Set<CalendarEventKind>([
  "assignment",
  "exam",
  "rotation",
  "class",
  "other",
]);

/** Provenance and planning fields, added 2026-08-11. All optional: every row written before
 *  this decodes with them absent, which is what "additive" has to mean for data already in the
 *  database. */
export interface CalendarProvenance {
  origin?: CalendarOrigin;
  /** The Canvas session this belongs to, so Calendar can open it (§23). */
  canvasId?: string;
  /** Which excerpts of which sources said so. §14: a date the learner cannot trace is a date
   *  they have to take on faith, and dates are too consequential for faith. */
  sourceRefs?: SourceRef[];
  confidence?: number;
  /** What the material literally said — "next Thursday". Never discarded (§15). */
  originalExpression?: string;
  /** What that was measured against, so the resolution can be re-checked. */
  resolvedAgainst?: string;
}

/** A calendar Nemesis mirrors rather than owns. Outlook is offered alongside Google and carries
 *  one too, so this names the provider rather than assuming there is only ever one. */
export type ExternalProvider = "google" | "outlook";

const PROVIDERS: ReadonlySet<string> = new Set<ExternalProvider>(["google", "outlook"]);

/**
 * What makes a Nemesis row and an event in somebody else's calendar THE SAME EVENT.
 *
 * 🔴🔴 THE FIELD THAT DID NOT EXIST, AND EVERYTHING GOOGLE-SHAPED IN THIS TABLE WAS WAITING ON IT.
 * `calendar_events` already carried attendees, reminders, conference links, RRULEs, transparency
 * and visibility — the whole Google vocabulary — and not one way to say WHICH Google event any of
 * it described. Without that: a second import duplicates the entire calendar, an edit made in
 * Google can never find the row it belongs to, and "these two disagree about when the exam is" is
 * a question with nowhere to ask it. All three of the things the owner asked for hang off this.
 *
 * 🔴 ALL-OR-NOTHING, AND THE DATABASE AGREES. An id with no provider cannot be looked up and a
 * provider with no id names nothing, so `calendar_events_external_pair` refuses the half-filled
 * pair outright and the decoder below drops it rather than keeping a link that leads nowhere.
 */
export interface ExternalLink {
  externalProvider?: ExternalProvider;
  /** The provider's own event id. */
  externalId?: string;
  /** The provider's calendar: "primary", or a calendar address.
   *  🔴 NOT `calendarId`, which is a row in the Nemesis `calendars` table. Two different ids with
   *  almost the same name, and putting one in the other's column links an event to nothing. */
  externalCalendar?: string;
  /** The provider's version marker, so an unchanged event costs nothing to re-read. */
  externalEtag?: string;
  /** When the provider last changed it, ISO. Decides who moved most recently. */
  externalUpdated?: string;
  /** When Nemesis last reconciled this row against the provider, ISO. */
  externalSyncedAt?: string;
  /**
   * When the database last changed this row. Server clock, read-only.
   *
   * 🔴 IT WAS A LIE UNTIL 2026-09-02. The column defaulted to now() and had no trigger, so all 172
   * rows carried `updated_at` exactly equal to `created_at` — a change log that had never recorded
   * a change, while looking to any reader like one that had.
   */
  updatedAt?: string;
}

export type DecodedCalendarEvent = CalendarEvent &
  CalendarProvenance &
  ExternalLink & {
    /** Keys this build does not recognise, carried through untouched. */
    extra?: Record<string, unknown>;
  };

/** Every key the current build understands. Anything else goes to `extra`. */
const KNOWN = new Set([
  "id",
  "user_id",
  "title",
  "date",
  "time",
  "endTime",
  "end_time",
  "endDate",
  "end_date",
  "allDay",
  "all_day",
  "timeZone",
  "time_zone",
  "rrule",
  "overrideOf",
  "override_of",
  "originalDate",
  "original_date",
  "calendarId",
  "calendar_id",
  "attendees",
  "reminders",
  "guestsCanModify",
  "guests_can_modify",
  "guestsCanInviteOthers",
  "guests_can_invite_others",
  "guestsCanSeeOtherGuests",
  "guests_can_see_other_guests",
  "conference",
  "attachments",
  "eventType",
  "event_type",
  "sourceTitle",
  "source_title",
  "sourceUrl",
  "source_url",
  "location",
  "colorId",
  "color_id",
  "status",
  "transparency",
  "visibility",
  "kind",
  "course",
  "note",
  "source",
  "recurrence",
  "seriesId",
  "origin",
  "canvasId",
  "canvas_id",
  "sourceRefs",
  "source_refs",
  "confidence",
  "originalExpression",
  "original_expression",
  "resolvedAgainst",
  "resolved_against",
  // The link to an outside calendar. Both spellings, like every pair above: the database sends
  // snake_case and the browser's own cache round-trips camelCase.
  "externalProvider",
  "external_provider",
  "externalId",
  "external_id",
  "externalCalendar",
  "external_calendar",
  "externalEtag",
  "external_etag",
  "externalUpdated",
  "external_updated",
  "externalSyncedAt",
  "external_synced_at",
  "created_at",
  "updated_at",
  "extra",
]);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Source references, with the whole locator — not just the two fields this
 * function used to know about.
 *
 * 🔴 THIS REBUILT EACH REF FROM `sourceId` AND `excerptId` AND SILENTLY DROPPED
 * THE REST, WHICH IS THE FAILURE THIS FILE'S OWN HEADER WARNS ABOUT. `SourceRef`
 * grew `parsedDocumentId`, `unitIndex`, `blockIds` and `headingPath` precisely so
 * a calendar entry could answer "show me where that came from" — and the writer
 * stored all four while this reader returned two, so every date came back
 * pointing at a canvas-local string and nothing else. Measured on a real
 * syllabus: 48 of 48 events lost their page and block ids between being written
 * and being read, with no error on either side.
 *
 * `excerptId` remains required because it is the canvas-local identity every
 * existing ref carries; the locator fields are optional because a source may
 * genuinely have no structure, and ABSENT MEANS UNKNOWN — never page 1.
 */
function refs(value: unknown): SourceRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SourceRef[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const sourceId = str(record.sourceId ?? record.source_id);
    const excerptId = str(record.excerptId ?? record.excerpt_id);
    if (!sourceId || !excerptId) continue;
    const parsedDocumentId = str(record.parsedDocumentId ?? record.parsed_document_id);
    const rawUnit = record.unitIndex ?? record.unit_index;
    const unitIndex = typeof rawUnit === "number" && Number.isInteger(rawUnit) && rawUnit >= 0 ? rawUnit : undefined;
    const rawBlocks = record.blockIds ?? record.block_ids;
    const blockIds = Array.isArray(rawBlocks)
      ? rawBlocks.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined;
    const rawHeadings = record.headingPath ?? record.heading_path;
    const headingPath = Array.isArray(rawHeadings)
      ? rawHeadings.filter((h): h is string => typeof h === "string")
      : undefined;
    out.push({
      excerptId,
      sourceId,
      ...(parsedDocumentId ? { parsedDocumentId } : {}),
      ...(unitIndex !== undefined ? { unitIndex } : {}),
      ...(blockIds && blockIds.length > 0 ? { blockIds } : {}),
      ...(headingPath && headingPath.length > 0 ? { headingPath } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Row or cached object → typed event. Null when it is not an event at all.
 *
 *  🔴 THE ONLY DECODER. Both the cloud reader and the localStorage reader call this. Adding a
 *  field here makes it survive on both paths at once, which is the entire point — there is no
 *  longer a second list to forget. */
/** An array of non-empty strings, or null. Used for the RRULE/EXDATE/RDATE lines. */
function lines(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return out.length > 0 ? out : null;
}


const RESPONSES = new Set(["needsAction", "declined", "tentative", "accepted"]);
const REMINDER_METHODS = new Set(["popup", "email"]);
const EVENT_TYPES = new Set(["default", "outOfOffice", "focusTime", "workingLocation"]);

/**
 * Guests, cleaned.
 *
 * 🔴 AN ENTRY WITH NO EMAIL IS DROPPED, not kept with a blank one. An address is
 * the only thing that identifies a guest; a row without one cannot be matched to
 * a reply, cannot be removed by the person it names, and would eventually be
 * handed to Google as an invitation to nobody. Capped at the same 200 the
 * database enforces, so a malformed import cannot make a row slow to read.
 */
function attendees(raw: unknown): CalendarEvent["attendees"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<CalendarEvent["attendees"]> = [];
  for (const entry of raw.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const email = str(row.email);
    if (!email) continue;
    const guest: NonNullable<CalendarEvent["attendees"]>[number] = { email };
    const displayName = str(row.displayName) ?? str(row.display_name);
    if (displayName) guest.displayName = displayName;
    if (row.optional === true) guest.optional = true;
    if (row.organizer === true) guest.organizer = true;
    if (row.self === true) guest.self = true;
    const response = str(row.responseStatus) ?? str(row.response_status);
    if (response && RESPONSES.has(response)) {
      guest.responseStatus = response as NonNullable<typeof guest.responseStatus>;
    }
    const comment = str(row.comment);
    if (comment) guest.comment = comment;
    out.push(guest);
  }
  return out.length > 0 ? out : undefined;
}

function reminders(raw: unknown): CalendarEvent["reminders"] {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const value: NonNullable<CalendarEvent["reminders"]> = {};
  if (typeof row.useDefault === "boolean") value.useDefault = row.useDefault;
  else if (typeof row.use_default === "boolean") value.useDefault = row.use_default;
  const list = Array.isArray(row.overrides) ? row.overrides : [];
  const overrides = list
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({ method: String(entry.method), minutes: Number(entry.minutes) }))
    // Google caps a reminder at four weeks; anything beyond is a typo, and a
    // negative one would fire before the event was created.
    .filter((entry) => REMINDER_METHODS.has(entry.method) && Number.isInteger(entry.minutes)
      && entry.minutes >= 0 && entry.minutes <= 40_320)
    .map((entry) => ({ method: entry.method as "popup" | "email", minutes: entry.minutes }))
    .slice(0, 5);
  if (overrides.length > 0) value.overrides = overrides;
  return value.useDefault === undefined && !value.overrides ? undefined : value;
}

function attachments(raw: unknown): CalendarEvent["attachments"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<CalendarEvent["attachments"]> = [];
  for (const entry of raw.slice(0, 25)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const fileUrl = str(row.fileUrl) ?? str(row.file_url);
    // 🔴 http(s) ONLY. An attachment url is rendered as a link, and a
    // `javascript:` one would be a script a student clicks in their own calendar.
    if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) continue;
    const file: NonNullable<CalendarEvent["attachments"]>[number] = { fileUrl };
    const title = str(row.title);
    if (title) file.title = title;
    const mimeType = str(row.mimeType) ?? str(row.mime_type);
    if (mimeType) file.mimeType = mimeType;
    const iconLink = str(row.iconLink) ?? str(row.icon_link);
    if (iconLink && /^https?:\/\//i.test(iconLink)) file.iconLink = iconLink;
    const fileId = str(row.fileId) ?? str(row.file_id);
    if (fileId) file.fileId = fileId;
    out.push(file);
  }
  return out.length > 0 ? out : undefined;
}

function conference(raw: unknown): CalendarEvent["conference"] {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const url = str(row.url);
  const value: NonNullable<CalendarEvent["conference"]> = {};
  if (url && /^https?:\/\//i.test(url)) value.url = url;
  const label = str(row.label);
  if (label) value.label = label;
  const id = str(row.id);
  if (id) value.id = id;
  return Object.keys(value).length > 0 ? value : undefined;
}

export function decodeCalendarEvent(raw: unknown): DecodedCalendarEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const id = str(row.id);
  const title = str(row.title);
  const date = str(row.date);
  if (!id || !title || !date || !DATE_KEY.test(date)) return null;

  const kindRaw = typeof row.kind === "string" ? row.kind : "";
  const event: DecodedCalendarEvent = {
    id,
    title,
    date,
    // An unrecognised kind is a formatting slip, not a reason to drop somebody's exam.
    kind: (KINDS.has(kindRaw) ? kindRaw : "other") as CalendarEventKind,
  };

  const time = str(row.time);
  if (time) event.time = time;
  const endTime = str(row.endTime) ?? str(row.end_time);
  if (endTime) event.endTime = endTime;
  const endDate = str(row.endDate) ?? str(row.end_date);
  // A malformed end must not shorten the event to nothing — it is dropped and
  // the row reads as the single day it starts on.
  if (endDate && DATE_KEY.test(endDate) && endDate >= date) event.endDate = endDate;
  const allDay = row.allDay ?? row.all_day;
  if (typeof allDay === "boolean") event.allDay = allDay;
  const timeZone = str(row.timeZone) ?? str(row.time_zone);
  if (timeZone) event.timeZone = timeZone;
  const rrule = lines(row.rrule);
  if (rrule) event.rrule = rrule;
  const overrideOf = str(row.overrideOf) ?? str(row.override_of);
  const originalDate = str(row.originalDate) ?? str(row.original_date);
  // Both or neither: an override with no date it replaces would silently fail to
  // suppress anything, and the moved lecture would be drawn twice.
  if (overrideOf && originalDate && DATE_KEY.test(originalDate)) {
    event.overrideOf = overrideOf;
    event.originalDate = originalDate;
  }
  const calendarId = str(row.calendarId) ?? str(row.calendar_id);
  if (calendarId) event.calendarId = calendarId;
  const location = str(row.location);
  if (location) event.location = location;
  const colorId = str(row.colorId) ?? str(row.color_id);
  // Only an id the palette actually has: an unknown one would paint nothing and
  // silently lose the kind colour it was overriding.
  if (colorId && eventColorOf(colorId)) event.colorId = colorId;
  const status = str(row.status);
  if (status === "confirmed" || status === "tentative" || status === "cancelled") event.status = status;
  const transparency = str(row.transparency);
  if (transparency === "opaque" || transparency === "transparent") event.transparency = transparency;
  const visibility = str(row.visibility);
  if (visibility === "default" || visibility === "public" || visibility === "private" || visibility === "confidential") {
    event.visibility = visibility;
  }
  const guests = attendees(row.attendees);
  if (guests) event.attendees = guests;
  const warn = reminders(row.reminders);
  if (warn) event.reminders = warn;
  for (const [key, column] of [
    ["guestsCanModify", "guests_can_modify"],
    ["guestsCanInviteOthers", "guests_can_invite_others"],
    ["guestsCanSeeOtherGuests", "guests_can_see_other_guests"],
  ] as const) {
    const value = row[key] ?? row[column];
    if (typeof value === "boolean") event[key] = value;
  }
  const call = conference(row.conference);
  if (call) event.conference = call;
  const files = attachments(row.attachments);
  if (files) event.attachments = files;
  const eventType = str(row.eventType) ?? str(row.event_type);
  if (eventType && EVENT_TYPES.has(eventType)) {
    event.eventType = eventType as NonNullable<CalendarEvent["eventType"]>;
  }
  const sourceTitle = str(row.sourceTitle) ?? str(row.source_title);
  if (sourceTitle) event.sourceTitle = sourceTitle;
  const sourceUrl = str(row.sourceUrl) ?? str(row.source_url);
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) event.sourceUrl = sourceUrl;
  const course = str(row.course);
  if (course) event.course = course;
  const note = str(row.note);
  if (note) event.note = note;
  if (row.source === "agent" || row.source === "manual") event.source = row.source;
  const seriesId = str(row.seriesId);
  if (seriesId) event.seriesId = seriesId;

  const recurrence = parseRecurrence(row.recurrence);
  if (recurrence) event.recurrence = recurrence;

  const origin = str(row.origin);
  if (origin && ORIGINS.has(origin)) event.origin = origin as CalendarOrigin;
  const canvasId = str(row.canvasId) ?? str(row.canvas_id);
  if (canvasId) event.canvasId = canvasId;
  const sourceRefs = refs(row.sourceRefs ?? row.source_refs);
  if (sourceRefs) event.sourceRefs = sourceRefs;
  if (typeof row.confidence === "number" && Number.isFinite(row.confidence)) {
    event.confidence = Math.min(1, Math.max(0, row.confidence));
  }
  const expression = str(row.originalExpression) ?? str(row.original_expression);
  if (expression) event.originalExpression = expression;
  const against = str(row.resolvedAgainst) ?? str(row.resolved_against);
  if (against) event.resolvedAgainst = against;

  // 🔴 READ, NEVER WRITTEN. The database sets this from its own clock on every update (see the
  // `calendar_events_touch_updated_at` trigger), which is what makes it trustworthy enough to
  // decide who moved an event last. `encodeCalendarEvent` deliberately does not send it: a client
  // that could set its own `updated_at` could win any sync argument by having a fast clock.
  const updatedAt = str(row.updatedAt) ?? str(row.updated_at);
  if (updatedAt) event.updatedAt = updatedAt;

  // 🔴 THE PAIR IS KEPT OR NEITHER IS. A provider with no id names nothing and an id with no
  // provider cannot be looked up, so a half-filled link is dropped rather than stored — a row
  // claiming to be linked but unable to say to what is worse than one that admits it is local.
  const provider = str(row.externalProvider) ?? str(row.external_provider);
  const externalId = str(row.externalId) ?? str(row.external_id);
  if (provider && PROVIDERS.has(provider) && externalId) {
    event.externalProvider = provider as ExternalProvider;
    event.externalId = externalId;
    // Google's default calendar is addressed as "primary" and comes back unnamed on some paths.
    // Written down rather than left absent, so the unique index has one string to compare.
    event.externalCalendar = str(row.externalCalendar) ?? str(row.external_calendar) ?? "primary";
    const etag = str(row.externalEtag) ?? str(row.external_etag);
    if (etag) event.externalEtag = etag;
    const updated = str(row.externalUpdated) ?? str(row.external_updated);
    if (updated) event.externalUpdated = updated;
    const syncedAt = str(row.externalSyncedAt) ?? str(row.external_synced_at);
    if (syncedAt) event.externalSyncedAt = syncedAt;
  }

  // 🔴 Everything this build does not know, kept rather than dropped.
  const carried = (row.extra && typeof row.extra === "object" ? { ...(row.extra as object) } : {}) as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(row)) {
    if (!KNOWN.has(key)) carried[key] = value;
  }
  if (Object.keys(carried).length > 0) event.extra = carried;

  return event;
}

/** Typed event → the row shape the database takes.
 *
 *  Owns persistence semantics in one place, so a writer cannot disagree with the reader about
 *  what a field is called. */
export function encodeCalendarEvent(
  event: DecodedCalendarEvent,
  userId: string,
  source: "agent" | "manual",
): Record<string, unknown> {
  return {
    id: event.id,
    user_id: userId,
    title: event.title,
    date: event.date,
    time: event.time ?? null,
    end_time: event.endTime ?? null,
    end_date: event.endDate ?? null,
    all_day: event.allDay ?? null,
    time_zone: event.timeZone ?? null,
    rrule: event.rrule && event.rrule.length > 0 ? event.rrule : null,
    override_of: event.overrideOf ?? null,
    original_date: event.originalDate ?? null,
    kind: event.kind,
    calendar_id: event.calendarId ?? null,
    attendees: event.attendees && event.attendees.length > 0 ? event.attendees : null,
    reminders: event.reminders ?? null,
    guests_can_modify: event.guestsCanModify ?? null,
    guests_can_invite_others: event.guestsCanInviteOthers ?? null,
    guests_can_see_other_guests: event.guestsCanSeeOtherGuests ?? null,
    conference: event.conference ?? null,
    attachments: event.attachments && event.attachments.length > 0 ? event.attachments : null,
    event_type: event.eventType ?? null,
    source_title: event.sourceTitle ?? null,
    source_url: event.sourceUrl ?? null,
    location: event.location ?? null,
    color_id: event.colorId ?? null,
    status: event.status ?? null,
    transparency: event.transparency ?? null,
    visibility: event.visibility ?? null,
    course: event.course ?? null,
    note: event.note ?? null,
    source,
    recurrence: event.recurrence ?? null,
    origin: event.origin ?? null,
    canvas_id: event.canvasId ?? null,
    source_refs: event.sourceRefs ?? null,
    confidence: event.confidence ?? null,
    original_expression: event.originalExpression ?? null,
    resolved_against: event.resolvedAgainst ?? null,
    // 🔴 THE PAIR AGAIN, ON THE WAY OUT. `calendar_events_external_pair` rejects the whole row if
    // one of these is set without the other, so an event carrying a stray id would fail to save at
    // all — and it would fail on every subsequent save too, which reads as "the calendar stopped
    // working" rather than as one malformed field.
    external_provider: event.externalId ? (event.externalProvider ?? null) : null,
    external_id: event.externalProvider ? (event.externalId ?? null) : null,
    external_calendar: event.externalCalendar ?? null,
    external_etag: event.externalEtag ?? null,
    external_updated: event.externalUpdated ?? null,
    external_synced_at: event.externalSyncedAt ?? null,
    // Unknown keys ride back out so a newer field survives an older client's re-save.
    extra: event.extra && Object.keys(event.extra).length > 0 ? event.extra : null,
  };
}
