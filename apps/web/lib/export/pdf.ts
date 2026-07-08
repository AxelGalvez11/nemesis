// Styled PDF formatter for a ResearchReport. Pure in-memory build on pdf-lib (no browser, no native
// dependency): base-14 fonts only (Times for display, Helvetica for body — every PDF viewer ships
// them, nothing is embedded), styled from the shared export design system so it reads as the same
// product as the Word and PowerPoint exports.
//
// Presentation only: content assembly and every honesty signal (grade, unverified caution, methods,
// counts, evidence-base table, attribution) match the screen and the other exporters, so the file is
// never more authoritative than the screen it came from. Deliberately no product branding anywhere
// in the document or its metadata (same call as the poster) — it reads as the user's own work.
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { AnswerPoint, Citation, CitationStyle, EvidenceRow, ResearchReport } from "@pharmabro/shared";
import { buildAttribution, claimRefMarker, evidenceRows, referenceLines } from "@pharmabro/shared";
import { EXPORT_COLORS as C, EXPORT_TYPE as T, pdfRgb } from "./theme.ts";

const PAGE_W = 612; // US Letter, portrait
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_ZONE = 26; // reserved band above the bottom margin for the page number

const col = (hex: string) => rgb(...pdfRgb(hex));

// ---------------------------------------------------------------------------
// Text sanitizing: the base-14 fonts encode WinAnsi (CP1252). Keep everything CP1252 can carry
// (curly quotes, en/em dashes, ×, ², µ, bullets), transliterate common science symbols, fold
// diacritics, and drop the rest — the previous exporter's behavior, but keeping far more.
const CP1252_EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
const REPLACEMENTS: Record<string, string> = {
  "≥": ">=", "≤": "<=", "≈": "~", "→": "->", "←": "<-", "−": "-",
  "α": "alpha", "β": "beta", "γ": "gamma", "μ": "µ",
};

function winAnsi(text: string): string {
  const out: string[] = [];
  for (const ch of text.normalize("NFC")) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch)) {
      out.push(ch);
      continue;
    }
    if (REPLACEMENTS[ch]) {
      out.push(REPLACEMENTS[ch]);
      continue;
    }
    const folded = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    if (folded !== ch && [...folded].every((f) => (f.codePointAt(0) ?? 0) <= 0xff)) out.push(folded);
    // else: drop the glyph (rare; matches the previous exporter)
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// Layout engine: a small top-down cursor. `y` is the BASELINE of the next line to draw (PDF
// coordinates grow upward). Every draw helper reserves space first, so blocks split across pages.
interface Fonts {
  sans: PDFFont;
  sansBold: PDFFont;
  serifBold: PDFFont;
}
interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: Fonts;
}

function newPage(cur: Cursor): void {
  cur.page = cur.doc.addPage([PAGE_W, PAGE_H]);
  cur.y = PAGE_H - MARGIN - 8;
}

function ensure(cur: Cursor, height: number): void {
  if (cur.y - height < MARGIN + FOOTER_ZONE) newPage(cur);
}

/** Hard-break a single overlong token (URLs in references) to fit maxW. */
function hardBreak(word: string, font: PDFFont, size: number, maxW: number): string[] {
  const parts: string[] = [];
  let piece = "";
  for (const ch of word) {
    if (font.widthOfTextAtSize(piece + ch, size) > maxW && piece) {
      parts.push(piece);
      piece = ch;
    } else {
      piece += ch;
    }
  }
  if (piece) parts.push(piece);
  return parts;
}

/** Measured word-wrap (real font metrics, not character counts). */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = winAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const pieces = font.widthOfTextAtSize(word, size) > maxW ? hardBreak(word, font, size, maxW) : [word];
    for (const piece of pieces) {
      const cand = line ? `${line} ${piece}` : piece;
      if (font.widthOfTextAtSize(cand, size) <= maxW || !line) {
        line = cand;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

interface TextStyle {
  size?: number;
  color?: string;
  font?: PDFFont;
  x?: number;
  width?: number;
  lineH?: number;
  after?: number;
}

function drawParagraph(cur: Cursor, text: string, style: TextStyle = {}): void {
  const size = style.size ?? T.body;
  const font = style.font ?? cur.fonts.sans;
  const x = style.x ?? MARGIN;
  const width = style.width ?? CONTENT_W - (x - MARGIN);
  const lineH = style.lineH ?? size * 1.38;
  for (const ln of wrap(text, font, size, width)) {
    ensure(cur, lineH);
    cur.page.drawText(ln, { x, y: cur.y, size, font, color: col(style.color ?? C.ink) });
    cur.y -= lineH;
  }
  cur.y -= style.after ?? 6;
}

/** Bullet with a hanging indent; the marker only on the first line. */
function drawBullet(cur: Cursor, text: string): void {
  const size = T.body;
  const lineH = size * 1.38;
  const indent = 13;
  const lines = wrap(text, cur.fonts.sans, size, CONTENT_W - indent);
  lines.forEach((ln, i) => {
    ensure(cur, lineH);
    if (i === 0) cur.page.drawText("•", { x: MARGIN + 2, y: cur.y, size, font: cur.fonts.sans, color: col(C.brand) });
    cur.page.drawText(ln, { x: MARGIN + indent, y: cur.y, size, font: cur.fonts.sans, color: col(C.ink) });
    cur.y -= lineH;
  });
  cur.y -= 3;
}

/** Section heading: brand-green serif with the thin bright-green underline rule. */
function drawHeading(cur: Cursor, text: string, color: string = C.brand): void {
  ensure(cur, 46);
  cur.y -= 12;
  cur.page.drawText(winAnsi(text), { x: MARGIN, y: cur.y, size: T.h1, font: cur.fonts.serifBold, color: col(color) });
  cur.page.drawRectangle({ x: MARGIN, y: cur.y - 7, width: CONTENT_W, height: 0.9, color: col(C.brandBright) });
  cur.y -= 24;
}

// ---------------------------------------------------------------------------
// Evidence-base table (# · Type · Source · Year), mirroring the on-screen review: dark header with
// reversed white text, zebra body rows, hairline row rules. Long tables continue across pages with
// the header redrawn.
const COLS = [
  { label: "#", w: 26 },
  { label: "Type", w: 96 },
  { label: "Source", w: 332 },
  { label: "Year", w: 50 },
] as const;
const CELL_PAD = 6;

function drawTableHeader(cur: Cursor): void {
  const h = 18;
  ensure(cur, h + 20);
  cur.page.drawRectangle({ x: MARGIN, y: cur.y - h + 11, width: CONTENT_W, height: h, color: col(C.headerFill) });
  let x = MARGIN;
  for (const c of COLS) {
    cur.page.drawText(c.label, { x: x + CELL_PAD, y: cur.y - 2, size: T.small, font: cur.fonts.sansBold, color: col(C.paper) });
    x += c.w;
  }
  cur.y -= h + 3;
}

function drawEvidenceTable(cur: Cursor, rows: EvidenceRow[]): void {
  drawTableHeader(cur);
  const size = T.small;
  const lineH = 11.5;
  rows.forEach((r, i) => {
    const titleLines = wrap(r.title, cur.fonts.sans, size, COLS[2].w - CELL_PAD * 2);
    const rowH = Math.max(16, titleLines.length * lineH + 5);
    if (cur.y - rowH < MARGIN + FOOTER_ZONE) {
      newPage(cur);
      drawTableHeader(cur);
    }
    if (i % 2 === 1) {
      cur.page.drawRectangle({ x: MARGIN, y: cur.y - rowH + 11, width: CONTENT_W, height: rowH, color: col(C.zebra) });
    }
    const [cTag, cType, cTitle, cYear] = COLS;
    cur.page.drawText(winAnsi(r.tag), { x: MARGIN + CELL_PAD, y: cur.y - 1, size, font: cur.fonts.sansBold, color: col(C.brand) });
    cur.page.drawText(winAnsi(r.type), { x: MARGIN + cTag.w + CELL_PAD, y: cur.y - 1, size, font: cur.fonts.sans, color: col(C.inkSoft) });
    titleLines.forEach((ln, li) => {
      cur.page.drawText(ln, { x: MARGIN + cTag.w + cType.w + CELL_PAD, y: cur.y - 1 - li * lineH, size, font: cur.fonts.sans, color: col(C.ink) });
    });
    cur.page.drawText(winAnsi(r.year), { x: MARGIN + cTag.w + cType.w + cTitle.w + CELL_PAD, y: cur.y - 1, size, font: cur.fonts.sans, color: col(C.inkSoft) });
    // hairline under the row
    cur.page.drawRectangle({ x: MARGIN, y: cur.y - rowH + 10.4, width: CONTENT_W, height: 0.5, color: col(C.hair) });
    cur.y -= rowH;
  });
  cur.y -= 10;
}

// ---------------------------------------------------------------------------

function pointText(point: AnswerPoint): string {
  return `${point.text}${claimRefMarker(point.citation_ids)}`;
}

/** The verification-state line, verbatim from the on-screen honesty banner. */
function verifyLine(report: ResearchReport): string {
  return report.template
    ? `Conservative response (${report.template.replace(/_/g, " ")}).`
    : report.claims_verified
    ? "Each claim was checked against its cited source."
    : "NOT FULLY FACT-CHECKED — the claim-by-claim check could not run; treat with extra caution.";
}

/** Cover block: kicker, serif title, accent rule, then the tinted honesty card. */
function drawCover(cur: Cursor, report: ResearchReport): void {
  cur.page.drawText("E V I D E N C E   R E P O R T", { x: MARGIN, y: cur.y, size: 9.5, font: cur.fonts.sansBold, color: col(C.brand) });
  cur.y -= 30;
  const titleLines = wrap(report.question || "Evidence Report", cur.fonts.serifBold, T.title, CONTENT_W);
  for (const ln of titleLines) {
    cur.page.drawText(ln, { x: MARGIN, y: cur.y, size: T.title, font: cur.fonts.serifBold, color: col(C.ink) });
    cur.y -= T.title * 1.18;
  }
  cur.y -= 2;
  cur.page.drawRectangle({ x: MARGIN, y: cur.y, width: 120, height: 3, color: col(C.brandBright) });
  cur.y -= 24;

  // Honesty card: tint panel + green left bar, grade + verification lines inside.
  const grade = `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`;
  const verify = verifyLine(report);
  const cardTextW = CONTENT_W - 32;
  const verifyLines = wrap(verify, cur.fonts.sans, T.body, cardTextW);
  const lineH = T.body * 1.4;
  const cardH = 14 + lineH * (1 + verifyLines.length) + 6;
  ensure(cur, cardH);
  cur.page.drawRectangle({ x: MARGIN, y: cur.y - cardH + 12, width: CONTENT_W, height: cardH, color: col(C.tint) });
  cur.page.drawRectangle({ x: MARGIN, y: cur.y - cardH + 12, width: 3, height: cardH, color: col(C.brandBright) });
  cur.y -= 10;
  cur.page.drawText(winAnsi(grade), { x: MARGIN + 16, y: cur.y, size: T.body, font: cur.fonts.sansBold, color: col(C.inkSoft) });
  cur.y -= lineH;
  for (const ln of verifyLines) {
    cur.page.drawText(ln, { x: MARGIN + 16, y: cur.y, size: T.body, font: cur.fonts.sans, color: col(C.muted) });
    cur.y -= lineH;
  }
  cur.y -= 18;
}

export async function reportToPdf(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(report.question || "Evidence Report"));
  doc.setProducer(" ");
  doc.setCreator(" ");
  const fonts: Fonts = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const cur: Cursor = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: 0, fonts };
  cur.y = PAGE_H - MARGIN - 8;

  drawCover(cur, report);

  if (report.summary) {
    drawHeading(cur, "Summary");
    drawParagraph(cur, report.summary);
  }

  if (report.search_method) {
    const m = report.search_method;
    drawHeading(cur, "Methods & Limitations");
    for (const line of [
      `Databases searched: ${m.databases.join(", ")}.`,
      m.queries.length ? `Search queries: ${m.queries.join("; ")}.` : "",
      `Search date: ${m.search_date}.`,
      m.inclusion_notes,
      m.exclusion_notes,
      "Automated bounded review; not an exhaustive census or formal systematic review.",
    ]) {
      if (line.trim()) drawParagraph(cur, line, { after: 2 });
    }
    cur.y -= 6;
  }

  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    drawHeading(cur, "What we searched");
    drawParagraph(
      cur,
      `${c.total_retrieved} candidate sources retrieved across ${c.n_searches} sub-question searches ` +
        `(each kept its top ${c.per_search_cap} by relevance), then merged and de-duplicated — ` +
        `a bounded, top-ranked sample, not an exhaustive census. By source: ${per}.`,
    );
  }

  if (report.citations.length) {
    drawHeading(cur, `Evidence base (${report.citations.length} sources)`);
    drawEvidenceTable(cur, evidenceRows(report.citations as Citation[]));
  }

  for (const sec of report.sections) {
    drawHeading(cur, sec.heading);
    for (const p of sec.points) drawBullet(cur, pointText(p));
    cur.y -= 4;
  }

  if (report.safety_notes.length) {
    drawHeading(cur, "Safety", C.warn);
    for (const p of report.safety_notes) drawBullet(cur, pointText(p));
    cur.y -= 4;
  }

  if (report.gaps?.length) {
    drawHeading(cur, "Evidence gaps");
    for (const g of report.gaps) {
      drawBullet(cur, g.text + (g.corroborating_trials.length ? ` An answer may be coming: ${g.corroborating_trials.join(", ")}.` : ""));
    }
    cur.y -= 4;
  }

  if (report.uncertainties.length) {
    drawHeading(cur, "Still uncertain");
    for (const p of report.uncertainties) drawBullet(cur, pointText(p));
    cur.y -= 4;
  }

  if (report.citations.length) {
    drawHeading(cur, "References");
    const refs = referenceLines(report.citations as Citation[], style);
    for (const r of refs) {
      // hanging indent: first line flush, continuations indented
      const size = T.small;
      const lineH = size * 1.35;
      const lines = wrap(r, cur.fonts.sans, size, CONTENT_W - 14);
      lines.forEach((ln, i) => {
        ensure(cur, lineH);
        cur.page.drawText(ln, { x: i === 0 ? MARGIN : MARGIN + 14, y: cur.y, size, font: cur.fonts.sans, color: col(C.inkSoft) });
        cur.y -= lineH;
      });
      cur.y -= 3;
    }
  }

  // Closing attribution: what this file was actually built from, so it's never more authoritative
  // than the screen. Suppressed when there are no citations, matching the on-screen ReportAttribution.
  if (report.citations.length) {
    const attribution = buildAttribution({
      citations: report.citations,
      generatedAt: new Date().toISOString().slice(0, 10),
      mode: (report.mode ?? "standard").replace(/_/g, " "),
    });
    drawHeading(cur, attribution.headline);
    for (const line of attribution.lines.filter(Boolean)) drawParagraph(cur, line, { after: 2 });
  }

  // Footer pass: page numbers only (needs the final page count, so it runs after all content).
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    const w = fonts.sans.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: PAGE_W - MARGIN - w, y: MARGIN - 20, size: 8, font: fonts.sans, color: col(C.faint) });
  });

  return Buffer.from(await doc.save());
}
