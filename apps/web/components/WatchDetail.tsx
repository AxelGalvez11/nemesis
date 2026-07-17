"use client";

import { partitionWatchEvents, type WatchEvent } from "@nemesis/shared";
import { Icon } from "@/components/icons";
import { safeHref } from "@/lib/url";
import { WatchCurrentEvidence } from "@/components/WatchCurrentEvidence";

// The watch detail view: the three channels of one live-monitoring watch, rendered from the pure
// partition in @nemesis/shared. The lanes are visually distinct ON PURPOSE:
//   • Alerts   — loud, emphasized cards (a new high-tier study / a retraction; evidence only)
//   • What's new — the quiet feed of every new source (the "it's working / worth my money" channel)
//   • In the news — WALLED OFF: muted, no provider square, no study-type, an explicit "not verified
//     evidence" label. A news item is never cited or grounded; the styling reinforces the wall.
//
// Not wired to a live backend yet (the migration + edge-fn deploy are owner-gated) — a page passes
// typed events in. The component is presentation-only and renders identically offline.

// Provider → the color-square class in shell.css (mirrors EvidencePanel).
function providerClass(t: string | null): string {
  const p = (t ?? "").toLowerCase();
  if (p.includes("openfda") || p.includes("dailymed") || p.includes("label")) return "openfda";
  if (p.includes("openalex")) return "openalex";
  if (p.includes("medlineplus")) return "medlineplus";
  if (p.includes("pubmed") || p.includes("europepmc")) return "pubmed";
  if (p.includes("trial") || p.includes("nct") || p.includes("clinicaltrials")) return "clinicaltrials";
  if (p.includes("faers")) return "faers";
  return "";
}
function providerLabel(t: string | null): string {
  const p = (t ?? "").toLowerCase();
  if (p.includes("openfda") || p.includes("dailymed")) return "FDA label";
  if (p.includes("openalex")) return "OpenAlex";
  if (p.includes("medlineplus")) return "MedlinePlus";
  if (p.includes("pubmed") || p.includes("europepmc")) return "PubMed";
  if (p.includes("clinicaltrials") || p.includes("trial")) return "ClinicalTrials.gov";
  if (p.includes("faers")) return "FAERS";
  return t ?? "source";
}

const ALERT_LABEL: Record<string, string> = {
  new_high_tier_study: "New high-tier study",
  retraction: "Retraction",
};

/** YYYY-MM-DD slice — deterministic (no locale/timezone surprises in SSR vs client). */
function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

interface WatchDetailProps {
  watch: { title: string; cadence: string; baselined: boolean; lastCheckedLabel?: string | null };
  events: WatchEvent[];
  // The watch's topic/title, used to load the current cited evidence INLINE (on demand) instead of
  // sending the user to the chat page. Null hides the current-evidence block entirely.
  currentEvidenceQuery?: string | null;
}

export function WatchDetail({ watch, events, currentEvidenceQuery }: WatchDetailProps) {
  const { alerts, feed, news, unreadAlertCount } = partitionWatchEvents(events);

  return (
    <div className="watch-detail">
      <header className="watch-head">
        <div>
          <h2 className="watch-title">{watch.title}</h2>
          <p className="watch-sub">
            <Icon name="bell" size={13} /> Checked {watch.cadence}
            {watch.lastCheckedLabel ? <> · last checked {watch.lastCheckedLabel}</> : null}
            {" · "}{watch.baselined ? "monitoring" : "setting up"}
          </p>
        </div>
        {unreadAlertCount > 0 ? (
          <span className="watch-unread">{unreadAlertCount} new alert{unreadAlertCount > 1 ? "s" : ""}</span>
        ) : null}
      </header>

      {currentEvidenceQuery ? <WatchCurrentEvidence query={currentEvidenceQuery} /> : null}

      <section className="watch-section">
        <h3 className="watch-section-h">
          <Icon name="bell" size={14} /> Alerts <small>conclusion-movers</small>
        </h3>
        {alerts.length === 0 ? (
          <p className="watch-empty">
            No alerts. We only sound the alarm for a new high-tier study (meta-analysis, systematic review,
            RCT, late-phase trial) or a retraction — not every new paper.
          </p>
        ) : (
          alerts.map((e) => <AlertCard key={e.id} e={e} />)
        )}
      </section>

      <section className="watch-section">
        <h3 className="watch-section-h">
          <Icon name="sparkle" size={14} /> What&apos;s new <small>every new source</small>
        </h3>
        {feed.length === 0 ? (
          <p className="watch-empty">
            {watch.baselined
              ? "Nothing new since the last check — you're up to date."
              : "Your first check baselines quietly: it records everything already published, then flags anything new here afterward."}
          </p>
        ) : (
          feed.map((e) => <FeedCard key={e.id} e={e} />)
        )}
      </section>

      {news.length > 0 ? (
        <section className="watch-section watch-news-section">
          <h3 className="watch-section-h watch-news-h">
            <Icon name="message" size={14} /> In the news <small>not verified evidence</small>
          </h3>
          <p className="watch-news-disclaimer">
            Press and media coverage, shown for context only. Not vetted, never cited, and never used to
            answer a question — unlike the evidence above.
          </p>
          {news.map((e) => <NewsCard key={e.id} e={e} />)}
        </section>
      ) : null}
    </div>
  );
}

function AlertCard({ e }: { e: WatchEvent }) {
  const href = safeHref(e.url ?? undefined);
  const title = e.title || providerLabel(e.provider); // never an empty/invisible link (WCAG 2.4.4)
  const reasonClass = e.alert_reason === "retraction" ? "retraction" : "study";
  return (
    <div className={`src watch-alert ${providerClass(e.provider)}`}>
      <div className="watch-alert-top">
        <span className={`watch-alert-reason ${reasonClass}`}>
          <Icon name={e.alert_reason === "retraction" ? "shield" : "bell"} size={11} />
          {ALERT_LABEL[e.alert_reason ?? ""] ?? "Alert"}
        </span>
        <span className="badge-src"><span className="sq" />{providerLabel(e.provider)}</span>
      </div>
      <h5>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{title}</a> : title}</h5>
      {e.summary ? <p className="watch-summary">{e.summary}</p> : null}
      <div className="meta">
        {e.study_type ? <span className="study-type-pill">{e.study_type}</span> : null}
        {e.published_date ? <span>{fmtDate(e.published_date)}</span> : null}
        <span className="since">detected {fmtDate(e.detected_at)}</span>
      </div>
    </div>
  );
}

function FeedCard({ e }: { e: WatchEvent }) {
  const href = safeHref(e.url ?? undefined);
  const title = e.title || providerLabel(e.provider);
  return (
    <div className={`src ${providerClass(e.provider)}`}>
      <span className="badge-src"><span className="sq" />{providerLabel(e.provider)}</span>
      <h5>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{title}</a> : title}</h5>
      <div className="meta">
        {e.study_type ? <span className="study-type-pill">{e.study_type}</span> : null}
        {e.published_date ? <span>{fmtDate(e.published_date)}</span> : null}
        <span className="since">detected {fmtDate(e.detected_at)}</span>
      </div>
    </div>
  );
}

function NewsCard({ e }: { e: WatchEvent }) {
  const href = safeHref(e.url ?? undefined);
  const title = e.title || e.provider || "Source";
  return (
    <div className="watch-news-item">
      <h5>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{title}</a> : title}</h5>
      <div className="watch-news-meta">
        {e.provider ? <span>{e.provider}</span> : null}
        {e.published_date ? <span>{fmtDate(e.published_date)}</span> : null}
      </div>
    </div>
  );
}
