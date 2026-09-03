import assert from "node:assert/strict";
import { test } from "node:test";

import type { DecodedCalendarEvent } from "./calendar-codec";
import { fromGoogleEvent, type MappedGoogleEvent } from "./google-calendar";
import { defaultWindow, planPull } from "./google-calendar-sync";

// Guards what a Google Calendar sync decides to do (owner 2026-09-02: "resolve discrepancies with
// scheduling"). Pure: `planPull` takes what Google said and what Nemesis holds and returns what
// ought to happen, so every one of these cases is checked without a network or a database.

function googleEvent(id: string, over: Record<string, unknown> = {}): MappedGoogleEvent {
  return fromGoogleEvent({
    end: { dateTime: "2026-09-10T11:00:00-05:00", timeZone: "America/Chicago" },
    etag: '"v1"',
    id,
    start: { dateTime: "2026-09-10T10:00:00-05:00", timeZone: "America/Chicago" },
    status: "confirmed",
    summary: "Pharmacology lecture",
    updated: "2026-09-01T09:00:00.000Z",
    ...over,
  })!;
}

/** A Nemesis row already linked to a Google event. */
function linkedRow(id: string, externalId: string, over: Partial<DecodedCalendarEvent> = {}): DecodedCalendarEvent {
  return {
    date: "2026-09-10",
    endTime: "11:00",
    externalCalendar: "primary",
    externalEtag: '"v1"',
    externalId,
    externalProvider: "google",
    externalSyncedAt: "2026-09-01T10:00:00.000Z",
    id,
    kind: "class",
    origin: "google_calendar",
    time: "10:00",
    timeZone: "America/Chicago",
    title: "Pharmacology lecture",
    ...over,
  };
}

test("an event Nemesis has never seen is an insert", () => {
  const plan = planPull([googleEvent("g1")], []);
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.insert[0]?.externalId, "g1");
  assert.equal(plan.update.length, 0);
});

test("importing twice does not duplicate anything", () => {
  // 🔴 THE WHOLE REASON `externalId` EXISTS. Without a link the second pull cannot tell a new event
  // from one it already has, so every refresh re-adds the entire calendar.
  const google = [googleEvent("g1"), googleEvent("g2")];
  const first = planPull(google, []);
  assert.equal(first.insert.length, 2);

  const saved = first.insert.map((event, i) => ({ ...event, id: `local-${i}` }) as DecodedCalendarEvent);
  const second = planPull(google, saved);
  assert.equal(second.insert.length, 0, "nothing is imported a second time");
  assert.equal(second.unchanged, 2);
});

test("an unchanged event is recognised by its etag, not by comparing fields", () => {
  const plan = planPull([googleEvent("g1")], [linkedRow("local-1", "g1")]);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.update.length, 0);
});

test("an event Google has moved is an update carrying the local row id", () => {
  const moved = googleEvent("g1", {
    etag: '"v2"',
    start: { dateTime: "2026-09-10T14:00:00-05:00", timeZone: "America/Chicago" },
    updated: "2026-09-02T09:00:00.000Z",
  });
  const plan = planPull([moved], [linkedRow("local-1", "g1")]);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0]?.id, "local-1", "the local row id, never Google's");
  assert.equal(plan.update[0]?.event.time, "14:00");
});

test("an update keeps what Nemesis knows and Google does not", () => {
  // 🔴 `kind` AND `course` ARE NEMESIS'S OWN IDEAS. An update built from the Google payload alone
  // blanks them, so an exam a student classified becomes an untyped event from nowhere on the next
  // refresh — and the source references that let them trace where the date came from go with it.
  const mine = linkedRow("local-1", "g1", { course: "PHCY 2119", kind: "exam" });
  const plan = planPull([googleEvent("g1", { etag: '"v2"' })], [mine]);
  assert.equal(plan.update[0]?.event.kind, "exam");
  assert.equal(plan.update[0]?.event.course, "PHCY 2119");
  // And it still takes Google's own fields.
  assert.equal(plan.update[0]?.event.externalEtag, '"v2"');
});

test("nothing is ever planned for deletion", () => {
  // 🔴 A ROW MISSING FROM GOOGLE'S ANSWER IS NOT PROOF IT WAS DELETED. It may simply fall outside
  // the window we asked for, and one of those two readings destroys a student's coursework.
  const plan = planPull([], [linkedRow("local-1", "g1")]);
  assert.equal(Object.hasOwn(plan, "delete"), false, "there is no delete list to fill in later");
  assert.equal(plan.insert.length, 0);
  assert.equal(plan.update.length, 0);
});

test("a row that lives only in Nemesis is left alone", () => {
  const local: DecodedCalendarEvent = { date: "2026-09-10", id: "local-9", kind: "assignment", title: "Essay" };
  const plan = planPull([googleEvent("g1")], [local]);
  assert.equal(plan.insert.length, 1, "Google's event still arrives");
  assert.equal(plan.disagreements.length, 0, "an unlinked row disagrees with nothing");
});

// ── The discrepancy, and who wins ──────────────────────────────────────────────────────────────

test("the same event at two different times is reported as a disagreement", () => {
  // Moved by four hours in Google: 10-11 became 14-15.
  const moved = googleEvent("g1", {
    end: { dateTime: "2026-09-10T15:00:00-05:00", timeZone: "America/Chicago" },
    etag: '"v2"',
    start: { dateTime: "2026-09-10T14:00:00-05:00", timeZone: "America/Chicago" },
    updated: "2026-09-02T09:00:00.000Z",
  });
  const plan = planPull([moved], [linkedRow("local-1", "g1")]);
  assert.equal(plan.disagreements.length, 1);
  const found = plan.disagreements[0]!;
  assert.deepEqual(found.fields.map((f) => f.field), ["time", "endTime"]);
  assert.equal(found.fields[0]?.nemesis, "10:00");
  assert.equal(found.fields[0]?.provider, "14:00");
  // Google moved since the two last agreed and Nemesis did not, so Google is the safe winner.
  assert.equal(found.suggested, "provider");
});

test("a change made in Nemesis is NOT overwritten by Google's older copy", () => {
  // 🔴🔴 THE DATA LOSS THIS WHOLE FEATURE HAS TO AVOID. The student moved their exam here; a
  // background refresh must not silently move it back. The disagreement is reported and the update
  // is held out of the plan entirely.
  const mine = linkedRow("local-1", "g1", {
    time: "16:00",
    endTime: "17:00",
    updatedAt: "2026-09-02T12:00:00.000Z", // edited after the last sync
    externalSyncedAt: "2026-09-01T10:00:00.000Z",
  });
  const plan = planPull([googleEvent("g1", { etag: '"v2"' })], [mine]);
  assert.equal(plan.disagreements.length, 1);
  assert.equal(plan.disagreements[0]?.suggested, "nemesis");
  assert.equal(plan.update.length, 0, "the local change survives the sync");
});

test("when both sides moved, Google does NOT silently win", () => {
  const mine = linkedRow("local-1", "g1", {
    time: "16:00",
    updatedAt: "2026-09-02T12:00:00.000Z",
    externalSyncedAt: "2026-09-01T10:00:00.000Z",
  });
  const google = googleEvent("g1", {
    etag: '"v2"',
    start: { dateTime: "2026-09-10T08:00:00-05:00", timeZone: "America/Chicago" },
    updated: "2026-09-02T13:00:00.000Z",
  });
  const plan = planPull([google], [mine]);
  assert.equal(plan.disagreements[0]?.suggested, "unknown", "the student decides");
  // 🔴🔴 THE CASE MOST LIKELY TO LOSE WORK, because a change definitely exists on BOTH sides. The
  // hold list was written as `=== "nemesis"` first, which covered only the clearly-local case and
  // let Google overwrite this one.
  assert.equal(plan.update.length, 0, "an ambiguous event is never overwritten on its own");
});

test("a row that has never been synced cannot say who moved last", () => {
  // 🔴 "unknown" IS THE HONEST ANSWER AND THE COMMON ONE. Without a last-agreed moment there is
  // nothing to compare against, and defaulting to the provider would make Google win by accident.
  const mine = linkedRow("local-1", "g1", { time: "16:00", externalSyncedAt: undefined });
  const plan = planPull([googleEvent("g1", { etag: '"v2"' })], [mine]);
  assert.equal(plan.disagreements[0]?.suggested, "unknown");
  assert.equal(plan.update.length, 0, "and it is held rather than decided for them");
});

test("the same time written two ways is not a disagreement", () => {
  // "09:00" and "9:00:00" are one time; reporting a conflict between them is noise a student would
  // learn to ignore, which is how a real conflict gets ignored too.
  const mine = linkedRow("local-1", "g1", { endTime: "11:00:00", time: "10:00:00" });
  const plan = planPull([googleEvent("g1", { etag: '"v2"' })], [mine]);
  assert.equal(plan.disagreements.length, 0);
});

test("a retitled event is reported, and casing alone is not", () => {
  const retitled = planPull([googleEvent("g1", { etag: '"v2"', summary: "Pharmacology seminar" })], [linkedRow("local-1", "g1")]);
  assert.deepEqual(retitled.disagreements[0]?.fields.map((f) => f.field), ["title"]);

  const recased = planPull([googleEvent("g1", { etag: '"v2"', summary: "  pharmacology   LECTURE " })], [linkedRow("local-1", "g1")]);
  assert.equal(recased.disagreements.length, 0, "whitespace and case are not a scheduling conflict");
});

test("a moved room is reported as a location disagreement", () => {
  const plan = planPull(
    [googleEvent("g1", { etag: '"v2"', location: "Room 2.05" })],
    [linkedRow("local-1", "g1", { location: "Room 4.12" })],
  );
  assert.deepEqual(plan.disagreements[0]?.fields.map((f) => f.field), ["location"]);
});

test("the default window looks back a month and forward a term", () => {
  const window = defaultWindow(new Date("2026-09-02T00:00:00.000Z"));
  assert.equal(window.timeMin, "2026-08-02T00:00:00.000Z");
  assert.equal(window.timeMax, "2027-03-01T00:00:00.000Z");
  assert.ok(window.timeMin < window.timeMax);
});

test("a cancelled event Nemesis has never seen is not imported", () => {
  // 🔴 MEASURED AGAINST THE OWNER'S REAL CALENDAR: 189 events in one term, 50 of them cancelled.
  // Importing those adds 50 struck-through rows for things that are not happening and that Nemesis
  // never claimed were — a quarter of the calendar, and it reads as the feature being broken.
  const plan = planPull([googleEvent("g1", { status: "cancelled" }), googleEvent("g2")], []);
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.insert[0]?.externalId, "g2");
});

test("a cancellation of an event Nemesis DOES hold still arrives", () => {
  // 🔴 THE OTHER HALF, AND IT IS WHY `showDeleted` IS ASKED FOR AT ALL. A lecture the student called
  // off in Google must stop claiming to be happening here; without this the meeting simply stops
  // being mentioned and Nemesis goes on showing a class that is not running.
  const plan = planPull([googleEvent("g1", { etag: '"v2"', status: "cancelled" })], [linkedRow("local-1", "g1")]);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0]?.event.status, "cancelled");
});
