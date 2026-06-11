"use client";

import { useMemo } from "react";
import type { AnswerPoint, Citation, CitationStyle, ResearchReport } from "@pharmabro/shared";
import { buildReferenceList } from "@pharmabro/shared";
import { renderInline } from "@/lib/inline-md";
import { normTag } from "@/lib/cite";
import { safeHref } from "@/lib/url";
import { Icon } from "./icons";
import { downloadReportExport } from "@/lib/api";

const PROVIDER_ABBR: Record<string, string> = {
  openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", europepmc: "PMID",
  clinicaltrials: "NCT", faers: "FAERS", rxnorm: "RxNorm",
};
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
}

// Readable source-type labels for the evidence-base table (built from the existing citations — no
// engine call, no new prose, so it carries no safety-scan / citation-namespace implications).
const SOURCE_TYPE_LABEL: Record<string, string> = {
  openfda: "Drug label", dailymed: "Drug label",
  clinicaltrials: "Clinical trial", trial: "Clinical trial",
  pubmed: "Study", pubmed_oa: "Study", europepmc: "Study",
  faers: "Adverse-event report", rxnorm: "Drug reference",
};
function sourceTypeLabel(t: string): string {
  return SOURCE_TYPE_LABEL[t] ?? t.replace(/_/g, " ");
}
function citationYear(c: Citation): string {
  if (typeof c.year === "number") return String(c.year);
  const m = /^(\d{4})/.exec(c.published_date ?? "");
  return m?.[1] ?? "—";
}

// A study/evidence-characteristics table — the at-a-glance "body of evidence" a review opens with.
// Rendered purely from report.citations metadata already shown in the reference list.
function EvidenceTable({ citations, onCite }: { citations: Citation[]; onCite: (tag: string) => void }) {
  return (
    <section className="research-section">
      <h4 className="research-heading">Evidence base ({citations.length} sources)</h4>
      <div className="evidence-table-wrap">
        <table className="evidence-table">
          <thead>
            <tr><th>#</th><th>Type</th><th>Source</th><th>Year</th></tr>
          </thead>
          <tbody>
            {citations.map((c) => {
              const tag = normTag(c.chunk_tag);
              return (
                <tr key={tag}>
                  <td><button type="button" className="cite" onClick={() => onCite(tag)} aria-label={`Show source ${tag}`}>{tag}</button></td>
                  <td>{sourceTypeLabel(c.source_type)}</td>
                  <td className="evidence-table-title" title={c.title ?? undefined}>{c.title ?? "—"}</td>
                  <td>{citationYear(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

      <p className="lead">{renderInline(report.summary)}</p>
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
