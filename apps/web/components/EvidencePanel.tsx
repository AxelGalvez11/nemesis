"use client";

import Link from "next/link";
import type { Citation } from "@pharmabro/shared";
import { normTag } from "@/lib/cite";
import { safeHref } from "@/lib/url";

// Provider → the color-square class in shell.css (openfda blue, pubmed purple, trial orange, faers red).
function providerClass(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("openfda") || p.includes("dailymed") || p.includes("label")) return "openfda";
  if (p.includes("pubmed")) return "pubmed";
  if (p.includes("trial") || p.includes("nct")) return "clinicaltrials";
  if (p.includes("faers")) return "faers";
  return "";
}
function providerLabel(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("openfda")) return "FDA label";
  if (p.includes("dailymed")) return "DailyMed label";
  // pubmed_oa is the PubMed open-access bucket (fetched via NCBI E-utilities OR Europe PMC — both
  // are PubMed-indexed articles with PMIDs). Label it "PubMed" so it isn't confused for a separate
  // source: a research article is a research article regardless of which mirror served it.
  if (p.includes("pubmed_oa") || p.includes("pubmed")) return "PubMed · live";
  if (p.includes("clinicaltrials") || p.includes("trial")) return "ClinicalTrials.gov";
  if (p.includes("faers")) return "FAERS · safety";
  return t;
}

// The panel shows the sources behind the answer — the only data the /ask response carries.
// (A Monograph + Calculators view will return here once the answer payload surfaces that data.)
// activeTag is the normalized chunk_tag of the citation the user just clicked in the answer; the
// matching card gets an `id` anchor (so the Ask page can scrollIntoView it) and an `active` class.
export function EvidencePanel({ citations, activeTag }: { citations: Citation[]; activeTag?: string }) {
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
            const inner = (
              <>
                <div className="cidx">{i + 1}</div>
                <div className="badge-src"><span className="sq" />{providerLabel(c.source_type)}</div>
                <h5>{c.title || c.source_type}</h5>
                <div className="meta">
                  {c.section ? <span>{c.section}</span> : null}
                  {c.published_date ? <span className="mono">{c.published_date}</span> : null}
                </div>
                <div className="relv"><i style={{ width: `${rank}%` }} /></div>
              </>
            );
            const href = safeHref(c.url);
            return href ? (
              <a key={`${c.source_id}-${c.chunk_tag}`} id={anchorId} className={klass} href={href} target="_blank" rel="noreferrer">{inner}</a>
            ) : (
              <Link key={`${c.source_id}-${c.chunk_tag}`} id={anchorId} className={klass} href={`/app/source/${c.source_id}`}>{inner}</Link>
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
