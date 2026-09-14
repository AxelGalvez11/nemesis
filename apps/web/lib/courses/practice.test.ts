import assert from "node:assert/strict";
import test from "node:test";

import { accepts, BLANK, blankOut, practiceFrom, sentenceFor, sentencesOf } from "./practice";
import type { Lesson } from "./lesson";

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  sectionOrdinal: 1,
  minutes: 4,
  blocks: [],
  terms: [],
  figures: {},
  flashcards: [],
  items: [],
  ...over,
});

test("a full stop inside a number does not end a sentence", () => {
  const l = lesson({ blocks: [{ kind: "text", text: "A cell is 0.5 mm across. It holds a nucleus." }] });
  assert.deepEqual(sentencesOf(l), ["A cell is 0.5 mm across.", "It holds a nucleus."]);
});

test("markers are stripped from sentences", () => {
  const l = lesson({ blocks: [{ kind: "text", text: "A [[cation]] carries a positive charge." }] });
  assert.deepEqual(sentencesOf(l), ["A cation carries a positive charge."]);
});

test("the defining sentence loses to one that merely uses the term", () => {
  const term = { term: "cation", definition: "an atom that has lost an electron" };
  const chosen = sentenceFor(term, [
    "A cation is an atom that has lost an electron in a reaction.",
    "Sodium forms a cation when it meets chlorine in solution.",
  ]);
  assert.equal(chosen, "Sodium forms a cation when it meets chlorine in solution.");
});

test("the defining sentence is used when the term appears nowhere else", () => {
  const term = { term: "cation", definition: "an atom that has lost an electron" };
  const only = "A cation is an atom that has lost an electron in a reaction.";
  assert.equal(sentenceFor(term, [only]), only);
});

test("a sentence too short to give any context is refused", () => {
  const term = { term: "cation", definition: "an atom missing an electron" };
  assert.equal(sentenceFor(term, ["A cation forms."]), null);
});

test("a fill-in blanks the term out of its sentence", () => {
  const l = lesson({
    blocks: [{ kind: "text", text: "Sodium forms a [[cation]] when it meets chlorine in water." }],
    terms: [{ term: "cation", definition: "an atom that has lost an electron" }],
  });
  const deck = practiceFrom(l);
  const fill = deck.find((p) => p.kind === "type_in");
  assert.ok(fill && fill.kind === "type_in");
  assert.equal(fill.prompt, `Sodium forms a ${BLANK} when it meets chlorine in water.`);
  assert.equal(fill.answer, "cation");
});

test("four or more terms make it a click-and-fill, fewer make it type-in", () => {
  const text = "Sodium forms a cation and chlorine forms an anion, so an ion pair meets a solvent here.";
  const few = practiceFrom(
    lesson({ blocks: [{ kind: "text", text }], terms: [{ term: "cation", definition: "positive ion" }] }),
  );
  assert.equal(few[0]?.kind, "type_in");

  const many = practiceFrom(
    lesson({
      blocks: [{ kind: "text", text }],
      terms: [
        { term: "cation", definition: "positive ion" },
        { term: "anion", definition: "negative ion" },
        { term: "ion pair", definition: "two joined ions" },
        { term: "solvent", definition: "what dissolves a solute" },
      ],
    }),
  );
  assert.equal(many[0]?.kind, "pool_fill");
});

// 🔴 The test bank had this exact fault: the right answer sat in the same place and a learner could
// score without reading. It arrived a second time by a different route, in the derived pools.
test("the answer does not sit in the same slot in every pool", () => {
  const text =
    "Sodium forms a cation and chlorine forms an anion, and an ion pair will meet a solvent, then a "
    + "solute dissolves into that same solvent in a beaker on the bench in front of you today.";
  const deck = practiceFrom(
    lesson({
      blocks: [{ kind: "text", text }],
      terms: [
        { term: "cation", definition: "positive ion" },
        { term: "anion", definition: "negative ion" },
        { term: "ion pair", definition: "two joined ions" },
        { term: "solvent", definition: "what dissolves something" },
        { term: "solute", definition: "what gets dissolved" },
      ],
    }),
  );
  const slots = new Set(
    deck.flatMap((p) => (p.kind === "pool_fill" ? [p.pool.indexOf(p.answer)] : [])),
  );
  assert.ok(slots.size > 1, `every answer landed in slot ${[...slots]}`);
});

// 🔴 A fill-in must quote a sentence the learner read. A lesson with authored pages has its prose
// in `pages`; `blocks` is then the older scroll-view copy, and quoting that asks about the wrong text.
test("authored pages are the source of sentences, not the older blocks", () => {
  const l = lesson({
    blocks: [{ kind: "text", text: "The scroll copy never mentions this word at all, not once here." }],
    pages: [
      {
        heading: "One",
        blocks: [{ kind: "text", text: "Sodium forms a [[cation]] when it meets chlorine in water." }],
      },
    ],
    terms: [{ term: "cation", definition: "an atom that has lost an electron" }],
  });
  const fill = practiceFrom(l).find((p) => p.kind === "type_in");
  assert.ok(fill && fill.kind === "type_in");
  assert.ok(fill.prompt.includes("chlorine"), fill.prompt);
});

test("match pairs needs three terms and stops at five", () => {
  // The terms have to be words the prose actually uses, or they are not counted at all.
  const of = (n: number) => {
    const terms = Array.from({ length: n }, (_, i) => ({ term: `word${i}`, definition: `d${i}` }));
    return lesson({
      blocks: [{ kind: "text", text: terms.map((t) => `The ${t.term} appears here.`).join(" ") }],
      terms,
    });
  };
  assert.equal(practiceFrom(of(2)).some((p) => p.kind === "match"), false);
  const big = practiceFrom(of(9)).find((p) => p.kind === "match");
  assert.ok(big && big.kind === "match");
  assert.equal(big.pairs.length, 5);
});

// 🔴 Marking a near-miss wrong teaches the learner the exercise is unfair, and they stop typing.
test("a typed answer forgives case, plurals and one slip", () => {
  assert.ok(accepts("  Cation ", "cation"));
  assert.ok(accepts("mitochondrion", "mitochondrions"));
  assert.ok(accepts("mitochodria", "mitochondria"));
  assert.equal(accepts("anion", "cation"), false);
  // Short words get no slack: one letter is the whole difference between ion and eon.
  assert.equal(accepts("eon", "ion"), false);
});

// 🔴 A question placed before the sentence it quotes asks the learner to complete text they have not
// read. Seen live on Anatomy 1.1: a fill-in drawn from page six appeared after page one.
test("a fill-in reports the page whose prose it quotes", () => {
  const l = lesson({
    pages: [
      { heading: "One", blocks: [{ kind: "text", text: "This first page defines the [[cation]] and nothing else." }] },
      { heading: "Two", blocks: [{ kind: "text", text: "Sodium forms a cation the moment it meets chlorine in water." }] },
    ],
    terms: [{ term: "cation", definition: "an atom that has lost an electron" }],
  });
  const fill = practiceFrom(l)[0];
  assert.ok(fill && fill.kind === "type_in");
  assert.ok(fill.prompt.includes("chlorine"), fill.prompt);
  assert.equal(fill.fromPage, 1);
});

// 🔴 Anatomy 1.1 defines "anatomy", "microscopic anatomy" and "regional anatomy". The first pool
// offered all three for a blank whose answer was "anatomy", so every option was arguably right.
test("a distractor never contains the answer", () => {
  const l = lesson({
    blocks: [
      {
        kind: "text",
        text:
          "The word [[anatomy]] covers both scales, and a student meets [[microscopic anatomy]] later on, "
          + "then [[regional anatomy]], then [[physiology]] and [[histology]] and [[cytology]] and [[dissection]].",
      },
    ],
    terms: [
      { term: "anatomy", definition: "the study of structure" },
      { term: "microscopic anatomy", definition: "structure needing a lens" },
      { term: "regional anatomy", definition: "one part of the body at a time" },
      { term: "physiology", definition: "the study of function" },
      { term: "histology", definition: "the study of tissues" },
      { term: "cytology", definition: "the study of cells" },
      { term: "dissection", definition: "cutting a body apart" },
    ],
  });
  const pool = practiceFrom(l).find((p) => p.kind === "pool_fill" && p.answer === "anatomy");
  assert.ok(pool && pool.kind === "pool_fill", "no pool was built for anatomy");
  for (const option of pool.pool) {
    if (option === "anatomy") continue;
    assert.ok(!option.toLowerCase().includes("anatomy"), `"${option}" contains the answer`);
  }
});

// 🔴 Anatomy 1.1 defines both "physiology" and "cardiovascular physiology". Blanking the short one
// out of the long one produced "... cardiovascular ____ the heart and vessels ...", which reads as a
// typo, not a question. Seen live before this rule existed.
test("a term is never blanked out of the middle of a longer term", () => {
  const known = [
    { term: "physiology", definition: "the study of function" },
    { term: "cardiovascular physiology", definition: "the heart and vessels" },
  ];
  const inside = "Cardiovascular physiology covers the heart and the vessels that carry blood.";
  assert.equal(blankOut(inside, "physiology", known), null);

  const free = "Cardiovascular physiology is one branch, and physiology as a whole is much wider.";
  assert.equal(
    blankOut(free, "physiology", known),
    `Cardiovascular physiology is one branch, and ${BLANK} as a whole is much wider.`,
  );
});

// 🔴 The lesson's `terms` and its prose can disagree. Anatomy 1.1 carried "Dissection" from an older
// draft, and Match Pairs asked the learner to define a word the lesson never mentions.
test("vocabulary the prose never uses produces no practice at all", () => {
  const l = lesson({
    blocks: [{ kind: "text", text: "A cation forms when sodium meets chlorine in a beaker of water." }],
    terms: [
      { term: "cation", definition: "an atom that has lost an electron" },
      { term: "dissection", definition: "cutting a body apart" },
      { term: "histology", definition: "the study of tissues" },
    ],
  });
  const deck = practiceFrom(l);
  assert.equal(deck.some((p) => p.kind === "match"), false, "match pairs was built from one real term");
  for (const p of deck) if (p.kind !== "match") assert.equal(p.term, "cation");
});
