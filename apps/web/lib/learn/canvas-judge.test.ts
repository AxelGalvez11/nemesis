import assert from "node:assert/strict";
import { test } from "node:test";

import { parseEvaluation, validateEvaluation, verdictIsPass } from "./canvas-judge";
import { deriveSchedulingSignal } from "./canvas-scheduling";
import { VERDICTS } from "./canvas-model";

const CONCEPTS = ["k1", "k2", "k3"];

function raw(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verdict: "partial",
    demonstrated: ["Named the two halves of the mechanism"],
    missing: ["Did not say what happens to the by-product"],
    feedback: "You have the first half. The by-product is reabsorbed, not excreted.",
    ...patch,
  };
}

// ---------------------------------------------------------------- validation

test("a well-formed judgement survives intact", () => {
  const { evaluation, rejected } = validateEvaluation(raw(), { conceptIds: CONCEPTS });
  assert.equal(rejected.length, 0);
  assert.equal(evaluation?.verdict, "partial");
  assert.deepEqual(evaluation?.demonstrated, ["Named the two halves of the mechanism"]);
  assert.equal(evaluation?.missing.length, 1);
});

test("a verdict outside the closed set is refused rather than coerced", () => {
  // Coercing an unknown verdict to "incorrect" would mark a learner wrong because the model
  // used a synonym. Refusing loses the judgement; guessing loses their trust.
  const { evaluation, rejected } = validateEvaluation(raw({ verdict: "correct" }), {
    conceptIds: CONCEPTS,
  });
  assert.equal(evaluation, null);
  assert.match(rejected.join(" "), /verdict/i);
});

test("a judgement that FELL SHORT with no refinement is refused", () => {
  // §20: the point is the targeted correction. A verdict that fell short and cannot say what was
  // missing has no way to change the teaching, so it is not worth storing.
  for (const bad of [undefined, "", "   ", 7]) {
    const { evaluation } = validateEvaluation(raw({ feedback: bad }), { conceptIds: CONCEPTS });
    assert.equal(evaluation, null, `refinement ${JSON.stringify(bad)} should be refused`);
  }
});

test("🔴 a CORRECT answer with no refinement survives — nothing was missing to supply", () => {
  // Found live, on the first real run of the policy loop. The prompt tells the judge that feedback
  // must supply "exactly what was missing and nothing else", so an obedient model returns "" for a
  // complete answer. This check then discarded the entire evaluation, the learner was shown
  // "Nemesis couldn't read that answer", and the demonstration they had genuinely just given was
  // recorded as no evidence at all — a right answer turned into absence.
  for (const pass of ["understood", "strong"]) {
    for (const empty of [undefined, "", "   "]) {
      const { evaluation } = validateEvaluation(raw({ feedback: empty, verdict: pass }), {
        conceptIds: CONCEPTS,
      });
      assert.equal(evaluation?.verdict, pass, `${pass} with feedback ${JSON.stringify(empty)} was thrown away`);
    }
  }
});

test("the judge is TOLD that empty feedback is right for a pass, so both ends agree", async () => {
  // A validator that accepts empty feedback while the prompt still demands prose would work by
  // luck: the model would keep inventing a sentence, and the day it stopped would look like a
  // regression in the validator rather than a contract nobody wrote down.
  const { evaluationMessages } = await import("./canvas-prompts");
  const wire = evaluationMessages({
    concepts: [],
    expectedEvidence: { referenceAnswer: "valsartan" },
    objective: { conceptId: null, label: "Given Diovan, produce valsartan" },
    prompt: "What is the generic for Diovan?",
    response: { text: "valsartan", via: "typed" },
    task: "name",
  });
  assert.match(wire.map((m) => m.content).join("\n"), /nothing was missing.*empty string/is);
});

test("non-string entries in got/missing are dropped, not stringified", () => {
  const { evaluation } = validateEvaluation(
    raw({ demonstrated: ["real point", 42, null, "  ", "second point"] }),
    { conceptIds: CONCEPTS },
  );
  assert.deepEqual(evaluation?.demonstrated, ["real point", "second point"]);
});

test("a bare string for got or missing is accepted as a single point", () => {
  const { evaluation } = validateEvaluation(raw({ missing: "Only one thing was missing" }), {
    conceptIds: CONCEPTS,
  });
  assert.deepEqual(evaluation?.missing, ["Only one thing was missing"]);
});

test("a concept the canvas never declared is dropped and reported", () => {
  // The judge naming a concept we did not give it has invented one. Storing it would put a
  // weakness on the diagnosis that points at nothing.
  const { evaluation, rejected } = validateEvaluation(
    raw({ alsoWeakConceptIds: ["k2", "k99", "made-up"] }),
    { conceptIds: CONCEPTS },
  );
  assert.deepEqual(evaluation?.alsoWeakConceptIds, ["k2"]);
  assert.match(rejected.join(" "), /k99/);
});

test("a named false belief is kept whatever the verdict", () => {
  // Changed deliberately from "only on a misconception verdict". Someone can have most of an
  // idea right AND hold one specific thing that is wrong; that belief is exactly what the
  // teaching policy needs, and discarding it because the verdict said "partial" threw away the
  // most actionable part of the reading.
  const partial = validateEvaluation(
    raw({ verdict: "partial", misconceptions: ["thinks the 3 multiplies only the first term"] }),
    { conceptIds: CONCEPTS },
  );
  assert.equal(partial.evaluation?.verdict, "partial");
  assert.equal(partial.evaluation?.misconceptions.length, 1);

  const named = validateEvaluation(
    raw({ verdict: "misconception", misconceptions: ["thinks the 3 multiplies only the first term"] }),
    { conceptIds: CONCEPTS },
  );
  assert.equal(named.evaluation?.verdict, "misconception");
  assert.match(named.evaluation?.misconceptions.join(" ") ?? "", /first term/);
});

test("a misconception verdict with nothing to name falls back to incorrect, and says so", () => {
  // Both are failures, so this cannot mark a right answer wrong — but a misconception with no
  // belief attached leaves the page with a label and nothing to teach against.
  const { evaluation, rejected } = validateEvaluation(raw({ verdict: "misconception" }), {
    conceptIds: CONCEPTS,
  });
  assert.equal(evaluation?.verdict, "incorrect");
  assert.match(rejected.join(" "), /misconception/i);
});

test("garbage in is null out, never a half-built judgement", () => {
  for (const bad of [null, undefined, "text", 12, [], true]) {
    const { evaluation } = validateEvaluation(bad, { conceptIds: CONCEPTS });
    assert.equal(evaluation, null, `${JSON.stringify(bad)} should not produce a judgement`);
  }
});

test("runaway lists and essays are clamped", () => {
  const { evaluation } = validateEvaluation(
    raw({
      got: Array.from({ length: 40 }, (_, i) => `point ${i}`),
      feedback: "x".repeat(5_000),
    }),
    { conceptIds: CONCEPTS },
  );
  assert.ok((evaluation?.demonstrated.length ?? 0) <= 8, "got should be clamped");
  assert.ok((evaluation?.feedback.length ?? 0) <= 1_200, "feedback should be clamped");
});

// -------------------------------------------------------------------- parsing

test("the judgement is found inside a fenced code block", () => {
  const reply = 'Sure!\n```json\n{"verdict":"understood","got":["all of it"],"missing":[],"feedback":"Exactly right."}\n```';
  const { evaluation } = parseEvaluation(reply, { conceptIds: CONCEPTS });
  assert.equal(evaluation?.verdict, "understood");
});

test("a reply with no JSON at all yields no judgement", () => {
  const { evaluation } = parseEvaluation("I think you did quite well there.", {
    conceptIds: CONCEPTS,
  });
  assert.equal(evaluation, null);
});

// ------------------------------------------------------------------- evidence

test("only 'understood' counts as having got it", () => {
  // §19 spends attention where understanding is not yet demonstrated, and `partial` is by
  // definition not that. Treating partial as a pass would retire a concept the learner has
  // only half of — the exact failure the diagnosis exists to prevent.
  assert.equal(verdictIsPass("understood"), true);
  assert.equal(verdictIsPass("partial"), false);
  assert.equal(verdictIsPass("incorrect"), false);
  assert.equal(verdictIsPass("misconception"), false);
});

// ------------------------------------- evidence in, scheduling out (adapter)

test("the scheduler's grade is derived from the evidence, never the other way round", () => {
  const evidence = (verdict: (typeof VERDICTS)[number]) => ({
    verdict,
    confidence: 0.8,
    demonstrated: [],
    missing: [],
    misconceptions: [],
    feedback: "…",
  });
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("understood") }).grade, "good");
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("partial") }).grade, "hard");
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("incorrect") }).grade, "again");
  assert.equal(deriveSchedulingSignal({ evaluation: evidence("misconception") }).grade, "again");
});
