"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EntitlementSnapshot } from "@pharmabro/shared";
import { watchEntitlement, watchUsageLabel } from "@pharmabro/shared";
import { fetchEntitlements, fetchWatches, type WatchSummary } from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";

// The Monitoring section: the topics and saved questions the user is watching. Each watch re-checks
// the live evidence on a schedule; this lists them and links to the detail view (/app/monitor/[id]),
// where the "what's new" feed, the loud alerts, and the walled-off news list are shown. Mirrors the
// Reports library. Until the monitoring backend is deployed (owner-gated), fetchWatches returns [] and
// the empty state shows — no error.
export default function MonitorPage() {
  const [watches, setWatches] = useState<WatchSummary[] | null>(null);
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWatches()
      .then((w) => { if (alive) setWatches(w); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load your watches."); });
    // entitlements are best-effort: a failure just hides the usage line, never blocks the list
    fetchEntitlements().then((e) => { if (alive) setEnt(e); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const tier = watchEntitlement(ent);

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Monitoring</h2>
        <p className="welcome-sub">
          Topics and saved questions you&apos;re watching. We re-check the live evidence on a schedule and
          surface what&apos;s new — sounding a loud alert only when a finding could change the answer.
        </p>
      </div>

      {watches && ent ? (
        <p className="watch-usage">
          {watchUsageLabel(watches.length, tier.limit)} · checked {tier.dailyEnabled ? "daily" : "weekly"}
          {watches.length >= tier.limit
            ? <> · <Link href="/app/billing">need more? see plans</Link></>
            : null}
        </p>
      ) : null}

      {err ? <p className="tmpl-note">{err}</p> : null}
      {watches === null && !err ? <p className="muted" style={{ fontSize: 14 }}>Loading watches…</p> : null}

      {watches && watches.length === 0 ? (
        <p className="welcome-sub">
          No watches yet. Open a topic or an answer in <Link href="/app/ask">Ask</Link> and choose
          &ldquo;Watch this&rdquo; to start monitoring it.
        </p>
      ) : null}

      {watches && watches.length > 0 ? (
        <div className="research-history">
          <div className="research-history-list">
            {watches.map((w) => (
              <Link key={w.id} href={`/app/monitor/${w.id}`} className="research-card" title={w.title}>
                <Icon name="bell" size={15} />
                <span className="research-card-title">{w.title}</span>
                <small>{w.cadence}{w.status === "paused" ? " · paused" : ""}</small>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
