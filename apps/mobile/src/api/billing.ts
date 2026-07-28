import { supabase } from "./supabase";
import type { UsageSnapshot } from "@nemesis/shared";

// Billing/plan reads for the mobile Plans screen: the caller's real plan and usage
// (get_my_entitlements / get_my_usage, both auth.uid()-scoped).
//
// This file used to state that App Store rules forbid linking out for subscriptions
// full stop. That is no longer accurate, and the correction matters because it is
// the rule the shipped Upgrade button depends on. Guideline 3.1.1(a) permits links
// to non-Apple purchasing on the UNITED STATES storefront and bans them everywhere
// else — see lib/pricing.ts, which carries the condition and the consequence of
// widening availability. Embedding a checkout INSIDE the app is still forbidden;
// opening the web page is not.

// fetchEntitlements already lives in api/monitor.ts (the cadence gate uses it); re-export so the billing
// screen has one import surface.
export { fetchEntitlements } from "./monitor";

/** The caller's usage counters (get_my_usage). Falls back to an empty free snapshot on any failure. */
export async function fetchUsage(): Promise<UsageSnapshot> {
  const { data, error } = await supabase.rpc("get_my_usage");
  if (error) throw new Error(`usage failed: ${error.message}`);
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as UsageSnapshot) : null;
  return obj ?? { plan: "free", counters: {} };
}
