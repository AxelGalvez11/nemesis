import assert from "node:assert/strict";

import { AI_MARGIN_TARGET, grossMarginAtScale, PAID_AI_GUARDRAILS, providerCostCeiling } from "./chat-economics";

assert.equal(Number(providerCostCeiling(PAID_AI_GUARDRAILS.plus).toFixed(2)), 1.34);
assert.equal(Number(providerCostCeiling(PAID_AI_GUARDRAILS.pro).toFixed(3)), 3.534);
assert.equal(Number(providerCostCeiling(PAID_AI_GUARDRAILS.max).toFixed(2)), 8.46);

// At 100 subscribers, even assigning the entire $45 shared infrastructure base
// to one plan keeps the pessimistic all-output-token ceiling at roughly 80%+.
for (const [name, plan] of Object.entries(PAID_AI_GUARDRAILS)) {
  assert.ok(grossMarginAtScale(plan, 100) >= AI_MARGIN_TARGET, `${name} falls below the 80% target`);
}

console.log("chat-economics.test.ts OK");
