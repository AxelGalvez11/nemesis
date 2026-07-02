// Lightweight PDF formatter for a ResearchReport. It emits a simple text-first PDF with the same
// honesty signals as the screen/docx/pptx exports. No browser or native PDF dependency needed.
import type { AnswerPoint, Citation, CitationStyle, EvidenceRow, ResearchReport } from "@pharmabro/shared";
import { claimRefMarker, evidenceRows, referenceLines } from "@pharmabro/shared";

interface PdfLine {
  text: string;
  size?: number;
  gap?: number;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 50;
const TOP_Y = 760;
const BOTTOM_Y = 52;
const BODY_SIZE = 10.5;
const HEADING_SIZE = 15;
const LINE_H = 14;

export function reportToPdf(report: ResearchReport, style: CitationStyle): Buffer {
  const lines = buildLines(report, style);
  const pages = paginate(lines);
  return buildPdf(pages);
}

function buildLines(report: ResearchReport, style: CitationStyle): PdfLine[] {
  const lines: PdfLine[] = [
    { text: report.question || "Evidence Report", size: 20, gap: 10 },
    { text: `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}` },
    {
      text: report.template
        ? `Conservative response (${report.template.replace(/_/g, " ")}).`
        : report.claims_verified
        ? "Each claim was checked against its cited source."
        : "NOT FULLY FACT-CHECKED - the claim-by-claim check could not run; treat with extra caution.",
      gap: 10,
    },
  ];

  if (report.summary) section(lines, "Summary", [report.summary]);
  if (report.search_method) {
    const m = report.search_method;
    section(lines, "Methods & Limitations", [
      `Databases searched: ${m.databases.join(", ")}.`,
      m.queries.length ? `Search queries: ${m.queries.join("; ")}.` : "",
      `Search date: ${m.search_date}.`,
      m.inclusion_notes,
      m.exclusion_notes,
      "Automated bounded review; not an exhaustive census or formal systematic review.",
    ]);
  }
  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    section(lines, "What we searched", [
      `${c.total_retrieved} candidate sources retrieved across ${c.n_searches} sub-question searches ` +
      `(each kept its top ${c.per_search_cap} by relevance), then merged and de-duplicated - ` +
      `a bounded, top-ranked sample, not an exhaustive census. By source: ${per}.`,
    ]);
  }
  if (report.citations.length) evidenceSection(lines, evidenceRows(report.citations as Citation[]));
  for (const sec of report.sections) section(lines, sec.heading, sec.points.map(pointText));
  if (report.safety_notes.length) section(lines, "Safety", report.safety_notes.map(pointText));
  if (report.gaps?.length) {
    section(lines, "Evidence gaps", report.gaps.map((g) =>
      g.text + (g.corroborating_trials.length ? ` An answer may be coming: ${g.corroborating_trials.join(", ")}.` : "")
    ));
  }
  if (report.uncertainties.length) section(lines, "Still uncertain", report.uncertainties.map(pointText));
  if (report.citations.length) {
    const refs = referenceLines(report.citations as Citation[], style);
    section(lines, "References", refs);
  }
  return lines;
}

function section(out: PdfLine[], title: string, items: string[]): void {
  out.push({ text: title, size: HEADING_SIZE, gap: 4 });
  for (const item of items) {
    const text = item.trim();
    if (text) out.push({ text, size: BODY_SIZE });
  }
  out.push({ text: "", gap: 8 });
}

function evidenceSection(out: PdfLine[], rows: EvidenceRow[]): void {
  out.push({ text: `Evidence base (${rows.length} sources)`, size: HEADING_SIZE, gap: 4 });
  out.push({ text: "# | Type | Source | Year", size: BODY_SIZE });
  for (const r of rows) out.push({ text: `${r.tag} | ${r.type} | ${r.title} | ${r.year}`, size: BODY_SIZE });
  out.push({ text: "", gap: 8 });
}

function pointText(point: AnswerPoint): string {
  return `${point.text}${claimRefMarker(point.citation_ids)}`;
}

function paginate(lines: PdfLine[]): string[] {
  const pages: string[] = [];
  let y = TOP_Y;
  let stream = "";

  const add = (text: string, size: number): void => {
    if (y < BOTTOM_Y) {
      pages.push(stream);
      stream = "";
      y = TOP_Y;
    }
    stream += `BT /F1 ${size.toFixed(1)} Tf ${MARGIN_X} ${y.toFixed(1)} Td (${escapePdfText(text)}) Tj ET\n`;
    y -= Math.max(LINE_H, size + 3);
  };

  for (const line of lines) {
    if (line.gap) y -= line.gap;
    if (!line.text.trim()) continue;
    const size = line.size ?? BODY_SIZE;
    for (const wrapped of wrap(line.text, size >= HEADING_SIZE ? 64 : 92)) add(wrapped, size);
  }
  if (stream || pages.length === 0) pages.push(stream);
  return pages;
}

function wrap(text: string, max: number): string[] {
  const words = asciiText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildPdf(pageStreams: string[]): Buffer {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const pageIds: number[] = [];
  let nextId = 4;
  for (const stream of pageStreams) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function escapePdfText(text: string): string {
  return asciiText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function asciiText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/²/g, "2")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "");
}
