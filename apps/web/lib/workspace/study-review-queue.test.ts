import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewQueue, minutesUntilNext, type ReviewQueueCard } from "./study-review-queue";

const NOW = new Date("2026-07-20T12:00:00Z");
/** Minutes from NOW, as an ISO string. */
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const card = (id: string, overrides: Partial<ReviewQueueCard> = {}): ReviewQueueCard => ({
  deckId: "deck-1",
  dueAt: at(-720),
  id,
  state: "review",
  suspended: false,
  ...overrides,
});

test("only cards that are due, in this deck, and not suspended", () => {
  const cards = [
    card("due"),
    card("tomorrow", { dueAt: at(1440) }),
    card("other-deck", { deckId: "deck-2" }),
    card("suspended", { suspended: true }),
  ];
  assert.deepEqual(buildReviewQueue({ cards, deckId: "deck-1", now: NOW }).map((row) => row.id), ["due"]);
  assert.deepEqual(buildReviewQueue({ cards, deckId: null, now: NOW }), []);
});

test("🔴 a card in its learning steps goes before a review card, because it is the one on a clock", () => {
  // A review card due "today" is due any time today. A learning card due four minutes ago is four
  // minutes late, and the ten-minute step it is walking only means anything if it is honoured.
  const cards = [
    card("review", { dueAt: at(-720) }),
    card("learning", { dueAt: at(-4), state: "learning" }),
    card("relearning", { dueAt: at(-1), state: "relearning" }),
  ];
  assert.deepEqual(
    buildReviewQueue({ cards, deckId: "deck-1", now: NOW }).map((row) => row.id),
    ["learning", "relearning", "review"],
  );
});

test("🔴🔴 when nothing is due, a learning card is pulled forward instead of ending the sitting", () => {
  // Anki's learn-ahead limit, 20 minutes by default. Press Good on the only card in a deck and it
  // is due in ten minutes; without this the screen would say "You're caught up" over a card that is
  // plainly unfinished.
  const soon = [card("stepping", { dueAt: at(10), state: "learning" })];
  assert.deepEqual(buildReviewQueue({ cards: soon, deckId: "deck-1", now: NOW }).map((row) => row.id), ["stepping"]);

  // Beyond the window it waits.
  const later = [card("stepping", { dueAt: at(45), state: "learning" })];
  assert.deepEqual(buildReviewQueue({ cards: later, deckId: "deck-1", now: NOW }), []);
});

test("🔴 the early pull happens ONLY when nothing is genuinely due", () => {
  // Otherwise a one-minute step would keep jumping in front of a deck the learner is working
  // through, and the sitting would never move on.
  const cards = [card("due-now"), card("stepping", { dueAt: at(5), state: "learning" })];
  assert.deepEqual(buildReviewQueue({ cards, deckId: "deck-1", now: NOW }).map((row) => row.id), ["due-now"]);
});

test("🔴 a review card that is not due is never pulled forward, however close it is", () => {
  // The window exists for cards mid-step. Pulling a review card forward would just be reviewing it
  // early, which is the thing spaced repetition is for avoiding.
  const cards = [card("tomorrow", { dueAt: at(5) })];
  assert.deepEqual(buildReviewQueue({ cards, deckId: "deck-1", now: NOW }), []);
});

test("an undone card jumps the queue even though its restored due date is days away", () => {
  const cards = [card("undone", { dueAt: at(4320) }), card("due")];
  assert.deepEqual(
    buildReviewQueue({ cards, deckId: "deck-1", now: NOW, priorityId: "undone" }).map((row) => row.id),
    ["undone", "due"],
  );
  // And it is never listed twice.
  const twice = buildReviewQueue({ cards: [card("undone"), card("due")], deckId: "deck-1", now: NOW, priorityId: "undone" });
  assert.deepEqual(twice.map((row) => row.id), ["undone", "due"]);
});

test("the wait is reported in minutes, so 'caught up' is never said over unfinished work", () => {
  const cards = [card("stepping", { dueAt: at(9.2), state: "learning" }), card("review-later", { dueAt: at(60) })];
  assert.equal(minutesUntilNext(cards, "deck-1", NOW), 10, "rounds up, so it never promises a card early");
  assert.equal(minutesUntilNext([card("review-later", { dueAt: at(60) })], "deck-1", NOW), null, "a review card is not a pending step");
  assert.equal(minutesUntilNext(cards, null, NOW), null);
});
