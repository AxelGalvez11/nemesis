// Pure PowerPoint (.pptx) formatter for a ResearchReport. Builds in memory and returns a Node
// Buffer (pptxgenjs v4.0.1; write({ outputType: "nodebuffer" }) needs the Node runtime). A
// briefing deck: title + honesty, summary, each section, safety, gaps, references.
import pptxgen from "pptxgenjs";
import type { AnswerPoint, Citation, CitationStyle, EvidenceRow, ResearchReport } from "@pharmabro/shared";
import { buildAttribution, claimRefMarker, evidenceRows, referenceLines } from "@pharmabro/shared";

type Run = { text: string; options: { bullet: boolean; breakLine: boolean } };
function bullets(ps: AnswerPoint[]): Run[] {
  return ps.map((p) => ({ text: `${p.text}${claimRefMarker(p.citation_ids)}`, options: { bullet: true, breakLine: true } }));
}

function contentSlide(pptx: pptxgen, title: string, runs: Run[]): void {
  const slide = pptx.addSlide();
  slide.addText(title, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: "1A1A1A" });
  if (runs.length) {
    slide.addText(runs, { x: 0.5, y: 1.2, w: 12.3, h: 5.6, fontSize: 15, color: "363636", valign: "top" });
  }
}

// Evidence-base table slide (# · Type · Source · Year), mirroring the on-screen review. Rows come
// from the shared evidenceRows helper so the deck matches the screen exactly.
function evidenceSlide(pptx: pptxgen, rows: EvidenceRow[]): void {
  const slide = pptx.addSlide();
  slide.addText(`Evidence base (${rows.length} sources)`, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: "1A1A1A" });
  const head = ["#", "Type", "Source", "Year"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" } } }));
  const body = rows.map((r) => [r.tag, r.type, r.title, r.year].map((t) => ({ text: t, options: {} })));
  slide.addTable([head, ...body], {
    x: 0.5, y: 1.2, w: 12.3, fontSize: 12, color: "363636", border: { type: "solid", pt: 1, color: "DDDDDD" },
    colW: [0.8, 2.6, 7.3, 1.6], valign: "top",
  });
}

export async function reportToPptx(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.author = "PharmaOrb";
  pptx.title = report.question || "Evidence Report";
  pptx.layout = "LAYOUT_WIDE";

  // Title slide + honesty.
  const title = pptx.addSlide();
  title.addText(report.question || "Evidence Report", { x: 0.5, y: 1.8, w: 12.3, h: 1.4, fontSize: 30, bold: true, color: "1A1A1A" });
  const verify = report.template
    ? `Conservative response (${report.template.replace(/_/g, " ")}).`
    : report.claims_verified
    ? "Each claim was checked against its cited source."
    : "NOT FULLY FACT-CHECKED — the claim-by-claim check could not run; treat with extra caution.";
  title.addText(
    [
      { text: `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`, options: { breakLine: true } },
      { text: verify, options: { breakLine: true } },
    ],
    { x: 0.5, y: 3.4, w: 12.3, h: 1.5, fontSize: 14, color: "5A5A5A" },
  );

  if (report.summary) contentSlide(pptx, "Summary", [{ text: report.summary, options: { bullet: false, breakLine: true } }]);

  if (report.search_method) {
    const m = report.search_method;
    contentSlide(pptx, "Methods & Limitations", [
      { text: `Databases: ${m.databases.join(", ")}`, options: { bullet: true, breakLine: true } },
      { text: `Search queries: ${m.queries.join("; ")}`, options: { bullet: true, breakLine: true } },
      { text: `Search date: ${m.search_date}`, options: { bullet: true, breakLine: true } },
      { text: m.inclusion_notes, options: { bullet: true, breakLine: true } },
      { text: m.exclusion_notes, options: { bullet: true, breakLine: true } },
      { text: "Automated bounded review; not an exhaustive census or formal systematic review.", options: { bullet: true, breakLine: true } },
    ]);
  }

  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    contentSlide(pptx, "What we searched", [
      { text: `${c.total_retrieved} candidate sources retrieved across ${c.n_searches} sub-question searches (each kept its top ${c.per_search_cap} by relevance), then merged and de-duplicated — a bounded, top-ranked sample, not an exhaustive census.`, options: { bullet: true, breakLine: true } },
      { text: `By source: ${per}.`, options: { bullet: true, breakLine: true } },
    ]);
  }

  if (report.citations.length) evidenceSlide(pptx, evidenceRows(report.citations as Citation[]));

  for (const sec of report.sections) contentSlide(pptx, sec.heading, bullets(sec.points));
  if (report.safety_notes.length) contentSlide(pptx, "Safety", bullets(report.safety_notes));
  if (report.gaps?.length) {
    contentSlide(pptx, "Evidence gaps", report.gaps.map((g) => ({
      text: g.text + (g.corroborating_trials.length ? ` An answer may be coming: ${g.corroborating_trials.join(", ")}.` : ""),
      options: { bullet: true, breakLine: true },
    })));
  }
  if (report.appraisal_questions?.length) {
    contentSlide(pptx, "Discussion questions", report.appraisal_questions.map((q) => ({
      text: q, options: { bullet: true, breakLine: true },
    })));
  }
  if (report.uncertainties.length) contentSlide(pptx, "Still uncertain", bullets(report.uncertainties));

  if (report.citations.length) {
    const refs = referenceLines(report.citations as Citation[], style);
    contentSlide(pptx, "References", refs.map((r) => ({ text: r, options: { bullet: false, breakLine: true } })));
  }

  // Closing attribution slide: what this deck was actually built from, so it's never more
  // authoritative than the screen it came from. Suppressed when there are no citations, matching
  // the on-screen ReportAttribution (which returns null for a zero-citation report).
  if (report.citations.length) {
    const attribution = buildAttribution({
      citations: report.citations,
      generatedAt: new Date().toISOString().slice(0, 10),
      mode: (report.mode ?? "standard").replace(/_/g, " "), // fallback matches on-screen ReportAttribution
    });
    contentSlide(pptx, attribution.headline, attribution.lines.filter(Boolean).map((line) => ({
      text: line, options: { bullet: false, breakLine: true },
    })));
  }

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buf;
}
