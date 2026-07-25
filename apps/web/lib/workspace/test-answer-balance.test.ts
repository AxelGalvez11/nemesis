import assert from "node:assert/strict";
import { test } from "node:test";

import { balanceAnswerPositions, balancedPositions } from "./test-answer-balance";
import type { TestQuestion } from "./study-artifact-content";

/** A paper where the model put every correct answer first — the real failure. */
function allFirst(count: number): TestQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    answer: 0,
    options: [`correct ${i}`, `wrong a${i}`, `wrong b${i}`, `wrong c${i}`],
    q: `Question number ${i} about a distinct topic`,
    why: "Because the mechanism works that way.",
  }));
}

function positionCounts(questions: TestQuestion[], slots: number): number[] {
  const counts: number[] = new Array(slots).fill(0);
  for (const question of questions) counts[question.answer] = (counts[question.answer] ?? 0) + 1;
  return counts;
}

test("a paper with every answer in slot A comes out spread across all four", () => {
  const balanced = balanceAnswerPositions(allFirst(20));
  // 20 questions over 4 slots is exactly 5 each — the balanced case is exact.
  assert.deepEqual(positionCounts(balanced, 4), [5, 5, 5, 5]);
});

test("the answer text still matches the answer index — nothing is corrupted", () => {
  const before = allFirst(12);
  const after = balanceAnswerPositions(before);
  after.forEach((question, i) => {
    const original = before[i] as TestQuestion;
    const correctText = original.options[original.answer] as string;
    // The option the index points at must still be the option that was true.
    assert.equal(question.options[question.answer], correctText);
    // And the paper still holds exactly the same options, just reordered.
    assert.deepEqual([...question.options].sort(), [...original.options].sort());
    assert.equal(question.q, original.q);
    assert.equal(question.why, original.why);
  });
});

test("an uneven count spreads as evenly as it can, never leaning on one slot", () => {
  // 10 questions over 4 slots: two slots get 3, two get 2. No slot gets 0 or 4+.
  const counts = positionCounts(balanceAnswerPositions(allFirst(10)), 4);
  assert.equal(counts.reduce((a, b) => a + b, 0), 10);
  for (const count of counts) {
    assert.ok(count >= 2, `a slot got only ${count} of 10 answers`);
    assert.ok(count <= 3, `a slot got ${count} of 10 answers — that is a pattern`);
  }
});

test("it is deterministic: the same paper lays out the same way twice", () => {
  const first = balanceAnswerPositions(allFirst(15));
  const second = balanceAnswerPositions(allFirst(15));
  assert.deepEqual(first.map((q) => q.answer), second.map((q) => q.answer));
  assert.deepEqual(first.map((q) => q.options), second.map((q) => q.options));
});

test("the positions are not the A,B,C,D cycle that balancing alone produces", () => {
  // A repeating cycle is MORE exploitable than clustering: spot it once and you
  // can answer the paper blind. This is the shuffle earning its place.
  const answers = balanceAnswerPositions(allFirst(24)).map((q) => q.answer);
  assert.equal(answers.every((answer, i) => answer === i % 4), false);
});

test("an explanation that names a letter is left exactly where it was", () => {
  const questions: TestQuestion[] = [
    {
      answer: 0,
      options: ["first", "second", "third", "fourth"],
      q: "Which agent lowers preload the most in this patient",
      why: "Option B describes a diuretic, which is why it is wrong here.",
    },
  ];
  const balanced = balanceAnswerPositions(questions);
  // Moving the options would have made that sentence untrue.
  assert.equal(balanced[0]?.answer, 0);
  assert.deepEqual(balanced[0]?.options, ["first", "second", "third", "fourth"]);
});

test("a question with fewer options never targets a slot it does not have", () => {
  const questions: TestQuestion[] = Array.from({ length: 12 }, (_, i) => ({
    answer: 0,
    options: [`true ${i}`, `false ${i}`],
    q: `Two-option question ${i}`,
    why: "",
  }));
  for (const question of balanceAnswerPositions(questions)) {
    assert.ok(question.answer >= 0 && question.answer < question.options.length);
  }
});

test("empty and single-question papers are handled without special-casing", () => {
  assert.deepEqual(balanceAnswerPositions([]), []);
  const one = balanceAnswerPositions(allFirst(1));
  assert.equal(one.length, 1);
  const question = one[0] as TestQuestion;
  assert.equal(question.options[question.answer], "correct 0");
});

test("balancedPositions covers every slot before repeating any", () => {
  // Pinned directly: the balance step is what stops a lean, the shuffle only
  // hides the order. With a stubbed generator the balance must still hold.
  const positions = balancedPositions(8, 4, () => 0);
  assert.equal(positions.length, 8);
  const counts: number[] = new Array(4).fill(0);
  for (const position of positions) counts[position] = (counts[position] ?? 0) + 1;
  assert.deepEqual(counts, [2, 2, 2, 2]);
});
