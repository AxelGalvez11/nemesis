// Settings → Usage: exactly three bars (owner 2026-07-20 evening) — daily
// questions, this week's questions, and voice-recording minutes this month.
// Daily comes from get_my_usage; the week is summed client-side from the
// user's own usage_counters rows (RLS: usage_counters_read_own); voice reads
// the live_audio_seconds_month row plus the plan entitlement for the limit.

import { fetchEntitlements, fetchUsage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { isPreviewMode } from "@/lib/env";

export interface UsageBar {
  key: "daily" | "weekly" | "voice";
  label: string;
  /** Plain-English amount line, e.g. "12 of 25 questions today". */
  detail: string;
  used: number;
  limit: number;
  unlimited: boolean;
}

/** Limits at or above this are internal "effectively unlimited" sentinels. */
const UNLIMITED_AT = 1_000_000;

function isUnlimited(limit: number | null): boolean {
  return limit === null || limit >= UNLIMITED_AT;
}

/** Pure assembly so the shape is unit-testable without network. */
export function summarizeUsage(input: {
  dailyUsed: number;
  dailyLimit: number | null;
  weekUsed: number;
  voiceUsedSeconds: number;
  voiceLimitSeconds: number | null;
}): UsageBar[] {
  const dailyUnlimited = isUnlimited(input.dailyLimit);
  const weeklyLimit = dailyUnlimited ? 0 : (input.dailyLimit ?? 0) * 7;
  const voiceUnlimited = isUnlimited(input.voiceLimitSeconds);
  const voiceUsedMinutes = Math.ceil(input.voiceUsedSeconds / 60);
  const voiceLimitMinutes = voiceUnlimited ? 0 : Math.round((input.voiceLimitSeconds ?? 0) / 60);

  return [
    {
      key: "daily",
      label: "Daily",
      detail: dailyUnlimited ? `${input.dailyUsed} questions today` : `${input.dailyUsed} of ${input.dailyLimit} questions today`,
      used: input.dailyUsed,
      limit: dailyUnlimited ? 0 : (input.dailyLimit ?? 0),
      unlimited: dailyUnlimited,
    },
    {
      key: "weekly",
      label: "Weekly",
      detail: dailyUnlimited ? `${input.weekUsed} questions in the last 7 days` : `${input.weekUsed} of ${weeklyLimit} questions in the last 7 days`,
      used: input.weekUsed,
      limit: weeklyLimit,
      unlimited: dailyUnlimited,
    },
    {
      key: "voice",
      label: "Voice recording",
      detail: voiceUnlimited ? `${voiceUsedMinutes} min this month` : `${voiceUsedMinutes} of ${voiceLimitMinutes} min this month`,
      used: voiceUsedMinutes,
      limit: voiceLimitMinutes,
      unlimited: voiceUnlimited,
    },
  ];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const PREVIEW_BARS: UsageBar[] = summarizeUsage({
  dailyUsed: 9,
  dailyLimit: 25,
  weekUsed: 41,
  voiceUsedSeconds: 620,
  voiceLimitSeconds: 1800,
});

/** Load the three usage bars for the signed-in account. */
export async function loadUsageBars(): Promise<UsageBar[]> {
  if (isPreviewMode) return PREVIEW_BARS;

  const [usage, entitlements] = await Promise.all([
    fetchUsage().catch(() => null),
    fetchEntitlements().catch(() => null),
  ]);
  const daily = usage?.counters?.ask_daily;
  const dailyLimit = finite(daily?.limit) ?? finite(entitlements?.entitlements?.ask_daily_limit);

  const today = new Date();
  const sinceDay = new Date(today.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const todayDay = today.toISOString().slice(0, 10);

  const [weekResult, voiceResult] = await Promise.all([
    supabase
      .from("usage_counters")
      .select("used")
      .eq("counter_key", "ask_daily")
      .gte("period_start", sinceDay),
    supabase
      .from("usage_counters")
      .select("used,limit_snapshot")
      .eq("counter_key", "live_audio_seconds_month")
      .lte("period_start", todayDay)
      .gt("period_end", todayDay)
      .limit(1),
  ]);

  const weekUsed = (weekResult.data ?? []).reduce((total, row) => total + (finite(row.used) ?? 0), 0);
  const voiceRow = voiceResult.data?.[0];
  const voiceLimit = finite(voiceRow?.limit_snapshot)
    ?? finite(entitlements?.entitlements?.live_audio_seconds_month_limit);

  return summarizeUsage({
    dailyUsed: finite(daily?.used) ?? 0,
    dailyLimit,
    weekUsed,
    voiceUsedSeconds: finite(voiceRow?.used) ?? 0,
    voiceLimitSeconds: voiceLimit,
  });
}
