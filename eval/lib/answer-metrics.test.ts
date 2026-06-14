import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scoreAnswers, type ScoredAnswer } from "./answer-metrics.ts";

const claim = (cited: boolean, supported: boolean) => ({ cited, supported });

Deno.test("scoreAnswers: grounding/citation coverage over delivered claims", () => {
  const answers: ScoredAnswer[] = [
    {
      id: "a",
      answerable: true,
      delivered: true,
      claims: [claim(true, true), claim(true, false), claim(true, true)], // 2/3 supported, 3/3 cited
    },
    {
      id: "b",
      answerable: true,
      delivered: true,
      claims: [claim(true, true), claim(false, false)], // 1/2 supported, 1/2 cited
    },
  ];
  const s = scoreAnswers(answers);
  assertEquals(s.claims_scored, 5);
  assertEquals(s.grounding_coverage, 3 / 5); // 3 supported of 5
  assertEquals(s.citation_coverage, 4 / 5); // 4 cited of 5
  assertEquals(s.answered_rate, 1); // both answerable items delivered
});

Deno.test("scoreAnswers: an answerable item that REFUSED counts against answered_rate, contributes no claims", () => {
  const answers: ScoredAnswer[] = [
    { id: "a", answerable: true, delivered: true, claims: [claim(true, true)] },
    { id: "b", answerable: true, delivered: false, claims: [] }, // over-refused a real question
  ];
  const s = scoreAnswers(answers);
  assertEquals(s.answerable_total, 2);
  assertEquals(s.delivered, 1);
  assertEquals(s.answered_rate, 1 / 2);
  assertEquals(s.grounding_coverage, 1); // 1/1 over the only delivered claim
});

Deno.test("scoreAnswers: unanswerable items scored on clean refusal, NOT on coverage", () => {
  const answers: ScoredAnswer[] = [
    { id: "u1", answerable: false, delivered: false, claims: [] }, // correctly refused
    { id: "u2", answerable: false, delivered: true, claims: [claim(true, false)] }, // BAD: answered an unanswerable
  ];
  const s = scoreAnswers(answers);
  assertEquals(s.unanswerable_total, 2);
  assertEquals(s.unanswerable_refused, 1);
  assertEquals(s.clean_refusal_rate, 1 / 2);
  // coverage only reflects the (bad) delivered unanswerable's claim — answered items still count.
  assertEquals(s.claims_scored, 1);
});

Deno.test("scoreAnswers: empty input is all-zero, never NaN", () => {
  const s = scoreAnswers([]);
  assertEquals(s.grounding_coverage, 0);
  assertEquals(s.citation_coverage, 0);
  assertEquals(s.answered_rate, 0);
  assertEquals(s.clean_refusal_rate, 0);
  assertEquals(s.claims_scored, 0);
});

Deno.test("scoreAnswers: a delivered answer with zero claims doesn't divide-by-zero", () => {
  const answers: ScoredAnswer[] = [
    { id: "a", answerable: true, delivered: true, claims: [] },
  ];
  const s = scoreAnswers(answers);
  assertEquals(s.answered_rate, 1);
  assertEquals(s.grounding_coverage, 0); // no claims => 0, not NaN
});
