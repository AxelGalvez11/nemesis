// pnpm --filter @nemesis/web exec tsx lib/workspace/chat-economics.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AI_MARGIN_TARGET,
  grossMarginAtScale,
  PAID_AI_GUARDRAILS,
  paymentProcessingCost,
  providerCostCeiling,
  SEARCH_UNIT_COST_USD,
} from "./chat-economics";

const nemesis = PAID_AI_GUARDRAILS.nemesis!;

// 🔴 EVERY LEGACY CODE MUST HAVE A GUARDRAIL. A live account still reporting
// `pro` with no row here would fall through to no runtime ceiling at all.
for (const legacy of ["plus", "pro", "max", "student", "professional", "trial"]) {
  const guardrail = PAID_AI_GUARDRAILS[legacy];
  assert.ok(guardrail, `${legacy} must keep a guardrail row`);
  assert.deepEqual(guardrail, nemesis, `${legacy} must resolve to the Nemesis ceiling`);
}

// The rates are the registry's, not this file's.
const source = readFileSync(new URL("./chat-economics.ts", import.meta.url), "utf8");
assert.match(source, /from "@\/lib\/provider-costs"/);
assert.doesNotMatch(source, /SEARCH_UNIT_COST_USD = 0\./, "no hand-written search rate");
assert.doesNotMatch(source, /LIVE_TRANSCRIPTION_HOURLY_COST_USD/, "the streaming lecture lane is not what voice costs");
assert.equal(SEARCH_UNIT_COST_USD, 0.005);

// Voice is priced in BOTH directions: speech in by the hour, speech out by the
// character. Pricing only one half understates the conversation.
assert.equal(nemesis.monthlyVoiceSeconds, 18_000);
assert.ok(providerCostCeiling(nemesis) > 0);
const withoutVoice = providerCostCeiling({ ...nemesis, monthlyVoiceSeconds: 0 });
assert.ok(providerCostCeiling(nemesis) > withoutVoice, "voice must cost something");

// The pessimistic ceiling charges every token at the output rate, which is why
// it does not clear the house target on its own — the guardrail is a ceiling,
// not a forecast.
assert.ok(paymentProcessingCost(nemesis) > 0.3);
assert.ok(grossMarginAtScale(nemesis, 0) === 0);
assert.ok(grossMarginAtScale(nemesis, 1_000) > grossMarginAtScale(nemesis, 10));
assert.equal(AI_MARGIN_TARGET, 0.8);

console.log("chat-economics.test.ts OK");
