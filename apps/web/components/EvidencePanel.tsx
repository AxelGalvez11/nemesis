"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AskResponse, Citation } from "@pharmabro/shared";
import { CLAIM_RELATION_LABEL, formatReference, studyTypeLabel } from "@pharmabro/shared";
import { useAppChrome } from "./AppShell";
import { normTag } from "@/lib/cite";
import { buildAskEvidenceGraph } from "@/lib/evidence-graph";
import { safeHref } from "@/lib/url";
import { EvidenceGraphCanvas } from "./EvidenceGraph";

// Provider → the color-square class in shell.css (openfda blue, pubmed purple, trial orange, faers red).
function providerClass(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("openfda") || p.includes("dailymed") || p.includes("label")) return "openfda";
  if (p.includes("fda_safety") || p.includes("enforcement")) return "faers";
  if (p.includes("openalex")) return "openalex";
  if (p.includes("medlineplus")) return "medlineplus";
  if (p.includes("pubmed") || p.includes("europepmc")) return "pubmed";
  if (p.includes("trial") || p.includes("nct")) return "clinicaltrials";
  if (p.includes("faers")) return "faers";
  return "";
}
function providerLabel(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("openfda")) return "FDA label";
  if (p.includes("fda_safety") || p.includes("enforcement")) return "FDA safety";
  if (p.includes("dailymed")) return "DailyMed label";
  // OpenAlex: the non-PMID long tail (PMID-bearing works dedupe into the PubMed bucket upstream).
  if (p.includes("openalex")) return "OpenAlex · live";
  // MedlinePlus: NLM/NIH consumer-health topic pages — the plain-language "general guidance" register,
  // distinct from the research providers. "· guide" marks it as patient guidance, not a study summary.
  if (p.includes("medlineplus")) return "MedlinePlus · guide";
  // pubmed_oa is the PubMed open-access bucket (fetched via NCBI E-utilities OR Europe PMC — both
  // are PubMed-indexed articles with PMIDs). Label it "PubMed" so it isn't confused for a separate
  // source: a research article is a research article regardless of which mirror served it.
  if (p.includes("pubmed_oa") || p.includes("pubmed") || p.includes("europepmc")) return "PubMed · live";
  if (p.includes("clinicaltrials") || p.includes("trial")) return "ClinicalTrials.gov";
  if (p.includes("faers")) return "FAERS · safety";
  return t;
}

// Coarse source family for the breadth breakdown header, so the search's reach reads at a glance
// ("18 sources · 9 PubMed · 4 trials · 3 FDA") instead of looking FDA-heavy from the few cited.
function sourceFamily(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("pubmed") || p.includes("europepmc") || p.includes("openalex")) return "PubMed";
  if (p.includes("trial") || p.includes("nct")) return "trials";
  if (p.includes("openfda") || p.includes("dailymed") || p.includes("faers") || p.includes("fda_safety")) return "FDA";
  if (p.includes("medlineplus")) return "guidance";
  return "other";
}
function breakdown(cites: Citation[]): { label: string; n: number }[] {
  const order = ["PubMed", "trials", "FDA", "guidance", "other"];
  const counts = new Map<string, number>();
  for (const c of cites) {
    const f = sourceFamily(c.source_type);
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return order.filter((f) => counts.has(f)).map((f) => ({ label: f, n: counts.get(f) ?? 0 }));
}

function supportLabel(c: Citation): string | null {
  if (!c.support_level) return null;
  switch (c.support_level) {
    case "direct": return "Direct support";
    case "partial": return "Partial support";
    case "weak": return "Weak support";
    case "background": return "Background";
    case "reviewed": return "Reviewed";
  }
}

function evidenceRoleLabel(role?: Citation["evidence_role"]): string | null {
  if (!role) return null;
  return role.replace(/_/g, " ");
}

function relationForCitation(c: Citation): Citation["claim_relation"] | undefined {
  if (c.claim_relation) return c.claim_relation;
  if (c.support_level === "direct") return "supports";
  if (c.support_level === "partial") return "partial";
  if (c.support_level === "weak" || c.support_level === "background") return "mentions";
  if (c.support_level === "reviewed") return "reviewed";
  return undefined;
}

function evidenceStrengthScore(c: Citation): number {
  const support = c.support_score ?? 0;
  const weight = c.evidence_weight ?? 0;
  const relation = relationForCitation(c);
  const relationBonus = relation === "supports" ? 16 : relation === "partial" ? 9 : relation === "mentions" ? 2 : relation === "conflicts" ? 7 : 0;
  const citedBonus = c.support_level === "reviewed" ? 0 : 8;
  return Math.max(0, Math.min(100, Math.round(support * 0.58 + weight * 0.34 + relationBonus + citedBonus)));
}

function strengthLabel(score: number): string {
  if (score >= 82) return "High";
  if (score >= 64) return "Good";
  if (score >= 45) return "Limited";
  return "Context";
}

function rankedSources(items: Citation[]): Citation[] {
  return [...items].sort((a, b) => {
    const byStrength = evidenceStrengthScore(b) - evidenceStrengthScore(a);
    if (byStrength !== 0) return byStrength;
    const aTag = Number(normTag(a.chunk_tag));
    const bTag = Number(normTag(b.chunk_tag));
    return (Number.isFinite(aTag) ? aTag : 9999) - (Number.isFinite(bTag) ? bTag : 9999);
  });
}

// Append a Chrome text-fragment so an external source opens scrolled to the exact supporting
// sentence (https://wicg.github.io/scroll-to-text-fragment/). Best-effort: if the destination HTML
// doesn't contain the text verbatim the browser simply lands at the top, so it never breaks the link.
// Only http(s) urls; the quote is capped + encoded (commas already percent-encoded by encodeURIComponent;
// hyphens too, since "-" is a fragment delimiter).
function withTextFragment(href: string, quote: string): string {
  if (!/^https?:\/\//i.test(href) || href.includes("#")) return href;
  const text = quote.trim().slice(0, 300);
  if (text.length < 8) return href;
  return `${href}#:~:text=${encodeURIComponent(text).replace(/-/g, "%2D")}`;
}

// One source card. Cited cards are numbered + carry a rank bar; "also reviewed" cards are dimmer and
// unnumbered (they were searched + ranked but the answer didn't lean on them). `rankPct` undefined => no bar.
function SourceCard({ c, index, rankPct, active, activeQuote }: { c: Citation; index: number; rankPct?: number; active: boolean; activeQuote?: string }) {
  const [open, setOpen] = useState(active || (rankPct !== undefined && index === 0));
  const cls = providerClass(c.source_type);
  const tag = normTag(c.chunk_tag);
  const anchorId = `ev-src-${tag}`;
  const numbered = rankPct !== undefined;
  const klass = `src ${cls}${active ? " active" : ""}${numbered ? "" : " reviewed"}`;
  const refText = formatReference(c, "vancouver");
  const studyType = studyTypeLabel(c);
  const support = supportLabel(c);
  const role = evidenceRoleLabel(c.evidence_role);
  const relation = relationForCitation(c);
  const strength = evidenceStrengthScore(c);
  // The supporting sentence belongs to the clicked claim, so it shows only on the active card.
  const activeSupportQuote = active && activeQuote ? activeQuote : null;

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const baseHref = safeHref(c.url);
  // On the active card, deep-link the source to the supporting sentence (graceful no-op if absent).
  const href = baseHref && activeSupportQuote ? withTextFragment(baseHref, activeSupportQuote) : baseHref;
  // Free-to-read full-text link (open-access providers). A separate destination from the card's
  // canonical source, shown only when it adds something (differs from the source url). A LINK to
  // the free article — we still only grounded the abstract — so the copy says "read", not "verified".
  const oaHref = c.oa_url && c.oa_url !== c.url ? safeHref(c.oa_url) : null;

  return (
    <details
      id={anchorId}
      className={`src-row ${klass}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="src-summary">
        {numbered ? <span className="cidx">[{tag || index + 1}]</span> : null}
      <div className="badge-src"><span className="sq" />{providerLabel(c.source_type)}</div>
      <h5 title={refText}>{c.title || c.source_type}</h5>
        <div className="meta compact-meta">
          <span className="strength-pill" title="Ranked from support level, source type, and evidence metadata">{strengthLabel(strength)} evidence · {strength}</span>
          {relation ? (
            <span
              className={`relation-pill ${relation}`}
              title={c.relation_reason ?? c.support_reason ?? "How this source relates to the claim"}
            >
              {CLAIM_RELATION_LABEL[relation]}
            </span>
          ) : null}
        </div>
      </summary>
      <div className="src-details">
        <div className="meta">
        <span className="strength-pill" title="Ranked from support level, source type, and evidence metadata">{strengthLabel(strength)} evidence · {strength}</span>
        {relation ? (
          <span
            className={`relation-pill ${relation}`}
            title={c.relation_reason ?? c.support_reason ?? "How this source relates to the claim"}
          >
            {CLAIM_RELATION_LABEL[relation]}
          </span>
        ) : null}
        {support ? (
          <span
            className={`support-pill ${c.support_level}`}
            title={c.support_reason ?? "Deterministic source-support rating"}
          >
            {support}{typeof c.support_score === "number" ? ` · ${c.support_score}` : ""}
          </span>
        ) : null}
        {role ? (
          <span className="evidence-role-pill" title="Source class derived from provider/publication metadata">{role}</span>
        ) : null}
        {studyType ? (
          <span className="study-type-pill" title="Study design, derived from the source's publication-type metadata">{studyType}</span>
        ) : null}
        {c.section ? <span>{c.section}</span> : null}
        {c.published_date ? <span className="mono">{c.published_date}</span> : null}
        {c.doaj_vetted ? (
          <span className="doaj-pill" title="Listed in the Directory of Open Access Journals — a vetted, anti-predatory open-access journal">✓ Vetted OA journal</span>
        ) : null}
      </div>
      {activeSupportQuote ? (
        <blockquote className="src-support">
          <span className="src-support-label">Supports this claim</span>
          <mark>{activeSupportQuote}</mark>
        </blockquote>
      ) : null}
      <p className="ref-cite-line">{refText}</p>
        <div className="src-actions">
          {href ? (
            <a className="src-action-link" href={href} target="_blank" rel="noreferrer">Open source</a>
          ) : (
            <Link className="src-action-link" href={`/app/source/${c.source_id}`}>Open source</Link>
          )}
          {oaHref ? (
            <a className="src-action-link" href={oaHref} target="_blank" rel="noreferrer"
              title="Open the free full text on the publisher or repository site (we grounded the abstract)">
              Read full text
            </a>
          ) : null}
        </div>
      {rankPct !== undefined ? <div className="relv"><i style={{ width: `${rankPct}%` }} /></div> : null}
      </div>
    </details>
  );
}

// The panel shows the sources behind the answer. `citations` are the ones the answer text cited;
// `reviewed` are the other reranked sources the engine searched + reviewed but the answer didn't lean
// on — surfaced as "also reviewed" so the full breadth of the search is visible (the fix for an answer
// that LOOKS FDA-heavy from a few cites while ~15-20 sources were actually searched). activeTag is the
// normalized chunk_tag of the citation just clicked; the matching card gets an `id` anchor + `active`
// class. activeQuote is the verbatim source sentence backing that claim, highlighted on the active card.
export function EvidencePanel({ answer, citations, reviewed, activeTag, activeQuote }: { answer?: AskResponse | null; citations: Citation[]; reviewed?: Citation[]; activeTag?: string; activeQuote?: string }) {
  const [view, setView] = useState<"sources" | "map">("sources");
  const { evidenceExpanded, toggleEvidenceExpanded } = useAppChrome();
  const rev = reviewed ?? [];
  const total = citations.length + rev.length;
  const fam = breakdown([...citations, ...rev]);
  const citedN = citations.length;
  const rankedCited = useMemo(() => rankedSources(citations), [citations]);
  const rankedReviewed = useMemo(() => rankedSources(rev), [rev]);
  const graph = useMemo(() => answer ? buildAskEvidenceGraph(answer) : null, [answer]);
  const hasMap = Boolean(graph && graph.nodes.length >= 3);

  const jumpToSource = useCallback((tag: string) => {
    setView("sources");
    requestAnimationFrame(() => {
      const t = normTag(tag);
      const el = document.getElementById(`ev-src-${t}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("src-flash");
      setTimeout(() => el.classList.remove("src-flash"), 1200);
    });
  }, []);

  return (
    <>
      <div className="ev-head">
        <b>Activity</b>
        {total ? <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>{total}</span> : null}
        <div className="spacer" />
        <span className="live"><span className="dot" />Live sources</span>
        <button
          type="button"
          className="ev-expand"
          onClick={toggleEvidenceExpanded}
          aria-pressed={evidenceExpanded}
          aria-label={evidenceExpanded ? "Collapse evidence panel" : "Expand evidence panel"}
        >
          {evidenceExpanded ? "Normal" : "Expand"}
        </button>
      </div>

      {total ? (
        <div className="ev-breakdown">
          <b>{total}</b> source{total === 1 ? "" : "s"} · ranked by evidence strength
          {fam.length ? <span className="ev-breakdown-by"> · {fam.map((f) => `${f.n} ${f.label}`).join(" · ")}</span> : null}
        </div>
      ) : null}

      {hasMap ? (
        <div className="ev-tabs" role="tablist" aria-label="Evidence panel view">
          <button type="button" role="tab" aria-selected={view === "sources"} className={`ev-tab${view === "sources" ? " active" : ""}`} onClick={() => setView("sources")}>Sources</button>
          <button type="button" role="tab" aria-selected={view === "map"} className={`ev-tab${view === "map" ? " active" : ""}`} onClick={() => setView("map")}>Map</button>
        </div>
      ) : null}

      <div className="ev-body">
        {total === 0 ? (
          <div className="ev-empty">Ask a question to see the sources behind the answer.</div>
        ) : view === "map" && graph ? (
          <EvidenceGraphCanvas
            model={graph}
            onCite={jumpToSource}
            activeTag={activeTag}
            compact={!evidenceExpanded}
            title="Evidence map"
            subtitle="Answer claims, cited support, and reviewed sources."
            hint="Drag · zoom · tap"
            rootLabel="Answer"
          />
        ) : (
          <>
            {rev.length > 0 && citedN > 0 ? <div className="ev-section-label">Cited in this answer</div> : null}
            {rankedCited.map((c, i) => (
              <SourceCard
                key={`c-${c.source_id}-${c.chunk_tag}`}
                c={c}
                index={i}
                rankPct={evidenceStrengthScore(c)}
                active={normTag(c.chunk_tag) === activeTag}
                activeQuote={activeQuote}
              />
            ))}
            {rev.length > 0 ? <div className="ev-section-label muted">Also reviewed · searched, not cited</div> : null}
            {rankedReviewed.map((c) => (
              <SourceCard
                key={`r-${c.source_id}-${c.chunk_tag}`}
                c={c}
                index={0}
                active={normTag(c.chunk_tag) === activeTag}
                activeQuote={activeQuote}
              />
            ))}
          </>
        )}
      </div>

      <div className="ev-foot">
        <span>{total ? `${total} source${total === 1 ? "" : "s"}` : "no sources yet"}</span>
        <span>dense ⊕ rerank-2.5</span>
      </div>
    </>
  );
}
