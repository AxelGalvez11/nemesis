import assert from "node:assert/strict";
import { test } from "node:test";

import { objectivePromptText, predictionPromptText, retrievalPromptFor } from "./objective-task";
import { easier, harder, initialsOf, promptAtRung, rungIsWordable, stagedRung, wordableRungs } from "./scaffold-prompt";
import type { LearningObjective } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import type { StoredObjective } from "./learner-store";

// THE LADDER WAS A LIE, AND THESE TESTS ARE WHAT STOPS IT BECOMING ONE AGAIN.
//
// 🔴🔴 BEFORE `scaffold-prompt.ts`, A `narrowed` RETRIEVAL AND AN `independent` ONE PRODUCED
// BYTE-IDENTICAL TEXT. `scaffold-rung.ts` defined five rungs, `scaffold-decision.ts` chose one,
// `promptTargeting` accepted it and every evidence row recorded it — while `retrievalPromptFor`
// worded the question from the capability alone. The learner met the same sentence twice and the log
// said the second one had been made easier. It matters now because the controller has `harder` and
// `easier` as real moves, and a verb that moves a label and not a question is the same defect with a
// model's name on it.

const association = {
  answer: "Losartan",
  capability: "recall",
  cue: "Cozaar",
  identityKey: "recall:v1:aaa",
  identityVersion: 1,
  knowledgeIdentityKey: "assoc:v2:aaa",
  label: "Cozaar goes with Losartan",
  parameters: { outputRole: "generic" },
} as unknown as LearningObjective;

const causal = {
  answer: "current falls",
  capability: "predict",
  cue: "resistance increasing",
  identityKey: "predict:v1:bbb",
  identityVersion: 1,
  knowledgeIdentityKey: "causal:v2:bbb",
  label: "resistance rising lowers current",
  parameters: {},
} as unknown as LearningObjective;

test("🔴🔴 a narrowed question is NOT the same sentence as the unaided one", () => {
  // The single assertion this whole module exists to make true.
  const full = objectivePromptText(association);
  const narrowed = promptAtRung({ base: full, objective: association, rung: "narrowed" });
  assert.notEqual(narrowed, full, "a narrowed rung that changes no text is a label, not a question");
  assert.ok(narrowed);
});

test("🔴 narrowing a two-part question DROPS the second part, which is §33's own move", () => {
  // "What follows from X, and why?" asks for the consequence AND the mechanism. Asking for one of
  // them is a smaller region of the same objective, worded without knowing what the subject is —
  // which is what makes this generalise to a law student and a mechanical engineer alike.
  const full = predictionPromptText(causal);
  assert.ok(full.includes(", and why"));
  const narrowed = promptAtRung({ base: full, objective: causal, rung: "narrowed" });
  assert.equal(narrowed, "What follows from resistance increasing?");
});

test("🔴 a single-clause question narrows by disclosing the answer's SHAPE, never its content", () => {
  const narrowed = promptAtRung({ base: objectivePromptText(association), objective: association, rung: "narrowed" });
  assert.ok(narrowed?.includes("one word"), narrowed ?? "no prompt");
  assert.equal(narrowed?.includes("Losartan"), false, "🔴 the answer must never appear in its own question");
});

test("🔴 a cue gives initials and nothing more, and refuses when initials would BE the answer", () => {
  assert.equal(initialsOf("Losartan"), "L");
  assert.equal(initialsOf("angiotensin receptor blocker"), "arb");
  // Below three characters the initial is most of the answer. There is no honest cue to give.
  assert.equal(initialsOf("pH"), null);
  // A long list of initials is a spelling puzzle, not a hint.
  assert.equal(initialsOf("one two three four five"), null);
});

test("🔴🔴 what the row CLAIMS is what the learner met, even when the rung cannot be worded", () => {
  // The defect this closes, restored one layer up: a caller that ignored a refusal would write
  // `scaffoldRung: "cued"` onto a row whose question was never cued.
  const unwordable = { ...association, answer: "pH" } as unknown as LearningObjective;
  const base = objectivePromptText(unwordable);
  const staged = stagedRung({ base, objective: unwordable, wanted: "cued" });
  assert.equal(staged.prompt, base);
  assert.equal(staged.rung, "independent", "🔴 an unworded cue must not be recorded as a cue");

  // And when it CAN be worded, the claim is the wanted rung and the text really changed.
  const real = stagedRung({ base, objective: association, wanted: "cued" });
  assert.equal(real.rung, "cued");
  assert.notEqual(real.prompt, base);
});

test("🔴 stepping the ladder REFUSES at the ends rather than silently clamping", () => {
  // Returning the same rung would make "decrease difficulty" a no-op reporting success: the
  // controller believes it helped, the learner meets the identical prompt, and nothing says so.
  assert.equal(harder("independent"), null);
  assert.equal(easier("cued"), null);
  assert.equal(easier("independent"), "narrowed");
  assert.equal(harder("cued"), "narrowed");
});

test("🔴 the two rungs nobody built are REFUSED, not guessed at", () => {
  // `recognition` needs options on screen, which needs distractors and a surface that does not
  // exist. `taught` means Nemesis supplies the answer, which is `show_correction` — duplicating it
  // here would be a retrieval that gives itself away.
  assert.equal(rungIsWordable("recognition"), false);
  assert.equal(rungIsWordable("taught"), false);
  assert.equal(promptAtRung({ base: "x", objective: association, rung: "recognition" }), null);
  assert.deepEqual([...wordableRungs()], ["cued", "narrowed", "independent"]);
});

test("🔴🔴 the rung reaches the REAL prompt builder, not just this module", () => {
  // 🔴 THE END-TO-END ASSERTION, AND THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. Every test
  // above could pass while `retrievalPromptFor` still ignored the rung entirely — which is exactly
  // the state this repo shipped. This calls the real builder the runtime calls.
  const stored = { ...association, rowId: "row-1" } as unknown as StoredObjective;
  const knowledge = { id: "k", statement: "Cozaar is Losartan", type: "association" } as unknown as KnowledgeObject;
  const unaided = retrievalPromptFor({ knowledge, objective: stored }, "p1", "independent");
  const narrowed = retrievalPromptFor({ knowledge, objective: stored }, "p2", "narrowed");
  assert.notEqual(narrowed.prompt, unaided.prompt, "🔴 the rung must change the question the learner reads");
  assert.equal(narrowed.rung, "narrowed");
  assert.equal(unaided.rung, "independent");
});
