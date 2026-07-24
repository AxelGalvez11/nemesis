import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSyllabusPrompt,
  describeMeeting,
  isRealDate,
  MAX_IMPORT_EVENTS,
  meetingToAnchorEvent,
  normalizeTime,
  quoteAppearsIn,
  type SyllabusExtraction,
  toValidKind,
  verifySyllabus,
} from "./syllabus";

const SOURCE = [
  "PHAR 512 — Pharmacokinetics, Fall 2026",
  "Lecture meets Monday, Wednesday and Friday 9:00-9:50 in Bell Hall 204, August 25 through December 12.",
  "Problem Set 1 is due Friday, September 11 at 11:59pm.",
  "The midterm examination will be held on October 14.",
  "Final exam: December 15, 8:00 am.",
].join("\n");

const TODAY = new Date(2026, 6, 24); // 2026-07-24, local
let counter = 0;
const newId = () => `evt-${++counter}`;
const verify = (raw: SyllabusExtraction | null, sourceText = SOURCE) => {
  counter = 0;
  return verifySyllabus(raw, { sourceText, today: TODAY, newId });
};

const datedItem = (over: Partial<SyllabusExtraction["dated"][number]> = {}) => ({
  title: "Problem Set 1",
  date: "2026-09-11",
  kind: "assignment" as const,
  sourceQuote: "Problem Set 1 is due Friday, September 11",
  ...over,
});

// ── The core guarantee ───────────────────────────────────────────────────────

test("an item whose quote is really in the syllabus is kept", () => {
  const result = verify({ dated: [datedItem()], meetings: [] });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.title, "Problem Set 1");
  assert.equal(result.events[0]?.date, "2026-09-11");
  assert.equal(result.dropped.length, 0);
});

test("an invented item is dropped even though it looks completely plausible", () => {
  const result = verify({
    dated: [datedItem({ title: "Quiz 3", date: "2026-10-02", sourceQuote: "Quiz 3 is due October 2" })],
    meetings: [],
  });
  assert.equal(result.events.length, 0);
  assert.equal(result.dropped[0]?.reason, "Not found in the syllabus text");
});

test("a real item with a doctored quote is dropped — the quote must be the syllabus's own words", () => {
  // The midterm IS in the syllabus, but on the 14th. A model nudging the date
  // has to nudge the quote too, and that is what fails.
  const result = verify({
    dated: [datedItem({ title: "Midterm", date: "2026-10-21", sourceQuote: "The midterm examination will be held on October 21." })],
    meetings: [],
  });
  assert.equal(result.events.length, 0);
  assert.equal(result.dropped.length, 1);
});

test("quote matching survives the line breaks a PDF extractor introduces", () => {
  const broken = SOURCE.replace("Problem Set 1 is due", "Problem Set 1\n   is    due");
  const result = verify({ dated: [datedItem()], meetings: [] }, broken);
  assert.equal(result.events.length, 1);
});

test("a quote too short to be unique verifies nothing", () => {
  assert.equal(quoteAppearsIn("due", SOURCE), false);
  assert.equal(quoteAppearsIn("Final exam: December 15", SOURCE), true);
});

// ── Dates ────────────────────────────────────────────────────────────────────

test("a date that does not exist is rejected rather than rolled over", () => {
  assert.equal(isRealDate("2026-02-30"), false);
  assert.equal(isRealDate("2026-13-01"), false);
  assert.equal(isRealDate("2026-02-28"), true);
  assert.equal(isRealDate("2024-02-29"), true); // real leap day
  assert.equal(isRealDate("2026-02-29"), false); // 2026 is not a leap year
  assert.equal(isRealDate("Oct 14 2026"), false);
});

test("a date in the wrong year is dropped — the usual shape of a bad year guess", () => {
  const result = verify({
    dated: [datedItem({ date: "2031-09-11" })],
    meetings: [],
  });
  assert.equal(result.events.length, 0);
  assert.match(result.dropped[0]?.reason ?? "", /too far from now/);
});

test("the same deadline stated twice imports once", () => {
  const result = verify({ dated: [datedItem(), datedItem()], meetings: [] });
  assert.equal(result.events.length, 1);
});

test("events come back in date order", () => {
  const result = verify({
    dated: [
      datedItem({ title: "Final exam", date: "2026-12-15", kind: "exam", sourceQuote: "Final exam: December 15" }),
      datedItem(),
      datedItem({ title: "Midterm", date: "2026-10-14", kind: "exam", sourceQuote: "The midterm examination will be held on October 14" }),
    ],
    meetings: [],
  });
  assert.deepEqual(result.events.map((event) => event.date), ["2026-09-11", "2026-10-14", "2026-12-15"]);
});

// ── Times ────────────────────────────────────────────────────────────────────

test("times normalize to the HH:MM the edit dialog can actually display", () => {
  assert.equal(normalizeTime("11:59pm"), "23:59");
  assert.equal(normalizeTime("8:00 am"), "08:00");
  assert.equal(normalizeTime("9:00"), "09:00");
  assert.equal(normalizeTime("12am"), "00:00");
  assert.equal(normalizeTime("12pm"), "12:00");
  assert.equal(normalizeTime("noon"), undefined);
  assert.equal(normalizeTime("25:00"), undefined);
  assert.equal(normalizeTime(undefined), undefined);
});

test("an unreadable time is dropped but the event is still kept", () => {
  const result = verify({ dated: [datedItem({ time: "sometime friday" })], meetings: [] });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.time, undefined);
});

// ── Kinds: a sixth value would fail the whole insert ─────────────────────────

test("syllabus vocabulary maps onto the five kinds the database allows", () => {
  assert.equal(toValidKind("quiz"), "exam");
  assert.equal(toValidKind("midterm"), "exam");
  assert.equal(toValidKind("problem set"), "assignment");
  assert.equal(toValidKind("pset"), "assignment");
  assert.equal(toValidKind("lecture"), "class");
  assert.equal(toValidKind("practicum"), "rotation");
  assert.equal(toValidKind("EXAM"), "exam");
  assert.equal(toValidKind("something else entirely"), "other");
  assert.equal(toValidKind(undefined), "other");
  assert.equal(toValidKind(42), "other");
});

test("every kind produced is one the calendar_events CHECK constraint accepts", () => {
  const allowed = new Set(["assignment", "exam", "rotation", "class", "other"]);
  const result = verify({
    dated: [datedItem({ kind: "pop quiz" as never }), datedItem({ title: "Reading", kind: "reading" as never, sourceQuote: "Final exam: December 15", date: "2026-12-15" })],
    meetings: [],
  });
  for (const event of result.events) assert.ok(allowed.has(event.kind), `${event.kind} would fail the insert`);
});

// ── Imported events must stay editable ───────────────────────────────────────

test("imported events are the student's own, so a wrong date can be fixed", () => {
  // source:'agent' routes to EventViewDialog, which has no edit and no delete
  // (event-dialogs.tsx) — a mis-parsed date would be permanent.
  const result = verify({ dated: [datedItem()], meetings: [] });
  assert.equal(result.events[0]?.source, "manual");
});

// ── Recurrence: one anchor, pattern preserved ────────────────────────────────

test("a repeating class becomes one anchor event carrying its pattern, not 45 rows", () => {
  const meeting = {
    title: "Lecture",
    daysOfWeek: [1, 3, 5],
    startTime: "9:00",
    endTime: "9:50",
    startDate: "2026-08-25",
    endDate: "2026-12-12",
    location: "Bell Hall 204",
    sourceQuote: "Lecture meets Monday, Wednesday and Friday 9:00-9:50",
  };
  const event = meetingToAnchorEvent(meeting, "evt-1", "PHAR 512");
  assert.ok(event);
  assert.equal(event.date, "2026-08-25");
  assert.equal(event.kind, "class");
  assert.equal(event.time, "09:00");
  assert.equal(event.source, "manual");
  assert.match(event.note ?? "", /Mon\/Wed\/Fri 09:00–09:50/);
  assert.match(event.note ?? "", /Bell Hall 204/);
  // The student is told the limitation rather than left to discover it.
  assert.match(event.note ?? "", /does not repeat events yet/);
});

test("a meeting with no start date produces nothing rather than a guess", () => {
  const event = meetingToAnchorEvent(
    { title: "Lab", daysOfWeek: [2], sourceQuote: "x".repeat(20) },
    "evt-1",
    null,
  );
  assert.equal(event, null);
});

test("the weekday pattern reads the way a student would write it", () => {
  assert.equal(
    describeMeeting({ title: "L", daysOfWeek: [5, 1, 3], startTime: "09:00", endTime: "09:50", sourceQuote: "" }),
    "Mon/Wed/Fri 09:00–09:50",
  );
});

test("a repeating pattern with no weekdays is dropped", () => {
  const result = verify({
    dated: [],
    meetings: [{ title: "Lecture", daysOfWeek: [], startDate: "2026-08-25", sourceQuote: "Lecture meets Monday, Wednesday and Friday" }],
  });
  assert.equal(result.meetings.length, 0);
  assert.match(result.dropped[0]?.reason ?? "", /No weekdays/);
});

// ── Nothing-to-report and malformed input ────────────────────────────────────

test("an empty result says so instead of showing a blank confirmation", () => {
  const result = verify({ dated: [], meetings: [] });
  assert.equal(result.events.length, 0);
  assert.ok(result.note);
});

test("a file where everything failed verification says that specifically", () => {
  const result = verify({ dated: [datedItem({ sourceQuote: "nothing like this appears anywhere" })], meetings: [] });
  assert.match(result.note ?? "", /could be matched back to a date/);
});

test("a malformed model reply produces an empty result, never a throw", () => {
  assert.doesNotThrow(() => verify(null));
  assert.doesNotThrow(() => verify({ dated: null as never, meetings: undefined as never }));
  const junk = verify({ dated: [{ nope: true } as never], meetings: [] });
  assert.equal(junk.events.length, 0);
});

test("an empty source text keeps nothing — with no text, nothing can be verified", () => {
  const result = verify({ dated: [datedItem()], meetings: [] }, "   ");
  assert.equal(result.events.length, 0);
  assert.ok(result.note);
});

test("the import is capped so a parsing failure cannot flood the calendar", () => {
  const many = Array.from({ length: MAX_IMPORT_EVENTS + 10 }, (_, i) =>
    datedItem({ title: `Item ${i}`, date: "2026-09-11" }),
  );
  const result = verify({ dated: many, meetings: [] });
  assert.equal(result.events.length, MAX_IMPORT_EVENTS);
});

// Duplicates must not consume the budget: a syllabus that restates its
// deadlines in both a table and prose would otherwise spend the whole cap on
// copies and report genuine items at the end as "over the limit".
test("repeated items do not eat the import cap", () => {
  const unique = Array.from({ length: MAX_IMPORT_EVENTS }, (_, i) =>
    datedItem({ title: `Item ${i}`, date: "2026-09-11" }),
  );
  // Every item stated a second time, interleaved as a syllabus would.
  const withRepeats = unique.flatMap((item) => [item, { ...item }]);
  const result = verify({ dated: withRepeats, meetings: [] });
  assert.equal(result.events.length, MAX_IMPORT_EVENTS, "duplicates displaced real items");
  assert.equal(result.dropped.length, 0, "nothing should be reported as over the limit here");
});

// ── Prompt ───────────────────────────────────────────────────────────────────

test("the prompt anchors the year and carries the text", () => {
  const prompt = buildSyllabusPrompt(SOURCE, "2026-07-24");
  assert.match(prompt, /Today is 2026-07-24/);
  assert.match(prompt, /sourceQuote/);
  assert.ok(prompt.includes(SOURCE));
});
