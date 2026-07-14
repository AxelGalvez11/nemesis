// Pure PowerPoint (.pptx) formatter for a ResearchReport. Builds in memory and returns a Node
// Buffer (pptxgenjs v4.0.1; write({ outputType: "nodebuffer" }) needs the Node runtime). A briefing
// deck: title + honesty, summary, each section, safety, gaps, references — styled from the shared
// export design system so it reads as the same product as the PDF and Word exports.
//
// Presentation only: content assembly and every honesty signal (grade, unverified caution, methods,
// counts, evidence-base table, attribution) are unchanged, so the deck is never more authoritative
// than the screen it came from.
import pptxgen from "pptxgenjs";
import type { AnswerPoint, Citation, CitationStyle, EvidenceRow, ResearchReport } from "@pharmabro/shared";
import { buildAttribution, claimRefMarker, evidenceRows, referenceLines } from "@pharmabro/shared";
import { EXPORT_COLORS as C, EXPORT_FONTS } from "./theme.ts";

// Neutral master name: it is written into the file's XML (and shows in PowerPoint's layout picker),
// so it must carry no product branding either.
const MASTER = "EVIDENCE_REPORT";
const CONTENT_W = 12.1; // inches, within the 13.33in wide layout at 0.6in side margins

// Derive the Slide instance type from the method's return type — robust across the default import
// regardless of how the package merges its namespace.
type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

type Run = { text: string; options: { bullet?: boolean; breakLine: boolean } };
function bullets(ps: AnswerPoint[]): Run[] {
  return ps.map((p) => ({ text: `${p.text}${claimRefMarker(p.citation_ids)}`, options: { bullet: true, breakLine: true } }));
}

// No rule under slide titles ON PURPOSE: an accent line under every title is a known hallmark of
// AI-generated decks (Anthropic's own pptx design guidance calls it out). The deck's recurring
// motif is instead the slim brand band on the master's top edge + the green serif titles.
function slideTitle(slide: PptxSlide, title: string): void {
  slide.addText(title, { x: 0.6, y: 0.42, w: CONTENT_W, h: 0.7, fontSize: 23, bold: true, color: C.brand, fontFace: EXPORT_FONTS.serif, valign: "top" });
}

function contentSlide(pptx: pptxgen, title: string, runs: Run[]): void {
  const slide = pptx.addSlide({ masterName: MASTER });
  slideTitle(slide, title);
  if (runs.length) {
    slide.addText(runs, {
      x: 0.6, y: 1.3, w: CONTENT_W, h: 5.5, fontSize: 15, color: C.ink, fontFace: EXPORT_FONTS.sans,
      valign: "top", lineSpacingMultiple: 1.15, paraSpaceAfter: 6, bullet: false,
    });
  }
}

// Evidence-base table slide (# · Type · Source · Year), mirroring the on-screen review. Rows come
// from the shared evidenceRows helper so the deck matches the screen exactly; the header carries the
// brand's dark fill and the body zebra-stripes for scan-ability. Long tables spill to more slides.
function evidenceSlide(pptx: pptxgen, rows: EvidenceRow[]): void {
  const slide = pptx.addSlide({ masterName: MASTER });
  slideTitle(slide, `Evidence base (${rows.length} sources)`);
  const head = ["#", "Type", "Source", "Year"].map((t) => ({
    text: t,
    options: { bold: true, color: C.paper, fill: { color: C.headerFill }, fontFace: EXPORT_FONTS.sans },
  }));
  const body = rows.map((r, i) =>
    [r.tag, r.type, r.title, r.year].map((t) => ({
      text: String(t),
      options: { color: C.ink, fontFace: EXPORT_FONTS.sans, fill: { color: i % 2 === 1 ? C.zebra : C.paper } },
    }))
  );
  slide.addTable([head, ...body], {
    x: 0.6, y: 1.42, w: CONTENT_W, fontSize: 12, color: C.ink,
    border: { type: "solid", pt: 0.5, color: C.hair }, colW: [0.7, 2.4, 7.4, 1.6],
    valign: "middle", rowH: 0.32, autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 0.6,
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

export async function reportToPptx(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const pptx = new pptxgen();
  // Deliberately no product branding anywhere in the deck or its metadata (same call as the
  // poster) — the deliverable reads as the user's own work.
  pptx.author = " ";
  pptx.title = report.question || "Evidence Report";
  pptx.layout = "LAYOUT_WIDE";

  // Slide master: white board, a slim brand band across the top edge (the deck's recurring motif),
  // and a discreet page number.
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: C.paper },
    objects: [
      { rect: { x: 0, y: 0, w: "100%", h: 0.05, fill: { color: C.brandBright } } },
    ],
    slideNumber: { x: 12.5, y: 7.04, w: 0.5, h: 0.3, fontSize: 8, color: C.faint, fontFace: EXPORT_FONTS.sans, align: "right" },
  });

  // Title slide: kicker, serif title, accent rule, honesty banner.
  const title = pptx.addSlide({ masterName: MASTER });
  title.addText("EVIDENCE REPORT", { x: 0.6, y: 0.8, w: CONTENT_W, h: 0.3, fontSize: 11, bold: true, color: C.brand, charSpacing: 2, fontFace: EXPORT_FONTS.sans });
  title.addText(report.question || "Evidence Report", { x: 0.6, y: 2.15, w: CONTENT_W, h: 2.0, fontSize: 30, bold: true, color: C.ink, fontFace: EXPORT_FONTS.serif, valign: "top" });
  title.addShape(pptx.ShapeType.rect, { x: 0.62, y: 4.35, w: 2.2, h: 0.06, fill: { color: C.brandBright }, line: { type: "none" } });
  title.addText(
    [
      { text: `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`, options: { breakLine: true, bold: true, color: C.inkSoft } },
      { text: verifyLine(report), options: { breakLine: true, color: C.muted } },
    ],
    { x: 0.6, y: 4.7, w: CONTENT_W, h: 1.4, fontSize: 14, fontFace: EXPORT_FONTS.sans, valign: "top", lineSpacingMultiple: 1.2 },
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
      mode: (report.mode ?? "standard").replace(/_/g, " "),
    });
    contentSlide(pptx, attribution.headline, attribution.lines.filter(Boolean).map((line) => ({
      text: line, options: { bullet: false, breakLine: true },
    })));
  }

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buf;
}
