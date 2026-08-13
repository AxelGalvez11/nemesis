import assert from "node:assert/strict";
import { test } from "node:test";

import { knowledgeProductionFor } from "./knowledge-production";

// The whole of RUNTIME-005's decision, and there is deliberately not much of it. The interesting
// proof is not here — it is `scripts/runtime-005-acceptance.mts`, which runs the real
// `ensureKnowledgeForCanvas` against the real production canvas. These pin the mapping so a later
// edit cannot quietly widen what counts as trustworthy.

test("only a COMPLETE extraction mints knowledge", () => {
  assert.deepEqual(knowledgeProductionFor({ outcome: "complete" }), { produce: true });
});

test("🔴 degraded refuses — and it refuses the whole canvas, deliberately", () => {
  // `outcome` is the WORST result across a canvas's sources, so one degraded source refuses three
  // clean ones beside it. That over-refusal is accepted rather than tolerated: it is the coarseness
  // `PARSER-003` removes once unit locality survives the extraction boundary, at which point
  // `degraded` refuses the CHART instead of the chapter it sits in. Softening it before then is how
  // knowledge gets minted from a grid that was flattened on the way in.
  assert.deepEqual(knowledgeProductionFor({ outcome: "degraded" }), {
    produce: false,
    refusal: "extraction-degraded",
  });
});

test("failed refuses — unknown is not empty", () => {
  assert.deepEqual(knowledgeProductionFor({ outcome: "failed" }), {
    produce: false,
    refusal: "extraction-failed",
  });
});

test("no durable source refuses, and says so as its own reason", () => {
  // Not a failure and not a degradation: there is simply nothing with a library row to read. Kept
  // distinct because the fix is completely different — it is `RUNTIME-004`'s attach path, not a parse.
  assert.deepEqual(knowledgeProductionFor({ outcome: "no-durable-source" }), {
    produce: false,
    refusal: "no-durable-source",
  });
});

test("🔴 a refusal can never be represented without saying why", () => {
  // The union is the point. `{ produce: false }` alone does not typecheck, so a refusal cannot reach
  // a surface with nothing to show for it — the shape that turns "we could not read your file" into
  // a blank canvas with no explanation.
  for (const outcome of ["degraded", "failed", "no-durable-source"] as const) {
    const decision = knowledgeProductionFor({ outcome });
    assert.equal(decision.produce, false);
    assert.ok(decision.produce === false && decision.refusal.length > 0);
  }
});

test("🔴 every outcome is mapped — nothing falls through to producing", () => {
  // Total by construction: a `switch` over a closed union with a return in every arm. If a fifth
  // outcome is ever added upstream, this stops compiling rather than silently minting knowledge from
  // an extraction nobody classified. Asserted at runtime too, because the compiler is not what runs
  // in production.
  const outcomes = ["complete", "degraded", "failed", "no-durable-source"] as const;
  const produced = outcomes.filter((outcome) => knowledgeProductionFor({ outcome }).produce);
  assert.deepEqual(produced, ["complete"], "exactly one outcome may mint knowledge");
});
