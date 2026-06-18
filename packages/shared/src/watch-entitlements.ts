// Watch tier gating — PURE. Reads the per-plan watch entitlements + resolves the allowed cadence.
//
// The plan_entitlements migration seeds watch_limit / watch_daily_enabled / watch_email_enabled per
// plan (free 1·weekly·no-email; Plus 10·daily·email; Pro 50·daily·email). This module turns the raw
// EntitlementSnapshot into the three values the UI + createWatch need, defaulting to the FREE-TIER
// FLOOR whenever a key is missing (e.g. pre-deploy, before the keys are seeded) so we never
// accidentally grant more than the floor.

import type { EntitlementSnapshot } from "./entitlements.ts";

export interface WatchEntitlement {
  /** Max number of watches the plan allows. */
  limit: number;
  /** Whether the plan can use the daily cadence (free = weekly only). */
  dailyEnabled: boolean;
  /** Whether the plan gets email delivery. */
  emailEnabled: boolean;
}

export function watchEntitlement(snapshot: EntitlementSnapshot | null): WatchEntitlement {
  const e = snapshot?.entitlements ?? {};
  const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    limit: num(e.watch_limit, 1), // free floor
    dailyEnabled: e.watch_daily_enabled === true,
    emailEnabled: e.watch_email_enabled === true,
  };
}

/**
 * The cadence a watch should be created with. Daily requires the plan's watch_daily_enabled, so a free
 * user can never create/persist a daily watch (this is the CLIENT-SIDE gate — the scheduler enforces
 * which watches are actually due). A paid user with no explicit choice defaults to daily (the freshness
 * the upgrade buys).
 */
export function resolveWatchCadence(
  requested: "weekly" | "daily" | undefined,
  dailyEnabled: boolean,
): "weekly" | "daily" {
  if (!dailyEnabled) return "weekly";
  return requested ?? "daily";
}

/** "3 of 10 watches used" — the usage line on the Monitoring page. */
export function watchUsageLabel(used: number, limit: number): string {
  return `${used} of ${limit} ${limit === 1 ? "watch" : "watches"} used`;
}
