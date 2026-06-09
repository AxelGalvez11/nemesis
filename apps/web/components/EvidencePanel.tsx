"use client";

import Link from "next/link";
import { useState } from "react";
import type { Citation } from "@pharmabro/shared";
import { Icon } from "./icons";

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

type Tab = "sources" | "monograph" | "calculators";

export function EvidencePanel({ citations }: { citations: Citation[] }) {
  const [tab, setTab] = useState<Tab>("sources");
  const total = citations.length;

  return (
    <>
      <div className="ev-head">
        <b>Evidence</b>
        <div className="spacer" />
        <span className="live"><span className="dot" />LIVE</span>
      </div>
      <div className="ev-tabs">
        <button className={`ev-tab${tab === "sources" ? " active" : ""}`} onClick={() => setTab("sources")}>
          Sources {total ? <span className="mono" style={{ color: "var(--text-3)" }}>{total}</span> : null}
        </button>
        <button className={`ev-tab${tab === "monograph" ? " active" : ""}`} onClick={() => setTab("monograph")}>Monograph</button>
        <button className={`ev-tab${tab === "calculators" ? " active" : ""}`} onClick={() => setTab("calculators")}>Calculators</button>
      </div>

      <div className="ev-body">
        {tab === "sources" ? (
          total === 0 ? (
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
          )
        ) : null}

        {tab === "monograph" ? (
          <div className="ev-empty">
            <Icon name="doc" size={22} />
            <p style={{ marginTop: 10 }}>A layered drug monograph (FDA label + recent evidence + dosing) opens here for drug-overview questions.</p>
          </div>
        ) : null}

        {tab === "calculators" ? (
          <div className="ev-empty">
            <Icon name="calc" size={22} />
            <p style={{ marginTop: 10 }}>39 deterministic clinical calculators (renal/hepatic dosing, QTc, pediatric, IV infusion…) surface here when a dose or score is computed.</p>
          </div>
        ) : null}
      </div>

      <div className="ev-foot">
        <span>{total ? `${total} source${total === 1 ? "" : "s"}` : "no sources yet"}</span>
        <span>dense ⊕ rerank-2.5</span>
      </div>
    </>
  );
}
