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

console.log("study-review-queue.test.ts OK");
