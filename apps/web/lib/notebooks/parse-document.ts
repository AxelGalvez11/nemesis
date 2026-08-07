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

import {
  documentToText,
  figureCoverageOf,
  unitTexts,
  withTruncation,
  withVisionText,
  type DocumentModel,
  type ExtractionCoverage,
} from "@nemesis/shared";

import {
  extractCut,
  pdfCoverage,
  pdfWholeCoverage,
  pptxCoverage,
  singleUnitCoverage,
} from "./extract-coverage";
import { extractDocxModel, pptxTextWithFigures, readPptxSlides } from "./office";
import { capText, extractPdfText, guessTitle, TEXT_CAP } from "@/lib/pdf/extract";
import { readPdfStructure } from "@/lib/pdf/structure";
import { lookAtFigures } from "@/lib/pdf/figure-look";
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
  /**
   * The structural read: units, blocks, geometry, figures, truthful locators.
   *
   * 🔴 ABSENT MEANS NO STRUCTURE WAS PRODUCED, WHICH IS NOT THE SAME AS A FLAT
   * DOCUMENT. PPTX and images still come through the older lanes, and a PDF the
   * structural reader could not open falls back to `unpdf`. A consumer that
   * treated a missing model as "this file has no structure" would file a
   * two-column paper as prose; one that treats it as "unknown" asks for a
   * reparse. `text` is always present and is derived from the model when there
   * is one, so nothing has to choose between them.
   */
  model?: DocumentModel;
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
  let model: DocumentModel | undefined;

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
    ({ coverage, model, readBy, text, title } = parsed);
  } else if (kind === "docx") {
    model = extractDocxModel(bytes);
    text = documentToText(model);
    title = model.title;
    // 🔴 ONE "document", NOT ONE PAGE. Word paginates at layout time, so
    // claiming "page 1 of 1" for a 40-page dissertation would invent a locator
    // every later citation would point at falsely. The model says the same
    // thing structurally: one unit, of kind `body`, which renders no number.
    coverage = singleUnitCoverage({ read: text.trim().length > 0, method: "native" });
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
    document: {
      coverage,
      kind,
      skippedFigures,
      text,
      title,
      ...(readBy ? { readBy } : {}),
      ...(model ? { model } : {}),
    },
    ok: true,
  };
}

/**
 * The PDF lane: structure and figures natively, then vision for what is left.
 *
 * 🔴 THE NATIVE PASS IS THE STRUCTURAL READER, NOT `unpdf`, AND THAT IS THE
 * WHOLE OF PHASE 2's INGEST CHANGE. `unpdf` exposes no image operators, so the
 * lane it fed could not tell a figure existed — measured over 120 real course
 * PDFs, that is 1,963 figures, 1,089 of them real content nobody looked at, on
 * pages coverage reported as fully read.
 *
 * `extractPdfText` stays as the fallback for a file the structural reader cannot
 * open, because a worse parse is better than no parse — but it never REPLACES a
 * structural one, per "a worse retry never replaces a better parse".
 */
async function parsePdf(bytes: Uint8Array): Promise<{
  coverage: ExtractionCoverage;
  model: DocumentModel | undefined;
  readBy: string | undefined;
  text: string;
  title: string | null;
}> {
  // 🔴 A COPY. pdf.js detaches the buffer it is handed, and the vision pass
  // below slices the ORIGINAL bytes per page. Handing it `bytes` directly makes
  // every later read see zeroes — which does not throw, it silently reports an
  // empty document.
  let model: DocumentModel | undefined;
  // Units the FILE declares. Beyond the cap they are unread, never absent.
  let unreadBeyondCap = 0;
  try {
    // 🔴 CAPTURE THE FIGURES ON THE WAY PAST, BECAUSE THERE IS NO WAY BACK.
    // `page.cleanup()` releases the decoded image data, so a later pass would
    // have to re-parse every page's operator list to see a diagram again.
    const structural = await readPdfStructure(new Uint8Array(bytes), { captureFigures: true });
    model = structural.model;
    unreadBeyondCap = Math.max(structural.declaredUnits - structural.model.units.length, 0);

    // 🔴 THE VISUAL HALF. Production decides what to look at from text sparsity
    // alone, which guarantees that 326 of 952 real pages — holding 1,807
    // figures — are never examined, because they have plenty of words AND a
    // load-bearing diagram. `planFigureVision` routes on an unexamined figure
    // large enough to hold something OR thin text, and either is sufficient.
    const looked = await lookAtFigures(model, structural.figureImages);
    model = looked.model;
  } catch {
    // Recorded as absent structure, not as a failed parse: the fallback below
    // still produces real text, and calling the document unreadable because the
    // richer reader refused would lose content we can still get.
    model = undefined;
  }

  // 🔴 BOTH READERS FAILING IS A VERDICT ABOUT THE FILE, NOT AN EXCEPTION.
  // A PDF that will not open — truncated, encrypted, or twelve bytes of noise
  // with a %PDF header — used to throw straight out of the parser and take the
  // whole upload request with it. The student then saw a server error for a
  // problem with their file. An empty read reaches the caller as `empty`, which
  // it already knows how to explain.
  const r = model
    ? {
        meta: { pages: model.units.length, title: model.title, truncated: false },
        pageTexts: unitTexts(model),
        text: capText(documentToText(model), TEXT_CAP).text,
      }
    : await extractPdfText(bytes).catch(() => ({
        meta: { pages: 0, title: null, truncated: false },
        pageTexts: [] as string[],
        text: "",
      }));
  // Figures are only KNOWN when the structural reader ran. Omitted means
  // unknown, and unknown must not be recorded as "this document has none".
  const figures = model ? figureCoverageOf(model) : undefined;
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
      readBy = "pages";
      readByVision = new Set(seen.keys());
      // 🔴 THE VISION TEXT GOES INTO THE MODEL, NOT BESIDE IT. Keeping the
      // blocks while separately building a flat string that also holds the
      // vision text leaves a document whose text says one thing and whose
      // citations point into another — which reads downstream as a
      // hallucination and is much harder to trace than a missing paragraph.
      // `seen` is keyed by 1-based page; units are 0-based.
      if (model) {
        model = withVisionText(model, new Map([...seen].map(([page, value]) => [page - 1, value])));
        text = capText(documentToText(model), TEXT_CAP).text;
      } else {
        text = read.text;
      }
    }
    record = pdfCoverage({
      pageTexts: r.pageTexts,
      readByVision,
      truncation: extractCut(TEXT_CAP, text.length, Math.max(wholeTextLength, text.length)),
      unreadBeyondCap,
      ...(figures ? { figures } : {}),
    });
  }
  if (plan.kind === "text") {
    record = pdfCoverage({
      pageTexts: r.pageTexts,
      readByVision,
      truncation: extractCut(TEXT_CAP, r.text.length, wholeTextLength),
      unreadBeyondCap,
      ...(figures ? { figures } : {}),
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
    coverage:
      record ?? pdfCoverage({ pageTexts: r.pageTexts, readByVision, unreadBeyondCap, ...(figures ? { figures } : {}) }),
    model,
    readBy,
    text,
    title,
  };
}
