/**
 * Bytes in, a parse out. No HTTP, no database, no response shape.
 *
 * 🔴 THIS EXISTS SO THE SYNCHRONOUS ROUTE AND THE WORKER CANNOT DISAGREE.
 *
 * Two lanes will read the same file during the Phase 1 cutover — the upload
 * request that still parses inline, and the worker that parses after the fact.
 * If each carried its own copy of "which pages were thin, when vision runs, what
 * counts as a figure", the same document would get two different coverage
 * records depending on which lane happened to reach it, and `parsed_documents`
 * would hold whichever one wrote last. One function, one answer.
 *
 * What is deliberately NOT here:
 *
 *   * fetching the bytes — the worker reads them from storage under the service
 *     role, the route may already hold them from a multipart body
 *   * persistence — `record_parsed_document` derives state from coverage inside
 *     the writing statement, and a second opinion here would be exactly the bug
 *     Phase 0b removed
 *   * the defensive copy — pdf.js detaches its input, so the CALLER decides
 *     whether it still needs the original bytes afterwards
 */

import { withTruncation, type ExtractionCoverage } from "@nemesis/shared";

import {
  extractCut,
  pdfCoverage,
  pdfWholeCoverage,
  pptxCoverage,
  singleUnitCoverage,
} from "./extract-coverage";
import { extractDocxText, pptxTextWithFigures, readPptxSlides } from "./office";
import { capText, extractPdfText, guessTitle, TEXT_CAP } from "@/lib/pdf/extract";
import { finishPdfPages, planPdfRead, thinPages, unreadPages } from "@/lib/pdf/pages";
import { describeFiguresWithVision, readPdfPagesWithVision, readPdfWithVision } from "@/lib/pdf/vision";
import { PHOTO_PROMPT, readWithVision, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

export type DocumentKind = "pdf" | "docx" | "pptx" | "image";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** What a file claims to be, from its name and declared type. PURE. */
export function kindFor(name: string, type: string): DocumentKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || type === DOCX_MIME) return "docx";
  if (lower.endsWith(".pptx") || type === PPTX_MIME) return "pptx";
  if (visionMime(name, type)) return "image";
  return null;
}

/**
 * What a file IS, when its name no longer says.
 *
 * A real course folder had two lecture PDFs whose long filenames had been
 * truncated past the ".pdf". The contents are unambiguous, so read them. PURE.
 */
export function sniffKind(bytes: Uint8Array): DocumentKind | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return null;
  // Entry names are plain ASCII in the local headers, so a scan beats unpacking
  // a hundred megabytes to answer one question.
  const window = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512 * 1024))).toString("latin1");
  if (window.includes("ppt/slides/")) return "pptx";
  if (window.includes("word/document.xml")) return "docx";
  return null;
}

export interface ParsedDocument {
  kind: DocumentKind;
  title: string | null;
  text: string;
  /** 🔴 ALWAYS SET. Absent coverage used to mean both "complete" and "nobody
   *  measured", and every caller resolved that the flattering way. */
  coverage: ExtractionCoverage;
  /** How the text was obtained, when it was not the file's own text layer. */
  readBy?: string;
  /** Figures a deck had beyond the per-deck ceiling. */
  skippedFigures: number;
}

export type ParseOutcome =
  | { ok: true; document: ParsedDocument }
  /** Nothing readable came out. Not an error — a verdict about the file. */
  | { ok: false; reason: "empty"; kind: DocumentKind }
  | { ok: false; reason: "unsupported" }
  | { ok: false; reason: "too-large-image" }
  | { ok: false; reason: "vision-unavailable" };

/**
 * Read a document.
 *
 * `bytes` may be DETACHED by this call when the file is a PDF — pdf.js takes
 * ownership of the buffer it is handed. A caller that needs the original
 * afterwards (to hash it, to re-sniff it) must pass a copy or hash first.
 */
export async function parseDocument(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<ParseOutcome> {
  // Name first (cheap and right almost always), contents second (right when a
  // name has lost its extension).
  const kind = kindFor(fileName, mimeType) ?? sniffKind(bytes);
  if (!kind) return { ok: false, reason: "unsupported" };

  if (kind === "image") {
    if (bytes.byteLength > VISION_MAX_BYTES) return { ok: false, reason: "too-large-image" };
    if (!visionConfigured()) return { ok: false, reason: "vision-unavailable" };
  }

  let title: string | null = null;
  let text = "";
  let readBy: string | undefined;
  let skippedFigures = 0;
  let coverage: ExtractionCoverage;

  if (kind === "image") {
    const seen = await readWithVision(bytes, visionMime(fileName, mimeType) ?? "image/jpeg", {
      prompt: PHOTO_PROMPT,
    });
    text = seen?.text ?? "";
    title = seen ? guessTitle(seen.text) : null;
    readBy = seen?.model;
    coverage = singleUnitCoverage({ read: Boolean(seen?.text.trim()), method: "vision" });
  } else if (kind === "pdf") {
    const parsed = await parsePdf(bytes);
    ({ coverage, readBy, text, title } = parsed);
  } else if (kind === "docx") {
    const out = extractDocxText(bytes);
    text = out.text;
    title = out.title;
    // 🔴 ONE "document", NOT ONE PAGE. Word paginates at layout time and this
    // extraction is a tag strip — it cannot see page boundaries, so claiming
    // "page 1 of 1" for a 40-page dissertation would invent a locator every
    // later citation would point at falsely. Real units are Phase 3's job.
    coverage = singleUnitCoverage({ read: out.text.trim().length > 0, method: "native" });
  } else {
    const deck = readPptxSlides(bytes);
    const figures = deck.media.images.length
      ? await describeFiguresWithVision(
          deck.media.images.flatMap((image) => {
            const data = deck.imageBytes.get(image.name);
            return data ? [{ bytes: data, mime: image.mime, name: image.name }] : [];
          }),
        )
      : new Map<string, string>();
    const out = pptxTextWithFigures(deck, figures);
    text = out.text;
    title = out.title;
    if (figures.size > 0) readBy = "figures";
    if (deck.media.droppedToCap > 0) skippedFigures = deck.media.droppedToCap;
    coverage = pptxCoverage({
      counts: deck.coverage,
      // What vision RETURNED, not what was planned. A figure that was queued and
      // whose description failed is a figure the student did not get.
      described: figures.size,
      visionAvailable: visionConfigured(),
    });
  }

  text = text.trim();
  // Word and PowerPoint were never capped, only PDF was. Cap them to the same
  // ceiling and REPORT it — withTruncation re-derives the state, so a deck that
  // was complete when its slides were counted stops being complete once its
  // text is clipped.
  if (kind !== "pdf") {
    const capped = capText(text, TEXT_CAP);
    coverage = withTruncation(coverage, extractCut(TEXT_CAP, capped.text.length, text.length));
    text = capped.text;
  }

  if (!text) return { ok: false, kind, reason: "empty" };
  return {
    document: { coverage, kind, skippedFigures, text, title, ...(readBy ? { readBy } : {}) },
    ok: true,
  };
}

/** The PDF lane: native text, then vision for the pages that are pictures. */
async function parsePdf(bytes: Uint8Array): Promise<{
  coverage: ExtractionCoverage;
  readBy: string | undefined;
  text: string;
  title: string | null;
}> {
  const r = await extractPdfText(bytes);
  let text = r.text;
  let title = r.meta.title;
  let readBy: string | undefined;

  const plan = planPdfRead(r.pageTexts);
  // The uncapped length, so a cut is reported as an amount rather than a
  // boolean. `pageTexts` keeps every page, so this is the only place the
  // original size is still knowable.
  const wholeTextLength = r.pageTexts.join("\n").trim().length;
  // Which pages vision actually returned text for. Carried rather than
  // recomputed: "we asked for these" and "these came back" are different facts,
  // and counting the request as the result is how a failed batch disappears.
  let readByVision = new Set<number>();
  let record: ExtractionCoverage | undefined;

  if (plan.kind === "whole") {
    const whole = await readPdfWithVision(bytes);
    if (whole?.text.trim()) {
      const raw = whole.text.trim();
      const { text: capped } = capText(raw, TEXT_CAP);
      title = title ?? guessTitle(capped);
      text = capped;
      readBy = whole.model;
      record = pdfWholeCoverage(r.meta.pages, extractCut(TEXT_CAP, capped.length, raw.length));
    }
  }
  if (plan.kind !== "text" && !readBy) {
    const thin = thinPages(r.pageTexts);
    const needed = plan.kind === "pages" ? plan.needed : unreadPages(r.pageTexts);
    const seen = await readPdfPagesWithVision(bytes, needed);
    const read = finishPdfPages(r.pageTexts, seen, thin, TEXT_CAP);
    if (seen.size > 0) {
      text = read.text;
      readBy = "pages";
      readByVision = new Set(seen.keys());
    }
    record = pdfCoverage({
      pageTexts: r.pageTexts,
      readByVision,
      truncation: extractCut(TEXT_CAP, text.length, Math.max(wholeTextLength, text.length)),
    });
  }
  if (plan.kind === "text") {
    record = pdfCoverage({
      pageTexts: r.pageTexts,
      readByVision,
      truncation: extractCut(TEXT_CAP, r.text.length, wholeTextLength),
    });
  }

  // A scanned PDF has no text LAYER — the words are pixels. When vision is
  // configured we read the pages instead; when it is not, this stays empty and
  // the caller reports "empty" exactly as before.
  if (!text.trim()) {
    const seen = await readPdfWithVision(bytes);
    if (seen) {
      text = seen.text.trim();
      readBy = seen.model;
      title = title ?? guessTitle(text);
      // The record built above counted every page unread, which was true a
      // moment ago and is not any more. An honest record is one that keeps up.
      record = pdfWholeCoverage(record?.units || r.meta.pages || 1);
    }
  }

  return {
    coverage: record ?? pdfCoverage({ pageTexts: r.pageTexts, readByVision }),
    readBy,
    text,
    title,
  };
}
