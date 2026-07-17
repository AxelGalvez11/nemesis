import { supabase } from "./supabase";
import type { UsageSnapshot } from "@nemesis/shared";

// Billing/plan reads for the mobile plan-display screen. App Store / Play rules forbid embedding the
// web's Stripe checkout for subscriptions, so mobile is DISPLAY-ONLY: it reads the caller's real plan +
// usage (get_my_entitlements / get_my_usage, both auth.uid()-scoped) and shows them. Upgrades happen on
// the web. No in-app purchase, no checkout deep-link.

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
