// What a subscription is allowed to do — asked once, in one place.
//
// Owner 2026-08-06: "Replace scattered string comparisons with one shared
// entitlement resolver. Code should ask for capabilities… It should not
// repeatedly ask whether the plan string equals `pro` or `max`."
//
// 🔴 WHY THIS EXISTS, CONCRETELY. `ctx.plan === 'pro' || ctx.plan === 'max'`
// appears three times in the valve and decides whether a turn reaches the
// premium reasoning model. Every production subscription is `enterprise`, which
// is neither — so the premium lane the business paid to build and measured at
// 80% blind-preferred was reaching nobody at all, including the owner. Nothing
// failed loudly. The turn simply came back from the fast model.
//
// That is the failure mode of a string comparison: it is silent, it is correct
// on its own terms, and it is wrong in a way no test written against the same
// two strings can see. Capabilities fail differently — a plan that reaches this
// resolver and is not recognised comes back with NOTHING granted and says so.

/** The canonical tiers, cheapest first. `none` is not a plan — it is what an
 *  expired, cancelled or unrecognised subscription resolves to. */
export type PlanTier = "none" | "free" | "student" | "pro" | "max";

/**
 * Subscription statuses that still entitle a user.
 *
 * 🔴 `past_due` IS ENTITLED, and that is a deliberate grace period: a card that
 * failed this morning must not take a student's coursework away mid-lecture.
 *
 * 🔴 THE DATABASE DISAGREES WITH THIS SET. `public.resolve_user_plan` (migration
 * 0122) accepts only ('active','trialing') and additionally requires
 * current_period_end in the future; every edge function accepts past_due and
 * ignores the period end. So a past_due account is entitled at the gateway and
 * unentitled at any RPC that calls resolve_user_plan. That divergence predates
 * this file and is REPORTED rather than silently resolved here — changing which
 * users the database considers paying is a billing decision, not a refactor.
 */
export const ENTITLING_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

export interface PlanCapabilities {
  /** The tier this subscription resolves to. */
  tier: PlanTier;
  /** Anything paid at all. False for free, cancelled, expired and unknown. */
  paid: boolean;
  /**
   * A High-effort turn may be served by the premium reasoning model
   * (deepseek-v4-pro) instead of the fast tier's own thinking mode.
   *
   * NOT "may think at all" — every plan gets thinking mode on the deep routes,
   * so a capability meaning that would grant everyone everything and gate
   * nothing.
   */
  premiumReasoning: boolean;
  /**
   * The very top lane (GLM 5.2, behind GLM_HIGH_MODE).
   *
   * Identical to `premiumReasoning` today, and named separately anyway because
   * they are two independent switches in the gateway with two different kill
   * flags. Collapsing them would mean that enabling GLM silently re-tiers
   * whoever happened to share the other flag.
   */
  highestReasoningTier: boolean;
  /** May be served by any non-default premium model. */
  premiumModels: boolean;
  /**
   * The `plan_entitlements.plan_code` to read numeric limits under.
   *
   * Deliberately the account's OWN code rather than its tier: `enterprise`
   * already has seeded rows (25M daily tokens) that are more generous than
   * max's, and mapping it onto max's rows in the name of "max-equivalent" would
   * quietly CUT the owner's own limits. Capability parity is the ask; the
   * numbers stay where they are.
   */
  limitsPlanCode: string;
  /** Set only when the plan string was not recognised. Drives telemetry. */
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

/** Everything a top-tier account can do. */
const TOP = {
  highestReasoningTier: true,
  paid: true,
  premiumModels: true,
  premiumReasoning: true,
} as const;

/**
 * Plan code → tier. The strings are the ones that actually appear in
 * `subscriptions.plan` and in the CHECK constraints across migrations 0109,
 * 0122 and 20260720101500 — not an idealised ladder.
 */
const TIER_OF: Readonly<Record<string, PlanTier>> = {
  // 🔴 ENTERPRISE IS MAX-EQUIVALENT (owner 2026-08-06). It is the plan every
  // internal and owner account carries, and it sat below `plus` in every
  // capability check in the codebase because nothing had ever named it.
  enterprise: "max",
  free: "free",
  max: "max",
  // Marketed as "Student" (pricing page); the code has always been `plus`.
  plus: "student",
  pro: "pro",
  // Legacy codes from migration 0109, still permitted by the CHECK constraint.
  // `professional` was the old top tier and maps to pro; `student` is the old
  // spelling of plus. Both are mapped rather than left to fail closed because
  // an old row must not silently lose access — but see the test: neither has
  // seeded entitlement rows, so their numeric limits fall back.
  professional: "pro",
  student: "student",
};

const CAPABILITIES_OF: Readonly<Record<PlanTier, Omit<PlanCapabilities, "limitsPlanCode" | "tier">>> = {
  free: { highestReasoningTier: false, paid: false, premiumModels: false, premiumReasoning: false },
  max: { ...TOP },
  none: { highestReasoningTier: false, paid: false, premiumModels: false, premiumReasoning: false },
  // Agent Pro reaches the premium reasoning model. This matches what the
  // gateway already does (`plan === 'pro' || plan === 'max'`) — the point of
  // this file is to stop asking that question in six places, not to re-tier
  // anyone while nobody is looking.
  pro: { ...TOP },
  student: { highestReasoningTier: false, paid: true, premiumModels: false, premiumReasoning: false },
};

/**
 * What this subscription may do.
 *
 * Fails closed on every axis: an unknown status, an unknown plan, a null, a
 * mixed-case surprise from a webhook — all resolve to `none` with nothing
 * granted and `unrecognisedPlan` set so the caller can report it. The one thing
 * this must never do is grant on a value it did not understand.
 */
export function resolvePlanCapabilities(
  plan: string | null | undefined,
  status: string | null | undefined,
): PlanCapabilities {
  const code = (plan ?? "").trim().toLowerCase();
  const state = (status ?? "").trim().toLowerCase();

  // Status first: a cancelled Max is a cancelled account, and reading its plan
  // before its status is how an expired subscription keeps its perks.
  if (!ENTITLING_STATUSES.includes(state)) return { ...NOTHING };

  const tier = TIER_OF[code];
  if (!tier) {
    // Fail closed AND say so. Silence here is what let `enterprise` sit
    // unrecognised for months.
    return { ...NOTHING, unrecognisedPlan: code || "(empty)" };
  }

  return { ...CAPABILITIES_OF[tier], limitsPlanCode: code, tier };
}

/**
 * The telemetry event for a plan nobody mapped. Sanitised by construction: it
 * carries the plan CODE and nothing else — no user id, no email, no status
 * detail that could identify one account.
 */
export interface UnknownPlanEvent {
  event: "entitlement_unknown_plan";
  plan: string;
  /** Where it was seen, e.g. "nemesis-llm". */
  surface: string;
}

export function unknownPlanEvent(capabilities: PlanCapabilities, surface: string): UnknownPlanEvent | null {
  if (!capabilities.unrecognisedPlan) return null;
  return { event: "entitlement_unknown_plan", plan: capabilities.unrecognisedPlan, surface };
}
