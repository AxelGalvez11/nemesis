/** Source-controlled assumptions behind the AI entitlement ceilings. */
export const AI_MARGIN_TARGET = 0.8;
export const SEARCH_UNIT_COST_USD = 0.005;
export const BASE_AI_INFRASTRUCTURE_USD = 45;

export interface PaidAiPlanGuardrail {
  priceUsd: number;
  monthlyMeteredTokens: number;
  monthlySearchUnits: number;
  /** Pessimistic: assume every metered token costs the model's output rate. */
  maxTokenPricePerMillionUsd: number;
}
export const PAID_AI_GUARDRAILS: Record<"plus" | "pro" | "max", PaidAiPlanGuardrail> = {
  plus: { priceUsd: 9.99, monthlyMeteredTokens: 3_000_000, monthlySearchUnits: 100, maxTokenPricePerMillionUsd: 0.28 },
  pro: { priceUsd: 19.99, monthlyMeteredTokens: 3_200_000, monthlySearchUnits: 150, maxTokenPricePerMillionUsd: 0.87 },
  max: { priceUsd: 49.99, monthlyMeteredTokens: 8_000_000, monthlySearchUnits: 300, maxTokenPricePerMillionUsd: 0.87 },
};

export function providerCostCeiling(plan: PaidAiPlanGuardrail): number {
  return (plan.monthlyMeteredTokens / 1_000_000) * plan.maxTokenPricePerMillionUsd
    + plan.monthlySearchUnits * SEARCH_UNIT_COST_USD;
}

export function grossMarginAtScale(
  plan: PaidAiPlanGuardrail,
  subscribers: number,
  fixedInfrastructureUsd = BASE_AI_INFRASTRUCTURE_USD,
): number {
  if (subscribers <= 0) return 0;
  const costPerSubscriber = providerCostCeiling(plan) + fixedInfrastructureUsd / subscribers;
  return 1 - costPerSubscriber / plan.priceUsd;
}
