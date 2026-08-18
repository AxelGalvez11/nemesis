/**
 * Runtime guardrails: what a plan's caps can cost us at worst.
 *
 * 🔴 THE RATES COME FROM lib/provider-costs.ts NOW. This file used to declare its
 * own `SEARCH_UNIT_COST_USD`, `LIVE_TRANSCRIPTION_HOURLY_COST_USD` and Stripe
 * fees, which meant a margin computed here and a margin computed in
 * workload-cost.ts were computed from different numbers. One registry, read by
 * both.
 *
 * 🔴 AND THE AUDIO LINE IS CONVERSATIONAL VOICE, NOT A LECTURE LANE. The old
 * `monthlyLiveAudioSeconds` priced AssemblyAI streaming at $0.15 an hour, a lane
 * Nemesis does not sell. What a plan now buys is talking to Nemesis, which is xAI
 * speech in and speech out at their own rates.
 */

import { usdFor } from "@/lib/provider-costs";

export const AI_MARGIN_TARGET = 0.8;
export const BASE_AI_INFRASTRUCTURE_USD = 45;

export const SEARCH_UNIT_COST_USD = usdFor("brave", "search", "per_query", 1);
export const STRIPE_CARD_FEE_RATE = usdFor("stripe", "card", "percent_of_revenue", 1);
export const STRIPE_CARD_FIXED_FEE_USD = usdFor("stripe", "card", "per_transaction", 1);
/** Stripe Billing's own fee, on top of the card fee. Not in the registry because
 *  it is a Stripe PRODUCT charge rather than a per-transaction rate. */
export const STRIPE_BILLING_FEE_RATE = 0.007;

/** Characters of speech a second, mirroring packages/shared/src/plan.ts. */
const VOICE_CHARS_PER_SECOND = 850 / 60;

export interface PaidAiPlanGuardrail {
  priceUsd: number;
  monthlyMeteredTokens: number;
  monthlySearchUnits: number;
  /** Pessimistic: assume every metered token costs the model's output rate. */
  maxTokenPricePerMillionUsd: number;
  /** Conversational voice seconds a month, both directions. */
  monthlyVoiceSeconds: number;
}

/**
 * Runtime guardrails per stored plan code.
 *
 * 🔴 EVERY LEGACY CODE KEEPS A ROW, AND THAT IS THE WHOLE REASON THIS TABLE IS
 * NOT JUST `{ nemesis }`. It is looked up by whatever plan a live account
 * reports; a `pro` record with no row would fall through to NO guardrail at all,
 * which is the opposite of what retiring a plan should do. They all point at the
 * Nemesis numbers because that is what a paid subscription now entitles you to.
 */
const NEMESIS_GUARDRAIL: PaidAiPlanGuardrail = {
  maxTokenPricePerMillionUsd: 0.87,
  monthlyMeteredTokens: 25_000_000,
  monthlySearchUnits: 150,
  monthlyVoiceSeconds: 18_000,
  priceUsd: 19.99,
};

export const PAID_AI_GUARDRAILS: Record<string, PaidAiPlanGuardrail> = {
  max: NEMESIS_GUARDRAIL,
  nemesis: NEMESIS_GUARDRAIL,
  plus: NEMESIS_GUARDRAIL,
  pro: NEMESIS_GUARDRAIL,
  professional: NEMESIS_GUARDRAIL,
  student: NEMESIS_GUARDRAIL,
  trial: NEMESIS_GUARDRAIL,
};

/** What the plan's caps cost if a subscriber exhausts every one of them. */
export function providerCostCeiling(plan: PaidAiPlanGuardrail): number {
  const hours = plan.monthlyVoiceSeconds / 2 / 3_600;
  const characters = (plan.monthlyVoiceSeconds / 2) * VOICE_CHARS_PER_SECOND;
  return (plan.monthlyMeteredTokens / 1_000_000) * plan.maxTokenPricePerMillionUsd
    + plan.monthlySearchUnits * SEARCH_UNIT_COST_USD
    + usdFor("xai_stt", "grok-stt", "per_hour", hours)
    + usdFor("xai_tts", "grok-tts", "per_million_characters", characters / 1e6);
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
