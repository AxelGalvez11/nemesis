// MVP web-beta entitlements (0122). These are the public plan/usage shapes used by
// web now and mobile later; the database remains the source of truth.

export type PlanCode = "free" | "plus" | "pro" | "student" | "professional" | "enterprise";

export type EntitlementKey =
  | "ask_daily_limit"
  | "watchlist_limit"
  | "stripe_plus_enabled"
  | "evidence_brief_daily_limit"
  | "deep_research_daily_limit"
  | "report_export_enabled"
  | "ppt_export_enabled";

export interface EntitlementSnapshot {
  plan: PlanCode;
  entitlements: {
    ask_daily_limit?: number;
    watchlist_limit?: number;
    stripe_plus_enabled?: boolean;
    evidence_brief_daily_limit?: number;
    deep_research_daily_limit?: number;
    report_export_enabled?: boolean;
    ppt_export_enabled?: boolean;
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
