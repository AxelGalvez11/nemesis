// Pure logic for the Usage feature (cloud-first phone build spec §11): the
// nemesis-llm `/usage` response shape + its parsing/percentage math.
// Deliberately dependency-free — no supabase client, no expo-secure-store, no
// react-native import — so usage.test.ts loads it clean under Deno (the
// repo's CI runs `deno test apps/mobile/src/`), the same way missions-helpers.ts
// stays Deno-testable: importing ./supabase.ts here would throw at module load
// (missing EXPO_PUBLIC_SUPABASE_URL) and react-native does not parse outside
// Metro. usage.ts re-exports everything in this file, so callers never see the
// split.

export interface UsageSummary {
  plan: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  /** yyyy-mm-dd, the daily counter's period key (UTC). */
  periodStart: string;
}

export type UsageErrorKind = "auth" | "unreachable" | "generic";

export type UsageResult = { ok: true; summary: UsageSummary } | { ok: false; errorKind: UsageErrorKind };

// SecureStore keys allow [A-Za-z0-9._-]; uuids fit as-is. Same key api/chat.ts
// uses for its device key, so a key minted from Chat is reused here with no
// double-mint (and vice versa) — kept in sync with chat.ts by hand since that
// file is intentionally not imported from here.
export const deviceKeyStoreFor = (uid: string): string => `nemesis_device_key_v1_${uid}`;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Parses the nemesis-llm `GET /usage` response body (see
 *  supabase/functions/nemesis-llm/index.ts). Returns null on any shape that
 *  doesn't look like a real usage payload (missing `plan` is the one field
 *  with no safe zero-value fallback). */
export function parseUsageSummary(body: unknown): UsageSummary | null {
  if (!isObject(body) || typeof body.plan !== "string") return null;
  return {
    dailyLimit: numberField(body.daily_limit),
    monthlyLimit: numberField(body.monthly_limit),
    monthlyRemaining: numberField(body.monthly_remaining),
    monthlyUsed: numberField(body.monthly_used),
    periodStart: typeof body.period_start === "string" ? body.period_start : "",
    plan: body.plan,
    remaining: numberField(body.remaining),
    used: numberField(body.used),
  };
}

/** Percentage of an allowance used, clamped to [0, 100]. `limit <= 0` reads as
 *  0% rather than dividing by zero (mirrors the web/desktop bar math). */
export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}
