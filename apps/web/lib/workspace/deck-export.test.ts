// A downloaded deck imports into Anki without the learner configuring anything.

import assert from "node:assert/strict";
import { test } from "node:test";

import { deckAsMarkdown, deckFileName, deckToAnkiText, type ExportableCard } from "./deck-export";

const card = (over: Partial<ExportableCard> = {}): ExportableCard => ({
  front: "What does ATP synthase do?",
  back: "Makes ATP from ADP using the proton gradient.",
  ...over,
});

test("🔴🔴🔴 a field never contains a newline, because Anki splits on those first", () => {
  // The failure this exists for is silent and arrives in bulk: one card with a line break in its
  // answer becomes two malformed notes, and the learner finds out weeks later mid-review.
  const text = deckToAnkiText([card({ back: "Line one\nline two\r\nline three" })]);
  const rows = text.split("\n").filter((line) => !line.startsWith("#"));
  assert.equal(rows.length, 1, "one card produced more than one row");
  assert.match(rows[0]!, /Line one<br>line two<br>line three/, "the break was dropped instead of converted");
});

test("🔴🔴 a tab inside a field never shifts the columns", () => {
  const text = deckToAnkiText([card({ front: "a\tb", back: "c\td" })]);
  const row = text.split("\n").at(-1)!;
  assert.equal(row.split("\t").length, 3, "a field's tab was read as a column break");
});

test("🔴🔴 the header tells Anki how to read the file", () => {
  // Without these the importer guesses, and its guess for a tab file is often comma.
  const lines = deckToAnkiText([card()]).split("\n");
  assert.equal(lines[0], "#separator:tab");
  assert.ok(lines.includes("#html:true"), "the <br> substitutions would import as literal text");
  assert.ok(lines.some((line) => line.startsWith("#columns:")), "the column mapping is gone");
});

test("🔴🔴 an occlusion card exports as a labelled note, never as a blank answer", () => {
  // Its picture lives in a private bucket and its masks are coordinates. Exporting the front
  // alone would look like a card Nemesis wrote badly.
  const text = deckToAnkiText([card({ back: "", cardType: "image_occlusion", front: "Neutral axis" })]);
  const row = text.split("\n").at(-1)!;
  const [front, back] = row.split("\t");
  assert.equal(front, "Neutral axis");
  assert.ok(back && back.length > 0, "an image card exported with an empty answer");
  assert.match(back, /Nemesis/, "the row does not say where the real card is");
});

test("🔴 a card with no front is skipped, not exported blank", () => {
  // Anki uses the first field as the note's identity; empty ones merge unrelated cards.
  const text = deckToAnkiText([card({ front: "   " }), card()]);
  assert.equal(text.split("\n").filter((line) => !line.startsWith("#")).length, 1);
});

test("🔴 tags keep their own boundaries", () => {
  // Anki separates tags with spaces, so "cell biology" would import as two tags.
  const row = deckToAnkiText([card({ tags: ["cell biology", "exam-1"] })]).split("\n").at(-1)!;
  assert.equal(row.split("\t")[2], "cell-biology exam-1");
});

test("🔴🔴🔴 a filename keeps its digits", () => {
  // 🔴 THE BUG THIS WAS WRITTEN FOR WAS MINE, and it was one character wide. The first draft
  // banned `[ -<>:"/\|?*]`, in which ` -<` is a RANGE covering 0x20 to 0x3C — every digit
  // included. "Chapter 12" downloaded as "Chapter.txt", and every numbered deck in an account
  // collided on the same filename.
  assert.equal(deckFileName("Chapter 12"), "Chapter 12.txt");
  assert.equal(deckFileName("Week 3 of 15"), "Week 3 of 15.txt");
  assert.match(deckFileName("Krebs cycle (2026)"), /2026/, "parentheses and digits were stripped");
});

test("🔴🔴 a filename carries nothing a filesystem refuses", () => {
  for (const illegal of ['a/b', "a\\b", "a:b", 'a"b', "a|b", "a?b", "a*b", "a<b", "a>b"]) {
    const made = deckFileName(illegal);
    assert.match(made, /^a b\.txt$/, `"${illegal}" produced ${made}`);
  }
});

test("🔴 a hidden file, an empty name and a DOS device all fall back", () => {
  assert.equal(deckFileName("...secret"), "secret.txt", "a leading dot would hide the file on Unix");
  assert.equal(deckFileName("   "), "deck.txt");
  assert.equal(deckFileName(""), "deck.txt");
  // Windows refuses these regardless of extension.
  for (const device of ["CON", "nul", "LPT1", "com9"]) {
    assert.equal(deckFileName(device), "deck.txt", `${device} is still a reserved name`);
  }
});

test("🔴 a very long deck name is cut to something a filesystem accepts", () => {
  assert.ok(deckFileName("x".repeat(400)).length <= 84, "the name outgrew the 255-byte limit");
});

test("🔴🔴 a deck handed to a conversation keeps its line breaks — the opposite of the Anki rule", () => {
  // Owner, 2026-09-03: an artifact opened from the Library carries an ask bar, and the artifact has
  // to travel with the question or the question is unanswerable. A deck is cards, not prose, so
  // this is what "the deck" means in a conversation.
  //
  // 🔴 THE TWO EXPORTS PULL IN OPPOSITE DIRECTIONS AND THAT IS WHY THIS IS ASSERTED. `deckToAnkiText`
  // turns every newline into `<br>` because Anki's importer splits on newlines first. Reusing it
  // here would hand a model a wall of `<br>` tags, so the markdown path must NOT inherit that.
  const made = deckAsMarkdown("Beams", [
    card({ back: "It resists sliding.\nMeasured at a section.", front: "What is shear force?" }),
    card({ back: "Bending moment.", front: "And the other one?" }),
  ]);
  assert.match(made, /^# Beams\n/, "the deck's name is not the heading");
  assert.match(made, /## 1\. What is shear force\?/, "the cards are not numbered questions");
  assert.match(made, /It resists sliding\.\nMeasured at a section\./, "a multi-line answer was flattened, the Anki way");
  assert.ok(!made.includes("<br>"), "the Anki line rule leaked into the conversation format");
  assert.ok(made.indexOf("## 1.") < made.indexOf("## 2."), "the cards left their order");
});

test("🔴 a cloze card keeps its markup, because the gap IS what the card teaches", () => {
  const made = deckAsMarkdown("Law", [card({ front: "{{c1::Pike balancing}} weighs the burden." })]);
  assert.match(made, /\{\{c1::Pike balancing\}\}/, "the cloze was stripped, leaving a sentence with no gap in it");
});

test("🔴 an empty deck is still a named document, not an empty string", () => {
  // A deck that is still loading, or genuinely has no cards, must not send a blank attachment: the
  // canvas would receive a file with nothing in it and answer about nothing.
  assert.equal(deckAsMarkdown("Empty", []), "# Empty\n");
});

console.log("deck-export.test.ts OK");
