"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DrugOverview } from "@pharmabro/shared";
import {
  fetchDrug,
  fetchDrugLabel,
  fetchDrugPubmed,
  fetchDrugTrials,
  fetchWatches,
  type DrugPubmed,
  type DrugTrial,
  type LabelDoc,
  type WatchSummary,
} from "@/lib/api";
import { Badge, Card, ErrorText, PageHeader, SourceAnchor } from "@/components/ui";
import { WatchButton } from "@/components/WatchButton";

export default function DrugPage() {
  const { id } = useParams<{ id: string }>();
  const [drug, setDrug] = useState<DrugOverview | null>(null);
  const [labels, setLabels] = useState<LabelDoc[]>([]);
  const [trials, setTrials] = useState<DrugTrial[]>([]);
  const [pubmed, setPubmed] = useState<DrugPubmed[]>([]);
  const [watches, setWatches] = useState<WatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!id) return;
    void Promise.all([
      fetchDrug(id),
      fetchDrugLabel(id),
      fetchDrugTrials(id),
      fetchDrugPubmed(id),
      fetchWatches(),
    ]).then(([d, l, t, p, w]) => {
      setDrug(d);
      setLabels(l);
      setTrials(t);
      setPubmed(p);
      setWatches(w);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load drug"));
  }, [id]);

  function onShare() {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href)
      .then(() => { setShared(true); setTimeout(() => setShared(false), 1500); })
      .catch(() => {});
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!drug) return <main>Loading drug…</main>;

  // A topic-watch on this drug is created with title === canonical_name (below), so a returning user's
  // existing watch is matched by title — flipping the button to "Watching" instead of minting a duplicate.
  const existingWatch = watches.find((w) => w.title === drug.canonical_name);

  return (
    <div className="drug-page-layout">
      <section className="drug-main">
        {/* Inner column caps line length for calm, readable prose (the .drug-main column is wide on
            large screens). Left-anchored to the padding edge so it aligns with the title and doesn't
            float against the right rail. Layout-only; reuses the foundation-restyled classes inside. */}
        <div style={{ maxWidth: 720, width: "100%" }}>
        <h1 className="drug-title">{drug.canonical_name}</h1>
        <div className="quick-chips" style={{ marginBottom: 10 }}>
          <Badge>{drug.approved_status}</Badge>
          {drug.primary_class ? <span className="chip">{drug.primary_class.name}</span> : null}
        </div>
        <div className="quick-chips">
          <WatchButton
            kind="topic"
            question={drug.canonical_name}
            title={drug.canonical_name}
            mentions={[drug.canonical_name, ...drug.brand_names]}
            label="Watch this drug"
            existingWatchId={existingWatch?.id}
          />
          <button className="secondary" type="button" onClick={onShare}>{shared ? "Link copied" : "Share"}</button>
        </div>

        {drug.evidence_score ? (
          <Card className="acid">
            <div className="row">
              <Badge>{drug.evidence_score.score}</Badge>
              <span className="muted">Updated Jun 2026</span>
            </div>
            <h2>Evidence strength</h2>
            <p>{drug.evidence_score.rationale}</p>
            <div className="grid four-stats">
              <Stat label="RCTs" value={String(drug.evidence_score.evidence_counts.n_rct ?? 0)} />
              <Stat label="Human trials" value={String(drug.evidence_score.evidence_counts.n_human_trials ?? 0)} />
              <Stat label="Phase" value={drug.evidence_score.evidence_counts.max_trial_phase ?? "n/a"} />
              <Stat label="Labels" value={String(drug.counts.labels)} />
            </div>
          </Card>
        ) : null}

        <section className="answer-section">
          <div className="eyebrow">Mechanism of action</div>
          <p>{drug.mechanism_summary || "Source-backed profile with labels, trials, PubMed, and evidence score."}</p>
        </section>

        <Card>
          <p className="error"><strong>Safety note</strong></p>
          <p className="muted">Review labeled warnings, contraindications, and clinician guidance before making medication decisions.</p>
        </Card>

        <Section title="Label" empty="No label projection yet.">
          {labels.map((l) => (
            <Card key={l.label_id}>
              <SourceAnchor sourceId={l.source_id} label="Open label source" />
              {Object.entries(l.extracted_sections).slice(0, 5).map(([k, v]) => (
                <p key={k}><strong>{k.replaceAll("_", " ")}:</strong> {String(v).slice(0, 420)}</p>
              ))}
            </Card>
          ))}
        </Section>
        <Section title="ClinicalTrials.gov" empty="No linked trials yet.">
          {trials.map((t) => (
            <Card key={t.trial_id}>
              <h3>{t.brief_title || t.nct_id}</h3>
              <p className="muted">{t.phase} · {t.status}</p>
              <SourceAnchor sourceId={t.source_id} label="Open trial source" />
            </Card>
          ))}
        </Section>
        <Section title="PubMed" empty="No linked PubMed articles yet.">
          {pubmed.map((p) => (
            <Card key={p.article_id}>
              <h3>{p.title || p.pmid}</h3>
              <p className="muted">{p.journal} · {p.publication_date}</p>
              <SourceAnchor sourceId={p.source_id} label="Open PubMed source" />
            </Card>
          ))}
        </Section>
        </div>
      </section>

      <aside className="right-rail">
        <div className="answer-section">
          <div className="eyebrow">Products &amp; pricing</div>
          {drug.brand_names.length ? (
            <div className="quick-chips">{drug.brand_names.map((b) => <span className="chip" key={b}>{b}</span>)}</div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>No brand-name products on file (often available as a generic).</p>
          )}
          <a
            className="chip-action"
            href={goodRxUrl(drug.canonical_name)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginTop: 8, display: "inline-flex" }}
            title="Opens GoodRx price comparison in a new tab"
          >
            Check prices on GoodRx ↗
          </a>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Third-party pricing (US). PharmaOrb doesn&apos;t set or verify prices.
          </p>
        </div>
        {drug.classes.length ? (
          <div className="answer-section">
            <div className="eyebrow">Drug classes</div>
            <div className="quick-chips">{drug.classes.map((c) => <span className="chip" key={c.id}>{c.name}</span>)}</div>
          </div>
        ) : null}
        <div className="answer-section">
          <div className="eyebrow">Evidence coverage</div>
          <div className="quick-chips">
            <span className="chip">{drug.counts.labels} labels</span>
            <span className="chip">{drug.counts.trials} trials</span>
            <span className="chip">{drug.counts.pubmed} PubMed</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h2>{value}</h2>
      <p className="muted">{label}</p>
    </div>
  );
}

// GoodRx drug pages live at goodrx.com/<slug> (e.g. goodrx.com/tretinoin). Slug the canonical name; a
// wrong slug still lands on GoodRx's own search, so this degrades gracefully rather than 404ing.
function goodRxUrl(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `https://www.goodrx.com/${encodeURIComponent(slug)}`;
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="answer-section">
      <h2>{title}</h2>
      <div className="grid">{children.length ? children : <p className="muted">{empty}</p>}</div>
    </section>
  );
}
