import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFreeQuestions,
  parseLesson,
  parseRecallCards,
  parseShortAnswer,
  parseTestQuestions,
} from "./canvas-parse";
import type { CanvasSource } from "./canvas-model";

const SOURCES: CanvasSource[] = [
  {
    id: "s1",
    title: "Lecture.pdf",
    kind: "pdf",
    excerpts: [
      { id: "s1:e1", label: null, text: "one" },
      { id: "s1:e2", label: null, text: "two" },
    ],
  },
];

// -------------------------------------------------------------------- lesson

const GOOD_LESSON = JSON.stringify({
  title: "Cardiac action potentials",
  concepts: [{ id: "k1", label: "Ion gradients" }, { id: "k2", label: "Nodal cells" }],
  blocks: [
    { type: "heading", content: "Cardiac action potentials", conceptIds: [], sourceRefs: [] },
    { type: "paragraph", content: "Charge moves.", conceptIds: ["k1"], sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }] },
  ],
});

test("a well-formed lesson parses into a title, concepts and blocks with ids", () => {
  const lesson = parseLesson(GOOD_LESSON, SOURCES);
  assert.equal(lesson?.title, "Cardiac action potentials");
  assert.equal(lesson?.concepts.length, 2);
  assert.equal(lesson?.blocks.length, 2);
  assert.ok(lesson?.blocks[0]?.id);
  assert.notEqual(lesson?.blocks[0]?.id, lesson?.blocks[1]?.id);
});

test("citations that resolve are kept", () => {
  const lesson = parseLesson(GOOD_LESSON, SOURCES);
  assert.deepEqual(lesson?.blocks[1]?.sourceRefs, [{ sourceId: "s1", excerptId: "s1:e1" }]);
});

test("a citation pointing at an excerpt that does not exist is dropped, not kept as decoration", () => {
  const raw = JSON.stringify({
    title: "T",
    concepts: [{ id: "k1", label: "A" }],
    blocks: [{ type: "paragraph", content: "x", sourceRefs: [{ sourceId: "s1", excerptId: "s1:e77" }] }],
  });
  assert.deepEqual(parseLesson(raw, SOURCES)?.blocks[0]?.sourceRefs, undefined);
});

test("a block claiming a concept the lesson never declared has that claim dropped", () => {
  const raw = JSON.stringify({
    title: "T",
    concepts: [{ id: "k1", label: "A" }],
    blocks: [{ type: "paragraph", content: "x", conceptIds: ["k1", "ghost"] }],
  });
  assert.deepEqual(parseLesson(raw, SOURCES)?.blocks[0]?.conceptIds, ["k1"]);
});

test("an unknown block type falls back to a paragraph rather than losing the content", () => {
  const raw = JSON.stringify({
    title: "T",
    concepts: [],
    blocks: [{ type: "interpretive_dance", content: "Real content." }],
  });
  const lesson = parseLesson(raw, SOURCES);
  assert.equal(lesson?.blocks[0]?.type, "paragraph");
  assert.equal(lesson?.blocks[0]?.content, "Real content.");
});

test("empty blocks are dropped", () => {
  const raw = JSON.stringify({
    title: "T",
    concepts: [],
    blocks: [{ type: "paragraph", content: "  " }, { type: "paragraph", content: "real" }],
  });
  assert.equal(parseLesson(raw, SOURCES)?.blocks.length, 1);
});

test("a lesson with no usable blocks is null, not an empty page", () => {
  const raw = JSON.stringify({ title: "T", concepts: [], blocks: [] });
  assert.equal(parseLesson(raw, SOURCES), null);
});

test("prose instead of JSON yields null rather than a broken lesson", () => {
  assert.equal(parseLesson("Sure, here's a lesson about the heart!", SOURCES), null);
});

test("a lesson wrapped in a fenced code block parses", () => {
  assert.ok(parseLesson("```json\n" + GOOD_LESSON + "\n```", SOURCES));
});

test("a concept with no label is dropped, and blocks stop referencing it", () => {
  const raw = JSON.stringify({
    title: "T",
    concepts: [{ id: "k1", label: "" }, { id: "k2", label: "Real" }],
    blocks: [{ type: "paragraph", content: "x", conceptIds: ["k1", "k2"] }],
  });
  const lesson = parseLesson(raw, SOURCES);
  assert.deepEqual(lesson?.concepts.map((c) => c.id), ["k2"]);
  assert.deepEqual(lesson?.blocks[0]?.conceptIds, ["k2"]);
});

test("a missing title falls back to the first heading rather than being blank", () => {
  const raw = JSON.stringify({
    concepts: [],
    blocks: [{ type: "heading", content: "Thermodynamics" }, { type: "paragraph", content: "x" }],
  });
  assert.equal(parseLesson(raw, SOURCES)?.title, "Thermodynamics");
});

// -------------------------------------------------------------------- recall

test("recall cards parse with concept and get ids", () => {
  const raw = JSON.stringify({
    cards: [{ front: "What drives phase 0?", back: "Sodium.", conceptId: "k1" }],
  });
  const cards = parseRecallCards(raw, ["k1"], SOURCES);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.conceptId, "k1");
  assert.ok(cards[0]?.id);
});

test("a card with no back is dropped — there is nothing to reveal", () => {
  const raw = JSON.stringify({ cards: [{ front: "Q?", back: "", conceptId: "k1" }] });
  assert.equal(parseRecallCards(raw, ["k1"], SOURCES).length, 0);
});

test("a card naming an unknown concept keeps the card but drops the claim", () => {
  const raw = JSON.stringify({ cards: [{ front: "Q?", back: "A.", conceptId: "ghost" }] });
  const cards = parseRecallCards(raw, ["k1"], SOURCES);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.conceptId, null);
});

test("identical fronts are de-duplicated so the same card is not asked twice", () => {
  const raw = JSON.stringify({
    cards: [
      { front: "What drives phase 0?", back: "Sodium.", conceptId: "k1" },
      { front: "what drives phase 0?", back: "Na+.", conceptId: "k1" },
    ],
  });
  assert.equal(parseRecallCards(raw, ["k1"], SOURCES).length, 1);
});

// ---------------------------------------------------------------------- test

const GOOD_TEST = JSON.stringify({
  questions: [
    { q: "Which ion drives phase 0?", options: ["Na", "K", "Ca", "Cl"], answer: 0, why: "Fast sodium channels.", conceptId: "k1" },
  ],
});

test("questions parse with their concept and an id", () => {
  const questions = parseTestQuestions(GOOD_TEST, ["k1"], SOURCES);
  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.conceptId, "k1");
  assert.ok(questions[0]?.id);
});

test("the answer index must point at a real option", () => {
  const raw = JSON.stringify({ questions: [{ q: "Q?", options: ["a", "b"], answer: 7, why: "", conceptId: "k1" }] });
  assert.equal(parseTestQuestions(raw, ["k1"], SOURCES).length, 0);
});

test("a question with fewer than two options is dropped", () => {
  const raw = JSON.stringify({ questions: [{ q: "Q?", options: ["only"], answer: 0, why: "", conceptId: "k1" }] });
  assert.equal(parseTestQuestions(raw, ["k1"], SOURCES).length, 0);
});

test("the correct answer survives the option reshuffle", () => {
  // Positions are rebalanced so the right answer is not always first; the index must follow
  // its own option, or every question silently becomes wrong.
  const raw = JSON.stringify({
    questions: Array.from({ length: 8 }, (_, i) => ({
      q: `Q${i}?`,
      options: [`correct${i}`, `w1${i}`, `w2${i}`, `w3${i}`],
      answer: 0,
      why: "",
      conceptId: "k1",
    })),
  });
  const questions = parseTestQuestions(raw, ["k1"], SOURCES);
  assert.equal(questions.length, 8);
  for (const [i, question] of questions.entries()) {
    assert.equal(question.options[question.answer], `correct${i}`);
  }
});

test("the correct answer is not always in the same position after parsing", () => {
  const raw = JSON.stringify({
    questions: Array.from({ length: 12 }, (_, i) => ({
      q: `Q${i}?`,
      options: ["correct", "w1", "w2", "w3"],
      answer: 0,
      why: "",
      conceptId: "k1",
    })),
  });
  const positions = new Set(parseTestQuestions(raw, ["k1"], SOURCES).map((q) => q.answer));
  assert.ok(positions.size > 1, "answers all landed in one slot");
});

test("a question naming no known concept is dropped — an unattributable miss teaches nothing", () => {
  const raw = JSON.stringify({ questions: [{ q: "Q?", options: ["a", "b"], answer: 0, why: "", conceptId: "ghost" }] });
  assert.equal(parseTestQuestions(raw, ["k1"], SOURCES).length, 0);
});

// -------------------------------------------------------------- short answer

test("a short answer parses out of the JSON envelope", () => {
  assert.equal(parseShortAnswer('{"answer":"Because sodium enters."}'), "Because sodium enters.");
});

test("a model that forgot the envelope still gives us its prose rather than nothing", () => {
  assert.equal(parseShortAnswer("Because sodium enters."), "Because sodium enters.");
});

test("an empty reply yields null", () => {
  assert.equal(parseShortAnswer("   "), null);
});

// ------------------------------------------------------------- free response

const FREE_SOURCES = [
  { id: "s1", title: "Lecture.pdf", kind: "pdf", excerpts: [{ id: "s1:e1", label: null, text: "…" }] },
];

test("a free-response prompt is parsed with its expected points", () => {
  const raw = JSON.stringify({
    questions: [
      {
        kind: "mechanism",
        q: "Walk through what happens after the valve opens.",
        expected: ["pressure equalises first", "flow follows the gradient"],
        why: "The full answer.",
        conceptId: "k1",
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }],
      },
    ],
  });
  const [question] = parseFreeQuestions(raw, ["k1"], FREE_SOURCES);
  assert.equal(question?.format, "free");
  assert.equal(question?.task, "mechanism");
  assert.equal(question?.expectedEvidence.acceptableClaims?.length, 2);
  assert.equal(question?.sourceRefs?.length, 1);
});

test("a prompt with nothing expected of it is dropped as unjudgeable", () => {
  // Without expected points the judge has nothing to check against, so the learner would answer
  // at length for no benefit.
  const raw = JSON.stringify({ questions: [{ q: "Explain.", expected: [], why: "", conceptId: "k1" }] });
  assert.deepEqual(parseFreeQuestions(raw, ["k1"], FREE_SOURCES), []);
});

test("a free prompt naming a concept the canvas never declared is dropped", () => {
  const raw = JSON.stringify({
    questions: [{ q: "Explain.", expected: ["a point"], why: "", conceptId: "ghost" }],
  });
  assert.deepEqual(parseFreeQuestions(raw, ["k1"], FREE_SOURCES), []);
});

test("an unrecognised kind falls back to explain rather than dropping the prompt", () => {
  // The kind only decides the one-line hint above the box, so a strange value is not worth
  // losing a usable prompt over.
  const raw = JSON.stringify({
    questions: [{ kind: "interpretive-dance", q: "Explain.", expected: ["a point"], why: "", conceptId: "k1" }],
  });
  assert.equal(parseFreeQuestions(raw, ["k1"], FREE_SOURCES)[0]?.task, "explain");
});
