// Deno unit tests (repo convention) for the Usage feature's pure helpers.
// Run: deno test --no-check apps/mobile/src/api/usage.test.ts
//
// Imports ONLY from usage-helpers.ts, never usage.ts — usage.ts pulls in the
// supabase client, which throws at module load without EXPO_PUBLIC_SUPABASE_URL,
// and expo-secure-store, which does not resolve outside Expo/Metro. The helpers
// are dependency-free by design so this file loads clean under Deno, the same
// way missions.test.ts only imports missions-helpers.ts.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deviceKeyStoreFor, parseUsageSummary, usagePercent } from "./usage-helpers.ts";

Deno.test("deviceKeyStoreFor: matches api/chat.ts's SecureStore key format exactly", () => {
  assertEquals(deviceKeyStoreFor("abc-123"), "nemesis_device_key_v1_abc-123");
});

Deno.test("parseUsageSummary: null/array/no-plan -> null", () => {
  assertEquals(parseUsageSummary(null), null);
  assertEquals(parseUsageSummary([1, 2]), null);
  assertEquals(parseUsageSummary({ daily_limit: 25000 }), null); // no plan
});

Deno.test("parseUsageSummary: a real nemesis-llm /usage body maps field-for-field", () => {
  const raw = {
    daily_limit: 25000,
    monthly_limit: 750000,
    monthly_remaining: 700000,
    monthly_used: 50000,
    period_start: "2026-07-20",
    plan: "free",
    remaining: 24000,
    used: 1000,
  };
  const out = parseUsageSummary(raw);
  assertEquals(out?.plan, "free");
  assertEquals(out?.dailyLimit, 25000);
  assertEquals(out?.used, 1000);
  assertEquals(out?.remaining, 24000);
  assertEquals(out?.monthlyLimit, 750000);
  assertEquals(out?.monthlyUsed, 50000);
  assertEquals(out?.monthlyRemaining, 700000);
  assertEquals(out?.periodStart, "2026-07-20");
});

Deno.test("parseUsageSummary: missing/non-finite numeric fields default to 0, not NaN", () => {
  const out = parseUsageSummary({ plan: "pro", remaining: Number.NaN, used: "lots" });
  assertEquals(out?.dailyLimit, 0);
  assertEquals(out?.used, 0);
  assertEquals(out?.remaining, 0);
  assertEquals(out?.periodStart, "");
});

Deno.test("usagePercent: normal fraction rounds and clamps at 100", () => {
  assertEquals(usagePercent(0, 25000), 0);
  assertEquals(usagePercent(12500, 25000), 50);
  assertEquals(usagePercent(30000, 25000), 100); // over-limit clamps, never > 100
});

Deno.test("usagePercent: a zero/negative limit reads as 0%, never NaN/Infinity", () => {
  assertEquals(usagePercent(500, 0), 0);
  assertEquals(usagePercent(500, -10), 0);
});
