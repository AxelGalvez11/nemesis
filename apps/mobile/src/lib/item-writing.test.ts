import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { qualityPracticeQuestions } from "./item-writing.ts";

Deno.test("AI test quality gate keeps well-formed items and rejects technical flaws", () => {
  const questions = qualityPracticeQuestions([
    {
      q: "A function approaches 4 from both sides as x approaches 2. What is its limit?",
      options: ["2", "4", "The limit does not exist", "There is not enough information"],
      answer: 1,
      why: "A two-sided limit is the shared value approached from the left and right.",
    },
    {
      q: "Which statement is NOT true?",
      options: ["A", "B", "C"],
      answer: 0,
      why: "Negative stems measure avoidable reading traps.",
    },
    {
      q: "What is continuity?",
      options: ["A connected idea", "None of the above", "A limit condition"],
      answer: 2,
      why: "None-of-the-above is not a diagnostic distractor.",
    },
  ]);
  assertEquals(questions.length, 1);
  assertEquals(questions[0]?.answer, 1);
});
