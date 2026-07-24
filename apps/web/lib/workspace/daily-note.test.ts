import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDailyNote,
  dailyNotePath,
  localDayKey,
  summarizeDay,
  type DailyNoteInput,
} from "./daily-note";

/** A local-time ISO string for the given day and hour, so these tests mean the same
 *  thing in every timezone the suite might run in. */
const at = (day: string, hour: number, minute = 0) =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();

const DAY = "2026-07-24";

const input = (over: Partial<DailyNoteInput> = {}): DailyNoteInput => ({
  cards: [
    { deck_id: "d1", id: "c1" },
    { deck_id: "d1", id: "c2" },
    { deck_id: "d2", id: "c3" },
  ],
  day: DAY,
  decks: [
    { id: "d1", name: "Cardio pharm" },
    { id: "d2", name: "Renal" },
  ],
  events: [],
  notes: [],
  recordings: [],
  reviews: [],
  ...over,
});

// ── Counting is done here, not by a model ────────────────────────────────────

test("reviews are counted, split by pass and fail, and attributed to their deck", () => {
  const summary = summarizeDay(input({
    reviews: [
      { card_id: "c1", grade: "good", reviewed_at: at(DAY, 9) },
      { card_id: "c2", grade: "again", reviewed_at: at(DAY, 9, 5) },
      { card_id: "c3", grade: "easy", reviewed_at: at(DAY, 10) },
    ],
  }));
  assert.equal(summary.cardsReviewed, 3);
  assert.equal(summary.passed, 2);
  assert.equal(summary.again, 1);
  assert.equal(summary.passRatePct, 67);
  assert.deepEqual(summary.byDeck, [
    { again: 1, deck: "Cardio pharm", reviewed: 2 },
    { again: 0, deck: "Renal", reviewed: 1 },
  ]);
});

test("a card reviewed twice counts twice as a review but once as a card", () => {
  const summary = summarizeDay(input({
    reviews: [
      { card_id: "c1", grade: "again", reviewed_at: at(DAY, 9) },
      { card_id: "c1", grade: "good", reviewed_at: at(DAY, 9, 10) },
    ],
  }));
  assert.equal(summary.cardsReviewed, 2);
  assert.equal(summary.uniqueCards, 1);
});

test("only 'again' counts as a failure — hard is a pass", () => {
  const summary = summarizeDay(input({
    reviews: [
      { card_id: "c1", grade: "hard", reviewed_at: at(DAY, 9) },
      { card_id: "c2", grade: "again", reviewed_at: at(DAY, 9) },
    ],
  }));
  assert.equal(summary.passed, 1);
  assert.equal(summary.again, 1);
});

test("a card whose deck is missing is still counted, under a fallback name", () => {
  const summary = summarizeDay(input({
    reviews: [{ card_id: "unknown-card", grade: "good", reviewed_at: at(DAY, 9) }],
  }));
  assert.equal(summary.cardsReviewed, 1);
  assert.equal(summary.byDeck[0]?.deck, "Other cards");
});

// A zero pass rate and no reviews at all must never look the same to a student.
test("no reviews gives a null pass rate, not zero", () => {
  assert.equal(summarizeDay(input()).passRatePct, null);
  const allFailed = summarizeDay(input({ reviews: [{ card_id: "c1", grade: "again", reviewed_at: at(DAY, 9) }] }));
  assert.equal(allFailed.passRatePct, 0);
});

// ── The day boundary is the student's, not UTC's ─────────────────────────────

test("work is filed under the local day it happened on", () => {
  const summary = summarizeDay(input({
    reviews: [
      { card_id: "c1", grade: "good", reviewed_at: at(DAY, 21, 30) },
      { card_id: "c2", grade: "good", reviewed_at: at("2026-07-25", 8) },
    ],
  }));
  assert.equal(summary.cardsReviewed, 1, "a 9:30pm review belongs to today, not tomorrow");
});

test("localDayKey handles a bad timestamp without throwing", () => {
  assert.equal(localDayKey("not a date"), "");
});

test("late-evening work does not leak into the next day's note", () => {
  const evening = at(DAY, 23, 45);
  assert.equal(localDayKey(evening), DAY);
});

// ── Recordings, notes, events ────────────────────────────────────────────────

test("recordings are counted and their minutes summed", () => {
  const summary = summarizeDay(input({
    recordings: [
      { created_at: at(DAY, 8), duration_seconds: 3_600, title: "Cardio lecture" },
      { created_at: at(DAY, 13), duration_seconds: 1_800, title: "Renal lecture" },
    ],
  }));
  assert.equal(summary.recordings, 2);
  assert.equal(summary.recordedMinutes, 90);
});

test("a recording with no stored duration still counts as a recording", () => {
  const summary = summarizeDay(input({ recordings: [{ created_at: at(DAY, 8), duration_seconds: null, title: null }] }));
  assert.equal(summary.recordings, 1);
  assert.equal(summary.recordedMinutes, 0);
});

test("only events dated on the day appear", () => {
  const summary = summarizeDay(input({
    events: [
      { date: DAY, kind: "exam", time: "09:00", title: "Pharm midterm" },
      { date: "2026-07-31", kind: "assignment", title: "Case writeup" },
    ],
  }));
  assert.equal(summary.events.length, 1);
  assert.equal(summary.events[0]?.title, "Pharm midterm");
});

// ── A quiet day is reported as quiet, not faked ──────────────────────────────

test("a day with nothing on it is marked quiet", () => {
  const summary = summarizeDay(input());
  assert.equal(summary.quiet, true);
  assert.match(buildDailyNote(summary), /No study activity recorded today/);
});

test("a day with only a recording is not quiet", () => {
  const summary = summarizeDay(input({ recordings: [{ created_at: at(DAY, 8), duration_seconds: 600, title: "Lecture" }] }));
  assert.equal(summary.quiet, false);
});

// ── The written note ─────────────────────────────────────────────────────────

test("the note reports the real numbers and names the decks", () => {
  const note = buildDailyNote(summarizeDay(input({
    reviews: [
      { card_id: "c1", grade: "good", reviewed_at: at(DAY, 9) },
      { card_id: "c2", grade: "again", reviewed_at: at(DAY, 9) },
      { card_id: "c3", grade: "good", reviewed_at: at(DAY, 10) },
    ],
  })));
  assert.match(note, /3 reviews across 3 cards/);
  assert.match(note, /2 passed, 1 marked again \(67% pass rate\)/);
  assert.match(note, /\*\*Cardio pharm\*\*: 2 reviews — 1 needing another look/);
  assert.match(note, /\*\*Renal\*\*: 1 review\b/, "singular when there is one");
});

test("the note links worked-on notes so the graph connects them", () => {
  const note = buildDailyNote(summarizeDay(input({
    notes: [{ path: "Pharm/ACE.md", title: "ACE inhibitors", updated_at: at(DAY, 15) }],
  })));
  assert.match(note, /\[\[ACE inhibitors\]\]/);
});

test("empty sections are left out entirely rather than printed empty", () => {
  const note = buildDailyNote(summarizeDay(input({
    reviews: [{ card_id: "c1", grade: "good", reviewed_at: at(DAY, 9) }],
  })));
  assert.doesNotMatch(note, /## Lectures recorded/);
  assert.doesNotMatch(note, /## On the calendar/);
  assert.match(note, /## Flashcards/);
});

test("the note opens with a readable date, not a bare key", () => {
  assert.match(buildDailyNote(summarizeDay(input())), /^# .*2026/);
});

test("the note has no runs of blank lines", () => {
  const note = buildDailyNote(summarizeDay(input({
    events: [{ date: DAY, kind: "class", title: "Lab" }],
    recordings: [{ created_at: at(DAY, 8), duration_seconds: 600, title: "L" }],
    reviews: [{ card_id: "c1", grade: "good", reviewed_at: at(DAY, 9) }],
  })));
  assert.doesNotMatch(note, /\n\n\n/);
});

test("one note per day, so re-running updates instead of piling up", () => {
  assert.equal(dailyNotePath(DAY), "Daily/2026-07-24.md");
});
