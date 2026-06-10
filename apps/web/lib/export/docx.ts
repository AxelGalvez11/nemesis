// Pure Word (.docx) formatter for a ResearchReport. No I/O, no filesystem write — builds the
// document in memory and returns a Node Buffer (docx v9.7.1; Packer.toBuffer needs the Node
// runtime, enforced by the route handler's `export const runtime = "nodejs"`).
//
// Honesty carry-through: evidence_grade, the unverified caution, safety_notes, gaps, counts,
// and (structured_review) the method block are all emitted so the file is never more
// authoritative than the screen.
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { AnswerPoint, Citation, CitationStyle, ResearchReport } from "@pharmabro/shared";
import { buildReferenceList } from "@pharmabro/shared";

function para(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}
function bullet(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 } });
}
function points(ps: AnswerPoint[]): Paragraph[] {
  return ps.map((p) => bullet(p.text));
}

export async function reportToDocx(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: report.question || "Evidence Report", bold: true })],
  }));

  // Honesty banner up top: grade + verification state.
  const gradeLine = `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`;
  const verifyLine = report.template
    ? `Conservative response (${report.template.replace(/_/g, " ")}).`
    : report.claims_verified
    ? "Each claim was checked against its cited source."
    : "NOT FULLY FACT-CHECKED — the claim-by-claim check could not run; treat with extra caution.";
  children.push(para(gradeLine));
  children.push(para(verifyLine));

  if (report.summary) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Summary")] }));
    children.push(para(report.summary));
  }

  // Structured-review method block (only when present).
  if (report.search_method) {
    const m = report.search_method;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Methods & Limitations")] }));
    children.push(para(`Databases searched: ${m.databases.join(", ")}.`));
    children.push(para(`Search queries: ${m.queries.join("; ")}.`));
    children.push(para(`Search date: ${m.search_date}.`));
    children.push(para(m.inclusion_notes));
    children.push(para(m.exclusion_notes));
  }

  // "What we searched" counts (honest cap disclosure; never "records identified").
  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What we searched")] }));
    children.push(para(
      `${c.total_retrieved} candidate sources retrieved (top-ranked by relevance, capped at ` +
      `${c.cap_per_source} per source — not an exhaustive census). By source: ${per}.`,
    ));
  }

  for (const sec of report.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(sec.heading)] }));
    children.push(...points(sec.points));
  }

  if (report.safety_notes.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Safety")] }));
    children.push(...points(report.safety_notes));
  }

  if (report.gaps?.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Evidence gaps")] }));
    children.push(...report.gaps.map((g) => bullet(g.text)));
  }

  if (report.uncertainties.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Still uncertain")] }));
    children.push(...points(report.uncertainties));
  }

  if (report.citations.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("References")] }));
    const refs = buildReferenceList(report.citations as Citation[], style);
    children.push(...refs.map((r) => new Paragraph({ children: [new TextRun(`${r.n}. ${r.text}`)] })));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
