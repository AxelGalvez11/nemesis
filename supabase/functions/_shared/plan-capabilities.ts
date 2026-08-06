// MIRROR of packages/shared/src/plan-capabilities.ts — that copy is canonical
// and carries the reasoning; this one exists because edge functions cannot
// import across the workspace root (only `supabase/` is bundled at deploy).
//
// 🔴 THE TWO ARE HELD TOGETHER BY A TEST, NOT BY DISCIPLINE.
// plan-capabilities.drift.test.ts runs the full plan × status matrix through
// both implementations and fails if any cell disagrees. Editing one without the
// other turns that test red rather than shipping two different opinions about
// who is allowed to reason.

export type PlanTier = "none" | "free" | "student" | "pro" | "max";

export const ENTITLING_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

export interface PlanCapabilities {
  tier: PlanTier;
  paid: boolean;
  /** A High turn may reach deepseek-v4-pro rather than the fast tier's thinking. */
  premiumReasoning: boolean;
  /** The GLM 5.2 lane, behind GLM_HIGH_MODE. */
  highestReasoningTier: boolean;
  premiumModels: boolean;
  /** plan_entitlements.plan_code for numeric limits — the account's own code. */
  limitsPlanCode: string;
  unrecognisedPlan?: string;
}

const NOTHING: PlanCapabilities = {
  highestReasoningTier: false,
  limitsPlanCode: "free",
  paid: false,
  premiumModels: false,
  premiumReasoning: false,
  tier: "none",
};

const TOP = { highestReasoningTier: true, paid: true, premiumModels: true, premiumReasoning: true } as const;

const TIER_OF: Readonly<Record<string, PlanTier>> = {
  enterprise: "max", // owner 2026-08-06: enterprise is max-equivalent
  free: "free",
  max: "max",
  plus: "student",
  pro: "pro",
  professional: "pro",
  student: "student",
};

const CAPABILITIES_OF: Readonly<Record<PlanTier, Omit<PlanCapabilities, "limitsPlanCode" | "tier">>> = {
  free: { highestReasoningTier: false, paid: false, premiumModels: false, premiumReasoning: false },
  max: { ...TOP },
  none: { highestReasoningTier: false, paid: false, premiumModels: false, premiumReasoning: false },
  pro: { ...TOP },
  student: { highestReasoningTier: false, paid: true, premiumModels: false, premiumReasoning: false },
};

export function resolvePlanCapabilities(
  plan: string | null | undefined,
  status: string | null | undefined,
): PlanCapabilities {
  const code = (plan ?? "").trim().toLowerCase();
  const state = (status ?? "").trim().toLowerCase();
  if (!ENTITLING_STATUSES.includes(state)) return { ...NOTHING };
  const tier = TIER_OF[code];
  if (!tier) return { ...NOTHING, unrecognisedPlan: code || "(empty)" };
  return { ...CAPABILITIES_OF[tier], limitsPlanCode: code, tier };
}
