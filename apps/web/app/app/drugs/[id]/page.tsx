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
    <>
      <PageHeader title={drug.canonical_name} eyebrow="Evidence page">
        {drug.mechanism_summary || "Source-backed profile with labels, trials, PubMed, and evidence score."}
      </PageHeader>
      <div className="grid two">
        <Card>
          <div className="row">
            <Badge>{drug.approved_status}</Badge>
            <button disabled={followed} onClick={onFollow}>{followed ? "Following" : "Follow"}</button>
          </div>
          {followError ? <ErrorText>{followError}</ErrorText> : null}
          <p className="muted">Plan follow limit: {watchlist.length}/{limit}</p>
        </Card>
        {drug.evidence_score ? (
          <Card>
            <Badge>{drug.evidence_score.score}</Badge>
            <h2>Evidence strength</h2>
            <p>{drug.evidence_score.rationale}</p>
          </Card>
        ) : null}
      </div>
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
    </>
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
