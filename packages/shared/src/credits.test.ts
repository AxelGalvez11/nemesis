import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCreditsSummary } from "./credits.ts";
import type { EntitlementSnapshot, UsageSnapshot } from "./entitlements.ts";

// A full Pro snapshot: usage counters present for both daily meters; watch/mission limits + counts known.
Deno.test("full pro snapshot maps every daily meter and slot", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "pro",
    entitlements: {
      ask_daily_limit: 250,
      deep_research_daily_limit: 3,
      watch_limit: 50,
      mission_limit: 5,
    },
  };
  const usage: UsageSnapshot = {
    plan: "pro",
    counters: {
      ask_daily: { used: 12, limit: 250, period_start: "", period_end: "" },
      deep_research_daily: { used: 1, limit: 3, period_start: "", period_end: "" },
    },
  };
  const s = buildCreditsSummary({ snapshot, usage, watchCount: 4, missionCount: 2 });
  assertEquals(s.plan, "pro");
  assertEquals(s.daily, [
    { key: "ask", label: "Ask", used: 12, limit: 250 },
    { key: "deep_research", label: "Deep research", used: 1, limit: 3 },
  ]);
  assertEquals(s.slots, [
    { key: "watches", label: "Monitors", used: 4, limit: 50 },
    { key: "missions", label: "Scheduled", used: 2, limit: 5 },
  ]);
});

// Free plan: deep_research + mission limits are 0. Both are KEPT (0/0), never dropped.
Deno.test("free plan keeps the 0-limit deep-research meter and scheduled slot", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "free",
    entitlements: {
      ask_daily_limit: 10,
      deep_research_daily_limit: 0,
      watch_limit: 1,
      mission_limit: 0,
    },
  };
  const usage: UsageSnapshot = {
    plan: "free",
    counters: { ask_daily: { used: 3, limit: 10, period_start: "", period_end: "" } },
  };
  const s = buildCreditsSummary({ snapshot, usage, watchCount: 0, missionCount: 0 });
  assertEquals(s.daily, [
    { key: "ask", label: "Ask", used: 3, limit: 10 },
    { key: "deep_research", label: "Deep research", used: 0, limit: 0 },
  ]);
  assertEquals(s.slots, [
    { key: "watches", label: "Monitors", used: 0, limit: 1 },
    { key: "missions", label: "Scheduled", used: 0, limit: 0 },
  ]);
});

// Missing usage: fall back to entitlement limits with used 0 (no NaN).
Deno.test("missing usage falls back to entitlement limits with used 0", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "plus",
    entitlements: {
      ask_daily_limit: 100,
      deep_research_daily_limit: 0,
      watch_limit: 10,
      mission_limit: 0,
    },
  };
  const s = buildCreditsSummary({ snapshot, usage: null, watchCount: 2, missionCount: 0 });
  assertEquals(s.daily, [
    { key: "ask", label: "Ask", used: 0, limit: 100 },
    { key: "deep_research", label: "Deep research", used: 0, limit: 0 },
  ]);
  assertEquals(s.slots, [
    { key: "watches", label: "Monitors", used: 2, limit: 10 },
    { key: "missions", label: "Scheduled", used: 0, limit: 0 },
  ]);
});

// Null counts (list fetch failed) AND no resolvable limit → that slot is omitted, never NaN.
Deno.test("null counts with no limit omit the slot", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "free",
    entitlements: { ask_daily_limit: 10 }, // no deep/ watch/ mission keys at all
  };
  const s = buildCreditsSummary({ snapshot, usage: null, watchCount: null, missionCount: null });
  // deep_research has no counter and no entitlement limit → omitted.
  assertEquals(s.daily, [{ key: "ask", label: "Ask", used: 0, limit: 10 }]);
  // both slots: count null AND limit missing → omitted.
  assertEquals(s.slots, []);
});

// A fully-null input must not throw and must not emit NaN.
Deno.test("all-null input degrades to an empty-but-valid summary", () => {
  const s = buildCreditsSummary({ snapshot: null, usage: null, watchCount: null, missionCount: null });
  assertEquals(s.plan, "free");
  assertEquals(s.daily, []);
  assertEquals(s.slots, []);
});
