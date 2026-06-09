"use client";

import Link from "next/link";
import type { Citation } from "@pharmabro/shared";

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
  if (p.includes("openfda")) return "openFDA · label";
  if (p.includes("dailymed")) return "DailyMed · label";
  if (p.includes("pubmed_oa")) return "Europe PMC · live";
  if (p.includes("pubmed")) return "PubMed";
  if (p.includes("clinicaltrials") || p.includes("trial")) return "ClinicalTrials";
  if (p.includes("faers")) return "FAERS · safety";
  return t;
}

// The panel shows the sources behind the answer — the only data the /ask response carries.
// (A Monograph + Calculators view will return here once the answer payload surfaces that data.)
export function EvidencePanel({ citations }: { citations: Citation[] }) {
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
            return c.url ? (
              <a key={`${c.source_id}-${c.chunk_tag}`} className={`src ${cls}`} href={c.url} target="_blank" rel="noreferrer">{inner}</a>
            ) : (
              <Link key={`${c.source_id}-${c.chunk_tag}`} className={`src ${cls}`} href={`/app/source/${c.source_id}`}>{inner}</Link>
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
