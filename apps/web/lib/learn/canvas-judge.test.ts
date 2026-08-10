import assert from "node:assert/strict";
import { test } from "node:test";

import { parseJudgement, validateJudgement, verdictIsPass } from "./canvas-judge";

const CONCEPTS = ["k1", "k2", "k3"];

function raw(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verdict: "partial",
    got: ["Named the two halves of the mechanism"],
    missing: ["Did not say what happens to the by-product"],
    refinement: "You have the first half. The by-product is reabsorbed, not excreted.",
    ...patch,
  };
}

// ---------------------------------------------------------------- validation

test("a well-formed judgement survives intact", () => {
  const { judgement, rejected } = validateJudgement(raw(), { conceptIds: CONCEPTS });
  assert.equal(rejected.length, 0);
  assert.equal(judgement?.verdict, "partial");
  assert.deepEqual(judgement?.got, ["Named the two halves of the mechanism"]);
  assert.equal(judgement?.missing.length, 1);
});

test("a verdict outside the closed set is refused rather than coerced", () => {
  // Coercing an unknown verdict to "incorrect" would mark a learner wrong because the model
  // used a synonym. Refusing loses the judgement; guessing loses their trust.
  const { judgement, rejected } = validateJudgement(raw({ verdict: "correct" }), {
    conceptIds: CONCEPTS,
  });
  assert.equal(judgement, null);
  assert.match(rejected.join(" "), /verdict/i);
});

test("a judgement with no refinement is refused", () => {
  // §20: the point is the targeted correction. A judgement with nothing to say has no way to
  // change the teaching, so it is not worth storing.
  for (const bad of [undefined, "", "   ", 7]) {
    const { judgement } = validateJudgement(raw({ refinement: bad }), { conceptIds: CONCEPTS });
    assert.equal(judgement, null, `refinement ${JSON.stringify(bad)} should be refused`);
  }
});

test("non-string entries in got/missing are dropped, not stringified", () => {
  const { judgement } = validateJudgement(
    raw({ got: ["real point", 42, null, "  ", "second point"] }),
    { conceptIds: CONCEPTS },
  );
  assert.deepEqual(judgement?.got, ["real point", "second point"]);
});

test("a bare string for got or missing is accepted as a single point", () => {
  const { judgement } = validateJudgement(raw({ missing: "Only one thing was missing" }), {
    conceptIds: CONCEPTS,
  });
  assert.deepEqual(judgement?.missing, ["Only one thing was missing"]);
});

test("a concept the canvas never declared is dropped and reported", () => {
  // The judge naming a concept we did not give it has invented one. Storing it would put a
  // weakness on the diagnosis that points at nothing.
  const { judgement, rejected } = validateJudgement(
    raw({ alsoWeakConceptIds: ["k2", "k99", "made-up"] }),
    { conceptIds: CONCEPTS },
  );
  assert.deepEqual(judgement?.alsoWeakConceptIds, ["k2"]);
  assert.match(rejected.join(" "), /k99/);
});

test("misconception text is kept only on a misconception verdict", () => {
  const other = validateJudgement(
    raw({ verdict: "partial", misconception: "thinks the 3 multiplies only the first term" }),
    { conceptIds: CONCEPTS },
  );
  assert.equal(other.judgement?.misconception, undefined);

  const real = validateJudgement(
    raw({ verdict: "misconception", misconception: "thinks the 3 multiplies only the first term" }),
    { conceptIds: CONCEPTS },
  );
  assert.equal(real.judgement?.verdict, "misconception");
  assert.match(real.judgement?.misconception ?? "", /first term/);
});

test("a misconception verdict with nothing to name falls back to incorrect, and says so", () => {
  // Both are failures, so this cannot mark a right answer wrong — but a misconception with no
  // belief attached leaves the page with a label and nothing to teach against.
  const { judgement, rejected } = validateJudgement(raw({ verdict: "misconception" }), {
    conceptIds: CONCEPTS,
  });
  assert.equal(judgement?.verdict, "incorrect");
  assert.match(rejected.join(" "), /misconception/i);
});

test("garbage in is null out, never a half-built judgement", () => {
  for (const bad of [null, undefined, "text", 12, [], true]) {
    const { judgement } = validateJudgement(bad, { conceptIds: CONCEPTS });
    assert.equal(judgement, null, `${JSON.stringify(bad)} should not produce a judgement`);
  }
});

test("runaway lists and essays are clamped", () => {
  const { judgement } = validateJudgement(
    raw({
      got: Array.from({ length: 40 }, (_, i) => `point ${i}`),
      refinement: "x".repeat(5_000),
    }),
    { conceptIds: CONCEPTS },
  );
  assert.ok((judgement?.got.length ?? 0) <= 8, "got should be clamped");
  assert.ok((judgement?.refinement.length ?? 0) <= 1_200, "refinement should be clamped");
});

// -------------------------------------------------------------------- parsing

test("the judgement is found inside a fenced code block", () => {
  const reply = 'Sure!\n```json\n{"verdict":"understood","got":["all of it"],"missing":[],"refinement":"Exactly right."}\n```';
  const { judgement } = parseJudgement(reply, { conceptIds: CONCEPTS });
  assert.equal(judgement?.verdict, "understood");
});

test("a reply with no JSON at all yields no judgement", () => {
  const { judgement } = parseJudgement("I think you did quite well there.", {
    conceptIds: CONCEPTS,
  });
  assert.equal(judgement, null);
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
