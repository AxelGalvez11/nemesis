"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EntitlementSnapshot } from "@pharmabro/shared";
import { watchEntitlement, watchUsageLabel, watchTitleFromQuestion } from "@pharmabro/shared";
import { createWatch, fetchEntitlements, fetchWatches, type WatchSummary } from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";

// The Monitoring section: the topics and saved questions the user is watching. Each watch re-checks
// the live evidence on a schedule; this lists them and links to the detail view (/app/monitor/[id]),
// where the "what's new" feed, the loud alerts, and the walled-off news list are shown. A "Monitor a
// new topic" box starts a watch right here (no need to detour through Ask). Mirrors the Reports library.
const ADD_ERROR_COPY: Record<"not_enabled" | "limit" | "auth" | "unknown", string> = {
  not_enabled: "Monitoring isn’t switched on yet.",
  limit: "You’ve reached your plan’s watch limit.",
  auth: "Sign in to start monitoring.",
  unknown: "Couldn’t start monitoring — try again.",
};

export default function MonitorPage() {
  const [watches, setWatches] = useState<WatchSummary[] | null>(null);
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // "Monitor a new topic" box.
  const [topic, setTopic] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadWatches = useCallback(
    () =>
      fetchWatches()
        .then((w) => setWatches(w))
        .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your watches.")),
    [],
  );

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

  // Start a new topic watch from the box. The per-plan limit is enforced server-side (createWatch
  // returns reason:"limit"); we surface that with an upgrade link rather than pre-disabling the input.
  async function addTopic() {
    const q = topic.trim();
    if (!q || adding) return;
    setAdding(true);
    setAddError(null);
    const res = await createWatch({ kind: "topic", title: watchTitleFromQuestion(q), topic: q, query_terms: q });
    if (res.ok) {
      setTopic("");
      await loadWatches(); // the new watch appears at the top of the list
    } else {
      setAddError(ADD_ERROR_COPY[res.reason]);
    }
    setAdding(false);
  }

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

      <div className="watch-add">
        <Icon name="bell" size={16} />
        <input
          className="watch-add-input"
          value={topic}
          maxLength={200}
          placeholder="Monitor a new topic — e.g. tirzepatide cardiovascular outcomes"
          aria-label="Monitor a new topic"
          onChange={(e) => { setTopic(e.target.value); if (addError) setAddError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTopic(); } }}
        />
        <button type="button" className="mode watch-add-btn" onClick={() => void addTopic()} disabled={adding || !topic.trim()}>
          {adding ? "Starting…" : "Monitor"}
        </button>
      </div>
      {addError ? (
        <p className="watch-add-error">
          {addError}
          {addError.includes("limit") ? <> · <Link href="/app/billing">see plans</Link></> : null}
        </p>
      ) : null}

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
          No watches yet. Type a topic above to start monitoring it — or open an answer in{" "}
          <Link href="/app/ask">Ask</Link> and choose &ldquo;Watch this&rdquo;.
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
