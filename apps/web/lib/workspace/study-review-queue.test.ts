import assert from "node:assert/strict";

import { buildReviewQueue, type ReviewQueueCard } from "./study-review-queue";

const NOW = new Date("2026-07-20T12:00:00Z");
const card = (id: string, overrides: Partial<ReviewQueueCard> = {}): ReviewQueueCard => ({
  id,
  deckId: "deck-1",
  dueAt: "2026-07-20T00:00:00Z",
  suspended: false,
  ...overrides,
});

// Due cards only: future-due, other-deck, suspended, and passed cards drop out.
{
  const cards = [
    card("a"),
    card("b", { dueAt: "2026-07-21T00:00:00Z" }),
    card("c", { deckId: "deck-2" }),
    card("d", { suspended: true }),
    card("e"),
  ];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: ["e"], retryIds: [], now: NOW });
  assert.deepEqual(queue.map((item) => item.id), ["a"]);
  assert.deepEqual(buildReviewQueue({ cards, deckId: null, passedIds: [], retryIds: [], now: NOW }), []);
}

// "Again" cards come back at the end of the session even though their stored
// due date moved to tomorrow, and they keep retryIds order.
{
  const cards = [card("a"), card("b"), card("failed", { dueAt: "2026-07-21T00:00:00Z" }), card("failed-2", { dueAt: "2026-07-21T00:00:00Z" })];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["failed-2", "failed"], now: NOW });
  assert.deepEqual(queue.map((item) => item.id), ["a", "b", "failed-2", "failed"]);
}

// An undone card jumps to the front and never duplicates elsewhere in the queue.
{
  const cards = [card("a"), card("undone")];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["undone"], priorityId: "undone", now: NOW });
  assert.deepEqual(queue.map((item) => item.id), ["undone", "a"]);
}

// Suspending mid-session removes a retry card.
{
  const cards = [card("failed", { suspended: true, dueAt: "2026-07-21T00:00:00Z" })];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["failed"], now: NOW });
  assert.deepEqual(queue, []);
}

// A failed card whose relearning step has not arrived waits behind work that is
// ready. Before this, retries had no date check at all, so a card failed
// seconds ago came straight back and the 10-minute step meant nothing.
{
  const cards = [card("ready"), card("failed", { dueAt: "2026-07-20T12:10:00Z" })];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["failed"], now: NOW });
  assert.equal(queue[0]?.id, "ready", "a card still in its step must not be the card on screen");
  assert.deepEqual(queue.map((item) => item.id), ["ready", "failed"]);
}

// Once the step arrives that same card is ready, and sits with the other work
// rather than behind it.
{
  const cards = [card("ready"), card("failed", { dueAt: "2026-07-20T12:10:00Z" })];
  const later = new Date("2026-07-20T12:11:00Z");
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["failed"], now: later });
  assert.deepEqual(queue.map((item) => item.id), ["ready", "failed"]);
}

// 🔴 The session must never claim to be finished while it still owes cards.
// When a waiting retry is all that is left it surfaces early rather than
// vanishing — a sitting that falsely reports itself done gives the reviewer no
// way to get those cards back.
{
  const cards = [card("failed", { dueAt: "2026-07-20T12:10:00Z" })];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["failed"], now: NOW });
  assert.deepEqual(queue.map((item) => item.id), ["failed"], "the last owed card must not disappear");
}

// Waiting retries come back soonest first, whatever order they were failed in.
{
  const cards = [
    card("late", { dueAt: "2026-07-20T12:30:00Z" }),
    card("soon", { dueAt: "2026-07-20T12:05:00Z" }),
  ];
  const queue = buildReviewQueue({ cards, deckId: "deck-1", passedIds: [], retryIds: ["late", "soon"], now: NOW });
  assert.deepEqual(queue.map((item) => item.id), ["soon", "late"]);
}

// The clock is an input, so the same session state yields a different queue as
// time passes — which is what lets the caller admit newly-due cards at a card
// boundary instead of never admitting them at all.
{
  const cards = [card("later", { dueAt: "2026-07-20T13:00:00Z" })];
  const args = { cards, deckId: "deck-1" as const, passedIds: [], retryIds: [] };
  assert.deepEqual(buildReviewQueue({ ...args, now: NOW }), [], "not due yet");
  assert.deepEqual(
    buildReviewQueue({ ...args, now: new Date("2026-07-20T13:00:01Z") }).map((item) => item.id),
    ["later"],
    "due once the clock passes it",
  );
}

console.log("study-review-queue.test.ts OK");
