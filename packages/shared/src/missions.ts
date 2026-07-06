// Missions — scheduled background deep-research runs (research-superapp-parity-audit §5). PURE.
// The cadence math lives here (not in SQL, not in the fn) so the edge function and any future
// mobile client advance next_run_at identically, and so it is unit-tested.

import type { EntitlementSnapshot } from "./entitlements.ts";

export type MissionCadence = "daily" | "weekly" | "monthly";
export type MissionDeliver = "in_app" | "email";
export type MissionRunStatus = "completed" | "failed" | "skipped_quota";

export interface MissionSummary {
  id: string;
  question: string;
  report_mode: string;
  cadence: MissionCadence;
  deliver: MissionDeliver;
  status: "active" | "paused";
  next_run_at: string;
  last_run_at: string | null;
  last_run_status: MissionRunStatus | null;
  last_saved_report_id: string | null;
}

/** Advance a mission's cursor. Monthly uses calendar-month arithmetic; JS Date rolls a short month
 *  over (Jan 31 + 1 month → Mar 2/3) — accepted, since "monthly on the 31st" has no universal answer. */
export function nextRunAt(cadence: MissionCadence, from: Date): Date {
  const d = new Date(from.getTime());
  if (cadence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export interface MissionEntitlement {
  /** Max scheduled missions the plan allows. Free floor is 0 (deep research is Pro-and-up). */
  limit: number;
}

export function missionEntitlement(snapshot: EntitlementSnapshot | null): MissionEntitlement {
  const e = snapshot?.entitlements ?? {};
  const v = (e as Record<string, unknown>).mission_limit;
  return { limit: typeof v === "number" && Number.isFinite(v) ? v : 0 };
}

/** "2 of 5 scheduled runs used" — the usage line on the Monitoring page. */
export function missionUsageLabel(used: number, limit: number): string {
  return `${used} of ${limit} scheduled ${limit === 1 ? "run" : "runs"} used`;
}

export function cadenceLabel(c: MissionCadence): string {
  return c === "daily" ? "Runs daily" : c === "weekly" ? "Runs weekly" : "Runs monthly";
}
