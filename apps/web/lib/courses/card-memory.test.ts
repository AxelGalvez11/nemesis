// The three numbers on a deck's front door, and what happens to them as cards are graded.

import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAnswer, countDeck, elapsedFor, freshMemory, memoryKey, type CardMemory } from "./card-memory";
import { answerStudyCard } from "@/lib/workspace/study-scheduler";

const NOW = new Date("2026-09-04T12:00:00Z");
const at = (memory: CardMemory, over: Partial<CardMemory>): CardMemory => ({ ...memory, ...over });

test("an untouched deck is all new", () => {
  assert.deepEqual(countDeck([], 7, NOW), { due: 0, fresh: 7, learning: 0 });
});

// 🔴 THE BUG THIS FILE EXISTS FOR. Both counts used to be gated on being due, so a card graded
// Good left `new` without arriving in `learning` and appeared to vanish from a seven-card deck.
test("a card graded Good moves from new into learning, not out of the deck", () => {
  const card = freshMemory(0, 0);
  const answer = answerStudyCard(card, "good", 0);
  const after = applyAnswer(card, answer, NOW);
  const counts = countDeck([after], 7, NOW);
  assert.equal(counts.fresh, 6);
  assert.equal(counts.learning, 1, "a card due in ten minutes is still in the deck");
  assert.equal(counts.fresh + counts.learning + counts.due, 7);
});

test("a learning card counts even though its minute has not come", () => {
  const soon = new Date(NOW.getTime() + 9 * 60_000).toISOString();
  const card = at(freshMemory(0, 0), { dueAt: soon, repetitions: 1, state: "learning" });
  assert.equal(countDeck([card], 3, NOW).learning, 1);
});

// 🔴 The opposite rule, and the reason it is not an inconsistency: a review card weeks away is not
// work you can do now, and counting it shows a backlog that makes people give up.
test("a review card not yet due is not counted as due", () => {
  const later = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
  const card = at(freshMemory(0, 0), { dueAt: later, repetitions: 4, state: "review" });
  const counts = countDeck([card], 3, NOW);
  assert.equal(counts.due, 0);
  assert.equal(counts.fresh, 2, "it has been seen, so it is not new either");
});

test("a review card whose time has come is due", () => {
  const past = new Date(NOW.getTime() - 86_400_000).toISOString();
  const card = at(freshMemory(0, 0), { dueAt: past, repetitions: 4, state: "review" });
  assert.equal(countDeck([card], 3, NOW).due, 1);
});

test("the counts never go negative when there are more memories than cards", () => {
  const cards = [0, 1, 2, 3].map((i) => at(freshMemory(0, i), { repetitions: 1, state: "review" }));
  assert.equal(countDeck(cards, 2, NOW).fresh, 0);
});

test("applying an answer records when the card comes back", () => {
  const card = freshMemory(2, 5);
  const after = applyAnswer(card, answerStudyCard(card, "easy", 0), NOW);
  assert.ok(after.dueAt);
  assert.equal(after.lastReviewedAt, NOW.toISOString());
  assert.ok(new Date(after.dueAt!).getTime() > NOW.getTime());
  assert.equal(after.sectionOrdinal, 2, "the card keeps its address");
  assert.equal(after.cardIndex, 5);
});

test("elapsed days is measured from the last review, and a new card is zero", () => {
  assert.equal(elapsedFor(freshMemory(0, 0), NOW), 0);
  const week = at(freshMemory(0, 0), { lastReviewedAt: new Date(NOW.getTime() - 7 * 86_400_000).toISOString() });
  assert.equal(Math.round(elapsedFor(week, NOW)), 7);
});

test("two sections cannot collide on a card key", () => {
  assert.notEqual(memoryKey(0, 1), memoryKey(1, 0));
});
