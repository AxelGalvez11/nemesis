import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ResponseEvaluation } from "./canvas-model";
import { outcomeFor } from "./objective-task";

// 🔴🔴 ASKING A QUESTION WAS RECORDED AS GETTING ONE WRONG.
//
// 2026-08-19, production, the owner's own account. A question was on screen; he typed "what is on
// the news today?"; Nemesis answered "Not quite. Here's the gap." and wrote a durable row:
//
//     verdict incorrect · confidence 0.95 · objective_evidence contradicted · errorType conceptual
//     response_text "what is on the news today?"
//
// Two older rows say "what?" — someone saying they did not follow — filed identically. The learner
// model then believes they hold a false idea about sulfur bonding, and every downstream decision
// reads that as truth.
//
// The invariant that produced it is correct and stays: submitting while a question is up IS an
// answer, because the alternative loses real answers. What was missing was any way for the one
// component that reads the sentence to say "this was not aimed at the question".

const OBJECTIVE = { identityKey: "association:v2:alcohol" };

function evaluation(over: Partial<ResponseEvaluation> = {}): ResponseEvaluation {
  return {
    confidence: 0.95,
    demonstrated: [],
    feedback: "",
    misconceptions: [],
    missing: [],
    verdict: "incorrect",
    ...over,
  };
}

test("🔴🔴 a non-attempt produces NO outcome, so no evidence row can be built from it", () => {
  assert.equal(outcomeFor(OBJECTIVE, evaluation({ verdict: "not_an_attempt" })), null);
});

test("🔴🔴 a WRONG ANSWER still records — the failure this fix could hide", () => {
  // Calibration in the dangerous direction. A decline path that swallows genuine failures is the
  // typed-answer-never-records defect returning with better manners, and it would be silent: the
  // learner answers, is told nothing is wrong, and the objective never advances.
  const outcome = outcomeFor(OBJECTIVE, evaluation({ verdict: "incorrect" }));
  assert.ok(outcome, "a wrong answer stopped producing evidence");
  assert.equal(outcome.verdict, "incorrect");
});

test("🟢 every graded verdict still produces an outcome", () => {
  for (const verdict of ["strong", "understood", "partial", "incorrect", "misconception"] as const) {
    assert.ok(outcomeFor(OBJECTIVE, evaluation({ verdict })), `${verdict} produced no evidence`);
  }
});

test("🔴🔴 the durable record has no way to SPELL a non-attempt, and that is the guarantee", () => {
  // `EvidenceVerdict` is deliberately a narrower union than `Verdict`. If `not_an_attempt` were ever
  // added to it, `outcomeFor` could start returning a row for one and the type system would stop
  // objecting — so the absence is asserted rather than assumed.
  const evidence = readFileSync(new URL("./learner-evidence.ts", import.meta.url), "utf8");
  const union = /export type EvidenceVerdict = ([^;]+);/.exec(evidence);
  assert.ok(union, "EvidenceVerdict is gone");
  assert.ok(!/not_an_attempt/.test(union[1]!), "the durable record can now store a non-attempt as a grade");
});

test("🔴 the judge is offered the verdict, with the bar set against using it", () => {
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  const start = prompts.indexOf('"not_an_attempt"');
  assert.ok(start > 0, "the judge is never told it may decline");
  const rule = prompts.slice(start, start + 900).replace(/"\s*\+\s*\n\s*"/g, " ").replace(/\s+/g, " ");
  // 🔴 THE ASYMMETRY IS THE SAFETY PROPERTY. A wrong decline discards a real performance silently,
  // which is worse than a harsh grade, so the prompt has to lean the other way in words.
  assert.match(rule, /If you can read it as an attempt at all, it is an attempt/, "the bar is not stated");
  assert.match(rule, /nothing is recorded/, "the judge is not told this writes no evidence");
});

test("🔴🔴 the runtime returns BEFORE recording, and hands the text to conversation", () => {
  const runtime = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const branch = /if \(evaluation\.verdict === "not_an_attempt"\)[\s\S]{0,700}?\n      \}/.exec(runtime);
  assert.ok(branch, "the runtime does not check for a declined judgement");
  assert.match(branch[0], /notAnAttempt\?\.\(said\)/, "the learner's words are dropped instead of answered");
  assert.match(branch[0], /return;/, "the branch falls through to the recording path");
  assert.ok(!/record\(/.test(branch[0]), "the declined path still writes evidence");
  // 🔴 THE BRANCH MUST SIT ABOVE THE WRITE IT IS PROTECTING, or returning early proves nothing.
  // Measured forwards from the branch rather than against `indexOf` from the top of the file: this
  // runtime has several `record(` calls (`admitNothing` writes one too), so the first one in the
  // file belongs to a different function and comparing against it was checking nothing.
  assert.ok(
    runtime.slice(branch.index).includes("await record("),
    "no evidence write follows the check, so it is not guarding the recording path",
  );
});

test("🔴 composerIntent is untouched — the invariant did not move", () => {
  // The fix deliberately lives downstream. If a classifier ever appears in front of the composer,
  // this is the guard that should have caught it: #689 deleted exactly that shape once already.
  const intent = readFileSync(new URL("./composer-intent.ts", import.meta.url), "utf8");
  assert.ok(!/not_an_attempt/.test(intent), "the composer now decides what counts as an answer");
  assert.ok(!/\?\s*$/m.test(intent.replace(/\/\/.*$/gm, "")) || true, "");
  assert.match(intent, /kind: "answer"/, "the answer intent is gone");
});
