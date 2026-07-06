"use client";

import { useEffect, useState } from "react";
import { buildCreditsSummary, type CreditsSummary } from "@pharmabro/shared";
import { fetchEntitlements, fetchMissions, fetchUsage, fetchWatches } from "@/lib/api";

// The inner list — plan name, a "Today" group (resettable daily meters) and a "Slots" group (permanent
// monitors/scheduled). Rendered by BOTH the modal (CreditsPanel) and the Settings "Usage" section, so the
// numbers read identically everywhere. Pure presentation over the display model built in shared.
export function CreditsBreakdown({ summary }: { summary: CreditsSummary }) {
  const planLabel = summary.plan.charAt(0).toUpperCase() + summary.plan.slice(1);
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 4px" }}>
        You're on the <b>{planLabel}</b> plan.
      </p>

      {summary.daily.length > 0 ? (
        <div className="credits-group">
          <div className="credits-group-label">Today · resets daily</div>
          {summary.daily.map((row) => {
            // A deep-research meter capped at 0 means the feature is Pro-gated on this plan — say so plainly.
            const gated = row.key === "deep_research" && row.limit === 0;
            const pct = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
            return (
              <div className="credits-row" key={row.key}>
                <span className="credits-row-label">
                  {row.label}
                  {gated ? <span className="credits-row-note">Pro feature</span> : null}
                </span>
                <span className="credits-row-count">{row.used}/{row.limit}</span>
                <span className="credits-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
              </div>
            );
          })}
        </div>
      ) : null}

      {summary.slots.length > 0 ? (
        <div className="credits-group">
          <div className="credits-group-label">Slots · free up when you delete one</div>
          {summary.slots.map((row) => {
            const pct = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
            return (
              <div className="credits-row" key={row.key}>
                <span className="credits-row-label">{row.label}</span>
                <span className="credits-row-count">{row.used}/{row.limit}</span>
                <span className="credits-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="credits-foot">
        Daily counts reset at midnight UTC where marked; slots free up when you delete one.{" "}
        <a href="/app/billing">See plans</a>
      </p>
    </div>
  );
}

// The modal. Fetches fresh on open so the numbers are current; each fetch degrades to a null/empty
// fallback so one failing call never blanks the panel. Reuses the confirm-overlay/confirm-card pattern
// (mirrors DataSourcesPanel).
export function CreditsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<CreditsSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSummary(null);
    void Promise.all([
      fetchEntitlements().catch(() => null),
      fetchUsage().catch(() => null),
      fetchWatches().catch(() => null),
      fetchMissions().catch(() => null),
    ]).then(([snapshot, usage, watches, missions]) => {
      if (!alive) return;
      setSummary(
        buildCreditsSummary({
          snapshot,
          usage,
          watchCount: watches ? watches.length : null,
          missionCount: missions ? missions.length : null,
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label="Your credits"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, textAlign: "left", maxHeight: "80vh", overflowY: "auto" }}
      >
        <h3 className="confirm-title">Your credits</h3>
        {summary ? (
          <CreditsBreakdown summary={summary} />
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: "8px 0" }}>Loading…</p>
        )}
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button type="button" className="confirm-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
