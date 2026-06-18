import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveWatchCadence, watchEntitlement, watchUsageLabel } from "./watch-entitlements.ts";
import type { EntitlementSnapshot } from "./entitlements.ts";

function snap(entitlements: Record<string, unknown>): EntitlementSnapshot {
  return { plan: "plus", entitlements };
}

Deno.test("watchEntitlement reads the watch_* keys", () => {
  const e = watchEntitlement(snap({ watch_limit: 10, watch_daily_enabled: true, watch_email_enabled: true }));
  assertEquals(e, { limit: 10, dailyEnabled: true, emailEnabled: true });
});

Deno.test("watchEntitlement defaults to the FREE-TIER FLOOR when keys are absent (e.g. pre-deploy)", () => {
  // absent watch_* keys → never grant more than the floor by accident
  assertEquals(watchEntitlement(snap({})), { limit: 1, dailyEnabled: false, emailEnabled: false });
  assertEquals(watchEntitlement(null), { limit: 1, dailyEnabled: false, emailEnabled: false });
});

Deno.test("resolveWatchCadence: a free user (daily not enabled) can NEVER get daily", () => {
  assertEquals(resolveWatchCadence("daily", false), "weekly"); // gate: requested daily ignored
  assertEquals(resolveWatchCadence(undefined, false), "weekly");
  assertEquals(resolveWatchCadence("weekly", false), "weekly");
});

Deno.test("resolveWatchCadence: a paid user defaults to daily (the freshness they pay for), honors weekly", () => {
  assertEquals(resolveWatchCadence(undefined, true), "daily");
  assertEquals(resolveWatchCadence("daily", true), "daily");
  assertEquals(resolveWatchCadence("weekly", true), "weekly");
});

Deno.test("watchUsageLabel pluralizes correctly", () => {
  assertEquals(watchUsageLabel(0, 1), "0 of 1 watch used");
  assertEquals(watchUsageLabel(3, 10), "3 of 10 watches used");
});
