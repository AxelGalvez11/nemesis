import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_CLARIFY_OPTIONS,
  clarifyAnswerFact,
  readClarifyAnswer,
  readClarifyQuestion,
} from "./clarify-question";

// What this file proves, and what it deliberately does not.
//
// 🔴 IT CANNOT PROVE THAT "create a course on biology" DESERVES A QUESTION. That is a judgement
// about a model, measured against the real one by `scripts/conversation-acceptance.ts`. What is
// deterministic is the SHAPE: that a malformed ask is refused rather than repaired, that a question
// nobody could answer never reaches a learner, and that refusing always means "go ahead" rather
// than "park behind a broken card".

const WELL_FORMED = {
  allowOther: true,
  id: "course-depth",
  options: [
    { description: "The major ideas.", id: "survey", label: "Overview" },
    { description: "Comparable to a college course.", id: "academic", label: "Academic" },
    { id: "expert", label: "Deep" },
  ],
  prompt: "How deep should this course go?",
};

// ── Reading an ask ──────────────────────────────────────────────────────────

test("a well formed ask survives intact, descriptions and all", () => {
  const question = readClarifyQuestion(WELL_FORMED);
  assert.ok(question);
  assert.equal(question.id, "course-depth");
  assert.equal(question.options.length, 3);
  assert.equal(question.options[2]?.label, "Deep");
  assert.equal(question.options[2]?.description, null, "a missing description is absent, not empty");
  assert.equal(question.invitesWritten, true);
});

test("🔴 one option is not a choice, so it is not a question", () => {
  // A card with a single button asks the learner to agree with a decision already made. Refusing it
  // costs nothing: the caller runs the turn it was going to run.
  assert.equal(
    readClarifyQuestion({ ...WELL_FORMED, options: [{ id: "survey", label: "Overview" }] }),
    null,
  );
});

test("🔴 an ask with no prompt or no options is refused, never repaired", () => {
  for (const broken of [
    { ...WELL_FORMED, prompt: "  " },
    { ...WELL_FORMED, options: [] },
    { ...WELL_FORMED, options: "Overview or Academic" },
    { prompt: "How deep?" },
    null,
    "How deep should this course go?",
    ["Overview", "Academic"],
  ]) {
    assert.equal(readClarifyQuestion(broken), null, `${JSON.stringify(broken)} produced a card`);
  }
});

test("🔴 a blank label is dropped rather than filled in", () => {
  // Inventing text for an unpickable seat would put the software's guess in the model's mouth on
  // the one screen whose whole job is finding out what the learner actually meant.
  const question = readClarifyQuestion({
    ...WELL_FORMED,
    options: [...WELL_FORMED.options, { id: "ghost", label: "   " }],
  });
  assert.ok(question);
  assert.equal(question.options.length, 3);
});

test("🔴 options are capped, never padded", () => {
  const question = readClarifyQuestion({
    ...WELL_FORMED,
    options: Array.from({ length: 9 }, (_, index) => ({ label: `Option ${index}` })),
  });
  assert.ok(question);
  assert.equal(question.options.length, MAX_CLARIFY_OPTIONS);

  const two = readClarifyQuestion({
    ...WELL_FORMED,
    options: [{ label: "Overview" }, { label: "Academic" }],
  });
  assert.equal(two?.options.length, 2, "two real alternatives is a complete question");
});

test("🔴 two seats that send the same answer back are one seat", () => {
  const question = readClarifyQuestion({
    ...WELL_FORMED,
    options: [{ label: "Overview" }, { label: "overview" }, { label: "Academic" }],
  });
  assert.ok(question);
  assert.equal(question.options.length, 2);
});

test("ids and the question id are derived when the model omits them, structurally", () => {
  // No subject-matter anywhere: the same rule handles a law student's options and an engineer's.
  const question = readClarifyQuestion({
    options: [{ label: "Droit pénal" }, { label: "Droit civil" }],
    prompt: "Quel domaine du droit ?",
  });
  assert.ok(question);
  assert.equal(question.options[0]?.id, "droit-pénal");
  assert.ok(question.id.length > 0);
});

test("🔴 allowOther:false hides the row and never refuses prose", () => {
  const question = readClarifyQuestion({ ...WELL_FORMED, allowOther: false });
  assert.equal(question?.invitesWritten, false);
  // The primary composer is on screen regardless, so a typed answer still reads as an answer.
  assert.deepEqual(readClarifyAnswer(question!, "something else entirely"), {
    kind: "written",
    text: "something else entirely",
  });
});

// ── Reading an answer ───────────────────────────────────────────────────────

test("a typed label is the option the learner meant, not free text", () => {
  const question = readClarifyQuestion(WELL_FORMED)!;
  assert.deepEqual(readClarifyAnswer(question, "  Academic "), {
    kind: "option",
    label: "Academic",
    optionId: "academic",
  });
  assert.deepEqual(readClarifyAnswer(question, "survey"), {
    kind: "option",
    label: "Overview",
    optionId: "survey",
  });
});

test("anything past a label match is prose, and prose is a real answer", () => {
  const question = readClarifyQuestion(WELL_FORMED)!;
  const answer = readClarifyAnswer(question, "just the parts on my exam");
  assert.equal(answer?.kind, "written");
  assert.equal(readClarifyAnswer(question, "   "), null, "an empty submission answers nothing");
});

test("🔴 the fact fed back is a fact, never an instruction", () => {
  const question = readClarifyQuestion(WELL_FORMED)!;
  const fact = clarifyAnswerFact(question, { kind: "option", label: "Academic", optionId: "academic" });
  assert.match(fact, /course-depth = academic/);
  // The model decides what happens next. Telling it what to do would invert the split turn-router.ts
  // exists to protect.
  assert.doesNotMatch(fact, /\b(now|next|you must|build|continue)\b/i);
});
