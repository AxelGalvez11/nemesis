import assert from "node:assert/strict";

import {
  AI_MARGIN_TARGET,
  grossMarginAtScale,
  PAID_AI_GUARDRAILS,
  paymentProcessingCost,
  providerCostCeiling,
} from "./chat-economics";

assert.equal(Number(providerCostCeiling(PAID_AI_GUARDRAILS.plus).toFixed(3)), 0.857);
assert.equal(Number(providerCostCeiling(PAID_AI_GUARDRAILS.pro).toFixed(3)), 2.427);
assert.equal(Number(providerCostCeiling(PAID_AI_GUARDRAILS.max).toFixed(3)), 15.285);
assert.equal(Number(paymentProcessingCost(PAID_AI_GUARDRAILS.plus).toFixed(5)), 0.65964);
assert.equal(Number(paymentProcessingCost(PAID_AI_GUARDRAILS.max).toFixed(3)), 3.864);

// At 100 subscribers, even assigning the entire $45 shared infrastructure base
// to one plan and including standard domestic-card + Stripe Billing fees keeps
// the pessimistic all-output-token + fully-used live-audio ceiling at 80%+.
for (const [name, plan] of Object.entries(PAID_AI_GUARDRAILS)) {
  assert.ok(grossMarginAtScale(plan, 100) >= AI_MARGIN_TARGET, `${name} falls below the 80% target`);
}

console.log("chat-economics.test.ts OK");
