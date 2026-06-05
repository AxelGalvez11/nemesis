"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DrugOverview, EntitlementSnapshot, WatchlistItem } from "@pharmabro/shared";
import {
  fetchDrug,
  fetchDrugLabel,
  fetchDrugPubmed,
  fetchDrugTrials,
  fetchEntitlements,
  fetchWatchlist,
  followItem,
  type DrugPubmed,
  type DrugTrial,
  type LabelDoc,
} from "@/lib/api";
import { Badge, Card, ErrorText, PageHeader, SourceAnchor } from "@/components/ui";

export default function DrugPage() {
  const { id } = useParams<{ id: string }>();
  const [drug, setDrug] = useState<DrugOverview | null>(null);
  const [labels, setLabels] = useState<LabelDoc[]>([]);
  const [trials, setTrials] = useState<DrugTrial[]>([]);
  const [pubmed, setPubmed] = useState<DrugPubmed[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void Promise.all([
      fetchDrug(id),
      fetchDrugLabel(id),
      fetchDrugTrials(id),
      fetchDrugPubmed(id),
      fetchWatchlist(),
      fetchEntitlements(),
    ]).then(([d, l, t, p, w, e]) => {
      setDrug(d);
      setLabels(l);
      setTrials(t);
      setPubmed(p);
      setWatchlist(w);
      setEnt(e);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load drug"));
  }, [id]);

  const followed = watchlist.some((w) => w.item_type === "drug" && w.item_ref === id);
  const limit = Number(ent?.entitlements.watchlist_limit ?? 3);

  async function onFollow() {
    setFollowError(null);
    try {
      await followItem("drug", id);
      setWatchlist(await fetchWatchlist());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Follow failed";
      setFollowError(msg.includes("watchlist_limit_exceeded") ? `Watchlist limit reached (${watchlist.length}/${limit}). Upgrade to Plus for 50 follows.` : msg);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!drug) return <main>Loading drug…</main>;

  return (
    <div className="drug-page-layout">
      <section className="drug-main">
        <h1 className="drug-title">{drug.canonical_name}</h1>
        <div className="quick-chips">
          <Badge>{drug.approved_status}</Badge>
          {drug.primary_class ? <span className="chip">{drug.primary_class.name}</span> : null}
        </div>
        <div className="quick-chips">
          <button disabled={followed} onClick={onFollow}>{followed ? "Following" : "Follow"}</button>
          <button className="secondary" type="button">Compare</button>
          <button className="secondary" type="button">Share</button>
        </div>
        {followError ? <ErrorText>{followError}</ErrorText> : null}
        <p className="muted">Plan follow limit: {watchlist.length}/{limit}</p>

        <div className="seg-tabs">
          {["Summary", "Trials", "PubMed", "Sources"].map((tab, i) => (
            <span className={i === 0 ? "active" : ""} key={tab}>{tab}</span>
          ))}
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
      </section>

      <aside className="right-rail">
        <div className="eyebrow">Products</div>
        {[
          { name: "Ozempic", form: "SC injection", dose: "0.5-2 mg", bg: "#1a3b78" },
          { name: "Wegovy", form: "SC injection", dose: "2.4 mg", bg: "#1563b5" },
          { name: "Rybelsus", form: "Oral tablet", dose: "3-14 mg", bg: "#1a7a42" },
        ].map((product) => (
          <section className="product-card" key={product.name}>
            <div className="product-art" style={{ background: `linear-gradient(135deg, ${product.bg}cc, ${product.bg})` }}>{product.name[0]}</div>
            <div className="drug-tile-body">
              <strong>{product.name}</strong>
              <p className="muted">{product.form}</p>
              <p className="source-link">{product.dose}</p>
            </div>
          </section>
        ))}
        <div className="answer-section">
          <div className="eyebrow">Related</div>
          {["Tirzepatide", "Liraglutide", "Dulaglutide"].map((name) => <p key={name}>{name}</p>)}
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

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="answer-section">
      <h2>{title}</h2>
      <div className="grid">{children.length ? children : <p className="muted">{empty}</p>}</div>
    </section>
  );
}
