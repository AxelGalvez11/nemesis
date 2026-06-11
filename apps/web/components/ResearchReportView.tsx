"use client";

import { useMemo } from "react";
import type { AnswerPoint, Citation, CitationStyle, MetaAnalysisResult, ResearchReport } from "@pharmabro/shared";
import { buildMetaAbstract, buildReferenceList, evidenceRows } from "@pharmabro/shared";
import { renderInline } from "@/lib/inline-md";
import { normTag } from "@/lib/cite";
import { safeHref } from "@/lib/url";
import { Icon } from "./icons";
import { ForestPlot } from "./ForestPlot";
import { downloadReportExport } from "@/lib/api";

const PROVIDER_ABBR: Record<string, string> = {
  openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", europepmc: "PMID",
  clinicaltrials: "NCT", faers: "FAERS", rxnorm: "RxNorm",
};
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
}

// A study/evidence-characteristics table — the at-a-glance "body of evidence" a review opens with.
// Rows come from the shared `evidenceRows` helper (pure, from report.citations metadata already
// shown in the reference list), so this table is identical to the one in the docx/pptx exports.
function EvidenceTable({ citations, onCite }: { citations: Citation[]; onCite: (tag: string) => void }) {
  const rows = evidenceRows(citations);
  return (
    <section className="research-section">
      <h4 className="research-heading">Evidence base ({rows.length} sources)</h4>
      <div className="evidence-table-wrap">
        <table className="evidence-table">
          <thead>
            <tr><th>#</th><th>Type</th><th>Source</th><th>Year</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag}>
                <td><button type="button" className="cite" onClick={() => onCite(r.tag)} aria-label={`Show source ${r.tag}`}>{r.tag}</button></td>
                <td>{r.type}</td>
                <td className="evidence-table-title" title={r.title}>{r.title}</td>
                <td>{r.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Forest table for a poolable meta-analysis: one row per study (risk ratio + 95% CI + weight + the
// exact sentence the counts came from), then the computed fixed/random pooled rows and heterogeneity.
// Every number comes from report.meta_analysis (computed in code) — this only displays it.
function MetaForestTable({ meta, onCite }: { meta: MetaAnalysisResult; onCite: (tag: string) => void }) {
  if (!meta.poolable) return null;
  const f2 = (n: number) => n.toFixed(2);
  const ci = (lo: number, hi: number) => `${f2(lo)}–${f2(hi)}`;
  const i2 = meta.heterogeneity.i2;
  const highHet = i2 != null && i2 >= 75;
  return (
    <section className="research-section">
      <h4 className="research-heading">Pooled estimate — forest plot</h4>
      <ForestPlot meta={meta} />
      <div className="evidence-table-wrap">
        <table className="evidence-table forest-table">
          <thead>
            <tr><th>Study</th><th>Risk ratio (95% CI)</th><th>Weight</th><th>Source</th></tr>
          </thead>
          <tbody>
            {meta.studies.map((s) => (
              <tr key={s.citation_tag}>
                <td>
                  <button type="button" className="cite" onClick={() => onCite(normTag(s.citation_tag))} aria-label={`Show source ${s.citation_tag}`}>{normTag(s.citation_tag)}</button>
                  {" "}{s.label}{s.continuity_corrected ? " *" : ""}
                </td>
                <td>{f2(s.effect)} ({ci(s.ci_low, s.ci_high)})</td>
                <td>{Math.round(s.weight_percent)}%</td>
                <td className="evidence-table-title" title={s.source_quote}>{s.source_quote}</td>
              </tr>
            ))}
            <tr className="forest-pooled">
              <td>Pooled (random effects)</td>
              <td>{f2(meta.random.estimate)} ({ci(meta.random.ci_low, meta.random.ci_high)})</td>
              <td>—</td><td />
            </tr>
            <tr className="forest-pooled">
              <td>Pooled (fixed effect)</td>
              <td>{f2(meta.fixed.estimate)} ({ci(meta.fixed.ci_low, meta.fixed.ci_high)})</td>
              <td>—</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className={`muted-note${highHet ? " forest-het-high" : ""}`}>
        Heterogeneity: I² = {i2 == null ? "n/a" : `${Math.round(i2)}%`} · τ² = {meta.heterogeneity.tau2.toFixed(3)} · Q = {f2(meta.heterogeneity.q)} (df {meta.heterogeneity.df}).
        {highHet ? " High heterogeneity — the studies disagree substantially, so read the pooled estimate with caution." : ""}
        {meta.studies.some((s) => s.continuity_corrected) ? " * a 0.5 continuity correction was applied for a zero-event arm." : ""}
      </p>
    </section>
  );
}

/** Renders a finished Deep Research report: summary, verification state, themed cited sections,
 *  prominent safety, honest uncertainties, and a numbered sources list. Citation chips scroll to the
 *  matching source. Visual language matches the /ask Answer (same classes) so it feels like one app. */
export function ResearchReportView({ report, reportId, style = "vancouver", onStyleChange }: { report: ResearchReport; reportId?: string; style?: CitationStyle; onStyleChange?: (s: CitationStyle) => void }) {
  const citeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of report.citations) m.set(normTag(c.chunk_tag), abbr(c.source_type));
    return m;
  }, [report.citations]);

  const onCite = (tag: string) => {
    const el = document.getElementById(`rep-src-${tag}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("src-flash");
    setTimeout(() => el.classList.remove("src-flash"), 1200);
  };

  const flags = (report.safety_flags ?? []).filter((f) => f !== "no_sources_found");
  // A meta report opens with a journal-style structured abstract (Results computed from the pool, not
  // narrated). When present it carries the bottom line, so the plain lead paragraph is omitted.
  const abstract = buildMetaAbstract(report);

  return (
    <div className="answer fade research-report">
      <div className="grade-row">
        <span className="grade">{report.evidence_grade.replace(/_/g, " ")}</span>
        {report.template ? null : (
          <span className={`verify-pill ${report.claims_verified ? "ok" : "warn"}`}>
            <Icon name={report.claims_verified ? "check" : "shield"} size={12} />
            {report.claims_verified ? "Claims fact-checked" : "Not fully fact-checked"}
          </span>
        )}
        {flags.map((f) => <span key={f} className="safety-flag">{f.replace(/_/g, " ")}</span>)}
      </div>

      {reportId && !report.template ? (
        <div className="report-export-bar">
          <div className="cite-style-toggle" role="group" aria-label="Citation style">
            <button type="button" className={style === "vancouver" ? "active" : ""} onClick={() => onStyleChange?.("vancouver")}>Vancouver</button>
            <button type="button" className={style === "ama" ? "active" : ""} onClick={() => onStyleChange?.("ama")}>AMA</button>
          </div>
          <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "docx", style)}>
            <Icon name="doc" size={14} />Word
          </button>
          <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "pptx", style)}>
            <Icon name="doc" size={14} />PowerPoint
          </button>
        </div>
      ) : null}

      {abstract ? (
        <section className="research-section meta-abstract">
          <h4 className="research-heading">Abstract</h4>
          <p className="ai-para"><b>Objective. </b>{abstract.objective}</p>
          <p className="ai-para"><b>Methods. </b>{abstract.methods}</p>
          <p className="ai-para"><b>Results. </b>{abstract.results}</p>
          <p className="ai-para"><b>Conclusions. </b>{renderInline(abstract.conclusions)}</p>
        </section>
      ) : (
        <p className="lead">{renderInline(report.summary)}</p>
      )}
      {report.template ? (
        <p className="tmpl-note">Conservative response ({report.template.replace(/_/g, " ")}).</p>
      ) : null}

      {report.search_method ? (
        <section className="research-section research-method">
          <h4 className="research-heading">Methods &amp; Limitations</h4>
          <p className="ai-para">Databases searched: {report.search_method.databases.join(", ")}.</p>
          {report.search_method.queries.length ? (
            <p className="ai-para">Search queries: {report.search_method.queries.join("; ")}.</p>
          ) : null}
          <p className="ai-para">Search date: {report.search_method.search_date}.</p>
          <p className="ai-para">{report.search_method.inclusion_notes}</p>
          <p className="ai-para">{report.search_method.exclusion_notes}</p>
        </section>
      ) : null}

      {report.sub_questions.length ? (
        <details className="research-plan">
          <summary>What I researched ({report.sub_questions.length} sub-questions)</summary>
          <ul>{report.sub_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </details>
      ) : null}

      {!report.template && report.citations.length ? <EvidenceTable citations={report.citations} onCite={onCite} /> : null}

      {report.sections.map((sec) => (
        <section className="research-section" key={sec.heading}>
          <h4 className="research-heading">{sec.heading}</h4>
          {sec.points.map((p, i) => (
            <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} citeMap={citeMap} onCite={onCite} /></p>
          ))}
        </section>
      ))}

      {report.meta_analysis ? <MetaForestTable meta={report.meta_analysis} onCite={onCite} /> : null}

      {report.safety_notes.length ? (
        <div className="ai-safety">
          <div className="ai-safety-label"><Icon name="shield" size={14} />Safety</div>
          {report.safety_notes.map((p, i) => (
            <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} citeMap={citeMap} onCite={onCite} /></p>
          ))}
        </div>
      ) : null}

      {report.counts ? (
        <details className="research-counts">
          <summary>What we searched ({report.counts.total_retrieved} candidate sources)</summary>
          <p className="muted-note">
            {report.counts.total_retrieved} candidate sources retrieved across {report.counts.n_searches} sub-question searches (each kept its top {report.counts.per_search_cap} by relevance), then merged and de-duplicated — a bounded, top-ranked sample, not an exhaustive census.
          </p>
          <ul>
            {Object.entries(report.counts.per_provider).map(([prov, n]) => (
              <li key={prov}>{abbr(prov)}: {n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {report.gaps?.length ? (
        <div className="research-gaps">
          <div className="muted-label">Evidence gaps</div>
          {report.gaps.map((g, i) => (
            <p className="ai-para" key={i}>
              {g.text}
              {g.corroborating_trials.length ? (
                <span className="gap-trials"> An answer may be coming: {g.corroborating_trials.join(", ")}.</span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      {report.uncertainties.length ? (
        <div className="ai-unclear">
          <div className="muted-label">Still uncertain</div>
          {report.uncertainties.map((p, i) => <p key={i}>{renderInline(p.text)}</p>)}
        </div>
      ) : null}

      {report.citations.length ? <Sources citations={report.citations} style={style} /> : null}
    </div>
  );
}

function CiteChips({ ids, citeMap, onCite }: { ids?: AnswerPoint["citation_ids"]; citeMap: Map<string, string>; onCite: (tag: string) => void }) {
  if (!ids?.length) return null;
  return (
    <>
      {" "}
      {ids.map((id) => {
        const t = normTag(id);
        return (
          <button key={id} type="button" className="cite" onClick={() => onCite(t)} title="Show source" aria-label={`Show source ${t}`}>
            {citeMap.get(t) ?? "REF"}&nbsp;{t}
          </button>
        );
      })}
    </>
  );
}

function Sources({ citations, style }: { citations: Citation[]; style: CitationStyle }) {
  const refs = buildReferenceList(citations, style);
  const byTag = new Map(citations.map((c) => [normTag(c.chunk_tag), c]));
  return (
    <div className="research-sources">
      <div className="ai-block-label">References ({refs.length})</div>
      <ol>
        {refs.map((r) => {
          const c = byTag.get(r.tag);
          const href = safeHref(c?.url ?? null);
          return (
            <li key={r.tag} id={`rep-src-${r.tag}`} className="research-src">
              <span>{r.text}</span>
              {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="ref-link"> ↗</a> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
