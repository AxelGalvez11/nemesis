// Pure Word (.docx) formatter for a ResearchReport. No I/O — builds the document in memory and
// returns a Node Buffer (docx v9.7.1; Packer.toBuffer needs the Node runtime, enforced by the route
// handler's `export const runtime = "nodejs"`). Styled from the shared export design system so it
// reads as the same product as the PDF and PowerPoint exports.
//
// Presentation only: content assembly and every honesty signal (evidence_grade, the unverified
// caution, safety_notes, gaps, counts, the structured-review method block, the attribution) are
// unchanged, so the file is never more authoritative than the screen it came from.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AnswerPoint, Citation, CitationStyle, EvidenceRow, ResearchReport } from "@nemesis/shared";
import { buildAttribution, claimRefMarker, evidenceRows, referenceLines } from "@nemesis/shared";
import { EXPORT_COLORS as C, EXPORT_FONTS as F, EXPORT_TYPE as T } from "./theme.ts";

const pt = (points: number): number => Math.round(points * 2); // docx sizes are half-points

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, size: pt(T.body), color: C.ink, font: F.sans })],
  });
}
function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70, line: 264 },
    children: [new TextRun({ text, size: pt(T.body), color: C.ink, font: F.sans })],
  });
}
function points(ps: AnswerPoint[]): Paragraph[] {
  return ps.map((p) => bullet(`${p.text}${claimRefMarker(p.citation_ids)}`));
}

// Section heading: brand-green serif with a thin green underline rule — the doc's recurring accent.
function heading(text: string, color: string = C.brand): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 90 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: C.brandBright, space: 3 } },
    children: [new TextRun({ text, bold: true, color, font: F.serif, size: pt(T.h1) })],
  });
}

// Evidence-base table (# · Type · Source · Year), mirroring the on-screen review. Rows come from the
// shared evidenceRows helper so the Word file matches the screen exactly; dark header with reversed
// white text, zebra body rows, hairline borders.
function evCell(text: string, opts: { bold?: boolean; color?: string; fill?: string } = {}): TableCell {
  return new TableCell({
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, color: opts.color ?? C.ink, font: F.sans, size: pt(T.small) })] })],
  });
}
function evidenceTable(rows: EvidenceRow[]): Table {
  const hair = { style: BorderStyle.SINGLE, size: 3, color: C.hair };
  const header = new TableRow({
    tableHeader: true,
    children: ["#", "Type", "Source", "Year"].map((t) => evCell(t, { bold: true, color: C.paper, fill: C.headerFill })),
  });
  const rowsOut = rows.map((r, i) => {
    const fill = i % 2 === 1 ? C.zebra : C.paper;
    return new TableRow({ children: [evCell(r.tag, { fill, color: C.brand, bold: true }), evCell(r.type, { fill }), evCell(r.title, { fill }), evCell(r.year, { fill })] });
  });
  // Fixed DXA width (not percentage): percentage-width tables render wrong in Google Docs, where
  // students actually open these. 10080 = US Letter 12240 minus the 1080-twip margins; columns sum to it.
  return new Table({
    width: { size: 10080, type: WidthType.DXA },
    columnWidths: [700, 2100, 6280, 1000],
    borders: { top: hair, bottom: hair, left: hair, right: hair, insideHorizontal: hair, insideVertical: hair },
    rows: [header, ...rowsOut],
  });
}

/** The verification-state line, verbatim from the on-screen honesty banner. */
function verifyLine(report: ResearchReport): string {
  return report.template
    ? `Conservative response (${report.template.replace(/_/g, " ")}).`
    : report.claims_verified
    ? "Each claim was checked against its cited source."
    : "NOT FULLY FACT-CHECKED — the claim-by-claim check could not run; treat with extra caution.";
}

export async function reportToDocx(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];

  // Cover block: kicker, serif title with a green rule, then a shaded honesty card. Deliberately no
  // product branding anywhere in the file (same call as the poster) — the deliverable reads as the
  // user's own work.
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: "EVIDENCE REPORT", bold: true, color: C.brand, font: F.sans, size: pt(T.small) })],
  }));
  children.push(new Paragraph({
    spacing: { after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: C.brandBright, space: 6 } },
    children: [new TextRun({ text: report.question || "Evidence Report", bold: true, color: C.ink, font: F.serif, size: pt(T.title) })],
  }));
  // Honesty card as shaded PARAGRAPHS (not a table): paragraph shading + a green left border can't
  // collapse the way an unsized table cell can in some renderers.
  const cardBorder = { left: { style: BorderStyle.SINGLE, size: 24, color: C.brandBright, space: 8 } };
  children.push(new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: C.tint, color: "auto" },
    border: cardBorder,
    indent: { left: 200 },
    spacing: { before: 80, after: 0 },
    children: [new TextRun({ text: `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`, bold: true, color: C.inkSoft, font: F.sans, size: pt(T.body) })],
  }));
  children.push(new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: C.tint, color: "auto" },
    border: cardBorder,
    indent: { left: 200 },
    spacing: { after: 160 },
    children: [new TextRun({ text: verifyLine(report), color: C.muted, font: F.sans, size: pt(T.body) })],
  }));

  if (report.summary) {
    children.push(heading("Summary"));
    children.push(body(report.summary));
  }

  if (report.search_method) {
    const m = report.search_method;
    children.push(heading("Methods & Limitations"));
    children.push(body(`Databases searched: ${m.databases.join(", ")}.`));
    children.push(body(`Search queries: ${m.queries.join("; ")}.`));
    children.push(body(`Search date: ${m.search_date}.`));
    children.push(body(m.inclusion_notes));
    children.push(body(m.exclusion_notes));
    children.push(body("Automated bounded review; not an exhaustive census or formal systematic review."));
  }

  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    children.push(heading("What we searched"));
    children.push(body(
      `${c.total_retrieved} candidate sources retrieved across ${c.n_searches} sub-question searches ` +
      `(each kept its top ${c.per_search_cap} by relevance), then merged and de-duplicated — ` +
      `a bounded, top-ranked sample, not an exhaustive census. By source: ${per}.`,
    ));
  }

  if (report.citations.length) {
    children.push(heading(`Evidence base (${report.citations.length} sources)`));
    children.push(evidenceTable(evidenceRows(report.citations as Citation[])));
  }

  for (const sec of report.sections) {
    children.push(heading(sec.heading));
    children.push(...points(sec.points));
  }

  if (report.safety_notes.length) {
    children.push(heading("Safety", C.warn));
    children.push(...points(report.safety_notes));
  }

  if (report.gaps?.length) {
    children.push(heading("Evidence gaps"));
    children.push(...report.gaps.map((g) =>
      bullet(g.text + (g.corroborating_trials.length ? ` An answer may be coming: ${g.corroborating_trials.join(", ")}.` : ""))
    ));
  }

  if (report.uncertainties.length) {
    children.push(heading("Still uncertain"));
    children.push(...points(report.uncertainties));
  }

  if (report.citations.length) {
    children.push(heading("References"));
    const refs = referenceLines(report.citations as Citation[], style);
    children.push(...refs.map((r) => new Paragraph({
      spacing: { after: 60 },
      indent: { left: 300, hanging: 300 },
      children: [new TextRun({ text: r, color: C.inkSoft, font: F.sans, size: pt(T.small) })],
    })));
  }

  // Closing attribution: what this document was actually built from, so it's never more authoritative
  // than the screen. Suppressed when there are no citations, matching the on-screen ReportAttribution.
  if (report.citations.length) {
    const attribution = buildAttribution({
      citations: report.citations,
      generatedAt: new Date().toISOString().slice(0, 10),
      mode: (report.mode ?? "standard").replace(/_/g, " "),
    });
    children.push(heading(attribution.headline));
    children.push(...attribution.lines.filter(Boolean).map((line) => body(line)));
  }

  // Running footer: page number only (brand-free, like everything else in the file).
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], color: C.faint, font: F.sans, size: pt(T.tiny) })],
    })],
  });

  const doc = new Document({
    sections: [{
      // Explicit US Letter (matches the PDF export) so the fixed-DXA table width is exact everywhere.
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      footers: { default: footer },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
