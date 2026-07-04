// Visible credits (Manus-style usage surface) — PURE. Turns the existing entitlement + usage + count
// snapshots into a small display model. DISPLAY-ONLY: reads what the backend already reports; it does
// not decide, enforce, or charge anything. The topbar chip, the credits modal, and the Settings "Usage"
// section all render from this one shape so the numbers are identical everywhere.
//
// Entitlement keys other than ask_daily_limit arrive through EntitlementSnapshot's `[key: string]:
// unknown` index signature, so they are read with the same finite-number guard used by
// watch-entitlements.ts / missions.ts — never bare Number(), which would yield NaN on undefined.

import type { EntitlementSnapshot, UsageSnapshot } from "./entitlements.ts";

export interface CreditsSummary {
  plan: string;
  /** Per-day meters that reset (Ask, Deep research). */
  daily: Array<{ key: "ask" | "deep_research"; label: string; used: number; limit: number }>;
  /** Permanent slots that free up on delete (Monitors, Scheduled). */
  slots: Array<{ key: "watches" | "missions"; label: string; used: number; limit: number }>;
}

/** A finite number, or undefined. Mirrors the guard in watch-entitlements.ts. */
function finite(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function buildCreditsSummary(input: {
  snapshot: EntitlementSnapshot | null;
  usage: UsageSnapshot | null;
  watchCount: number | null;
  missionCount: number | null;
}): CreditsSummary {
  const { snapshot, usage, watchCount, missionCount } = input;
  const ent = snapshot?.entitlements ?? {};
  const counters = usage?.counters ?? {};

  const daily: CreditsSummary["daily"] = [];

  // Ask meter. Prefer the counter's used/limit; fall back to the entitlement limit; keep only if a
  // numeric limit resolves at all.
  {
    const c = counters.ask_daily;
    const limit = finite(c?.limit) ?? finite(ent.ask_daily_limit);
    if (limit !== undefined) {
      daily.push({ key: "ask", label: "Ask", used: finite(c?.used) ?? 0, limit });
    }
  }

  // Deep-research meter. Same rule; a resolved limit of 0 is KEPT (Pro-gated 0/0 the UI marks).
  {
    const c = counters.deep_research_daily;
    const limit = finite(c?.limit) ?? finite(ent.deep_research_daily_limit);
    if (limit !== undefined) {
      daily.push({ key: "deep_research", label: "Deep research", used: finite(c?.used) ?? 0, limit });
    }
  }

  const slots: CreditsSummary["slots"] = [];

  // Monitors slot. Include when the count is known (a number, incl. 0) OR a limit resolves.
  {
    const limit = finite(ent.watch_limit);
    if (watchCount !== null || limit !== undefined) {
      slots.push({ key: "watches", label: "Monitors", used: watchCount ?? 0, limit: limit ?? 0 });
    }
  }

  // Scheduled slot. Same rule; free/plus resolve a limit of 0 and show 0/0.
  {
    const limit = finite(ent.mission_limit);
    if (missionCount !== null || limit !== undefined) {
      slots.push({ key: "missions", label: "Scheduled", used: missionCount ?? 0, limit: limit ?? 0 });
    }
  }

  return { plan: snapshot?.plan ?? "free", daily, slots };
}
