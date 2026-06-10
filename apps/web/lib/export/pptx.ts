// Pure PowerPoint (.pptx) formatter for a ResearchReport. Builds in memory and returns a Node
// Buffer (pptxgenjs v4.0.1; write({ outputType: "nodebuffer" }) needs the Node runtime). A
// briefing deck: title + honesty, summary, each section, safety, gaps, references.
import pptxgen from "pptxgenjs";
import type { AnswerPoint, Citation, CitationStyle, ResearchReport } from "@pharmabro/shared";
import { buildReferenceList } from "@pharmabro/shared";

type Run = { text: string; options: { bullet: boolean; breakLine: boolean } };
function bullets(ps: AnswerPoint[]): Run[] {
  return ps.map((p) => ({ text: p.text, options: { bullet: true, breakLine: true } }));
}

function contentSlide(pptx: pptxgen, title: string, runs: Run[]): void {
  const slide = pptx.addSlide();
  slide.addText(title, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: "1A1A1A" });
  if (runs.length) {
    slide.addText(runs, { x: 0.5, y: 1.2, w: 12.3, h: 5.6, fontSize: 15, color: "363636", valign: "top" });
  }
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
    ]);
  }

  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    contentSlide(pptx, "What we searched", [
      { text: `${c.total_retrieved} candidate sources retrieved (top-ranked by relevance, capped at ${c.cap_per_source} per source — not an exhaustive census).`, options: { bullet: true, breakLine: true } },
      { text: `By source: ${per}.`, options: { bullet: true, breakLine: true } },
    ]);
  }

  for (const sec of report.sections) contentSlide(pptx, sec.heading, bullets(sec.points));
  if (report.safety_notes.length) contentSlide(pptx, "Safety", bullets(report.safety_notes));
  if (report.gaps?.length) {
    contentSlide(pptx, "Evidence gaps", report.gaps.map((g) => ({ text: g.text, options: { bullet: true, breakLine: true } })));
  }
  if (report.uncertainties.length) contentSlide(pptx, "Still uncertain", bullets(report.uncertainties));

  if (report.citations.length) {
    const refs = buildReferenceList(report.citations as Citation[], style);
    contentSlide(pptx, "References", refs.map((r) => ({ text: `${r.n}. ${r.text}`, options: { bullet: false, breakLine: true } })));
  }

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buf;
}
