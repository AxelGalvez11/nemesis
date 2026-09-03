// Deciding what a Google Calendar sync should actually do, and then doing it.
//
// Owner 2026-09-02: "be able to use Google Calendar and also be able to map events to Nemesis
// Calendar and the Google Calendar. And be able to resolve discrepancies with scheduling."
//
// ── THE SHAPE OF THIS FILE ─────────────────────────────────────────────────────────────────────
//
// 🔴 THE DECIDING IS PURE AND THE DOING IS NOT, AND THEY ARE KEPT APART ON PURPOSE. `planPull` is
// a function over two arrays: it takes what Google says and what Nemesis holds and returns what
// ought to happen. No network, no Supabase, no clock. That is what lets the hard part — which of
// these 200 events is new, which changed, which two disagree — be tested exhaustively against
// real payload shapes instead of being verified by pressing a button and squinting.
//
// 🔴🔴 AND NOTHING HERE DELETES ANYTHING. A plan has `insert` and `update` and no third list. An
// event that is in Nemesis and no longer in the Google window is NOT reported as deleted, because
// this cannot tell the difference between "the student removed it" and "it fell outside the dates
// we asked for", and one of those two readings quietly destroys a student's coursework. Deleting
// on a guess is not a feature that can be added later with an apology.

import { runAction } from "./composio-client";
import type { DecodedCalendarEvent } from "./calendar-codec";
import { findProviderDisagreements, type ProviderDisagreement } from "./calendar-conflicts";
import {
  eventsFromListResult,
  fromGoogleEvents,
  type LinkedCalendarEvent,
  type MappedGoogleEvent,
  toGoogleCreateArgs,
  toGooglePatchArgs,
} from "./google-calendar";

export const GOOGLE_CALENDAR_APP = "googlecalendar";

/** Composio's names for the three things this needs. Read off the live catalogue 2026-09-02. */
const LIST_EVENTS = "GOOGLECALENDAR_EVENTS_LIST";
const CREATE_EVENT = "GOOGLECALENDAR_CREATE_EVENT";
// 🔴 PATCH, NOT UPDATE, AND THE DIFFERENCE MATTERS TWICE. `GOOGLECALENDAR_UPDATE_EVENT` takes the
// same start-plus-duration shape as create, so it cannot express an all-day event at all; PATCH
// takes a real start and end and accepts a bare YYYY-MM-DD for whole days. It is also a PATCH:
// fields we do not send are left alone, so writing a title back does not blank a description
// somebody added in Google.
const PATCH_EVENT = "GOOGLECALENDAR_PATCH_EVENT";

// ── The plan ───────────────────────────────────────────────────────────────────────────────────

export interface PullPlan {
  /** Events Google has that Nemesis has never seen. */
  insert: LinkedCalendarEvent[];
  /** Events Nemesis already holds, where Google's copy has moved on. Carries the local row id. */
  update: { id: string; event: LinkedCalendarEvent }[];
  /** Already in step. Counted so a sync can say "nothing changed" and mean it. */
  unchanged: number;
  /**
   * Linked events where the two calendars disagree AND Nemesis has its own unsynced change.
   *
   * 🔴 THESE ARE HELD BACK FROM `update`, WHICH IS THE WHOLE POINT OF THE OWNER'S THIRD ASK.
   * Overwriting them with Google's copy is exactly the data loss a student would never forgive:
   * they moved their exam here, and a background refresh silently moved it back.
   */
  disagreements: ProviderDisagreement[];
}

/**
 * What a pull should do, given what Google said and what Nemesis holds.
 *
 * 🔴 UNCHANGED IS DECIDED BY THE ETAG, NOT BY COMPARING FIELDS. Google's etag changes whenever the
 * event does and never when it does not, so this is both cheaper and more honest than diffing:
 * a field this build does not map yet still counts as a change rather than being invisible.
 */
export function planPull(
  incoming: readonly MappedGoogleEvent[],
  existing: readonly DecodedCalendarEvent[],
): PullPlan {
  const byLink = new Map<string, DecodedCalendarEvent>();
  for (const row of existing) {
    if (row.externalProvider && row.externalId) {
      byLink.set(linkKey(row.externalProvider, row.externalCalendar ?? "primary", row.externalId), row);
    }
  }

  const plan: PullPlan = { disagreements: [], insert: [], unchanged: 0, update: [] };
  const remoteRows: LinkedCalendarEvent[] = [];

  for (const { event } of incoming) {
    remoteRows.push(event);
    const mine = byLink.get(linkKey(event.externalProvider, event.externalCalendar, event.externalId));
    if (!mine) {
      plan.insert.push(event);
      continue;
    }
    if (mine.externalEtag && event.externalEtag && mine.externalEtag === event.externalEtag) {
      plan.unchanged += 1;
      continue;
    }
    // 🔴 THE LOCAL ROW'S OWN FIELDS ARE KEPT WHERE GOOGLE HAS NOTHING TO SAY. `kind`, `course` and
    // the provenance fields are Nemesis's own ideas that Google has never heard of, and an update
    // built from the Google payload alone would blank them — so an exam a student had classified,
    // and a date traced back to page 4 of a syllabus, would both quietly become an untyped event
    // from nowhere on the next refresh.
    plan.update.push({
      event: {
        ...event,
        canvasId: mine.canvasId,
        confidence: mine.confidence,
        course: mine.course,
        id: mine.id,
        kind: mine.kind,
        originalExpression: mine.originalExpression,
        sourceRefs: mine.sourceRefs,
      },
      id: mine.id,
    });
  }

  // The disagreements are found over the SAME two sets, using the shared auditor rather than a
  // second opinion about what "different" means.
  plan.disagreements = findProviderDisagreements(existing, remoteRows);
  // 🔴🔴 ONLY A CLEAR WIN FOR GOOGLE IS APPLIED. Everything else is held for the student, and the
  // list is written this way round on purpose: `!== "provider"` holds the ambiguous case as well as
  // the clearly-local one, where `=== "nemesis"` (which is what this said first) held only the
  // clearly-local one and quietly let Google overwrite every event where BOTH sides had moved —
  // the one case where being wrong is guaranteed to lose somebody's work, since a change definitely
  // exists on each side.
  //
  // 🔴 "unknown" ALSO COVERS A CLOCK SKEW, AND THAT IS THE SAFE DIRECTION. `externalSyncedAt` is
  // stamped by the browser and `updatedAt` by Postgres, so a browser running slightly behind the
  // database can make a freshly imported row look edited-since-sync. The result is that Nemesis
  // asks about an event it could have decided by itself. The opposite arrangement would silently
  // overwrite it, so the question is which way an unavoidable inaccuracy should fail.
  const contested = new Set(
    plan.disagreements.filter((row) => row.suggested !== "provider").map((row) => row.externalId),
  );
  if (contested.size > 0) {
    plan.update = plan.update.filter((row) => !contested.has(row.event.externalId));
  }
  return plan;
}

const linkKey = (provider: string, calendar: string, id: string) => `${provider}|${calendar}|${id}`;

// ── Reaching Google ────────────────────────────────────────────────────────────────────────────

export interface PullWindow {
  /** ISO instants. Google wants RFC3339 and is strict about it. */
  timeMin: string;
  timeMax: string;
  /** Which Google calendar. "primary" is the student's own. */
  calendarId?: string;
}

/** A month back and a term forward: the range a student is actually looking at. */
export function defaultWindow(now: Date = new Date()): PullWindow {
  const from = new Date(now.getTime() - 31 * 86_400_000);
  const to = new Date(now.getTime() + 180 * 86_400_000);
  return { timeMax: to.toISOString(), timeMin: from.toISOString() };
}

export interface PullResult {
  ok: boolean;
  /** Present when the pull failed, in words a student can read. */
  error?: string;
  events: MappedGoogleEvent[];
}

/**
 * Read a window of the student's Google Calendar.
 *
 * 🔴🔴 `singleEvents` IS FALSE, AND THAT IS THE MOST CONSEQUENTIAL ARGUMENT HERE. True asks Google
 * to expand a repeating event into every single meeting, so a weekly seminar arrives as forty
 * separate events with forty separate ids. Importing those turns one class into forty unrelated
 * rows that cannot be edited, moved or deleted together — the exact defect `rrule` was added to
 * fix. False returns the series as ONE event carrying its repeat rule, which is the shape Nemesis
 * already stores.
 *
 * 🔴 CANCELLED EVENTS ARE ASKED FOR, NOT FILTERED OUT. `showDeleted` matters because a student who
 * cancelled a lecture in Google needs that cancellation to arrive; without it the meeting simply
 * stops being mentioned, and Nemesis goes on showing a class that is not happening.
 *
 * 🔴 NEVER THROWS. A failure is a returned `{ok: false}` with a sentence, matching the contract
 * every other connected-app call in this product keeps: a calendar that cannot reach Google must
 * still draw the events it already has.
 */
export async function pullGoogleEvents(window: PullWindow): Promise<PullResult> {
  const calendarId = window.calendarId ?? "primary";
  try {
    const result = await runAction({
      action: LIST_EVENTS,
      app: GOOGLE_CALENDAR_APP,
      arguments: {
        calendarId,
        maxResults: 250,
        showDeleted: true,
        singleEvents: false,
        timeMax: window.timeMax,
        timeMin: window.timeMin,
      },
    });
    if (result.kind !== "ran") {
      return { error: result.kind === "failed" ? result.error : "That needs your approval first.", events: [], ok: false };
    }
    return { events: fromGoogleEvents(eventsFromListResult(result.data), { calendar: calendarId }), ok: true };
  } catch {
    return { error: "Google Calendar is not responding right now.", events: [], ok: false };
  }
}

export interface PushResult {
  ok: boolean;
  error?: string;
  /** Google's id for the event, so the local row can be linked to it. */
  externalId?: string;
  externalEtag?: string;
}

/**
 * Put one Nemesis event into Google.
 *
 * 🔴🔴 CREATING AN EVENT IN SOMEBODY'S CALENDAR IS A WRITE, AND WRITES ARE HELD FOR A CONFIRMATION.
 * `runAction` refuses an unconfirmed write before the network is touched and the server refuses it
 * again, so `confirmed` has to be passed by something a person clicked. It is a parameter here
 * rather than a hardcoded `true` precisely so that this function cannot be the place the gate is
 * quietly bypassed.
 *
 * 🔴 AN EVENT THAT IS ALREADY LINKED IS UPDATED, NOT RE-CREATED. Without this check a student
 * pressing send twice ends up with two copies in Google and a Nemesis row pointing at one of them.
 */
export async function pushEventToGoogle(
  event: DecodedCalendarEvent,
  options: { confirmed: boolean; calendarId?: string; timeZone?: string } = { confirmed: false },
): Promise<PushResult> {
  const calendarId = options.calendarId ?? event.externalCalendar ?? "primary";
  const linkedId = event.externalProvider === "google" ? event.externalId : undefined;
  try {
    // An event already in Google is patched where it stands. Without this check a student pressing
    // send twice ends up with two copies in Google and a Nemesis row pointing at one of them.
    if (linkedId) {
      const patched = await runAction({
        action: PATCH_EVENT,
        app: GOOGLE_CALENDAR_APP,
        arguments: toGooglePatchArgs(event, linkedId, { calendarId, timeZone: options.timeZone }),
        confirmed: options.confirmed,
      });
      return resultOf(patched, linkedId);
    }

    const created = await runAction({
      action: CREATE_EVENT,
      app: GOOGLE_CALENDAR_APP,
      arguments: toGoogleCreateArgs(event, { calendarId, timeZone: options.timeZone }),
      confirmed: options.confirmed,
    });
    if (created.kind !== "ran") return resultOf(created);
    const written = readWrittenEvent(created.data);
    if (!written.id) {
      // 🔴 THE EVENT EXISTS AND WE CANNOT NAME IT. Reporting success would leave a Nemesis row
      // saying it lives nowhere, and the next sync would import the event this product just
      // created as though it were new — a duplicate, every time, forever.
      return { error: "Google saved it but did not say where. It may need a refresh to appear.", ok: false };
    }

    // 🔴🔴 THE SECOND CALL IS WHAT MAKES AN ALL-DAY EVENT ALL-DAY. `CREATE_EVENT` has no date-only
    // field, so an exam with no clock time is created at midnight and then converted here. Skipping
    // it puts every deadline a student has into Google as a midnight appointment.
    const allDay = event.allDay ?? !event.time;
    if (allDay) {
      await runAction({
        action: PATCH_EVENT,
        app: GOOGLE_CALENDAR_APP,
        arguments: toGooglePatchArgs(event, written.id, { calendarId, timeZone: options.timeZone }),
        confirmed: options.confirmed,
      });
    }
    return { ok: true, externalId: written.id, ...(written.etag ? { externalEtag: written.etag } : {}) };
  } catch {
    return { error: "Google Calendar is not responding right now.", ok: false };
  }
}

/** One `runAction` outcome, in this module's words. Held is not an error: it is the confirmation
 *  gate doing its job, and it must not be reported as a failure the student can only retry. */
function resultOf(result: Awaited<ReturnType<typeof runAction>>, externalId?: string): PushResult {
  if (result.kind === "held") return { error: "Sending this to Google needs your confirmation.", ok: false };
  if (result.kind === "failed") return { error: result.error, ok: false };
  const written = readWrittenEvent(result.data);
  return {
    ok: true,
    ...(written.id ?? externalId ? { externalId: written.id ?? externalId } : {}),
    ...(written.etag ? { externalEtag: written.etag } : {}),
  };
}

/**
 * The id and etag of the event Google just wrote.
 *
 * 🔴 WITHOUT THE ID THE PUSH IS ONLY HALF DONE. The event exists in Google and the Nemesis row
 * still says it lives nowhere, so the next sync sees it as brand new and imports a duplicate of
 * the event this product just created. The envelope is read at both known depths for the same
 * reason `eventsFromListResult` does.
 */
function readWrittenEvent(data: unknown): { id?: string; etag?: string } {
  if (!data || typeof data !== "object") return {};
  const body = data as Record<string, unknown>;
  const inner = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;
  const nested = (inner.response_data && typeof inner.response_data === "object" ? inner.response_data : inner) as Record<string, unknown>;
  const id = typeof nested.id === "string" ? nested.id : undefined;
  const etag = typeof nested.etag === "string" ? nested.etag : undefined;
  return { ...(id ? { id } : {}), ...(etag ? { etag } : {}) };
}
