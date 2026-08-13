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
  docxCoverage,
  extractCut,
  pdfCoverage,
  pdfWholeCoverage,
  pptxCoverage,
  singleUnitCoverage,
  xlsxCoverage,
  csvCoverage,
} from "./extract-coverage";
import { csvToModel } from "./csv-model";
import { readCsv } from "./csv-structure";
import { workbookToModel } from "./xlsx-model";
import { readWorkbook } from "./xlsx-structure";
import { extractDocxModel, pptxTextWithFigures, readPptxSlides } from "./office";
import { pptxToModel } from "./pptx-model";
import { capText, extractPdfText, guessTitle, TEXT_CAP } from "@/lib/pdf/extract";
import { readPdfStructure } from "@/lib/pdf/structure";
import { lookAtFigures } from "@/lib/pdf/figure-look";
import { finishPdfPages, planPdfRead, thinPages, unreadPages } from "@/lib/pdf/pages";
import { describeFiguresWithVision, readPdfPagesWithVision, readPdfWithVision } from "@/lib/pdf/vision";
import { PHOTO_PROMPT, readWithVision, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

/**
 * 🔴 ONE OF THREE HAND-WRITTEN FORMAT LISTS, AND THEY HAVE DRIFTED BEFORE.
 * `DocFormat` (the model), `FORMATS` (the envelope's runtime allow-list) and
 * `ParsedDocKind` (the database CHECK's mirror) all enumerate formats too.
 * `ParsedDocKind` carried "xlsx" for months before anything could produce one.
 * Adding a format means visiting all four; `document-envelope.test.ts` fails
 * loudly for the pair that can lose a whole document.
 */
export type DocumentKind = "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "image";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** What a file claims to be, from its name and declared type. PURE. */
export function kindFor(name: string, type: string): DocumentKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || type === DOCX_MIME) return "docx";
  if (lower.endsWith(".pptx") || type === PPTX_MIME) return "pptx";
  if (lower.endsWith(".xlsx") || type === XLSX_MIME) return "xlsx";
  if (lower.endsWith(".csv") || type === "text/csv") return "csv";
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
  // `xl/workbook.xml` is the part every .xlsx has and no other Office format
  // does. Checked last so a document that merely EMBEDS a spreadsheet — a Word
  // file with a linked chart carries `xl/` parts — is still read as what it is.
  if (window.includes("xl/workbook.xml")) return "xlsx";
  // 🔴 CSV IS DELIBERATELY NOT SNIFFED. It has no signature — it is plain text
  // with separators in it — so any content test for it is really a test for
  // "does this look tabular", which a Markdown table, a log file and a list of
  // names all pass. Guessing here would silently reclassify other people's text
  // files as grids. A `.csv` extension or a `text/csv` type is a CLAIM the
  // uploader made, and that is the only evidence this format offers.
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
  /** Nothing readable came out, and no structure either. A verdict about the file. */
  | { ok: false; reason: "empty"; kind: DocumentKind }
  /**
   * The file has STRUCTURE and no readable text: a scan, or slides exported as
   * pictures. Distinct from `empty`, and the document rides along.
   *
   * 🔴 THIS EXISTS BECAUSE A TRUTHFUL REFUSAL WAS ERASING ITS OWN EVIDENCE.
   * Once the `[Figure — not examined]` placeholder stopped being written into
   * extracted text (#485), an image-only PDF finally reported the truth — no
   * text — and this function's `if (!text)` then threw the model away with it.
   * Measured: 8 of 458 benchmark layout PDFs and 5 of 165 real course files take
   * this path, discarding 17 units, 25 blocks and 25 figures that the structural
   * reader had already located, sized and placed on a page.
   *
   * So the student uploading a scanned handout got nothing at all — not even
   * "this is a scan, it holds 3 pictures, and Nemesis cannot read images
   * natively". That sentence is both true and useful; silence is neither.
   *
   * `text` is `""` and every caller must keep treating that as "no text to
   * show". What changes is that `model` and `coverage` are worth PERSISTING, so
   * a later vision pass can enrich a document whose shape is already known
   * rather than having to decide again what the file even is.
   */
  | { ok: false; reason: "no-text"; kind: DocumentKind; document: ParsedDocument }
  | { ok: false; reason: "unsupported" }
  | { ok: false; reason: "too-large-image" }
  | { ok: false; reason: "vision-unavailable" };

/**
 * Did the parser find structure it could not read?
 *
 * The test is BLOCKS, not units. A model with pages and nothing on them records
 * only a page count — there is no figure, no rectangle and nothing for a later
 * pass to enrich, so it is genuinely empty. One block with a rectangle is a
 * located thing, and a located thing is worth keeping.
 */
function hasStructure(model: DocumentModel | undefined): model is DocumentModel {
  return model !== undefined && model.blocks.length > 0;
}

/**
 * Read a document.
 *
 * `bytes` may be DETACHED by this call when the file is a PDF — pdf.js takes
 * ownership of the buffer it is handed. A caller that needs the original
 * afterwards (to hash it, to re-sniff it) must pass a copy or hash first.
 */
export interface ParseOptions {
  /**
   * Send unexamined figures to a vision model.
   *
   * 🔴 OFF BY DEFAULT, AND THAT IS A COST DECISION, NOT A DEFAULT-BY-ACCIDENT.
   * The figure router selects up to 40 figures per document. On the synchronous
   * upload lane that is up to 40 vision calls before the request returns —
   * latency the student waits through, on the one primitive with no entitlement,
   * no counter and no cache (`docs` unit-economics audit, 2026-08-06). The
   * background worker is where a document may cost minutes and money; the
   * request path is not. Structure, figure DETECTION and coverage are unchanged
   * either way, so an upload still knows a diagram is there and still says
   * nobody has looked at it.
   */
  lookAtFigures?: boolean;
}

export async function parseDocument(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  options: ParseOptions = {},
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
    const parsed = await parsePdf(bytes, options);
    ({ coverage, model, readBy, text, title } = parsed);
  } else if (kind === "docx") {
    model = extractDocxModel(bytes);
    text = documentToText(model);
    title = model.title;
    // 🔴 ONE "document", NOT ONE PAGE. Word paginates at layout time, so
    // claiming "page 1 of 1" for a 40-page dissertation would invent a locator
    // every later citation would point at falsely. The model says the same
    // thing structurally: one unit, of kind `body`, which renders no number.
    //
    // 🔴 AND NOW IT CARRIES ITS FIGURES. Until the reader could see a picture,
    // a Word document had no figure record at all, so one full of diagrams read
    // as `complete` — the exact silence coverage exists to end.
    coverage = docxCoverage({ figures: figureCoverageOf(model), read: text.trim().length > 0 });
  } else if (kind === "xlsx") {
    // 🔴 THE GRID IS THE CONTENT, SO NOTHING IS FLATTENED ON THE WAY THROUGH.
    // `documentToText` renders each sheet's table as markdown for the lanes that
    // want a string, while `model` keeps the cells, their references, their
    // formulas and their merges for the lanes that want to cite one.
    const workbook = readWorkbook(bytes);
    model = workbookToModel(workbook, workbook.title);
    text = documentToText(model);
    title = model.title;
    coverage = xlsxCoverage({
      sheets: workbook.sheets.length,
      // Charts, pivots and macros: seen, located, not turned into content. Any
      // non-zero count makes the workbook `partial`, which is the honest answer
      // for a file whose point may be the chart we cannot read. The kinds ride
      // along now instead of being summed away before coverage sees them.
      unsupported: workbook.unsupported,
    });
  } else if (kind === "csv") {
    // 🔴 THE SAME GRID AS XLSX, ON PURPOSE. A CSV is one sheet's worth of data,
    // so it reuses the identical table representation rather than getting a
    // parallel one — two models of "a grid" would mean two locators, two
    // renderers, and a second copy that drifts.
    //
    // Deterministic end to end: no model call, no heuristic beyond a delimiter
    // rule that refuses when it cannot tell (see `chooseDelimiter`).
    const grid = readCsv(bytes);
    model = csvToModel(grid);
    text = documentToText(model);
    title = null;
    coverage = csvCoverage({
      rows: grid.rows,
      // A file whose columns we declined to split is READ but not fully
      // understood — `partial` is the honest answer, and the rows survive as
      // evidence either way. The kinds ride along instead of being summed away.
      unsupported: grid.unsupported,
    });
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
    // 🔴 THE DECK BECOMES A MODEL TOO, AND THE STRING STAYS EXACTLY AS IT WAS.
    // PPTX is the strong lane — notes, SmartArt, charts, tables, EMF/TIFF — and
    // a re-extraction would risk all of it. `pptxToModel` re-SHAPES the same
    // merged text into slide-numbered blocks, which is what lets a chunk carry
    // a locator and a citation say "slide 12" instead of "somewhere in this
    // file". `scripts/phase3-pptx-check.mts` asserts against real decks that
    // not one character was lost doing it.
    model = pptxToModel(
      {
        deckTitle: deck.deckTitle,
        images: deck.media.images,
        slides: deck.slides,
        slideTitles: deck.slideTitles,
        // The grids and boxes read alongside the same text, so a table is a
        // table and a citation can name the box it came from.
        structure: deck.structure,
      },
      figures,
    );
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

  const document: ParsedDocument = {
    coverage,
    kind,
    skippedFigures,
    text,
    title,
    ...(readBy ? { readBy } : {}),
    ...(model ? { model } : {}),
  };

  // 🔴 NO TEXT IS NOT NO DOCUMENT. Both branches refuse — the caller still has
  // nothing to show a student — but only one of them has nothing to REMEMBER.
  // Returning the same `empty` for both is what discarded a model the
  // structural reader had already built, on every scan production has seen.
  if (!text) {
    return hasStructure(model)
      ? { document, kind, ok: false, reason: "no-text" }
      : { kind, ok: false, reason: "empty" };
  }
  return { document, ok: true };
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
async function parsePdf(bytes: Uint8Array, options: ParseOptions = {}): Promise<{
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
  // Content located and not delivered, smaller than a page: today, table regions
  // with no recoverable grid. Any non-zero value makes the document `partial`.
  let unreadableRegions = 0;
  // WHICH pages those regions were on. Empty when the structural read did not
  // happen at all (the catch below), which reads as "we do not know where",
  // never as "there was nowhere" — see `ExtractionCoverage.lostUnits`.
  let unreadableRegionsByUnit: readonly { unit: number; count: number }[] = [];
  try {
    // 🔴 CAPTURE THE FIGURES ON THE WAY PAST, BECAUSE THERE IS NO WAY BACK.
    // `page.cleanup()` releases the decoded image data, so a later pass would
    // have to re-parse every page's operator list to see a diagram again.
    const structural = await readPdfStructure(new Uint8Array(bytes), {
      captureFigures: options.lookAtFigures === true,
      // 🔴 THE ENV VAR IS THE SWITCH, NOT A SECOND FLAG BESIDE IT. Asking for
      // tables unconditionally is safe because `layoutModelPath()` returns null
      // when `DOCLING_LAYOUT_ONNX` is unset, and no weights means no tables —
      // never an error. A separate boolean would be a second thing to keep in
      // step with the first, and the pair would eventually disagree.
      detectTables: true,
    });
    model = structural.model;
    unreadBeyondCap = Math.max(structural.declaredUnits - structural.model.units.length, 0);
    // A table region the layout model found and the grid builder could not
    // reconstruct. Carried to coverage so a text-full page holding an
    // unreadable table cannot report itself complete.
    unreadableRegions = structural.tableRegionsUnread;
    unreadableRegionsByUnit = structural.tableRegionsUnreadByUnit;

    // 🔴 THE VISUAL HALF. Production decides what to look at from text sparsity
    // alone, which guarantees that 326 of 952 real pages — holding 1,807
    // figures — are never examined, because they have plenty of words AND a
    // load-bearing diagram. `planFigureVision` routes on an unexamined figure
    // large enough to hold something OR thin text, and either is sufficient.
    if (options.lookAtFigures) {
      const looked = await lookAtFigures(model, structural.figureImages);
      model = looked.model;
    }
  } catch (cause) {
    // Recorded as absent structure, not as a failed parse: the fallback below
    // still produces real text, and calling the document unreadable because the
    // richer reader refused would lose content we can still get.
    //
    // 🔴 BUT IT MUST SAY WHY, AND FOR MONTHS IT DID NOT. This was a bare
    // `catch {}`. Degrading silently means the difference between "this PDF is
    // genuinely unstructured" and "the structural reader is broken on every
    // document in production" is invisible — and the second one is true right
    // now: every parse in production is stored as flat text with no model, so
    // no table, heading or locator survives, source indexing has nothing to
    // consume, and the request still logs `state: "complete"`.
    //
    // Found by uploading one document and asking what the database actually
    // held, because nothing in a log, a status or a metric would ever have said
    // it. A fallback that hides its own reason is not a fallback, it is a leak.
    console.warn(JSON.stringify({
      event: "pdf_structure_unavailable",
      detail: cause instanceof Error ? cause.message.slice(0, 300) : String(cause).slice(0, 300),
      name: cause instanceof Error ? cause.name : typeof cause,
      // The frame that actually threw is the whole point of logging this.
      stack: cause instanceof Error ? (cause.stack ?? "").split("\n").slice(0, 4).join(" | ").slice(0, 500) : undefined,
    }));
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
      ...(unreadableRegions ? { unreadableRegions } : {}),
      unreadableRegionsByUnit,
    });
  }
  if (plan.kind === "text") {
    record = pdfCoverage({
      pageTexts: r.pageTexts,
      readByVision,
      truncation: extractCut(TEXT_CAP, r.text.length, wholeTextLength),
      unreadBeyondCap,
      ...(figures ? { figures } : {}),
      ...(unreadableRegions ? { unreadableRegions } : {}),
      unreadableRegionsByUnit,
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
      record ??
      pdfCoverage({
        pageTexts: r.pageTexts,
        readByVision,
        unreadBeyondCap,
        ...(figures ? { figures } : {}),
        ...(unreadableRegions ? { unreadableRegions } : {}),
        unreadableRegionsByUnit,
      }),
    model,
    readBy,
    text,
    title,
  };
}
