// MVP web-beta entitlements (0122). These are the public plan/usage shapes used by
// web now and mobile later; the database remains the source of truth.

/**
 * Every plan code that can appear in a stored row.
 *
 * 🔴 THIS IS A DATA TYPE, NOT A PRODUCT LADDER. Only `free` and `nemesis` are
 * sold; `enterprise` is a comp; the rest are retired names that old rows and
 * replayed Stripe webhooks still carry. What any of them GRANTS is decided in
 * one place: `canonicalPlan` / `entitlementPlanCode` in ./plan.ts.
 */
export type PlanCode =
  | "free"
  | "nemesis"
  | "plus"
  | "pro"
  | "max"
  | "student"
  | "professional"
  | "trial"
  | "enterprise";

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
// effective `plan` -- the only column the edge functions read -- is always the
// best of the two. When one side lapses, the other takes over automatically
// instead of a last-webhook-wins race silently downgrading a paying student.
//
// 🔴 "THE HIGHER PLAN WINS" IS NOW A BOOLEAN OR, AND THE RANKING IS GONE.
// Ranking mattered while the stores could disagree about HOW MUCH product
// someone had bought. With one paid product (owner, 2026-08-17) the question
// collapses to "does either store say they are paid". The implementation lives
// in ./plan.ts so the application has exactly one answer; this is the historical
// name, kept because the RevenueCat webhook and the Stripe webhook both import
// it and neither should have to learn a new one to get the same behaviour.
// ---------------------------------------------------------------------------

export { effectivePlan } from "./plan.ts";
