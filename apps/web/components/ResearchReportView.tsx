"use client";

import { useMemo } from "react";
import type { AnswerPoint, Citation, CitationStyle, ResearchReport } from "@pharmabro/shared";
import { renderInline } from "@/lib/inline-md";
import { normTag } from "@/lib/cite";
import { safeHref } from "@/lib/url";
import { Icon } from "./icons";
import { downloadReportExport } from "@/lib/api";

const PROVIDER_ABBR: Record<string, string> = {
  openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID",
  clinicaltrials: "NCT", faers: "FAERS", rxnorm: "RxNorm",
};
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
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

      {report.sub_questions.length ? (
        <details className="research-plan">
          <summary>What I researched ({report.sub_questions.length} sub-questions)</summary>
          <ul>{report.sub_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </details>
      ) : null}

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

      {report.uncertainties.length ? (
        <div className="ai-unclear">
          <div className="muted-label">Still uncertain</div>
          {report.uncertainties.map((p, i) => <p key={i}>{renderInline(p.text)}</p>)}
        </div>
      ) : null}

      {report.citations.length ? <Sources citations={report.citations} /> : null}
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

function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className="research-sources">
      <div className="ai-block-label">Sources ({citations.length})</div>
      <ol>
        {citations.map((c) => {
          const href = safeHref(c.url);
          return (
            <li key={c.chunk_tag} id={`rep-src-${normTag(c.chunk_tag)}`} className="research-src">
              <span className="src-prov">{abbr(c.source_type)}</span>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">{c.title ?? href}</a>
              ) : (
                <span>{c.title ?? c.source_id}</span>
              )}
              {c.published_date ? <small className="src-date"> · {c.published_date}</small> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
