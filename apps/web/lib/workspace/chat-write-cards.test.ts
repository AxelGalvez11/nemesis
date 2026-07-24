import assert from "node:assert/strict";
import { test } from "node:test";

import { writeCardFor } from "./chat-write-cards";

const ctx = { createdAt: "2026-07-24T10:00:00.000Z", id: "card-1" };

test("a flashcards write becomes a flashcards card titled by the deck", () => {
  const card = writeCardFor("add_flashcards", { added: 12, created_deck: true, deck: "Cardiovascular pharmacology" }, ctx);
  assert.ok(card);
  assert.equal(card?.kind, "flashcards");
  assert.equal(card?.title, "Cardiovascular pharmacology");
  assert.equal(card?.id, "card-1");
  assert.equal(card?.createdAt, ctx.createdAt);
  // The card says what landed and where to find it (it opens the generic viewer).
  assert.match(card?.notes ?? "", /12 cards/);
  assert.match(card?.notes ?? "", /Study page/);
});

test("one card is singular, not '1 cards'", () => {
  const card = writeCardFor("add_flashcards", { added: 1, deck: "Deck" }, ctx);
  assert.match(card?.notes ?? "", /1 card\b/);
});

test("a practice test write becomes a test card with the question count", () => {
  const card = writeCardFor("add_practice_test", { added: true, kind: "test", questions: 8, title: "ACE inhibitors" }, ctx);
  assert.equal(card?.kind, "test");
  assert.equal(card?.title, "ACE inhibitors");
  assert.match(card?.notes ?? "", /8-question/);
});

test("a mind map write becomes a mindmap card", () => {
  const card = writeCardFor("add_mindmap", { added: true, kind: "mindmap", title: "RAAS pathway" }, ctx);
  assert.equal(card?.kind, "mindmap");
  assert.equal(card?.title, "RAAS pathway");
});

test("a created library note becomes an 'other' card pointing at the path", () => {
  const card = writeCardFor("create_library_note", { created: true, path: "Pharmacology/ACE inhibitors.md", title: "ACE inhibitors" }, ctx);
  assert.equal(card?.kind, "other");
  assert.equal(card?.title, "ACE inhibitors");
  assert.match(card?.notes ?? "", /Pharmacology\/ACE inhibitors\.md/);
});

test("a tool error mints no card (the model already reacts in text)", () => {
  assert.equal(writeCardFor("add_flashcards", { error: "No valid cards." }, ctx), null);
});

test("reads, calendar writes, and unknown tools mint no card", () => {
  assert.equal(writeCardFor("search_library", { notes: [] }, ctx), null);
  assert.equal(writeCardFor("add_calendar_event", { added: true, date: "2026-08-01", title: "Exam" }, ctx), null);
  assert.equal(writeCardFor("list_study_decks", { decks: [] }, ctx), null);
});

test("a non-object result never throws", () => {
  assert.equal(writeCardFor("add_flashcards", null, ctx), null);
  assert.equal(writeCardFor("add_flashcards", "boom", ctx), null);
});
