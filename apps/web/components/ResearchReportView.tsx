"use client";

import { useMemo, useState } from "react";
import type {
  AnswerPoint,
  Citation,
  CitationStyle,
  DiscoveryClaim,
  DiscoveryReport,
  ResearchGap,
  ResearchHypothesis,
  ResearchReport,
  StudyCharacteristic,
  SuggestedStudyDesign,
  MetaAnalysisResult,
} from "@pharmabro/shared";
import type { ResearchRunRow } from "@/lib/api";
import { buildAttribution, buildMetaAbstract, buildReferenceList, claimEvidenceCounts, evidenceRows } from "@pharmabro/shared";
import { renderInline } from "@/lib/inline-md";
import { normTag } from "@/lib/cite";
import { safeHref } from "@/lib/url";
import { Icon } from "./icons";
import { ForestPlot } from "./ForestPlot";
import { EvidenceChartsSection } from "./EvidenceCharts";
import { downloadReportExport } from "@/lib/api";
import Link from "next/link";
import { engineVisualsEnabled } from "@/lib/env";
import { MissionSheet } from "@/components/MissionSheet";
import { ResearchProgress } from "./ResearchProgress";

const PROVIDER_ABBR: Record<string, string> = {
  openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", europepmc: "PMID",
  clinicaltrials: "NCT", faers: "FAERS", rxnorm: "RxNorm", medlineplus: "NLM",
};
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function shortText(value: string, max = 140): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

function EvidenceLinkButton({ tag, label, onCite }: { tag: string; label: string; onCite: (tag: string) => void }) {
  const normalized = normTag(tag);
  return (
    <button type="button" className="discovery-cite" onClick={() => onCite(normalized)} aria-label={`Show source ${normalized}`}>
      <span>{label}</span>
      <b>{normalized}</b>
    </button>
  );
}

// A study/evidence-characteristics table — the at-a-glance "body of evidence" a review opens with.
// Rows come from the shared `evidenceRows` helper (pure, from report.citations metadata already
// shown in the reference list), so this table is identical to the one in the docx/pptx exports.
function EvidenceTable({ citations, reviewed, onCite }: { citations: Citation[]; reviewed?: Citation[]; onCite: (tag: string) => void }) {
  const citedRows = evidenceRows(citations);
  // "Also reviewed": sources gathered into the pool (agentic web loop + wider DB retrieval) that the
  // writer didn't cite. Surfaced so the evidence base reflects the FULL breadth searched, not just the
  // handful cited. Display-only — their tags aren't in the citeMap, so they render as plain rows.
  const reviewedRows = reviewed?.length ? evidenceRows(reviewed) : [];
  const total = citedRows.length + reviewedRows.length;
  return (
    <section className="research-section">
      <h4 className="research-heading">Evidence base ({total} sources)</h4>
      <div className="evidence-table-wrap">
        <table className="evidence-table">
          <thead>
            <tr><th>#</th><th>Type</th><th>Source</th><th>Year</th></tr>
          </thead>
          <tbody>
            {citedRows.map((r) => (
              <tr key={r.tag}>
                <td><button type="button" className="cite" onClick={() => onCite(r.tag)} aria-label={`Show source ${r.tag}`}>{r.tag}</button></td>
                <td>{r.type}</td>
                <td className="evidence-table-title" title={r.title}>{r.title}</td>
                <td>{r.year}</td>
              </tr>
            ))}
            {reviewedRows.length ? (
              <tr className="evidence-reviewed-head"><td colSpan={4}>Also reviewed ({reviewedRows.length})</td></tr>
            ) : null}
            {reviewedRows.map((r) => (
              <tr key={`rev-${r.tag}`} className="evidence-reviewed-row">
                <td>{r.tag}</td>
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

// "Characteristics of included studies": the journal-standard table of the RAW extracted data — the
// 2x2 event counts behind the pool, one row per study, with the crude event rate. Every value comes
// straight from report.meta_analysis.studies (read verbatim from each source, never computed by an
// LLM); the crude % is a trivial honest division. This table is the auditable data; the forest table
// below it is the computed effects.
function MetaStudyCharacteristics({ meta, onCite }: { meta: MetaAnalysisResult; onCite: (tag: string) => void }) {
  if (!meta.poolable) return null;
  const arm = (e: number, n: number) => `${e}/${n}${n > 0 ? ` (${((e / n) * 100).toFixed(1)}%)` : ""}`;
  const outcome = meta.studies[0]?.outcome_label;
  const totalN = meta.studies.reduce((acc, s) => acc + s.total_treatment + s.total_control, 0);
  return (
    <section className="research-section">
      <h4 className="research-heading">Characteristics of included studies</h4>
      <p className="muted-note">
        {meta.k} studies{outcome ? <> · outcome: <b>{outcome}</b></> : null} · {totalN.toLocaleString()} participants. Event counts are read verbatim from each source.
      </p>
      <div className="evidence-table-wrap">
        <table className="evidence-table study-char-table">
          <thead>
            <tr><th>Study</th><th>Intervention (events/N)</th><th>Control (events/N)</th><th>Participants</th></tr>
          </thead>
          <tbody>
            {meta.studies.map((s) => (
              <tr key={s.citation_tag}>
                <td>
                  <button type="button" className="cite" onClick={() => onCite(normTag(s.citation_tag))} aria-label={`Show source ${s.citation_tag}`}>{normTag(s.citation_tag)}</button>
                  {" "}{s.label}
                </td>
                <td className="mono">{arm(s.events_treatment, s.total_treatment)}</td>
                <td className="mono">{arm(s.events_control, s.total_control)}</td>
                <td className="mono">{(s.total_treatment + s.total_control).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiscoveryPanel({ discovery, citeMap, onCite }: { discovery: DiscoveryReport; citeMap: Map<string, string>; onCite: (tag: string) => void }) {
  const topClaims = discovery.claims.slice(0, 4);
  const topStudies = discovery.study_characteristics.slice(0, 5);
  const topGaps = discovery.research_gaps.slice(0, 5);
  const topHypotheses = discovery.hypotheses.slice(0, 4);
  const topDesigns = discovery.study_designs.slice(0, 2);
  return (
    <section className="research-section discovery-section">
      <div className="discovery-head">
        <div>
          <div className="muted-label">Discovery engine</div>
          <h4 className="research-heading">Research gaps and next-study map</h4>
          <p className="muted-note">{discovery.summary}</p>
        </div>
        <span className="discovery-meter">{humanize(discovery.evidence_meter)}</span>
      </div>

      <div className="discovery-stats" aria-label="Discovery report summary">
        <span><b>{discovery.claims.length}</b> claims</span>
        <span><b>{discovery.study_characteristics.length}</b> extracted studies</span>
        <span><b>{discovery.research_gaps.length}</b> gaps</span>
        <span><b>{discovery.study_designs.length}</b> study designs</span>
      </div>

      {topClaims.length ? <DiscoveryClaims claims={topClaims} citeMap={citeMap} onCite={onCite} /> : null}
      {topStudies.length ? <DiscoveryStudyTable studies={topStudies} onCite={onCite} /> : null}

      <div className="discovery-two-col">
        {topGaps.length ? <DiscoveryGaps gaps={topGaps} citeMap={citeMap} onCite={onCite} /> : null}
        {topHypotheses.length ? <DiscoveryHypotheses hypotheses={topHypotheses} /> : null}
      </div>

      {topDesigns.length ? <DiscoveryStudyDesigns designs={topDesigns} /> : null}
      {discovery.monitor_terms.length ? (
        <p className="discovery-monitor">
          <span>Monitor terms</span>
          {discovery.monitor_terms.slice(0, 10).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function DiscoveryClaims({ claims, citeMap, onCite }: { claims: DiscoveryClaim[]; citeMap: Map<string, string>; onCite: (tag: string) => void }) {
  return (
    <div className="discovery-block">
      <h5>Claim cards</h5>
      <div className="discovery-claim-grid">
        {claims.map((claim) => {
          const counts = claimEvidenceCounts(claim);
          return (
            <article className="discovery-card" key={claim.id}>
              <div className="discovery-card-top">
                <span className={`discovery-status ${claim.verdict}`}>{humanize(claim.verdict)}</span>
                <span>{humanize(claim.confidence)} confidence</span>
              </div>
              <p className="discovery-claim-text">{claim.claim_text}</p>
              {claim.rationale ? <p className="discovery-card-note">{claim.rationale}</p> : null}
              <div className="discovery-relations" aria-label="Evidence relation counts">
                {Object.entries(counts).filter(([, n]) => n > 0).map(([relation, n]) => (
                  <span className={`discovery-relation ${relation}`} key={relation}>{humanize(relation)} {n}</span>
                ))}
              </div>
              {claim.evidence.length ? (
                <div className="discovery-cites">
                  {claim.evidence.slice(0, 3).map((ev) => (
                    <EvidenceLinkButton
                      key={`${claim.id}-${ev.citation_tag}`}
                      tag={ev.citation_tag}
                      label={`${citeMap.get(normTag(ev.citation_tag)) ?? "REF"} · ${humanize(ev.relation)}`}
                      onCite={onCite}
                    />
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function DiscoveryStudyTable({ studies, onCite }: { studies: StudyCharacteristic[]; onCite: (tag: string) => void }) {
  return (
    <div className="discovery-block">
      <h5>Evidence extraction</h5>
      <div className="evidence-table-wrap">
        <table className="evidence-table discovery-study-table">
          <thead>
            <tr><th>#</th><th>Design</th><th>Population</th><th>Outcomes / limits</th></tr>
          </thead>
          <tbody>
            {studies.map((s) => (
              <tr key={`${s.source_id}-${s.citation_tag}`}>
                <td><button type="button" className="cite" onClick={() => onCite(normTag(s.citation_tag))} aria-label={`Show source ${s.citation_tag}`}>{normTag(s.citation_tag)}</button></td>
                <td><b>{s.study_type}</b><br /><span>{shortText(s.title, 80)}</span></td>
                <td>{s.population ? shortText(s.population, 70) : "Not specified"}</td>
                <td>
                  {s.outcomes.length ? <span>{s.outcomes.slice(0, 3).join(", ")}</span> : <span>No outcome extracted</span>}
                  {s.limitations.length ? <small>{s.limitations.slice(0, 2).join("; ")}</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiscoveryGaps({ gaps, citeMap, onCite }: { gaps: ResearchGap[]; citeMap: Map<string, string>; onCite: (tag: string) => void }) {
  return (
    <div className="discovery-block">
      <h5>Research gaps</h5>
      <div className="discovery-detail-list">
        {gaps.map((gap, i) => (
          <details className="discovery-detail" key={gap.id} open={i === 0}>
            <summary>
              <span>{humanize(gap.dimension)}</span>
              <b className={`gap-severity ${gap.severity}`}>{gap.severity}</b>
            </summary>
            <p>{gap.description}</p>
            <p className="discovery-card-note">{gap.rationale}</p>
            {gap.source_tags.length ? (
              <div className="discovery-cites">
                {gap.source_tags.slice(0, 3).map((tag) => (
                  <EvidenceLinkButton key={`${gap.id}-${tag}`} tag={tag} label={citeMap.get(normTag(tag)) ?? "REF"} onCite={onCite} />
                ))}
              </div>
            ) : null}
          </details>
        ))}
      </div>
    </div>
  );
}

function DiscoveryHypotheses({ hypotheses }: { hypotheses: ResearchHypothesis[] }) {
  return (
    <div className="discovery-block">
      <h5>Hypotheses</h5>
      <div className="discovery-detail-list">
        {hypotheses.map((h) => (
          <article className="discovery-mini" key={h.id}>
            <div className="discovery-card-top">
              <span className={`gap-severity ${h.priority}`}>{h.priority} priority</span>
            </div>
            <p className="discovery-claim-text">{h.hypothesis}</p>
            <p className="discovery-card-note">{h.uncertainty}</p>
            {h.why_plausible.length ? (
              <ul>
                {h.why_plausible.slice(0, 3).map((why) => <li key={why}>{why}</li>)}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function DiscoveryStudyDesigns({ designs }: { designs: SuggestedStudyDesign[] }) {
  return (
    <div className="discovery-block">
      <h5>Suggested next study</h5>
      <div className="discovery-design-list">
        {designs.map((d) => (
          <article className="discovery-design" key={d.id}>
            <div className="discovery-card-top">
              <span>{humanize(d.design_type)}</span>
              <b>{d.feasibility} feasibility</b>
            </div>
            <p className="discovery-claim-text">{d.research_question}</p>
            <dl>
              <div><dt>Population</dt><dd>{d.population}</dd></div>
              <div><dt>Intervention</dt><dd>{d.intervention}</dd></div>
              <div><dt>Comparator</dt><dd>{d.comparator}</dd></div>
              <div><dt>Primary endpoint</dt><dd>{d.primary_endpoint}</dd></div>
              <div><dt>Duration</dt><dd>{d.duration}</dd></div>
            </dl>
            <p className="discovery-card-note">{d.sample_size_notes}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Renders a finished Deep Research report: summary, verification state, themed cited sections,
 *  prominent safety, honest uncertainties, and a numbered sources list. Citation chips scroll to the
 *  matching source. Visual language matches the /ask Answer (same classes) so it feels like one app. */
export function ResearchReportView({ report, reportId, run, style = "vancouver", onStyleChange }: { report: ResearchReport; reportId?: string; run?: ResearchRunRow | null; style?: CitationStyle; onStyleChange?: (s: CitationStyle) => void }) {
  const [showMission, setShowMission] = useState(false);
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
  const isLabDraft = report.mode === "lab_draft";
  // For lab_draft reports the first safety note IS the disclaimer banner — pull it out so it renders
  // as a prominent notice at the top, not buried in the safety block with drug-interaction warnings.
  const labDraftDisclaimer = isLabDraft ? report.safety_notes[0]?.text ?? null : null;
  const remainingSafetyNotes = isLabDraft ? report.safety_notes.slice(1) : report.safety_notes;
  // A meta report opens with a journal-style structured abstract (Results computed from the pool, not
  // narrated). When present it carries the bottom line, so the plain lead paragraph is omitted.
  const abstract = buildMetaAbstract(report);
  // For a poolable meta report we lay the body out in journal IMRaD order: Abstract -> Methods ->
  // Results (the computed meta tables) -> Discussion (the narrative sections). Introduction is folded
  // into the abstract's Objective. We only REORDER + GROUP existing pieces under standard headings —
  // no prose is relabeled or invented.
  const isMeta = report.meta_analysis?.poolable === true;
  const sectionEls = report.sections.map((sec) => (
    <section className="research-section" key={sec.heading}>
      <h4 className="research-heading">{sec.heading}</h4>
      {sec.points.map((p, i) => (
        <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} citeMap={citeMap} onCite={onCite} /></p>
      ))}
    </section>
  ));

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
        <div className="report-export-bar-wrap">
          <div className="report-export-bar">
            <div className="cite-style-toggle" role="group" aria-label="Citation style">
              <button type="button" className={style === "vancouver" ? "active" : ""} onClick={() => onStyleChange?.("vancouver")}>Vancouver</button>
              <button type="button" className={style === "ama" ? "active" : ""} onClick={() => onStyleChange?.("ama")}>AMA</button>
            </div>
            <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "pdf", style)}>
              <Icon name="doc" size={14} />PDF (cited)
            </button>
            <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "docx", style)}>
              <Icon name="doc" size={14} />Word (cited)
            </button>
            <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "pptx", style)}>
              <Icon name="doc" size={14} />PowerPoint (cited)
            </button>
            {/* Poster = a print-ready cited conference poster generated from this report (the
                ResearchPoster component, now wired to a live route). Opens the poster view where
                Print/Save-as-PDF produces the 48x36 board. */}
            <Link className="chip-action" href={`/app/reports/${reportId}/poster`}>
              <Icon name="doc" size={14} />Poster
            </Link>
            <button type="button" className="chip-action" onClick={() => setShowMission((v) => !v)} aria-expanded={showMission}>
              <Icon name="bell" size={14} />Repeat this research
            </button>
          </div>
          <p className="muted-note">Every claim carries its sources — the references and build method are inside the file.</p>
          {showMission ? (
            <MissionSheet question={report.question} reportMode={report.mode ?? "standard"} onClose={() => setShowMission(false)} />
          ) : null}

          {run?.progress?.length ? (
            <details className="report-activity">
              <summary className="ai-block-label" style={{ cursor: "pointer" }}>
                <Icon name="sparkle" size={14} /> How this report was researched
              </summary>
              <ResearchProgress steps={run.progress} done />
            </details>
          ) : null}
        </div>
      ) : null}

      {labDraftDisclaimer ? (
        <div className="lab-draft-notice">
          <Icon name="shield" size={14} />
          <span>{labDraftDisclaimer}</span>
        </div>
      ) : null}

      {report.paper_meta ? (
        <p className="muted-note appraisal-paper-line">
          <Icon name="doc" size={13} /> Appraisal of {report.paper_meta.title ?? "an uploaded paper"}
          {report.paper_meta.pages ? ` · ${report.paper_meta.pages} pages` : ""}
          {report.paper_meta.truncated ? " · long paper, appraised from its leading text" : ""}
        </p>
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
          <p className="ai-para">Automated bounded review; not an exhaustive census or formal systematic review.</p>
        </section>
      ) : null}

      {report.sub_questions.length ? (
        <details className="research-plan">
          <summary>What I researched ({report.sub_questions.length} sub-questions)</summary>
          <ul>{report.sub_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </details>
      ) : null}

      {!report.template && report.citations.length ? <EvidenceTable citations={report.citations} reviewed={report.reviewed_sources} onCite={onCite} /> : null}
      {/* Evidence-at-a-glance figures (study-design mix + publications-by-year) from the report's real cited
          sources. Each self-suppresses when the data is too thin. Behind NEXT_PUBLIC_ENGINE_VISUALS (default off). */}
      {engineVisualsEnabled && !report.template && report.citations.length ? (
        <EvidenceChartsSection citations={report.citations} />
      ) : null}
      {report.discovery ? <DiscoveryPanel discovery={report.discovery} citeMap={citeMap} onCite={onCite} /> : null}

      {isMeta ? (
        <>
          <h3 className="research-imrad-heading">Results</h3>
          {report.meta_analysis ? <MetaStudyCharacteristics meta={report.meta_analysis} onCite={onCite} /> : null}
          {report.meta_analysis ? <MetaForestTable meta={report.meta_analysis} onCite={onCite} /> : null}
          {report.sections.length ? <h3 className="research-imrad-heading">Discussion</h3> : null}
          {sectionEls}
        </>
      ) : (
        sectionEls
      )}

      {remainingSafetyNotes.length ? (
        <div className="ai-safety">
          <div className="ai-safety-label"><Icon name="shield" size={14} />Safety</div>
          {remainingSafetyNotes.map((p, i) => (
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

      {report.appraisal_questions?.length ? (
        <div className="research-questions">
          <div className="muted-label">Discussion questions</div>
          <ol>
            {report.appraisal_questions.map((q, i) => <li key={i}>{renderInline(q)}</li>)}
          </ol>
        </div>
      ) : null}

      {report.uncertainties.length ? (
        <div className="ai-unclear">
          <div className="muted-label">Still uncertain</div>
          {report.uncertainties.map((p, i) => <p key={i}>{renderInline(p.text)}</p>)}
        </div>
      ) : null}

      {report.citations.length ? <Sources citations={report.citations} style={style} /> : null}
      <ReportAttribution report={report} />
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

// NotebookLM-style "Built from N sources · method · date" footer — a quiet, honest recap of what the
// report was actually built from. Pure buildAttribution() does the counting; this only renders it.
// Additive: report.mode/search_method are optional, so older saved reports degrade to "standard" with
// no date rather than erroring or showing a stale/fabricated timestamp.
function ReportAttribution({ report }: { report: ResearchReport }) {
  if (report.template || !report.citations.length) return null;
  const attribution = buildAttribution({
    citations: report.citations,
    generatedAt: report.search_method?.search_date ?? "",
    mode: (report.mode ?? "standard").replace(/_/g, " "),
  });
  return (
    <div className="research-attribution">
      <p className="attribution-headline">{attribution.headline}</p>
      {attribution.lines.filter(Boolean).map((line, i) => (
        <p className="muted-note" key={i}>{line}</p>
      ))}
    </div>
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
