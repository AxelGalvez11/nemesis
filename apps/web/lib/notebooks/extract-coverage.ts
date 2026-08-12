// Turning what each extractor actually did into one honest record.
//
// The extraction route knows different things about each format — per-page text
// for a PDF, a slide/notes/chart tally for a deck, nothing but a byte count for
// a Word file. This module is where those become the SAME shape, so every
// surface downstream reads one type instead of four ad-hoc objects.
//
// It used to be four ad-hoc objects. `coverage` left the route as
// `Record<string, number | boolean>` with different keys per format, the client
// type had no field for it, and so nothing could consume it even in principle.
//
// PURE. Facts in, a record out — no pdf.js, no zip, no network.

import {
  buildCoverage,
  type ExtractionCoverage,
  type FigureCoverage,
  type FigureSkipReason,
  type TruncationRecord,
} from "@nemesis/shared";
import { pageTextLength, THIN_PAGE_CHARS } from "@/lib/pdf/pages";

/**
 * A record that could not be built is a bug, not a reason to stay quiet.
 *
 * 🔴 THE FALLBACK MUST NOT BE CHEERFUL. If the numbers do not reconcile we know
 * something is wrong and know nothing about what — so the record says the whole
 * document is unaccounted for, which reads as "partial" everywhere and makes the
 * bug visible. Falling back to "complete" would restore exactly the silence this
 * module exists to end.
 */
function orUnaccounted(result: ExtractionCoverage | string, unitKind: "page" | "slide" | "sheet" | "document", units: number): ExtractionCoverage {
  if (typeof result !== "string") return result;
  console.warn(JSON.stringify({ event: "coverage_inconsistent", detail: result }));
  const fallback = buildCoverage({ unitKind, units: Math.max(units, 1), unitsNative: 0, unitsUnread: Math.max(units, 1) });
  // The fallback is built from constants that cannot fail to reconcile; the cast
  // documents that, and the throw is a tripwire in case it ever stops being true.
  if (typeof fallback === "string") throw new Error(`coverage fallback is itself inconsistent: ${fallback}`);
  return fallback;
}

/** A cut worth recording — nothing at all when nothing was dropped. */
export function extractCut(limit: number, kept: number, original: number): TruncationRecord[] {
  const dropped = original - kept;
  return dropped > 0 ? [{ stage: "extract", limit, kept, dropped }] : [];
}

/**
 * A PDF's coverage, from the per-page text and what vision managed to read.
 *
 * 🔴 THE FOUR STATES COME FROM TWO INDEPENDENT FACTS, and both have to be kept:
 * whether a page had usable text of its own, and whether vision read it.
 *
 *     had text   vision read   ->  native   (the ordinary page)
 *     had text   vision read   ->  both     (a heading over a screenshot)
 *     no text    vision read   ->  vision   (a scan)
 *     no text    not read      ->  unread   (the number that must not hide)
 *
 * `thin` is the set of pages judged not really read from their text alone, which
 * is the same rule `planPdfRead` uses to decide what to send — so a page counted
 * unread here is exactly a page the reader could not use.
 */
export function pdfCoverage(input: {
  pageTexts: readonly string[];
  /** 1-based page numbers vision actually returned text for. */
  readByVision: ReadonlySet<number>;
  truncation?: readonly TruncationRecord[];
  /**
   * The document's figures, when a reader that can see them produced the parse.
   *
   * 🔴 OMITTING IT MEANS UNKNOWN, NOT NONE — and the two must not look alike.
   * `unpdf`, which production ships today, exposes no image operators at all, so
   * a parse from that lane genuinely does not know whether the file has figures.
   * Passing a zeroed record from there would assert "this document has no
   * pictures" about 89 of 120 real course files that do.
   */
  figures?: FigureCoverage;
  /**
   * Units the file declares beyond the ones `pageTexts` describes.
   *
   * 🔴 THE UNIT CAP REACHES THE STUDENT THROUGH HERE, AS UNREAD PAGES.
   * A hundred-thousand-page PDF is stopped at `MAX_UNITS_PER_PARSE`, and without
   * this the record would describe the 5,000 pages we read as the whole file —
   * complete, nothing missing, a document quietly renamed to its own prefix.
   * Counting them as unread is both the truth and the existing mechanism: the
   * four buckets still reconcile and `describeCoverage` already knows how to say
   * "5,000 of 100,000 pages could be read".
   *
   * They are counted rather than materialised because the cap exists precisely
   * for files whose declared unit count is adversarially large; building 100,000
   * empty strings to represent them would be the same denial-of-service wearing
   * a different hat.
   */
  unreadBeyondCap?: number;
  /**
   * Regions a reader located and could not deliver — today, table regions the
   * layout model found and the grid builder could not reconstruct.
   *
   * 🔴 WITHOUT THIS, AN UNREADABLE TABLE ON A TEXT-FULL PAGE READS AS COMPLETE.
   * The page has plenty of native text, so it lands in `unitsNative` and every
   * unit reconciles — while the densest thing on it, the part a student
   * actually wants, never reached them. The unit buckets cannot express that,
   * because the failure is smaller than a page. `deriveState` already forces
   * `partial` on any non-zero count, so plumbing it here is the whole fix.
   */
  unreadableRegions?: number;
}): ExtractionCoverage {
  let native = 0;
  let vision = 0;
  let both = 0;
  let unread = 0;
  for (let index = 0; index < input.pageTexts.length; index += 1) {
    const hasOwnText = pageTextLength(input.pageTexts[index] ?? "") >= THIN_PAGE_CHARS;
    const wasRead = input.readByVision.has(index + 1);
    if (hasOwnText && wasRead) both += 1;
    else if (hasOwnText) native += 1;
    else if (wasRead) vision += 1;
    else unread += 1;
  }
  const beyond = Math.max(input.unreadBeyondCap ?? 0, 0);
  const units = input.pageTexts.length + beyond;
  return orUnaccounted(
    buildCoverage({
      unitKind: "page",
      units,
      unitsNative: native,
      unitsVision: vision,
      unitsBoth: both,
      unitsUnread: unread + beyond,
      truncation: input.truncation,
      ...(input.figures ? { figures: input.figures } : {}),
      ...(input.unreadableRegions ? { unreadableRegions: input.unreadableRegions } : {}),
    }),
    "page",
    units,
  );
}

/**
 * A PDF read whole by a vision model in one request — every page came back from
 * the pixels, so there is no per-page text to reason from.
 */
export function pdfWholeCoverage(pages: number, truncation?: readonly TruncationRecord[]): ExtractionCoverage {
  return orUnaccounted(
    buildCoverage({ unitKind: "page", units: pages, unitsNative: 0, unitsVision: pages, truncation }),
    "page",
    pages,
  );
}

/** The deck tally `readPptxSlides` already produces, in the shared shape. */
export interface DeckCounts {
  slides: number;
  imagesFound: number;
  imagesReadable: number;
  imagesUnreadable: number;
  imagesGlyphs: number;
  imagesDroppedToCap: number;
}

/**
 * A deck's coverage.
 *
 * 🔴 EVERY SLIDE IS READ. A .pptx slide is XML, so its text always extracts —
 * what goes missing in a deck is the PICTURES, which is why the figure tally
 * carries the weight here and the unit counts are uniformly native. Claiming a
 * slide "unread" because its figure was skipped would be the wrong unit and
 * would make the page counts meaningless across formats.
 *
 * `described` is what vision actually returned, NOT what was planned: a planned
 * figure whose description failed is a skip, and calling it read would put the
 * lie back one level down.
 */
export function pptxCoverage(input: {
  counts: DeckCounts;
  described: number;
  /** False when no vision key is configured, so unread figures get the reason
   *  that names the real cause rather than being blamed on the file. */
  visionAvailable: boolean;
  truncation?: readonly TruncationRecord[];
}): ExtractionCoverage {
  const { counts } = input;
  const described = Math.min(input.described, counts.imagesFound);
  const reasons: Partial<Record<FigureSkipReason, number>> = {};
  if (counts.imagesGlyphs > 0) reasons.decorative = counts.imagesGlyphs;
  if (counts.imagesUnreadable > 0) reasons["unreadable-format"] = counts.imagesUnreadable;
  if (counts.imagesDroppedToCap > 0) reasons["over-cap"] = counts.imagesDroppedToCap;
  // Whatever is left over: readable pictures that were planned and still have no
  // description. Vision being off is the usual cause and the honest label; when
  // it IS on, the call failed, which is the same loss to the student either way.
  const accounted = described + counts.imagesGlyphs + counts.imagesUnreadable + counts.imagesDroppedToCap;
  const undescribed = Math.max(0, counts.imagesFound - accounted);
  if (undescribed > 0) reasons["vision-unavailable"] = undescribed;

  const skipped = counts.imagesFound - described;
  const figures: FigureCoverage = { found: counts.imagesFound, described, skipped, reasons };
  return orUnaccounted(
    buildCoverage({
      unitKind: "slide",
      units: counts.slides,
      unitsNative: counts.slides,
      figures,
      truncation: input.truncation,
    }),
    "slide",
    counts.slides,
  );
}

/**
 * A Word document's coverage.
 *
 * 🔴 THIS EXISTS BECAUSE `singleUnitCoverage` COULD NOT SAY "AND THERE ARE
 * PICTURES IN IT". Word was the one format with no figure record at all, so a
 * .docx whose diagrams nobody had looked at reported `complete` — measured over
 * 158 real course files, 207 placed pictures in 46 of them, every one silently
 * absent from both the text and the coverage. The unit story is unchanged and
 * still honest: ONE unit of kind `document`, because Word paginates at layout
 * time and this parser cannot see a page.
 *
 * `figures` comes from the model (`figureCoverageOf`), where a picture with no
 * description and no stated reason lands in `not-examined` — which is what makes
 * such a document `partial` rather than complete. Omitting the argument means
 * UNKNOWN, not none: a caller that has no model must not assert the file has no
 * pictures.
 */
export function docxCoverage(input: {
  read: boolean;
  figures?: FigureCoverage;
  truncation?: readonly TruncationRecord[];
}): ExtractionCoverage {
  const read = input.read ? 1 : 0;
  return orUnaccounted(
    buildCoverage({
      unitKind: "document",
      units: 1,
      unitsNative: read,
      unitsUnread: 1 - read,
      truncation: input.truncation,
      ...(input.figures ? { figures: input.figures } : {}),
    }),
    "document",
    1,
  );
}

/**
 * A workbook's coverage.
 *
 * 🔴 EVERY SHEET IS READ, AND AN EMPTY SHEET IS READ TOO. A sheet's cells are
 * XML: if there are none, the sheet is genuinely empty and we know that with
 * certainty. That is NOT the PDF situation, where a page with no text layer may
 * be a scan whose words are pixels — there, "no text" is a failure to read and
 * counting it unread is honest. Marking a blank tab unread would make almost
 * every real workbook `partial`, and a warning that appears everywhere is read
 * nowhere.
 *
 * 🔴 WHAT DOES DOWNGRADE IT IS CONTENT WE SAW AND COULD NOT DELIVER — a chart, a
 * pivot table, a macro. Those go to `unreadableRegions`, which is exactly the
 * field's stated purpose ("the next parser will hit this with a different node
 * label — a chart with no data"), and any non-zero count forces `partial`. A
 * workbook whose point is its chart must not report itself completely read;
 * unsupported is not absent.
 */
export function xlsxCoverage(input: {
  sheets: number;
  /** Charts, pivot tables, macros — located, not turned into content. */
  unreadable?: number;
  truncation?: readonly TruncationRecord[];
}): ExtractionCoverage {
  const sheets = Math.max(input.sheets, 0);
  return orUnaccounted(
    buildCoverage({
      unitKind: "sheet",
      units: sheets,
      unitsNative: sheets,
      truncation: input.truncation,
      ...(input.unreadable ? { unreadableRegions: input.unreadable } : {}),
    }),
    "sheet",
    sheets,
  );
}

/**
 * A file with no unit structure this parser can see — a photograph, or any
 * format whose reader cannot yet describe what is inside it.
 *
 * 🔴 `units: 1, unitKind: "document"` IS A CLAIM ABOUT THE PARSER, NOT THE FILE.
 * A .docx has pages when Word lays it out; our extraction cannot see them.
 * Reporting one "document" says exactly that and leaves the page count to
 * whichever parser earns the right to claim one. Inventing "page 1 of 1" for a
 * 40-page dissertation would be a fabricated locator, and every citation built
 * on it would point at nothing.
 */
export function singleUnitCoverage(input: {
  read: boolean;
  method: "native" | "vision";
  truncation?: readonly TruncationRecord[];
}): ExtractionCoverage {
  const read = input.read ? 1 : 0;
  return orUnaccounted(
    buildCoverage({
      unitKind: "document",
      units: 1,
      unitsNative: input.method === "native" ? read : 0,
      unitsVision: input.method === "vision" ? read : 0,
      unitsUnread: 1 - read,
      truncation: input.truncation,
    }),
    "document",
    1,
  );
}
