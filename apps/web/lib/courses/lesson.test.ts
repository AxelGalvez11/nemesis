// Vocabulary markers, and the rules that make a retake different from a reshuffle.

import assert from "node:assert/strict";
import { test } from "node:test";

import { drawTest, plainText, scoreOf, splitOnTerms, weakFrom, type LessonTerm, type TestItem } from "./lesson";

const terms: LessonTerm[] = [
  { term: "Anatomy", definition: "The study of structure." },
  { term: "form follows function", definition: "Shape is explained by the job." },
];

test("a marked term becomes a clickable segment carrying its definition", () => {
  const out = splitOnTerms("So [[Anatomy]] is first.", terms);
  assert.deepEqual(out, [
    { kind: "plain", text: "So " },
    { kind: "term", text: "Anatomy", definition: "The study of structure." },
    { kind: "plain", text: " is first." },
  ]);
});

test("matching is case-insensitive, and the author's capitalisation is kept on screen", () => {
  const out = splitOnTerms("[[anatomy]] first.", terms);
  assert.equal(out[0]?.kind, "term");
  assert.equal((out[0] as { text: string }).text, "anatomy");
});

test("a multi-word term works, since the marker sets the boundary", () => {
  const out = splitOnTerms("Called [[form follows function]].", terms);
  assert.equal(out[1]?.kind, "term");
});

// 🔴 A missing definition is a writing bug. Refusing to render the passage is a worse way to
// report it than showing the word without a chip.
test("an unknown marker degrades to plain text rather than throwing", () => {
  const out = splitOnTerms("A [[mystery]] word.", terms);
  assert.deepEqual(out.map((s) => s.kind), ["plain", "plain", "plain"]);
  assert.equal(out.map((s) => s.text).join(""), "A mystery word.");
});

test("text with no markers comes back as one segment", () => {
  assert.deepEqual(splitOnTerms("Nothing marked here.", terms), [
    { kind: "plain", text: "Nothing marked here." },
  ]);
});

test("plainText strips the markers and keeps the words", () => {
  assert.equal(plainText("So [[Anatomy]] is first."), "So Anatomy is first.");
});

const item = (objective: number, n: number): TestItem => ({
  objective,
  question: `q${n}`,
  choices: ["a", "b"],
  answer: 0,
  why: "because",
});

const bank: TestItem[] = [item(0, 1), item(0, 2), item(1, 3), item(1, 4), item(2, 5), item(2, 6)];

test("a draw returns the size asked for", () => {
  assert.equal(drawTest(bank, 4).length, 4);
});

test("a bank smaller than the test gives everything it has, without repeats", () => {
  const out = drawTest(bank, 99);
  assert.equal(out.length, bank.length);
  assert.equal(new Set(out.map((i) => i.question)).size, bank.length);
});

// 🔴 THE POINT OF A RETAKE. Items on objectives you missed are drawn first, so the second paper is
// a second look at what you did not know rather than a fresh shuffle of everything.
test("items on weak objectives are drawn first", () => {
  const out = drawTest(bank, 2, { weakObjectives: [2] });
  assert.deepEqual(out.map((i) => i.objective), [2, 2]);
});

test("questions just seen are pushed to the back, so a retake is a different paper", () => {
  const seen = ["q1", "q2", "q3"];
  const out = drawTest(bank, 3, { avoid: seen });
  assert.equal(out.some((i) => seen.includes(i.question)), false);
});

test("a weak objective still beats an unseen item on an objective you got right", () => {
  // q5 and q6 are the weak pair and both were just seen; q1..q4 are unseen and not weak.
  const out = drawTest(bank, 1, { weakObjectives: [2], avoid: ["q1"] });
  assert.equal(out[0]?.objective, 2);
});

test("the same seed draws the same paper, and different seeds differ", () => {
  const a = drawTest(bank, 4, { seed: 7 }).map((i) => i.question);
  assert.deepEqual(drawTest(bank, 4, { seed: 7 }).map((i) => i.question), a);
  const seeds = new Set([1, 2, 3, 4, 5].map((s) => drawTest(bank, 4, { seed: s }).map((i) => i.question).join()));
  assert.ok(seeds.size > 1, "every seed produced the same paper");
});

test("an objective is weak if any of its items was missed", () => {
  const paper = [item(0, 1), item(0, 2), item(1, 3)];
  assert.deepEqual(weakFrom(paper, [0, 1, 0]), [0]);
  assert.deepEqual(weakFrom(paper, [0, 0, 0]), []);
});

test("an unanswered question counts as missed", () => {
  assert.deepEqual(weakFrom([item(3, 1)], [null]), [3]);
  assert.equal(scoreOf([item(3, 1)], [null]), 0);
});

/* ---------------------------------------------------------------- the chapter pool */

import { poolForChapter, type Lesson } from "./lesson";

const lessonWith = (items: TestItem[]): Lesson => ({
  blocks: [],
  figures: {},
  flashcards: [],
  items,
  minutes: 5,
  sectionOrdinal: 0,
  terms: [],
});

const sections = [
  { number: "1.1", objectives: ["know A", "know B"], ordinal: 0 },
  { number: "1.2", objectives: ["know C"], ordinal: 1 },
];

// 🔴 THE TRAP. Objective 0 exists in every section, so pooling without remapping would report a
// 1.1 objective for a question that came from 1.2.
test("pooling a chapter renumbers objectives so two sections cannot collide", () => {
  const lessons = new Map<number, Lesson>([
    [0, lessonWith([item(0, 1), item(1, 2)])],
    [1, lessonWith([item(0, 3)])],
  ]);
  const pool = poolForChapter(sections, lessons);
  assert.deepEqual(pool.items.map((i) => i.objective), [0, 1, 2]);
  assert.deepEqual(pool.labels, ["1.1 · know A", "1.1 · know B", "1.2 · know C"]);
});

test("a label names the section it came from, so a chapter score is readable", () => {
  const pool = poolForChapter(sections, new Map([[1, lessonWith([item(0, 9)])]]));
  const missed = pool.items[0]!.objective;
  assert.equal(pool.labels[missed], "1.2 · know C");
});

test("a section with no written lesson contributes objectives but no questions", () => {
  const pool = poolForChapter(sections, new Map([[0, lessonWith([item(0, 1)])]]));
  assert.equal(pool.items.length, 1);
  assert.equal(pool.labels.length, 3);
});

test("an item naming an objective its section does not have is dropped, not mislabelled", () => {
  const pool = poolForChapter(sections, new Map([[1, lessonWith([item(4, 1)])]]));
  assert.equal(pool.items.length, 0);
});

/* ---------------------------------------------------------------- vocabulary everywhere */

const BOND_TERMS = [
  { definition: "An attraction between oppositely charged ions.", term: "ionic bond" },
  { definition: "A bond in which atoms share a pair of electrons.", term: "covalent bond" },
  { definition: "A positively charged ion.", term: "cation" },
  { definition: "An atom carrying a charge.", term: "ion" },
];

// 🔴 THE WHOLE POINT OF THE 2026-09-04 CHANGE. Owner: a reader who meets a word again three
// paragraphs later should not have to scroll back to the one place it was underlined.
test("a term stays clickable after the paragraph that introduced it", () => {
  const marked = splitOnTerms("A [[cation]] is positive.", BOND_TERMS);
  const later = splitOnTerms("Every cation attracts an anion.", BOND_TERMS);
  assert.equal(marked.filter((s) => s.kind === "term").length, 1);
  assert.equal(later.filter((s) => s.kind === "term").length, 1);
  assert.equal(later.find((s) => s.kind === "term")?.text, "cation");
});

test("a plural is still the term it came from", () => {
  const out = splitOnTerms("Two cations met.", BOND_TERMS);
  const term = out.find((s) => s.kind === "term");
  assert.equal(term?.text, "cations");
  assert.equal(term?.definition, "A positively charged ion.");
});

// 🔴 THE REASON `MIN_MATCHED` EXISTS. "ion" is a term here and it is inside "region", "portion"
// and "reaction". Without a length floor and word boundaries the passage fills with dotted
// underlines on syllables.
test("a short term does not chip the inside of another word", () => {
  const out = splitOnTerms("The region of the reaction.", BOND_TERMS);
  assert.equal(out.filter((s) => s.kind === "term").length, 0);
});

// 🔴 LONGEST FIRST, so the reader gets the specific definition rather than the general one.
test("the longer term wins where two overlap", () => {
  const out = splitOnTerms("An ionic bond holds them.", BOND_TERMS);
  const term = out.find((s) => s.kind === "term");
  assert.equal(term?.text, "ionic bond");
});

test("a marker is never split in half by the matcher", () => {
  const out = splitOnTerms("A [[covalent bond]] shares, and a covalent bond is strong.", BOND_TERMS);
  const terms = out.filter((s) => s.kind === "term");
  assert.equal(terms.length, 2);
  assert.equal(terms[0]?.text, "covalent bond");
  assert.equal(terms[1]?.text, "covalent bond");
});

test("text with no terms comes back as one plain segment", () => {
  const out = splitOnTerms("Nothing here is vocabulary.", BOND_TERMS);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.kind, "plain");
});
