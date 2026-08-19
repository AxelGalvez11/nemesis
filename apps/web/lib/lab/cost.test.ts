import assert from "node:assert/strict";
import { test } from "node:test";

// 🔴 THE CANONICAL MODULE, IMPORTED ONLY HERE. A test runs from the full checkout, so it can reach
// `supabase/functions/`; the app cannot, because Vercel builds from a pruned workspace. That
// asymmetry is the whole reason `cost.ts` is a copy, and this file is what stops the copy drifting.
import { costUsd, PRICES } from "../../../../supabase/functions/_shared/llm-cost";

import { labCostUsd, LAB_PRICES } from "./cost";

test("🔴 the mirrored price table is identical to the canonical one", () => {
  // Not "contains the models we care about" — identical. A model added canonically and missed here
  // would read as unpriced in the panel, which looks like a deliberate refusal rather than a gap.
  assert.deepEqual(LAB_PRICES, PRICES);
});

test("🔴 the mirrored arithmetic agrees with the canonical function", () => {
  const splits = [
    { cacheHitTokens: 0, completionTokens: 0, promptTokens: 0 },
    { cacheHitTokens: 0, completionTokens: 73, promptTokens: 13240 },
    { cacheHitTokens: 3840, completionTokens: 9, promptTokens: 3878 },
    // A provider reporting more cached tokens than prompt tokens; both must clamp the same way.
    { cacheHitTokens: 9999, completionTokens: 5, promptTokens: 100 },
    // Negatives, which a corrupt body could carry.
    { cacheHitTokens: -5, completionTokens: -1, promptTokens: -10 },
  ];
  for (const model of [...Object.keys(PRICES), "deepseek-chat", "some-unpriced-model", ""]) {
    for (const split of splits) {
      assert.deepEqual(
        labCostUsd(model, split),
        costUsd(model, split),
        `disagreed on ${model || "(empty model)"} with ${JSON.stringify(split)}`,
      );
    }
  }
});

test("🔴 an unpriced model is null, never zero", () => {
  const result = labCostUsd("a-model-nobody-has-priced", {
    cacheHitTokens: 0,
    completionTokens: 500,
    promptTokens: 500,
  });
  assert.equal(result.usd, null);
  assert.equal(result.priced, false);
});
