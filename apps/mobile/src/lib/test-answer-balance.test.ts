// Deno unit tests (repo convention) for answer-position balancing on the phone.
// Run: deno test --no-check apps/mobile/src/lib/test-answer-balance.test.ts
//
// These mirror apps/web/lib/workspace/test-answer-balance.test.ts assertion for
// assertion, plus a GOLDEN sequence shared by both suites — see the last test.
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { balanceAnswerPositions, balancedPositions } from "./test-answer-balance.ts";
import type { TestQuestion } from "./study-artifact-content.ts";

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

Deno.test("a paper with every answer in slot A comes out spread across all four", () => {
  // 20 questions over 4 slots is exactly 5 each — the balanced case is exact.
  assertEquals(positionCounts(balanceAnswerPositions(allFirst(20)), 4), [5, 5, 5, 5]);
});

Deno.test("the answer text still matches the answer index — nothing is corrupted", () => {
  const before = allFirst(12);
  const after = balanceAnswerPositions(before);
  after.forEach((question, i) => {
    const original = before[i] as TestQuestion;
    const correctText = original.options[original.answer] as string;
    // The option the index points at must still be the option that was true.
    assertStrictEquals(question.options[question.answer], correctText);
    // And the paper still holds exactly the same options, just reordered.
    assertEquals([...question.options].sort(), [...original.options].sort());
    assertStrictEquals(question.q, original.q);
    assertStrictEquals(question.why, original.why);
  });
});

Deno.test("an uneven count spreads as evenly as it can, never leaning on one slot", () => {
  // 10 questions over 4 slots: two slots get 3, two get 2. No slot gets 0 or 4+.
  const counts = positionCounts(balanceAnswerPositions(allFirst(10)), 4);
  assertStrictEquals(counts.reduce((a, b) => a + b, 0), 10);
  for (const count of counts) {
    if (count < 2) throw new Error(`a slot got only ${count} of 10 answers`);
    if (count > 3) throw new Error(`a slot got ${count} of 10 answers — that is a pattern`);
  }
});

Deno.test("it is deterministic: the same paper lays out the same way twice", () => {
  const first = balanceAnswerPositions(allFirst(15));
  const second = balanceAnswerPositions(allFirst(15));
  assertEquals(first.map((q) => q.answer), second.map((q) => q.answer));
  assertEquals(first.map((q) => q.options), second.map((q) => q.options));
});

Deno.test("the positions are not the A,B,C,D cycle that balancing alone produces", () => {
  // A repeating cycle is MORE exploitable than clustering: spot it once and you
  // can answer the paper blind. This is the shuffle earning its place.
  const answers = balanceAnswerPositions(allFirst(24)).map((q) => q.answer);
  assertStrictEquals(answers.every((answer, i) => answer === i % 4), false);
});

Deno.test("an explanation that names a letter is left exactly where it was", () => {
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
  assertStrictEquals(balanced[0]?.answer, 0);
  assertEquals(balanced[0]?.options, ["first", "second", "third", "fourth"]);
});

Deno.test("a question with fewer options never targets a slot it does not have", () => {
  const questions: TestQuestion[] = Array.from({ length: 12 }, (_, i) => ({
    answer: 0,
    options: [`true ${i}`, `false ${i}`],
    q: `Two-option question ${i}`,
    why: "",
  }));
  for (const question of balanceAnswerPositions(questions)) {
    if (question.answer < 0 || question.answer >= question.options.length) {
      throw new Error(`answer index ${question.answer} is outside ${question.options.length} options`);
    }
  }
});

Deno.test("empty and single-question papers are handled without special-casing", () => {
  assertEquals(balanceAnswerPositions([]), []);
  const one = balanceAnswerPositions(allFirst(1));
  assertStrictEquals(one.length, 1);
  const question = one[0] as TestQuestion;
  assertStrictEquals(question.options[question.answer], "correct 0");
});

Deno.test("balancedPositions covers every slot before repeating any", () => {
  // Pinned directly: the balance step is what stops a lean, the shuffle only
  // hides the order. With a stubbed generator the balance must still hold.
  const positions = balancedPositions(8, 4, () => 0);
  assertStrictEquals(positions.length, 8);
  const counts: number[] = new Array(4).fill(0);
  for (const position of positions) counts[position] = (counts[position] ?? 0) + 1;
  assertEquals(counts, [2, 2, 2, 2]);
});

// The one test that is NOT a copy of the web suite's — it is the seam between
// them. A test the student starts on the web and finishes on the phone reads the
// SAME stored row, so the two implementations have to agree exactly, not merely
// both "look balanced". This pins the byte-for-byte output of a fixed paper; the
// identical assertion sits in the web suite against the same numbers, so a change
// to either copy fails on the side that was not updated.
const GOLDEN_20 = [3, 2, 1, 1, 3, 3, 3, 1, 2, 2, 0, 1, 0, 2, 0, 1, 2, 0, 3, 0];

Deno.test("GOLDEN: phone and web lay out the same paper identically", () => {
  assertEquals(balanceAnswerPositions(allFirst(20)).map((q) => q.answer), GOLDEN_20);
});
