"use client";

import Link from "next/link";
import type { Citation } from "@pharmabro/shared";
import { formatReference, studyTypeLabel } from "@pharmabro/shared";
import { normTag } from "@/lib/cite";
import { safeHref } from "@/lib/url";

// Provider → the color-square class in shell.css (openfda blue, pubmed purple, trial orange, faers red).
function providerClass(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("openfda") || p.includes("dailymed") || p.includes("label")) return "openfda";
  if (p.includes("openalex")) return "openalex";
  if (p.includes("pubmed") || p.includes("europepmc")) return "pubmed";
  if (p.includes("trial") || p.includes("nct")) return "clinicaltrials";
  if (p.includes("faers")) return "faers";
  return "";
}
function providerLabel(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("openfda")) return "FDA label";
  if (p.includes("dailymed")) return "DailyMed label";
  // OpenAlex: the non-PMID long tail (PMID-bearing works dedupe into the PubMed bucket upstream).
  if (p.includes("openalex")) return "OpenAlex · live";
  // pubmed_oa is the PubMed open-access bucket (fetched via NCBI E-utilities OR Europe PMC — both
  // are PubMed-indexed articles with PMIDs). Label it "PubMed" so it isn't confused for a separate
  // source: a research article is a research article regardless of which mirror served it.
  if (p.includes("pubmed_oa") || p.includes("pubmed") || p.includes("europepmc")) return "PubMed · live";
  if (p.includes("clinicaltrials") || p.includes("trial")) return "ClinicalTrials.gov";
  if (p.includes("faers")) return "FAERS · safety";
  return t;
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

// The panel shows the sources behind the answer — the only data the /ask response carries.
// (A Monograph + Calculators view will return here once the answer payload surfaces that data.)
// activeTag is the normalized chunk_tag of the citation the user just clicked in the answer; the
// matching card gets an `id` anchor (so the Ask page can scrollIntoView it) and an `active` class.
// activeQuote is the verbatim source sentence backing the clicked claim — highlighted in the active
// card so the citation visibly points at the line that supports the generated statement.
export function EvidencePanel({ citations, activeTag, activeQuote }: { citations: Citation[]; activeTag?: string; activeQuote?: string }) {
  const total = citations.length;

  return (
    <>
      <div className="ev-head">
        <b>Evidence</b>
        {total ? <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>{total}</span> : null}
        <div className="spacer" />
        <span className="live"><span className="dot" />LIVE</span>
      </div>

      <div className="ev-body">
        {total === 0 ? (
          <div className="ev-empty">Ask a question to see the sources behind the answer.</div>
        ) : (
          citations.map((c, i) => {
            // Position-based rank bar: the answer's citations arrive in reranked order, so the bar
            // reflects ordinal rank (first = strongest), not a fabricated per-source score.
            const rank = Math.max(34, Math.round(100 - (i / Math.max(1, total - 1)) * 60));
            const cls = providerClass(c.source_type);
            const tag = normTag(c.chunk_tag);
            const anchorId = `ev-src-${tag}`;
            const active = activeTag === tag;
            const klass = `src ${cls}${active ? " active" : ""}`;
            const refText = formatReference(c, "vancouver");
            // Study-design badge from the source's own publication-type metadata (undefined => no badge).
            const studyType = studyTypeLabel(c);
            // The supporting sentence belongs to the clicked claim, so it shows only on the active card.
            const support = active && activeQuote ? activeQuote : null;
            const inner = (
              <>
                <div className="cidx">{i + 1}</div>
                <div className="badge-src"><span className="sq" />{providerLabel(c.source_type)}</div>
                <h5 title={refText}>{c.title || c.source_type}</h5>
                <div className="meta">
                  {studyType ? (
                    <span className="study-type-pill" title="Study design, derived from the source's publication-type metadata">{studyType}</span>
                  ) : null}
                  {c.section ? <span>{c.section}</span> : null}
                  {c.published_date ? <span className="mono">{c.published_date}</span> : null}
                  {c.doaj_vetted ? (
                    <span className="doaj-pill" title="Listed in the Directory of Open Access Journals — a vetted, anti-predatory open-access journal">✓ Vetted OA journal</span>
                  ) : null}
                </div>
                {support ? (
                  <blockquote className="src-support">
                    <span className="src-support-label">Supports this claim</span>
                    <mark>{support}</mark>
                  </blockquote>
                ) : null}
                <p className="ref-cite-line">{refText}</p>
                <div className="relv"><i style={{ width: `${rank}%` }} /></div>
              </>
            );
            const baseHref = safeHref(c.url);
            // On the active card, deep-link the source to the supporting sentence (graceful no-op if absent).
            const href = baseHref && support ? withTextFragment(baseHref, support) : baseHref;
            // Free-to-read full-text link (open-access providers). A separate destination from the card's
            // canonical source, shown only when it adds something (differs from the source url). A LINK to
            // the free article — we still only grounded the abstract — so the copy says "read", not "verified".
            const oaHref = c.oa_url && c.oa_url !== c.url ? safeHref(c.oa_url) : null;
            const card = href ? (
              <a id={anchorId} className={klass} href={href} target="_blank" rel="noreferrer">{inner}</a>
            ) : (
              <Link id={anchorId} className={klass} href={`/app/source/${c.source_id}`}>{inner}</Link>
            );
            return (
              <div className="src-row" key={`${c.source_id}-${c.chunk_tag}`}>
                {card}
                {oaHref ? (
                  <a className="oa-link" href={oaHref} target="_blank" rel="noreferrer"
                    title="Open the free full text on the publisher or repository site (we grounded the abstract)">
                    Read full text (free) ↗
                  </a>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="ev-foot">
        <span>{total ? `${total} source${total === 1 ? "" : "s"}` : "no sources yet"}</span>
        <span>dense ⊕ rerank-2.5</span>
      </div>
    </>
  );
}
