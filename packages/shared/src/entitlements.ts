// MVP web-beta entitlements (0122). These are the public plan/usage shapes used by
// web now and mobile later; the database remains the source of truth.

export type PlanCode = "free" | "plus" | "pro" | "max" | "student" | "professional" | "enterprise";

export type EntitlementKey =
  | "ask_daily_limit"
  | "watchlist_limit"
  | "stripe_plus_enabled"
  | "live_audio_seconds_month_limit";

export interface EntitlementSnapshot {
  plan: PlanCode;
  entitlements: {
    ask_daily_limit?: number;
    watchlist_limit?: number;
    stripe_plus_enabled?: boolean;
    [key: string]: unknown;
  };
}

export interface UsageCounter {
  used: number;
  limit: number | null;
  period_start: string;
  period_end: string;
}

export interface UsageSnapshot {
  plan: PlanCode;
  counters: {
    ask_daily?: UsageCounter;
    [key: string]: UsageCounter | undefined;
  };
}

export interface QuotaExceededError {
  error: "quota_exceeded";
  counter_key: "ask_daily" | string;
  used: number;
  limit: number;
  plan: PlanCode | string;
}

// ---------------------------------------------------------------------------
// Dual-store subscriptions (owner decision 2026-08-03: "the higher plan wins").
//
// A student can hold a Stripe subscription (web) and an Apple subscription
// (iPhone) at the same time. The `subscriptions` table keeps one row per user;
// each store writes its OWN column (`stripe_plan` / `apple_plan`) and the
// effective `plan` — the only column the edge functions read — is always the
// best of the two. When one side lapses, the other takes over automatically
// instead of a last-webhook-wins race silently downgrading a paying student.
// ---------------------------------------------------------------------------

/** Rank of the paid ladder. Unknown strings rank as free so a bad write can
 *  never grant access, only fail to. */
const PLAN_RANK: Readonly<Record<string, number>> = { free: 0, plus: 1, pro: 2, max: 3 };

export function planRank(plan: string | null | undefined): number {
  return PLAN_RANK[plan ?? "free"] ?? 0;
}

/** The plan a user is actually entitled to, given what each store says. */
export function effectivePlan(
  stripePlan: string | null | undefined,
  applePlan: string | null | undefined,
): PlanCode {
  const winner = planRank(applePlan) > planRank(stripePlan) ? applePlan : stripePlan;
  const rank = planRank(winner);
  return rank === 3 ? "max" : rank === 2 ? "pro" : rank === 1 ? "plus" : "free";
}
