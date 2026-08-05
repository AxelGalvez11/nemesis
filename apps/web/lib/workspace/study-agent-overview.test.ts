import assert from "node:assert/strict";
import test from "node:test";

import { studyOverview } from "./study-agent-overview";

const NOW = new Date("2026-08-05T12:00:00Z");

const DECKS = [
  { id: "d1", name: "PHCY 1218::Beta Blockers" },
  { id: "d2", name: "PHCY 1218::Exam 2::Cardio" },
  { id: "d3", name: "MCAT Units" },
];

const CARDS = [
  // d1: one due, one future, one suspended-but-due (must not count).
  { deck_id: "d1", due_at: "2026-08-01T00:00:00Z", lapses: 0, suspended: false },
  { deck_id: "d1", due_at: "2026-09-01T00:00:00Z", lapses: 3, suspended: false },
  { deck_id: "d1", due_at: "2026-08-01T00:00:00Z", lapses: 5, suspended: true },
  // d2: due and struggling.
  { deck_id: "d2", due_at: "2026-08-05T00:00:00Z", lapses: 2, suspended: false },
  // d3: nothing due.
  { deck_id: "d3", due_at: null, lapses: 0, suspended: false },
];

test("per-deck counts: cards, due right now, struggling — suspended cards count nowhere", () => {
  const overview = studyOverview(DECKS, CARDS, NOW);
  assert.deepEqual(overview.decks, [
    { cards: 1, due: 0, name: "MCAT Units", struggling: 0 },
    { cards: 3, due: 1, name: "PHCY 1218::Beta Blockers", struggling: 1 },
    { cards: 1, due: 1, name: "PHCY 1218::Exam 2::Cardio", struggling: 1 },
  ]);
  assert.deepEqual(overview.totals, { cards: 5, decks: 3, due: 2, struggling: 2 });
});

test("folders roll up over descendants — nested '::' levels included", () => {
  const overview = studyOverview(DECKS, CARDS, NOW);
  assert.deepEqual(overview.folders, [
    { cards: 4, decks: 2, due: 2, folder: "PHCY 1218", struggling: 2 },
    { cards: 1, decks: 1, due: 1, folder: "PHCY 1218::Exam 2", struggling: 1 },
  ]);
});

test("the payload says it is complete — no silent sampling anywhere", () => {
  assert.equal(studyOverview(DECKS, CARDS, NOW).complete, true);
});
