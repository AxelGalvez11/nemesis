"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EntitlementSnapshot, SearchResult } from "@pharmabro/shared";
import { watchEntitlement, watchUsageLabel, watchTitleFromQuestion } from "@pharmabro/shared";
import { createWatch, fetchDrug, fetchEntitlements, fetchWatches, type WatchSummary } from "@/lib/api";
import { isDrugLikeEntity, watchFieldsFromEntity } from "@/lib/entity";
import { EntityPicker } from "@/components/EntityPicker";
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
    try {
      const res = await createWatch({ kind: "topic", title: watchTitleFromQuestion(q), topic: q, query_terms: q });
      if (res.ok) {
        setTopic("");
        await loadWatches(); // the new watch appears at the top of the list
      } else {
        setAddError(ADD_ERROR_COPY[res.reason]);
      }
    } finally {
      setAdding(false); // never leave the box stuck on "Starting…" if createWatch throws unexpectedly
    }
  }

  // A picked catalog entity → a precise, scoped watch (brand→generic; openFDA name-scope set via mentions).
  async function addEntity(entity: SearchResult) {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      // search_entities returns only ONE brand alias (its subtitle), so pull the full brand list on pick
      // and scope the openFDA watch to EVERY brand (e.g. Ozempic AND Wegovy AND Rybelsus). Best-effort: a
      // failed/absent fetch falls back to the single-alias subtitle inside watchFieldsFromEntity.
      const drug = isDrugLikeEntity(entity.type) ? await fetchDrug(entity.id).catch(() => null) : null;
      const f = watchFieldsFromEntity(entity, drug?.brand_names);
      const res = await createWatch({ kind: "topic", title: f.title, topic: f.topic, query_terms: f.query_terms, mentions: f.mentions });
      if (res.ok) {
        setTopic("");
        await loadWatches();
      } else {
        setAddError(ADD_ERROR_COPY[res.reason]);
      }
    } finally {
      setAdding(false); // never leave the box stuck on "Starting…" if createWatch throws unexpectedly
    }
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
        <EntityPicker
          value={topic}
          onChange={(v) => { setTopic(v); if (addError) setAddError(null); }}
          onPickEntity={(e) => void addEntity(e)}
          onSubmitText={() => void addTopic()}
          placeholder="Search a drug to monitor — or type any topic"
          ariaLabel="Monitor a new topic"
          disabled={adding}
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
