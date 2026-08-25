// A generated deck is named after its subject.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { deckName, UNTITLED_DECK } from "./deck-name";

test("🔴🔴🔴 the product's name never appears in a deck name", () => {
  // The exact string the owner saw, 2026-08-25. An untitled canvas produced this, and the review
  // screen then printed it over every card in the deck.
  assert.equal(deckName(""), UNTITLED_DECK);
  assert.equal(deckName(null), UNTITLED_DECK);
  assert.equal(deckName(undefined), UNTITLED_DECK);
  assert.ok(!/nemesis/i.test(deckName("")), "an untitled deck is named after the product again");
});

test("🔴🔴 the word 'flashcards' is not appended to a deck of flashcards", () => {
  assert.equal(deckName("Krebs cycle"), "Krebs cycle");
  // Calibration: restore the old `${title} · flashcards` and every line here reddens.
  assert.ok(!/flashcard/i.test(deckName("Krebs cycle")), "the suffix is back");
});

test("🔴🔴 a title that already carries a suffix is not given a second one", () => {
  // The realistic path into this: a deck made under the old rule is renamed, re-imported, or its
  // name is fed back in as a title. Without stripping, names grow by one suffix per round trip.
  for (const decorated of [
    "Krebs cycle · flashcards",
    "Krebs cycle - Flashcards",
    "Krebs cycle: cards",
    "Krebs cycle — deck",
    "Krebs cycle · flash cards",
    "Krebs cycle · cards · flashcards",
  ]) {
    assert.equal(deckName(decorated), "Krebs cycle", `"${decorated}" kept its decoration`);
  }
});

test("🔴 an empty title falls back rather than saving a nameless row", () => {
  // 🔴 THIS TEST ASKED FOR THE WRONG THING FIRST, and the code was right. It demanded that a
  // canvas titled exactly "Flashcards" become "Untitled deck", on the theory that the title was
  // pure decoration. But the strip is deliberately anchored to a SEPARATOR — a bare word is a
  // name somebody typed, and renaming a learner's "Flashcards" to "Untitled deck" would be this
  // module overruling them. Only a suffix hanging off a real name is decoration.
  assert.equal(deckName("Flashcards"), "Flashcards", "a title the learner chose was overruled");
  assert.equal(deckName("   "), UNTITLED_DECK);
  // A name that is nothing BUT a suffix does still fall back, because stripping leaves nothing.
  assert.equal(deckName(" · flashcards"), UNTITLED_DECK);
});

test("🔴 a real title containing the word is left alone", () => {
  // The strip is anchored to the END and requires a separator, so a subject that genuinely
  // mentions cards keeps its name. Occlusion decks about card games are a real thing.
  assert.equal(deckName("How flashcards work"), "How flashcards work");
  assert.equal(deckName("Card sorting in UX research"), "Card sorting in UX research");
});

test("🔴 the name fits the column", () => {
  // study_decks.name is capped at 120 by every caller; a longer name was silently truncated
  // mid-word by `.slice(0, 120)` at two call sites with two different limits.
  const long = "a".repeat(400);
  assert.equal(deckName(long).length, 120);
  assert.ok(!deckName(`${"word ".repeat(40)}`).endsWith(" "), "a truncated name keeps a trailing space");
});

test("🔴🔴 both deck-making paths use this, so neither can drift back", () => {
  // The bug existed in two files with two different fallbacks ("Nemesis canvas", "Learning
  // canvas"). One rule, imported twice, is what stops a third from being invented.
  // 🔴 COMMENTS ARE STRIPPED FIRST, and leaving them in is how this guard failed on its first
  // run. Both files EXPLAIN the old names in their comments, so a bare search found "Nemesis
  // canvas" in the very sentence recording that it had been removed. A guard that fires on prose
  // is a guard nobody trusts — the same mistake `every-kind-renders.test.ts` made with `<figure`.
  const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const file of ["./canvas-deliverables.ts", "./canvas-study-bridge.ts"]) {
    const source = strip(readFileSync(new URL(file, import.meta.url), "utf8"));
    assert.match(source, /from "\.\/deck-name"/, `${file} names decks its own way again`);
    // 🔴 THE GUARD IS ON THE `name` FIELD, NOT ON THE WORDS ANYWHERE IN THE FILE. Its first
    // spelling banned "Nemesis canvas" outright and reddened on
    // `description: "Made on a Nemesis canvas, at your request."` — a DESCRIPTION, which is
    // allowed to say where a deck came from and which the owner never objected to. Only the
    // NAME was the complaint.
    assert.match(source, /name[:,]?\s*(=\s*)?deckName\(/, `${file} builds its deck name some other way`);
    assert.ok(!/\bname:\s*["'`]/.test(source), `${file} hard-codes a deck name again`);
    assert.ok(!/·\s*flashcards/.test(source), `${file} still appends the suffix`);
  }
});

console.log("deck-name.test.ts OK");
