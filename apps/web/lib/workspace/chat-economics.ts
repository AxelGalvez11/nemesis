/** Source-controlled assumptions behind the AI entitlement ceilings. */
export const AI_MARGIN_TARGET = 0.8;
export const SEARCH_UNIT_COST_USD = 0.005;
export const LIVE_TRANSCRIPTION_HOURLY_COST_USD = 0.15;
export const BASE_AI_INFRASTRUCTURE_USD = 45;
export const STRIPE_CARD_FEE_RATE = 0.029;
export const STRIPE_BILLING_FEE_RATE = 0.007;
export const STRIPE_CARD_FIXED_FEE_USD = 0.3;

export interface PaidAiPlanGuardrail {
  priceUsd: number;
  monthlyMeteredTokens: number;
  monthlySearchUnits: number;
  /** Pessimistic: assume every metered token costs the model's output rate. */
  maxTokenPricePerMillionUsd: number;
  monthlyLiveAudioSeconds: number;
}
export const PAID_AI_GUARDRAILS: Record<"plus" | "pro" | "max", PaidAiPlanGuardrail> = {
  plus: { priceUsd: 9.99, monthlyMeteredTokens: 1_900_000, monthlySearchUnits: 50, maxTokenPricePerMillionUsd: 0.28, monthlyLiveAudioSeconds: 1_800 },
  pro: { priceUsd: 19.99, monthlyMeteredTokens: 2_100_000, monthlySearchUnits: 75, maxTokenPricePerMillionUsd: 0.87, monthlyLiveAudioSeconds: 5_400 },
  max: { priceUsd: 99, monthlyMeteredTokens: 5_500_000, monthlySearchUnits: 100, maxTokenPricePerMillionUsd: 0.87, monthlyLiveAudioSeconds: 240_000 },
};

export function providerCostCeiling(plan: PaidAiPlanGuardrail): number {
  return (plan.monthlyMeteredTokens / 1_000_000) * plan.maxTokenPricePerMillionUsd
    + plan.monthlySearchUnits * SEARCH_UNIT_COST_USD
    + (plan.monthlyLiveAudioSeconds / 3_600) * LIVE_TRANSCRIPTION_HOURLY_COST_USD;
}

export function paymentProcessingCost(plan: PaidAiPlanGuardrail): number {
  return plan.priceUsd * (STRIPE_CARD_FEE_RATE + STRIPE_BILLING_FEE_RATE)
    + STRIPE_CARD_FIXED_FEE_USD;
}

export function grossMarginAtScale(
  plan: PaidAiPlanGuardrail,
  subscribers: number,
  fixedInfrastructureUsd = BASE_AI_INFRASTRUCTURE_USD,
): number {
  if (subscribers <= 0) return 0;
  const costPerSubscriber = providerCostCeiling(plan)
    + paymentProcessingCost(plan)
    + fixedInfrastructureUsd / subscribers;
  return 1 - costPerSubscriber / plan.priceUsd;
}
