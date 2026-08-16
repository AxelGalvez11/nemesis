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
import { mistralCoverage } from "./extract-coverage";
import { mistralHandles, readWithMistral } from "./mistral-ocr";
import { llamaHandles, llamaTier, readWithLlama } from "./llamaparse-ocr";
import { modelFromLlama, type LlamaResult } from "./llamaparse-model";
import { claimOf, judgeFigureAccounting, judgeMistralRead } from "./mistral-quality";
import { modelFromMistral, titleFromMistral, unitKindFor } from "./mistral-model";
import { csvToModel } from "./csv-model";
import { readCsv } from "./csv-structure";
import { readTextDocument } from "./text-structure";
import { workbookToModel } from "./xlsx-model";
import { readWorkbook } from "./xlsx-structure";
import { normalizedFigures, type NormalizedFigure } from "./figure-assets";
import { extractDocxModel, pptxTextWithFigures, readPptxSlides } from "./office";
import { pptxToModel } from "./pptx-model";
import { capText, extractPdfText, guessTitle, TEXT_CAP } from "@/lib/pdf/extract";
import { readPdfStructure, type CapturedFigure } from "@/lib/pdf/structure";
import { accountForFigures, NO_ACCOUNTING } from "@/lib/pdf/figure-accounting";
import { lookAtFigures, type FigureLookResult } from "@/lib/pdf/figure-look";
import { matchFigureImages } from "@/lib/pdf/figure-match";
import { finishPdfPages, planPdfRead, thinPages, unreadPages } from "@/lib/pdf/pages";
import type { FigureLabel } from "@/lib/learn/figure-labels";
import { describeFiguresWithVision, readFiguresWithVision, readPdfPagesWithVision, readPdfWithVision } from "@/lib/pdf/vision";
import { PHOTO_PROMPT, readWithVision, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

/**
 * 🔴 ONE OF THREE HAND-WRITTEN FORMAT LISTS, AND THEY HAVE DRIFTED BEFORE.
 * `DocFormat` (the model), `FORMATS` (the envelope's runtime allow-list) and
 * `ParsedDocKind` (the database CHECK's mirror) all enumerate formats too.
 * `ParsedDocKind` carried "xlsx" for months before anything could produce one.
 * Adding a format means visiting all four; `document-envelope.test.ts` fails
 * loudly for the pair that can lose a whole document.
 */
export type DocumentKind = "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "image" | "text";

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
  // 🔴 CHECKED AFTER `.csv`, BECAUSE A CSV IS ALSO TEXT. The more specific claim wins: a file
  // that says it is a grid is read as a grid, and only what is left is read as prose.
  //
  // These two extensions were offered by every upload control, accepted by the storage bucket
  // and allowed by the `doc_kind` CHECK — and had no branch here, so `parseDocument` returned
  // `unsupported`. A student's own notes were stored and never read. Four markdown files and one
  // text file sat in production with zero parses between them.
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || type === "text/markdown") return "text";
  if (lower.endsWith(".txt") || type === "text/plain") return "text";
  if (visionMime(name, type)) return "image";
  return null;
}

/**
 * Is this text file written in Markdown?
 *
 * 🔴 FROM THE FILE'S OWN CLAIM, NEVER FROM ITS CONTENT. A `.txt` containing `# Notes` is someone
 * writing a hash character, not a heading, and sniffing for markup would turn their prose into a
 * structure they did not write. The extension and the declared type are the only evidence a text
 * file offers about which it is, exactly as `chooseDelimiter` refuses to guess a CSV separator.
 */
export function isMarkdown(name: string, type: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || type === "text/markdown";
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
  /**
   * Figures this lane could not process, having looked: past a ceiling, or with no pixels.
   *
   * 🔴 ABSENT MEANS NOBODY COUNTED, AND `0` NOW MEANS SOMEBODY COUNTED AND FOUND NONE. It was
   * a required number, so every lane that had no figure pass at all wrote the literal `0` —
   * the vendor lane among them, while it was silently examining no figure ever. That is this
   * codebase's most repeated defect in one field: a missing measurement reported as a
   * flattering measurement. A lane that did not look must now say nothing.
   */
  skippedFigures?: number;
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
  | {
      ok: true;
      document: ParsedDocument;
      /**
       * Pictures this parse normalized, still as pixels.
       *
       * 🔴 A SIBLING OF `document`, NOT A FIELD ON IT, AND THAT PLACEMENT IS THE
       * SAFETY. `document` is the thing that gets recorded; a 20 MB array of
       * figure bytes hanging off it would be base64'd into a database column by
       * the first caller that stored the object whole — recreating the exact
       * working-set problem these assets exist to end. Out here it has to be
       * picked up deliberately, by a caller that has somewhere to put it.
       *
       * Absent means the format has no figures or none survived the media plan.
       */
      figures?: NormalizedFigure[];
    }
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
  | {
      ok: false;
      reason: "no-text";
      kind: DocumentKind;
      document: ParsedDocument;
      /** Same sibling placement, same reason, as on the success variant above. */
      figures?: NormalizedFigure[];
    }
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
 * How a Mistral-read document identifies itself in `parsed_documents.parser_version` and in
 * `coverage.parserVersion`.
 *
 * 🔴 THE PROVIDER AND THE MODEL, NOT A DATE. Every other parse in this table is stamped
 * `extract-YYYY-MM-DD`, which answers "which build of ours" — a useful question when we own the
 * extractor and a useless one when we do not. What matters for a vendor read is WHO read it and
 * WITH WHAT, because that is the pair that changes underneath us without a deploy.
 */
export const MISTRAL_PARSER_PREFIX = "mistral/";

/** The same, for the Office lane. `readBy` therefore names the vendor AND the tier that ran. */
export const LLAMA_PARSER_PREFIX = "llamaparse/";

/** What the coverage record calls a Mistral-read unit, per format. */
function coverageKindFor(kind: DocumentKind): "page" | "slide" | "document" {
  if (kind === "pptx") return "slide";
  if (kind === "pdf") return "page";
  return "document";
}

/**
 * Try the extraction vendor. `null` means "use the local extractors" and never means "this file
 * is bad" — a verdict about the FILE is only ever reached by the lane that actually read it.
 *
 * 🔴 IT RETURNS A WHOLE `ParseOutcome` RATHER THAN FILLING IN THE SHARED LOCALS ABOVE. The
 * alternative — set `text`/`model`/`coverage` and fall through the format chain — would put the
 * vendor inside the definite-assignment chain that every existing format depends on, so a mistake
 * here could change what a CSV does. This way the local lanes are byte-for-byte what they were.
 */
/**
 * Which vendor reads which format, and why it is two rather than one.
 *
 * 🔴🔴 THEY FAIL IN OPPOSITE DIRECTIONS, MEASURED ON THE OWNER'S OWN COURSEWORK. A PDF is painted
 * glyphs: a font whose "ti" is a single ligature defeats any text-layer reader, and on a 24-page
 * drug chart both our own parser and LlamaParse produced 60 corrupted words across 39 spellings
 * (`ac1on`, `contraindica1ons`) while Mistral, which reads the pixels, produced 16,823 words with
 * none. An Office file is the reverse: a deck's speaker notes live in `ppt/notesSlides/` and are
 * never painted on a slide, so an optical model cannot see them at all — Mistral returned a third
 * of one lecture's vocabulary, while LlamaParse has a `slideSpeakerNotes` field and recovered a
 * deck's declared 13,134 characters exactly.
 *
 * One vendor for both would therefore be wrong on half the corpus. PURE.
 */
function vendorFor(kind: DocumentKind): "mistral" | "llamaparse" | null {
  if (mistralHandles(kind)) return "mistral";
  if (llamaHandles(kind)) return "llamaparse";
  return null;
}

/**
 * The vendor clients `parseWithVendor` calls, injectable so a test can prove a call was AVOIDED
 * rather than merely that it failed. Defaults to the real network clients; production never
 * passes this argument.
 */
interface VendorClients {
  readWithMistral: typeof readWithMistral;
  readWithLlama: typeof readWithLlama;
}
const REAL_VENDOR_CLIENTS: VendorClients = { readWithLlama, readWithMistral };

/**
 * The images a PDF paints, and where. `null` when the file cannot be read that way.
 *
 * 🔴 A FAILURE HERE IS UNKNOWN, NEVER "NO FIGURES". Returning an empty model on a throw would
 * hand the accounting below a document that paints nothing, so every vendor read would pass the
 * figure gate and every one would report `skippedFigures: 0` — a broken decoder reported as a
 * clean document. `null` means nobody looked, and every consumer of it says so.
 *
 * 🔴 AND IT COPIES THE BYTES. pdf.js DETACHES the buffer it is handed, and on the rejection path
 * `parseDocument` hands the SAME bytes to the local PDF lane straight afterwards. Without the
 * copy that lane reads zeroes, which does not throw — it silently reports an empty document.
 */
async function readFigureSource(
  bytes: Uint8Array,
  options: ParseOptions,
): Promise<{ model: DocumentModel; images: ReadonlyMap<string, CapturedFigure> } | null> {
  try {
    const structural = await readPdfStructure(new Uint8Array(bytes), {
      // Pixels cost a PNG decode each, so they are only paid for on the lane that can spend
      // them. The GEOMETRY is read either way, so the gate holds on both lanes — an upload that
      // will not look at a figure still refuses a read that lost one.
      captureFigures: options.lookAtFigures === true,
      detectTables: false,
    });
    return { images: structural.figureImages, model: structural.model };
  } catch (cause) {
    console.warn(JSON.stringify({
      event: "vendor_figure_source_unavailable",
      detail: cause instanceof Error ? cause.message.slice(0, 300) : String(cause).slice(0, 300),
    }));
    return null;
  }
}

/**
 * Exported so a test can call it directly with a counting stub in place of the network client —
 * see `parse-document.test.ts`. Not part of `ParseOptions`; this is a test seam, not a product
 * knob, and it must not become one.
 */
export async function parseWithVendor(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  kind: DocumentKind,
  options: ParseOptions = {},
  vendors: VendorClients = REAL_VENDOR_CLIENTS,
): Promise<ParseOutcome | null> {
  const vendor = vendorFor(kind);
  if (!vendor) return null;

  // Computed once and reused below for the quality gate too — a pure, local read of the file's
  // own zip parts (see `mistral-quality.ts`), safe to call unconditionally: it returns a claim of
  // nothing for any kind that is not pptx or docx.
  const claim = claimOf(kind, bytes);

  let model: DocumentModel | null = null;
  let readBy = "";
  let unitsBilled = 0;

  if (vendor === "mistral") {
    const outcome = await vendors.readWithMistral(bytes, fileName, mimeType);
    if (!outcome.ok) {
      // `not-configured` is the ordinary state of a local checkout and of any preview deploy
      // without the key, so it is not worth a line in the log; everything else is a provider fact
      // worth seeing next to the document it happened to.
      if (outcome.reason !== "not-configured") {
        console.warn(JSON.stringify({ event: "mistral_fell_back", kind, ms: outcome.durationMs, reason: outcome.reason }));
      }
      return null;
    }
    model = modelFromMistral(outcome.response, kind, titleFromMistral(outcome.response));
    readBy = `${MISTRAL_PARSER_PREFIX}${outcome.response.model || "unknown"}`;
    unitsBilled = outcome.response.pages.length;
  } else {
    // 🔴 THE DETERMINISTIC HALF OF THE FIGURE-LOSS GATE (§46.6 follow-up, 2026-08-15).
    // `modelFromLlama` has exactly two item branches, `heading` and `table` — no picture branch
    // exists, so a PPTX carrying real pictures is GUARANTEED to come back with zero figure blocks
    // regardless of what LlamaParse itself returns. `judgeMistralRead` already rejects that read
    // every time (`found < claim.images` can never be false when `found` is structurally always
    // zero), so calling the vendor first only pays for a call whose outcome is not in doubt.
    //
    // This is NOT the same claim as the notes/tables cases below it, which stay genuinely
    // uncertain until the vendor answers — LlamaParse's own read of a deck's speaker notes, or a
    // Word document's tables, really can go either way, and skipping those ahead of time would
    // give up real wins the gate exists to allow through. Only the figures case is skipped, and
    // only for PPTX: `claimOf` never sets `images` for DOCX (see `mistral-quality.ts`), so this
    // reads as `false` there by construction rather than by a second condition to keep in sync.
    //
    // The result of skipping is BYTE-IDENTICAL to today's outcome for every such document: before
    // this change, the vendor was called, `judgeMistralRead` rejected it, and `parseWithVendor`
    // returned null so `parseDocument` fell through to the local PPTX lane. After this change,
    // the same `null` is returned one step earlier, into the exact same fallthrough. See
    // `parse-document.test.ts` for the assertion that the two paths produce the same
    // `ParseOutcome`.
    if (kind === "pptx" && claim.images > 0) {
      console.warn(
        JSON.stringify({ event: "vendor_skipped_would_lose_figures", images: claim.images, kind, vendor }),
      );
      return null;
    }

    const outcome = await vendors.readWithLlama(bytes, fileName);
    if (!outcome.ok) {
      if (outcome.reason !== "not-configured") {
        console.warn(JSON.stringify({ code: outcome.code, event: "llama_fell_back", kind, ms: outcome.durationMs, reason: outcome.reason }));
      }
      return null;
    }
    const { tier, version } = llamaTier();
    model = modelFromLlama(outcome.result as LlamaResult, kind, null);
    readBy = `${LLAMA_PARSER_PREFIX}${tier}@${version}`;
    unitsBilled = outcome.pages;
  }

  if (!model) {
    console.warn(JSON.stringify({ event: "vendor_unmappable", kind, pages: unitsBilled, vendor }));
    return null;
  }

  // 🔴 THE QUALITY GATE THE OWNER SPECIFIED, AND IT IS THE ONLY THING KEEPING THE LEGACY READERS
  // LOAD-BEARING. Everything above accepts that a vendor read may be worse in detail than a
  // format-native one; this refuses only the case where the FILE ITSELF declares content that did
  // not arrive — a deck whose speaker notes are missing, a Word document whose tables are gone.
  // It never compares against the legacy parser's output, because running both would cost exactly
  // what this change exists to stop paying.
  const verdict = judgeMistralRead(claim, model);
  if (!verdict.ok) {
    console.warn(
      JSON.stringify({ detail: verdict.detail, event: "vendor_quality_rejected", kind, missing: verdict.missing, vendor }),
    );
    return null;
  }

  // 🔴 THE PIXELS AND THE ACCOUNTING, BOTH FROM ONE PASS OVER THE ORIGINAL FILE. Mistral
  // returns a figure's COORDINATES and refuses its bytes — `mistral-ocr.ts` sends
  // `include_image_base64: false` on purpose, noting "the reader renders from the original file
  // anyway". This is that render. Without it a vendor-parsed PDF can never describe a diagram,
  // because nothing else in the process has ever decoded one: measured on the owner's diabetes
  // lecture, the vendor lane returned 8 figures and examined 0 of 8, where the native lane it
  // replaced routed 9 to vision.
  //
  // 🔴 IT IS NOT A SECOND PARSE AND MUST NEVER BECOME ONE. `pdfFigures.model` is read for
  // exactly two things — the rectangles of the images the file paints, and the pixels behind
  // them. Its text, its reading order, its tables and its unit counts are never consulted, and
  // nothing it produces reaches `text`, `unitsNative`, `unitsVision` or `parserVersion`. That is
  // the same line `parse-docling.ts` draws for the same reason; crossing it would rebuild the
  // double parse the vendor lane exists to remove. `detectTables` is off for that reason too:
  // this pass has no use for a grid.
  const pdfFigures = kind === "pdf" ? await readFigureSource(bytes, options) : null;

  // 🔴 THE FIGURE HALF OF THE QUALITY GATE, AND IT ASKS ABOUT REGIONS RATHER THAN COUNTS.
  // A count test on this lecture says "3 figures lost"; a figure-to-figure geometric test says
  // 5. Both would have rejected a read that lost nothing at all — five of those regions are
  // screenshots of ADA tables that Mistral OCR'd into real tables. See `figure-accounting.ts`
  // for the measurement. Only a region that arrived in NO form is loss, and that is what this
  // refuses. Calibrated against production geometry rather than a fixture: strip the figure
  // blocks out of this document's stored vendor model — the `image_limit: 0` failure — and the
  // count goes 0 to 3 (`scripts/bakeoff-vendor-figures.ts --strip-figures`).
  const accounting = pdfFigures ? accountForFigures(model, pdfFigures.model) : NO_ACCOUNTING;
  const figureVerdict = judgeFigureAccounting(accounting);
  if (!figureVerdict.ok) {
    console.warn(
      JSON.stringify({ detail: figureVerdict.detail, event: "vendor_quality_rejected", kind, missing: figureVerdict.missing, vendor }),
    );
    return null;
  }

  // 🔴 SAID OUT LOUD, BECAUSE `asContent` IS INVISIBLE EVERYWHERE ELSE. A region that arrived as
  // a table rather than as a figure is not loss and so has no place in the coverage record — but
  // it is the whole reason this gate is not a count, and if the vendor's behaviour ever changes
  // this line is the only place that would show it. `absent` is always 0 here: a non-zero one
  // returned above.
  if (accounting.regions.length > 0) {
    console.info(JSON.stringify({
      asContent: accounting.asContent,
      asFigure: accounting.asFigure,
      event: "vendor_figure_accounting",
      regions: accounting.regions.length,
      vendor,
    }));
  }

  // The vision pass the native lane runs, applied to the vendor's model. `matchFigureImages`
  // pairs the vendor's figure rectangles with the images we just decoded for the SAME file;
  // `lookAtFigures` spends from the ambient `VisionLedger` through `readFiguresWithVision`, so
  // this lane debits the same per-document budget as every other and cannot become a second,
  // unmetered door. A figure with no match keeps its honest reason and never fails the parse.
  let looked: FigureLookResult | null = null;
  if (pdfFigures && options.lookAtFigures) {
    const matched = matchFigureImages(model, pdfFigures.model, pdfFigures.images);
    looked = await lookAtFigures(model, matched.images);
    model = looked.model;
  }

  const unitsRead = new Set(
    model.blocks.filter((block) => block.text.trim() || block.table).map((block) => block.unit),
  ).size;

  let coverage = mistralCoverage({
    // 🔴 WHAT THE MODEL SAYS AFTER THE PASS, NOT A COUNT ASSUMED UNEXAMINED. `mistralCoverage`
    // could only ever build `described: 0, not-examined: N` from a bare number, which was true
    // while no vendor figure was examined and would have gone on reporting it after this change
    // — a coverage record contradicting the model beside it.
    ...(looked ? { figureCoverage: figureCoverageOf(model) } : { figures: model.blocks.filter((block) => block.kind === "figure").length }),
    unitKind: coverageKindFor(kind),
    units: model.units.length,
    unitsRead,
  });
  // The vendor's own answer, so a silent model change on their side is visible on ours. Recorded
  // even when it differs from what we asked for — especially then.
  coverage = { ...coverage, parserVersion: readBy };

  const full = documentToText(model);
  const capped = capText(full, TEXT_CAP);
  coverage = withTruncation(coverage, extractCut(TEXT_CAP, capped.text.length, full.length));
  const text = capped.text.trim();

  const document: ParsedDocument = {
    coverage,
    kind,
    model,
    readBy,
    // 🔴 PRESENT ONLY WHEN SOMETHING LOOKED. `overBudget` is a figure the router's per-document
    // ceiling refused, `notSent` one the vision ledger would not pay for, `withoutPixels` one we
    // routed and could not decode. All three are figures this lane skipped, which is what the
    // field has always meant on the deck lane.
    // With no pass — an Office file, or a PDF whose structural read threw — the field is absent,
    // because "we did not look" is not "there were none".
    ...(looked
      ? { skippedFigures: looked.report.overBudget + looked.report.withoutPixels + looked.report.notSent }
      : {}),
    text,
    title: model.title,
  };

  // The same refusal the local lanes make, for the same reason: a document with structure and no
  // readable text is worth remembering even though there is nothing to show a student yet.
  if (!text) {
    return hasStructure(model) ? { document, kind, ok: false, reason: "no-text" } : null;
  }
  return { document, ok: true };
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

  // 🔴 THE VENDOR GETS FIRST REFUSAL, AND A REFUSAL COSTS NOTHING. Extraction is infrastructure
  // (owner, 2026-08-13): Mistral answers "what is in this document and where", and everything
  // below this line stays exactly as it was for the cases it declines. `null` means "not
  // configured, or it did not work" — never a verdict about the file — so the local extractors
  // run unchanged and an upload can never fail because a provider did.
  //
  // 🔴 BEFORE THE `image` GUARDS ON PURPOSE. Those guards exist to protect the Gemini call; a
  // provider that does not need them must not be gated by them. `mistralHandles` excludes images
  // anyway, so today this is ordering that documents an intent rather than ordering that changes
  // an outcome — which is precisely when it is cheap to get right.
  if (vendorFor(kind)) {
    const read = await parseWithVendor(bytes, fileName, mimeType, kind, options);
    if (read) return read;
  }

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
  /** Pixels, held only until a caller with storage takes them. See `ParseOutcome`. */
  let normalized: NormalizedFigure[] | undefined;

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
  } else if (kind === "text") {
    // 🔴 A STUDENT'S OWN NOTES. This lane was a door with nothing behind it until now: offered by
    // every upload control, accepted by storage, allowed by the database — and refused here.
    //
    // Deterministic, and the two formats are read differently on purpose. Markdown STATES its
    // structure, so `#` becomes a heading; plain text states nothing, so nothing is inferred and
    // every paragraph stays a paragraph. See `text-structure.ts`.
    const read = readTextDocument(bytes, { markdown: isMarkdown(fileName, mimeType) });
    model = read.model;
    text = documentToText(model);
    title = read.title;
    // One unit, read natively and completely. There is no partial case here: either the bytes
    // decoded or the file is empty, and an empty file is caught by the `!text` verdict below —
    // which is why this is `singleUnitCoverage` and not a bespoke text coverage shape.
    coverage = singleUnitCoverage({ method: "native", read: text.trim().length > 0 });
  } else {
    const deck = readPptxSlides(bytes);
    // The pictures are in memory RIGHT HERE and nowhere else. `deck.imageBytes` holds
    // every figure already unwrapped and downscaled — 34 TIFFs became PNG on the way
    // in — and until now they were sent to vision and then dropped, so the only route
    // back to a diagram was re-downloading and re-parsing the whole file. Taking a
    // reference now costs nothing: the same arrays, kept rather than collected.
    normalized = normalizedFigures(deck.imageBytes, deck.media.images);
    // 🔴 `readFiguresWithVision`, NOT `describeFiguresWithVision` — SAME CALL, TWO ANSWERS (§46.6).
    // The labelled-diagram labels come back off the request that was already being made, so a deck
    // full of anatomy slides costs exactly what it did before. Nothing extra is sent and nothing
    // extra is billed; the reply is simply read for more than its prose.
    const seen = deck.media.images.length
      ? await readFiguresWithVision(
          deck.media.images.flatMap((image) => {
            const data = deck.imageBytes.get(image.name);
            return data ? [{ bytes: data, mime: image.mime, name: image.name }] : [];
          }),
        )
      : { descriptions: new Map<string, string>(), labels: new Map<string, FigureLabel[]>() };
    const figures = seen.descriptions;
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
      seen.labels,
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
    // 🔴 AND THE PICTURES RIDE ALONG. A deck exported as images is the case where
    // stored figures matter MOST — there is nothing else in it — so dropping them on
    // the refusal path would starve exactly the document that needs them.
    return hasStructure(model)
      ? { document, figures: normalized, kind, ok: false, reason: "no-text" }
      : { kind, ok: false, reason: "empty" };
  }
  return { document, figures: normalized, ok: true };
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
      // 🔴 `seen` IS ALREADY KEYED THE WAY UNITS ARE — 0-BASED — AND CONVERTING IT
      // COST US THE TEXT. This line used to subtract one, under a comment
      // asserting the keys were 1-based. They are not: they are the indices
      // handed to `readPdfPagesWithVision` above, which come from `thinPages`,
      // which builds them with `.map((text, index) => …)`. So every transcript
      // was filed on the page BEFORE the one it was read from — and when the
      // thin page was the first page the key became -1, a page that does not
      // exist, and the text vanished from the layout output, the page markdown
      // and the document markdown alike. Nothing logged; coverage still counted
      // the page as read. We paid for the answer and threw it away.
      if (model) {
        model = withVisionText(model, seen);
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
