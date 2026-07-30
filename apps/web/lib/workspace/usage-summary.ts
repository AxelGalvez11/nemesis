// Settings → Usage.
//
// REWRITTEN 2026-07-30. This page was reading counters nothing writes any more.
//
// It showed "questions today / this week" off the `ask_daily` counter, which the old
// /ask edge function incremented. The workspace chat replaced /ask as the way people
// actually talk to Nemesis, and it does not touch `ask_daily` — the newest row in the
// whole table is 2026-07-19, while the real meter recorded 18.8M tokens on 2026-07-30.
// So every bar read zero and the page looked broken. The owner's own account had four
// live counter rows and not one `ask_daily` row.
//
// The meters that are real, and that actually stop you, live in the edge functions:
// nemesis-llm returns 429 once `nemesis_llm_tokens` passes the plan's daily budget or
// `nemesis_llm_tokens_month` passes the monthly one; nemesis-search does the same for
// its units. Those are what this file reads now. The iPhone app already read the right
// source (nemesis-llm's GET /usage) and its comments flagged the web path as wrong —
// this closes that gap from the other side, without web needing a device key.
//
// PERCENTAGES ONLY (owner 2026-07-30). A student does not think in tokens, and a token
// count is not a number anyone can act on. The public shape below deliberately exposes
// no raw used/limit values, so a future edit cannot put "12 of 25 questions" back on
// the page without changing the type.

import { fetchEntitlements } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { isPreviewMode } from "@/lib/env";

export type UsageBarKey = "ai-today" | "ai-month" | "search-today" | "recording-month";

export interface UsageBar {
  key: UsageBarKey;
  label: string;
  /** 0-100, already clamped. The only quantity this page shows. */
  percent: number;
  unlimited: boolean;
}

/** Limits at or above this are internal "effectively unlimited" sentinels. */
const UNLIMITED_AT = 1_000_000_000;

function isUnlimited(limit: number | null): boolean {
  return limit === null || limit >= UNLIMITED_AT;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentOf(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

interface MeterInput {
  used: number;
  limit: number | null;
}

/** Pure assembly, so the shape is unit-testable without network. */
export function summarizeUsage(input: {
  aiToday: MeterInput;
  aiMonth: MeterInput;
  searchToday: MeterInput;
  recordingMonth: MeterInput;
}): UsageBar[] {
  const bar = (key: UsageBarKey, label: string, meter: MeterInput): UsageBar => ({
    key,
    label,
    percent: isUnlimited(meter.limit) ? 0 : percentOf(meter.used, meter.limit),
    unlimited: isUnlimited(meter.limit),
  });

  return [
    bar("ai-today", "AI usage today", input.aiToday),
    bar("ai-month", "AI usage this month", input.aiMonth),
    bar("search-today", "Web search today", input.searchToday),
    bar("recording-month", "Recording this month", input.recordingMonth),
  ];
}

// The edge functions key their rows on the UTC date (see nemesis-llm/index.ts:
// `now.toISOString().slice(0, 10)`). Deriving these any other way — local midnight,
// say — reads yesterday's row for anyone west of UTC and reports 0% all evening.
function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
function utcMonthKey(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

const PREVIEW_BARS: UsageBar[] = summarizeUsage({
  aiToday: { used: 27_400, limit: 75_000 },
  aiMonth: { used: 412_000, limit: 2_000_000 },
  searchToday: { used: 3, limit: 10 },
  recordingMonth: { used: 1_980, limit: 7_200 },
});

/** Load the usage bars for the signed-in account. */
export async function loadUsageBars(): Promise<UsageBar[]> {
  if (isPreviewMode) return PREVIEW_BARS;

  const now = new Date();
  const day = utcDayKey(now);
  const month = utcMonthKey(now);

  const [entitlements, countersResult] = await Promise.all([
    fetchEntitlements().catch(() => null),
    // One query for every counter this page needs; RLS (usage_counters_read_own)
    // scopes it to the signed-in user.
    supabase
      .from("usage_counters")
      .select("counter_key,period_start,used,limit_snapshot")
      .in("counter_key", [
        "nemesis_llm_tokens",
        "nemesis_llm_tokens_month",
        "nemesis_search_units",
        "transcription_seconds_month",
      ])
      .in("period_start", [day, month]),
  ]);

  const rows = countersResult.data ?? [];
  const rowFor = (counterKey: string, period: string) =>
    rows.find((r) => r.counter_key === counterKey && r.period_start === period);

  const ent = (key: string): number | null => finite(entitlements?.entitlements?.[key]);

  // Prefer the current plan's entitlement; fall back to the limit the gate stamped on
  // the row. A missing row simply means nothing has been spent in this period yet.
  const meter = (counterKey: string, period: string, entitlementKey: string): MeterInput => {
    const row = rowFor(counterKey, period);
    return {
      used: finite(row?.used) ?? 0,
      limit: ent(entitlementKey) ?? finite(row?.limit_snapshot),
    };
  };

  return summarizeUsage({
    aiToday: meter("nemesis_llm_tokens", day, "nemesis_llm_daily_tokens"),
    aiMonth: meter("nemesis_llm_tokens_month", month, "nemesis_llm_monthly_tokens"),
    searchToday: meter("nemesis_search_units", day, "nemesis_search_daily_units"),
    recordingMonth: meter("transcription_seconds_month", month, "transcription_seconds_month_limit"),
  });
}
