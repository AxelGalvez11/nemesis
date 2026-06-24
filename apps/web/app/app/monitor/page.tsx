"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { BrowseTopic, EntitlementSnapshot, EntitySuggestion } from "@pharmabro/shared";
import { watchEntitlement, watchUsageLabel, watchFieldsFromBrowseTopic } from "@pharmabro/shared";
import { createWatch, fetchDrug, fetchEntitlements, fetchWatches, type WatchSummary } from "@/lib/api";
import { isCatalogDrug, watchFieldsFromEntity } from "@/lib/entity";
import { getCached, setCached } from "@/lib/cache";
import { BrowseTopics } from "@/components/BrowseTopics";
import { EntityPicker } from "@/components/EntityPicker";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";

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

/** "3h ago" / "2d ago" — a compact last-checked label for the watch cards. */
function relTime(iso: string | null): string {
  if (!iso) return "not yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function MonitorPage() {
  // Seed from the session cache so a return visit paints the list instantly (no skeleton), then
  // revalidate below. Both watches AND ent are cached because the list render gates on both.
  const [watches, setWatches] = useState<WatchSummary[] | null>(() => getCached<WatchSummary[]>("watches") ?? null);
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(() => getCached<EntitlementSnapshot>("watch-ent") ?? null);
  const [err, setErr] = useState<string | null>(null);

  // "Monitor a new topic" box.
  const [topic, setTopic] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadWatches = useCallback(
    () =>
      fetchWatches()
        .then((w) => { setWatches(w); setCached("watches", w); })
        .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your watches.")),
    [],
  );

  useEffect(() => {
    let alive = true;
    fetchWatches()
      .then((w) => { if (alive) { setWatches(w); setCached("watches", w); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load your watches."); });
    // entitlements are best-effort: a failure just hides the usage line, never blocks the list
    fetchEntitlements().then((e) => { if (alive) { setEnt(e); setCached("watch-ent", e); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const tier = watchEntitlement(ent);

  // Submitting raw typed text no longer creates a watch. Free-text questions produced messy,
  // unscoped watches (e.g. "what does the literature say on hgh and tesamorelin?") whose title WAS
  // the whole sentence and whose search terms were noise. Watches now come only from a resolved
  // entity (an autocomplete pick) or a curated browse chip — both scoped and clean. Pressing Enter
  // without picking just nudges the user to choose a real drug/condition.
  function hintPickEntity() {
    setAddError("Pick a drug or condition from the suggestions to start monitoring it.");
  }

  // A picked suggestion → a precise, scoped watch. A catalog drug resolves brand→generic with an openFDA
  // name-scope (mentions); a MeSH condition/device/procedure becomes a canonical-term evidence+news watch.
  async function addEntity(entity: EntitySuggestion) {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      // Only an in-house catalog drug gets the full brand list (search returns one alias; get_drug returns
      // all, e.g. Ozempic AND Wegovy AND Rybelsus). A MeSH entity skips the fetch — no openFDA name-scope.
      // Best-effort: a failed/absent fetch falls back to the subtitle alias inside watchFieldsFromEntity.
      const drug = isCatalogDrug(entity) ? await fetchDrug(entity.id).catch(() => null) : null;
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

  // Tapping a curated "browse" chip → a watch, via the SAME builder shape as the autocomplete path
  // (a drug carries its brand/generic mentions for the openFDA name-scope; a condition/class doesn't).
  async function addBrowseTopic(t: BrowseTopic) {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const f = watchFieldsFromBrowseTopic(t);
      const res = await createWatch({ kind: "topic", title: f.title, topic: f.topic, query_terms: f.query_terms, mentions: f.mentions });
      if (res.ok) await loadWatches();
      else setAddError(ADD_ERROR_COPY[res.reason]);
    } finally {
      setAdding(false);
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
          onSubmitText={hintPickEntity}
          placeholder="Search a drug or condition to monitor"
          ariaLabel="Monitor a new topic"
          disabled={adding}
        />
        {adding ? <span className="watch-add-status">Starting…</span> : null}
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
      {watches === null && !err ? <SkeletonRows count={3} label="Loading your watches…" /> : null}

      {watches && watches.length === 0 ? (
        <p className="welcome-sub">
          No watches yet. Search a drug or condition above, or pick one from the popular topics below — or
          open an answer in <Link href="/app/ask">Ask</Link> and choose &ldquo;Watch this&rdquo;.
        </p>
      ) : null}

      {watches && watches.length > 0 ? (
        <div className="research-history">
          <div className="watch-card-list">
            {watches.map((w) => {
              const paused = w.status === "paused";
              return (
                <Link key={w.id} href={`/app/monitor/${w.id}`} className="watch-card" title={w.title}>
                  <span className={`watch-card-dot ${paused ? "paused" : "active"}`} aria-hidden />
                  <span className="watch-card-main">
                    <span className="watch-card-title">{w.title}</span>
                    <span className="watch-card-meta">
                      <span className={`watch-card-pill ${w.cadence === "daily" ? "daily" : ""}`}>
                        {w.cadence === "daily" ? "Daily" : "Weekly"}
                      </span>
                      <span>{paused ? "Paused" : `Checked ${relTime(w.last_checked_at)}`}</span>
                    </span>
                  </span>
                  <span className="watch-card-chev" aria-hidden>›</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Tappable starting points — complements the search box above. One tap starts a watch. Shown
          once the page has settled (with the list or the empty state) so it never races the skeleton. */}
      {watches !== null ? <BrowseTopics onPick={(t) => void addBrowseTopic(t)} busy={adding} /> : null}
    </div>
  );
}
