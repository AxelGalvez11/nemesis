import assert from "node:assert/strict";

import {
  currentStreak,
  LEECH_LAPSES,
  MATURE_INTERVAL_DAYS,
  summarizePerformance,
  summarizeTest,
  type CardRow,
  type ReviewLogRow,
} from "./study-performance";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function card(over: Partial<CardRow> & { id: string }): CardRow {
  return {
    deck_id: "d1",
    due_at: "2026-07-01T00:00:00.000Z",
    front: "front",
    interval_days: 1,
    lapses: 0,
    repetitions: 1,
    suspended: false,
    ...over,
  };
}

function log(cardId: string, grade: string, reviewedAt: string): ReviewLogRow {
  return { card_id: cardId, grade, reviewed_at: reviewedAt };
}

// --- currentStreak -----------------------------------------------------------

// Today plus the two days before it is a three-day streak.
assert.equal(currentStreak(new Set(["2026-07-24", "2026-07-23", "2026-07-22"]), NOW), 3);

// A streak that ended yesterday still counts — the student has not missed a day
// yet at midday, and telling them their streak is 0 would be wrong.
assert.equal(currentStreak(new Set(["2026-07-23", "2026-07-22"]), NOW), 2);

// One that ended two days ago is over.
assert.equal(currentStreak(new Set(["2026-07-22", "2026-07-21"]), NOW), 0);

// Gaps do not carry across.
assert.equal(currentStreak(new Set(["2026-07-24", "2026-07-22", "2026-07-21"]), NOW), 1);

assert.equal(currentStreak(new Set(), NOW), 0);

// --- retention ---------------------------------------------------------------

{
  // 3 of 4 reviews recalled = 75%, and "again" is the only grade that counts as
  // a failure (hard is a slow success, not a lapse).
  const summary = summarizePerformance({
    cards: [card({ id: "c1" })],
    decks: [{ id: "d1", name: "Cardio" }],
    logs: [
      log("c1", "good", "2026-07-24T09:00:00.000Z"),
      log("c1", "hard", "2026-07-23T09:00:00.000Z"),
      log("c1", "easy", "2026-07-22T09:00:00.000Z"),
      log("c1", "again", "2026-07-21T09:00:00.000Z"),
    ],
    now: NOW,
    tests: [],
    windowDays: 30,
  });
  assert.equal(summary.retention_pct, 75);
  assert.equal(summary.reviews, 4);
  assert.equal(summary.days_studied, 4);
  assert.equal(summary.decks[0]?.retention_pct, 75);
  assert.equal(summary.decks[0]?.deck, "Cardio");
  assert.equal(summary.note, undefined);
}

{
  // A deck with cards but zero reviews reports null, NOT 0 — "no data yet" and
  // "you failed everything" must never render the same way.
  const summary = summarizePerformance({
    cards: [card({ id: "c1", repetitions: 0 })],
    decks: [{ id: "d1", name: "Untouched" }],
    logs: [],
    now: NOW,
    tests: [],
    windowDays: 30,
  });
  assert.equal(summary.retention_pct, null);
  assert.equal(summary.decks[0]?.retention_pct, null);
  assert.equal(summary.decks[0]?.unseen, 1);
  // With no reviews and no tests the summary says so outright.
  assert.match(summary.note ?? "", /no performance history/i);
}

{
  // Nothing at all reads as "no cards", not as a zeroed report.
  const summary = summarizePerformance({ cards: [], decks: [], logs: [], now: NOW, tests: [], windowDays: 30 });
  assert.match(summary.note ?? "", /no flashcards/i);
  assert.deepEqual(summary.decks, []);
}

// --- card mix and due counts -------------------------------------------------

{
  const summary = summarizePerformance({
    cards: [
      card({ id: "new", repetitions: 0, interval_days: 0 }),
      card({ id: "learning", interval_days: MATURE_INTERVAL_DAYS - 1, repetitions: 3 }),
      card({ id: "mature", interval_days: MATURE_INTERVAL_DAYS, repetitions: 9 }),
      // Suspended cards never count as due — they cannot come up.
      card({ id: "suspended", suspended: true, due_at: "2026-01-01T00:00:00.000Z" }),
      card({ id: "future", due_at: "2026-12-01T00:00:00.000Z" }),
    ],
    decks: [{ id: "d1", name: "Mix" }],
    logs: [],
    now: NOW,
    tests: [],
    windowDays: 30,
  });
  const deck = summary.decks[0];
  assert.equal(deck?.cards, 5);
  assert.equal(deck?.unseen, 1);
  assert.equal(deck?.learning, 3); // learning + suspended + future are all sub-mature
  assert.equal(deck?.mature, 1);
  assert.equal(deck?.suspended, 1);
  // "new", "learning", "mature" are due (2026-07-01, in the past); "suspended"
  // is excluded despite being overdue and "future" is not due yet.
  assert.equal(deck?.due_now, 3);
  assert.equal(summary.due_now, 3);
}

// --- struggling cards --------------------------------------------------------

{
  const summary = summarizePerformance({
    cards: [
      card({ front: "  keeps   failing  ", id: "leech", lapses: LEECH_LAPSES + 3 }),
      card({ id: "borderline", lapses: LEECH_LAPSES }),
      card({ id: "fine", lapses: LEECH_LAPSES - 1 }),
    ],
    decks: [{ id: "d1", name: "Cardio" }],
    logs: [],
    now: NOW,
    tests: [],
    windowDays: 30,
  });
  assert.equal(summary.struggling_cards.length, 2);
  // Worst first, and the front text is whitespace-normalised for the prompt.
  assert.equal(summary.struggling_cards[0]?.front, "keeps failing");
  assert.equal(summary.struggling_cards[0]?.lapses, LEECH_LAPSES + 3);
  assert.equal(summary.struggling_cards[0]?.deck, "Cardio");
}

// --- reviews on deleted cards ------------------------------------------------

{
  // The review happened, so it counts overall; it just has no deck to land in.
  const summary = summarizePerformance({
    cards: [],
    decks: [],
    logs: [log("gone", "good", "2026-07-24T09:00:00.000Z")],
    now: NOW,
    tests: [],
    windowDays: 30,
  });
  assert.equal(summary.reviews, 1);
  assert.equal(summary.retention_pct, 100);
  assert.deepEqual(summary.decks, []);
}

// --- tests -------------------------------------------------------------------

{
  const summary = summarizeTest({
    content: {
      attempts: [
        { at: "2026-07-01T00:00:00.000Z", missed: [{ picked: 1, questionIndex: 0 }], score: 1, total: 2 },
        {
          at: "2026-07-20T00:00:00.000Z",
          missed: [
            { picked: 1, questionIndex: 0 },
            { picked: 0, questionIndex: 1 },
          ],
          score: 0,
          total: 2,
        },
      ],
      questions: [
        { answer: 0, options: ["a", "b"], q: "Which drug blocks ACE?", why: "" },
        { answer: 1, options: ["a", "b"], q: "Which drug blocks ARB?", why: "" },
      ],
    },
    group_name: " Cardio ",
    title: "ACE test",
  });
  assert.equal(summary?.attempts, 2);
  assert.equal(summary?.first_pct, 50);
  assert.equal(summary?.latest_pct, 0);
  assert.equal(summary?.trend, "down");
  assert.equal(summary?.group, "Cardio");
  // Missed twice ranks above missed once, and the QUESTION comes back, not an index.
  assert.deepEqual(summary?.most_missed, ["Which drug blocks ACE?", "Which drug blocks ARB?"]);
}

{
  // One attempt has a score but no trend to report.
  const summary = summarizeTest({
    content: { attempts: [{ at: "2026-07-01T00:00:00.000Z", missed: [], score: 4, total: 5 }], questions: [{ answer: 0, options: ["a", "b"], q: "Q", why: "" }] },
    group_name: null,
    title: "Solo",
  });
  assert.equal(summary?.trend, null);
  assert.equal(summary?.latest_pct, 80);
}

{
  // Attempts arrive out of order; first/latest come from the timestamps, not the array.
  const summary = summarizeTest({
    content: {
      attempts: [
        { at: "2026-07-20T00:00:00.000Z", missed: [], score: 5, total: 5 },
        { at: "2026-07-01T00:00:00.000Z", missed: [], score: 1, total: 5 },
      ],
      questions: [{ answer: 0, options: ["a", "b"], q: "Q", why: "" }],
    },
    group_name: null,
    title: "Ordering",
  });
  assert.equal(summary?.first_pct, 20);
  assert.equal(summary?.latest_pct, 100);
  assert.equal(summary?.trend, "up");
  assert.equal(summary?.last_taken, "2026-07-20T00:00:00.000Z");
}

// A malformed artifact drops instead of throwing — one bad row must not take
// the whole performance answer down.
assert.equal(summarizeTest({ content: { nope: true }, group_name: null, title: "Bad" }), null);
assert.equal(summarizeTest({ content: null, group_name: null, title: "Bad" }), null);

{
  // Never-taken tests are left out entirely: an unopened test says nothing
  // about performance, and listing it invites the model to invent a score.
  const summary = summarizePerformance({
    cards: [],
    decks: [],
    logs: [],
    now: NOW,
    tests: [
      { content: { attempts: [], questions: [{ answer: 0, options: ["a", "b"], q: "Q", why: "" }] }, group_name: null, title: "Untaken" },
      { content: { attempts: [{ at: "2026-07-20T00:00:00.000Z", missed: [], score: 3, total: 4 }], questions: [{ answer: 0, options: ["a", "b"], q: "Q", why: "" }] }, group_name: null, title: "Taken" },
    ],
    windowDays: 30,
  });
  assert.equal(summary.tests.length, 1);
  assert.equal(summary.tests[0]?.title, "Taken");
  assert.equal(summary.tests[0]?.latest_pct, 75);
  // A taken test is performance history, so no "nothing to report" note.
  assert.equal(summary.note, undefined);
}

// The definition of retention always rides along with the number.
{
  const summary = summarizePerformance({ cards: [], decks: [], logs: [], now: NOW, tests: [], windowDays: 30 });
  assert.match(summary.retention_definition, /not graded 'again'/i);
  assert.equal(summary.window_days, 30);
}
