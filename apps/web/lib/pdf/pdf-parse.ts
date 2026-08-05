// The PDF read this app already does, expressed as a ParsedDocument.
//
// Nothing here re-reads a PDF. lib/pdf/extract.ts already hands back the text
// layer page by page, and lib/pdf/pages.ts already decides which pages hold their
// content as a picture. This file is the mapping from those two answers into the
// shape in packages/shared/src/doc-model.ts, so a citation, a chunk and a coverage
// report never have to know that a PDF was involved.
//
// SPLIT ON PURPOSE. buildPdfParsedDocument is PURE — a record of what was read in,
// a ParsedDocument out — so every rule below is testable without a PDF. The async
// shell underneath it only fetches facts and hands them to the pure function.
//
// 🔴 NO BLOCK CARRIES A BOX, and that is a measurement, not laziness. unpdf 0.12.2
// (the pinned version) implements extractText as
// `items.filter(i => i.str != null).map(i => i.str + (i.hasEOL ? "\n" : "")).join("")`
// — the string and the line break survive, the position does not. So the per-page
// strings this module consumes contain no geometry whatsoever, and the honest
// answer is an absent box. The geometry does exist one call lower down: the
// PDFDocumentProxy that getDocumentProxy returns is a real pdf.js proxy, and
// page.getTextContent() items carry `transform`, `width`, `height` and `fontName`
// at 0.12.2 (checked against the pinned build, not assumed). Reading it means a
// second pass over every page, which is a new read rather than an adaptation of
// this one — so it belongs to whoever builds that pass. An invented box is worse
// than no box, because a consumer cannot tell the difference.
//
// 🔴 AND NO HEADINGS. With no geometry, the only signals left for promoting a line
// to a heading are its length, its capitalisation and its punctuation — every one
// of which is an assumption about Latin script and English prose. A document model
// that is wrong for Japanese, Arabic or a numbered legal clause is not
// field-agnostic. So every text-layer block is a paragraph until there is a real
// measurement to promote it.

import type {
  DocBlock,
  DocCoverage,
  DocUnit,
  Locator,
  ParsedDocument,
} from "@nemesis/shared";
import { extractPdfText, type ExtractResult } from "@/lib/pdf/extract";
import {
  PAGE_READ_SCORER_VERSION,
  type PageReadDecision,
  type PageReadReason,
  scorePagesRead,
} from "@/lib/pdf/page-read";

/**
 * The build of this mapping. A new value means a NEW parsed_documents row rather
 * than an overwrite, so "reprocess everything parsed by version X" stays
 * answerable. Bump it when the units, blocks or coverage this file produces
 * change shape or meaning — notably when boxes or headings arrive.
 *
 * 1.1.0: which pages count as read stopped being a character count and became the
 * scored, script-aware decision in lib/pdf/page-read.ts, so coverage numbers from
 * before and after this version are not comparable page for page.
 */
export const PDF_PARSER_VERSION = "pdf-1.1.0";

/** Facts that live in the PDF itself rather than in its text. Read once, from one
 *  document proxy, because both come off the same catalog. */
export interface PdfDocumentFacts {
  /** One entry per page, in page order, as the PDF's own /PageLabels says it
   *  should be numbered. `null` when the file declares no labels at all — which is
   *  most files, and is not a failure. */
  pageLabels: readonly (string | null)[] | null;
  /** The PDF's own /Info dictionary, narrowed to the fields worth keeping. */
  info: { title: string | null; producer: string | null; creator: string | null };
}

/**
 * Everything the existing read produced, in one object.
 *
 * It is deliberately a record of what HAPPENED rather than a set of instructions:
 * this module never decides to call anything, so a caller that read no pages and a
 * caller that read forty describe themselves the same way.
 */
export interface PdfReadRecord {
  /** sha256 of the ORIGINAL bytes. Physical identity; this module never computes it. */
  contentHash: string;
  /** extractPdfText().pageTexts — the text layer, one entry per page, in order. */
  pageTexts: readonly string[];
  /** extractPdfText().meta.pages. Kept separate from pageTexts.length because a
   *  malformed file can disagree with itself, and the disagreement is reportable. */
  pageCount: number;
  /** extractPdfText().meta.title — the first plausible line of the text layer.
   *  Used only when the PDF declares no title of its own. */
  guessedTitle?: string | null;
  /**
   * Whether the text handed downstream was clipped at the character ceiling.
   *
   * An INPUT, never recomputed here. The route derives it from finishPdfPages on
   * the page-splicing path and from extractPdfText on the plain one; a second
   * opinion computed from string lengths in this file would silently disagree with
   * whichever one actually ran.
   */
  truncated: boolean;
  /**
   * Transcripts of picture-pages, keyed by 0-BASED page index exactly as
   * readPdfPagesWithVision returns them. Empty (or absent) whenever no page was
   * read from its pixels — which is the common case, and today the only one in
   * production.
   */
  transcripts?: ReadonlyMap<number, string>;
  /** Page indices (0-based) that were SENT to be read. Optional: when it is given,
   *  a page that was never sent can be told apart from one that was sent and came
   *  back empty, and both from a page nobody tried. */
  requested?: readonly number[];
  /** The whole-document transcript, when every page was a picture and the file was
   *  read in a single pass. It has no page boundaries — see the unit it becomes. */
  wholeTranscript?: string | null;
  facts?: PdfDocumentFacts | null;
  /** The score at or above which a page counts as read from its own text layer.
   *  Overridable so a test can be explicit; defaults to READ_SCORE in
   *  lib/pdf/page-read.ts, where the signals behind the score also live. */
  readScore?: number;
}

/** Blank-line-separated runs of a page's text.
 *
 *  A blank line is something the text layer MARKS (unpdf emits a newline wherever
 *  the page's own text items say a line ended), so splitting on it segments what is
 *  there rather than guessing at structure. Every other paragraph cue — indentation,
 *  leading, first-line capitals — needs geometry this module does not have. PURE. */
export function splitTextLayerBlocks(pageText: string): string[] {
  // CRLF is matched as well as LF. unpdf emits a bare "\n" for a line break, but a
  // carriage return can arrive inside a text item's own string, and a page whose
  // blank lines were CRLF would otherwise come back as one undivided block.
  return pageText
    .split(/(?:\r?\n)[^\S\r\n]*(?:\r?\n)+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The page's printed number, when the PDF says it differs from its position.
 *
 * Front matter numbered i, ii, iii and appendices that restart at 1 both cite
 * wrongly if a reader is told "page 4" for a page whose corner says "ii". Equal
 * values are dropped rather than stored: printedLabel exists for the difference,
 * and repeating the ordinal in it would make every consumer print it twice. PURE.
 */
export function printedLabelFor(
  labels: readonly (string | null | undefined)[] | null | undefined,
  pageNumber: number,
): string | undefined {
  if (!labels) return undefined;
  const label = labels[pageNumber - 1];
  if (typeof label !== "string") return undefined;
  const trimmed = label.trim();
  if (!trimmed || trimmed === String(pageNumber)) return undefined;
  return trimmed;
}

/** What this parser does not even attempt, said once so a zero is never read as an
 *  absence. In a PDF a figure is drawn INTO its page — most diagrams are vector
 *  operators, and bitmaps are routinely one figure sliced into strips — so the page,
 *  not the picture, is the only unit that is reliably the thing a person looks at.
 *  A picture-page becomes transcribed text, never a DocVisual. */
export const PDF_NO_VISUALS_NOTE =
  "This parser reports pages, not pictures: a PDF figure is drawn into its page rather than stored as a file, so no visuals or tables are extracted and every visual and table count here is zero.";

/** Said on every parse, because "no box" has two possible meanings and only one of
 *  them is true here. */
export const PDF_NO_GEOMETRY_NOTE =
  "No block carries a box: the text extractor keeps each item's characters and line breaks and discards its position, so nothing about where text sits on the page was measured.";

/** The mapping. PURE: no I/O, no clock, no randomness — the same record always
 *  produces the same document, ids included. */
export function buildPdfParsedDocument(record: PdfReadRecord): ParsedDocument {
  const pageTexts = record.pageTexts;
  const transcripts = record.transcripts ?? new Map<number, string>();
  const labels = record.facts?.pageLabels ?? null;
  const whole = (record.wholeTranscript ?? "").trim();

  // Which pages hold their content as a picture, and WHY each one was judged that
  // way. Recomputed from the same pure scorer the read used, rather than passed in,
  // so the coverage report and the read decision can never drift apart.
  const decisions = scorePagesRead(
    pageTexts,
    record.readScore === undefined ? {} : { readScore: record.readScore },
  );
  const thin = decisions.filter((decision) => !decision.read).map((decision) => decision.index);
  const thinSet = new Set(thin);

  const units: DocUnit[] = pageTexts.map((text, index) => {
    const pageNumber = index + 1;
    const printedLabel = printedLabelFor(labels, pageNumber);
    const locator: Locator = {
      kind: "page",
      index: pageNumber,
      ...(printedLabel ? { printedLabel } : {}),
    };
    const blocks: DocBlock[] = [];
    for (const part of splitTextLayerBlocks(text)) {
      blocks.push({
        id: `p${pageNumber}-b${blocks.length}`,
        kind: "paragraph",
        ordinal: blocks.length,
        text: part,
        method: "textLayer",
      });
    }
    const transcript = transcripts.get(index)?.trim();
    if (transcript) {
      // The page's own words and a machine's reading of its pixels stay SEPARATE
      // blocks, in that order — the same rule splicePages follows in prose. A
      // heading extracted from the text layer is the document's exact wording; the
      // transcript underneath it is not, and blending them into one block would
      // erase the difference for every consumer downstream.
      //
      // No `confidence` is set. A transcription is uncertain in kind, but this
      // module has no measured number for it, and a made-up 0.5 would be exactly
      // the invented provenance the model forbids. `method: "vision"` and
      // `transcribed` are the honest signals, and they are structured, not prose —
      // so no "[Read from the page image]" marker is written into the text either.
      blocks.push({
        id: `p${pageNumber}-b${blocks.length}`,
        kind: "paragraph",
        ordinal: blocks.length,
        text: transcript,
        method: "vision",
      });
    }
    return { locator, blocks, ...(transcript ? { transcribed: true } : {}) };
  });

  if (whole) {
    // Every page was a picture and the file was read in ONE pass, so the transcript
    // arrives with no page boundaries in it. Slicing it back into pages would mean
    // deciding where page 3 ends, which nothing measured — so it is recorded at
    // document level, the same answer the model gives for an image. The page units
    // above still exist and still hold whatever scraps their text layer had; this
    // unit is appended rather than replacing them, and only when such a read
    // actually happened.
    units.push({
      locator: { kind: "document" },
      transcribed: true,
      blocks: [
        {
          id: "doc-b0",
          kind: "paragraph",
          ordinal: 0,
          text: whole,
          method: "vision",
        },
      ],
    });
  }

  const coverage = buildPdfCoverage(record, decisions, thin, thinSet, transcripts, whole);
  const title = record.facts?.info.title?.trim() || record.guessedTitle?.trim() || undefined;
  const meta: Record<string, string | number | boolean> = {};
  const producer = record.facts?.info.producer?.trim();
  const creator = record.facts?.info.creator?.trim();
  if (producer) meta.producer = producer;
  if (creator) meta.creator = creator;
  if (labels) meta.hasPageLabels = true;
  // The routing decision, per page, in a form something can query later. Only the
  // pages the text layer did not carry are written: they are the ones a bill or a
  // complaint is ever about, and on a 2,000-page scan every page would be listed.
  //
  // 🔴 THIS IS NOT coverage.unitsUnread AND THE TWO DISAGREE ON PURPOSE. This says
  // which pages the text layer failed to carry; unitsUnread says which pages nobody
  // ended up reading at all. On a document read whole from its pixels every page
  // fails the first test and none fails the second, so this field is full and
  // unitsUnread is empty — both true, about different questions.
  const unreadRecord = pageReadRecord(decisions);
  if (unreadRecord) {
    meta.pageReadScorer = PAGE_READ_SCORER_VERSION;
    meta.pageReadUnread = unreadRecord;
  }

  return {
    contentHash: record.contentHash,
    kind: "pdf",
    parserVersion: PDF_PARSER_VERSION,
    ...(title ? { title } : {}),
    units,
    tables: [],
    visuals: [],
    coverage,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

/**
 * How many unread pages the per-page record may name.
 *
 * The record is stored with the parse, and a scanned book would otherwise put
 * thousands of entries in a field meant for facts. Past the cap the entries stop
 * and a note says so — unitsUnread still names EVERY unread page, so nothing is
 * hidden by the cap, only its reason.
 */
export const PAGE_READ_RECORD_CAP = 50;

/**
 * The pages the text layer did not carry, as JSON: page number to the reason and
 * the score behind it.
 *
 * JSON rather than prose because this is the auditing artifact — "how many pages
 * did we send to be re-read because their text layer was garbled, across every
 * document imported in June" is a question about data, and a sentence cannot
 * answer it. Keyed by PAGE NUMBER, matching every locator in the document, so
 * nobody has to remember which of the two is 0-based. Returns null when every page
 * read fine, so an ordinary document carries no meta at all. PURE.
 */
function pageReadRecord(decisions: readonly PageReadDecision[]): string | null {
  const unread = decisions.filter((decision) => !decision.read);
  if (unread.length === 0) return null;
  const entries: Record<string, { reason: PageReadReason; score: number }> = {};
  for (const decision of unread.slice(0, PAGE_READ_RECORD_CAP)) {
    entries[String(decision.index + 1)] = { reason: decision.reason, score: decision.score };
  }
  return JSON.stringify(entries);
}

/** One prose line per reason that actually occurred, in a fixed order so two parses
 *  of the same document read identically. Counted over EVERY page, read or not, so
 *  the line is a description of the document rather than of its failures. PURE. */
function pageReadNotes(decisions: readonly PageReadDecision[]): string[] {
  const counts = new Map<PageReadReason, number>();
  for (const decision of decisions) {
    counts.set(decision.reason, (counts.get(decision.reason) ?? 0) + 1);
  }
  const said: Record<PageReadReason, string> = {
    "no-text-layer": "had no text layer at all",
    "thin-text-layer": "carried too little text to have been read from the page itself",
    "garbled-text-layer":
      "had text of a plausible length whose characters carry no information, which is what a broken font map produces",
    "thin-for-this-document":
      "cleared the absolute floor but returned a small fraction of what this document's own pages return",
    "short-composed-page":
      "is short but composed — a title page or a divider — and was left alone rather than re-read as a picture",
    "text-layer": "carried its own words",
  };
  const order: PageReadReason[] = [
    "text-layer",
    "short-composed-page",
    "no-text-layer",
    "thin-text-layer",
    "garbled-text-layer",
    "thin-for-this-document",
  ];
  const lines = order
    .filter((reason) => (counts.get(reason) ?? 0) > 0)
    .map((reason) => `${counts.get(reason)} page(s): ${said[reason]}.`);
  if (lines.length === 0) return [];
  const out = [`Page readability was scored by ${PAGE_READ_SCORER_VERSION}. ${lines.join(" ")}`];
  // Counted from the decisions themselves rather than by subtracting the reasons
  // that mean "read": a seventh reason would silently break the subtraction, and
  // the count above is the number this note has to be true about.
  const unread = decisions.filter((decision) => !decision.read).length;
  if (unread > PAGE_READ_RECORD_CAP) {
    out.push(
      `Only the first ${PAGE_READ_RECORD_CAP} of the ${unread} pages the text layer did not carry have their reason kept alongside this parse.`,
    );
  }
  return out;
}

/**
 * What was read and what was not, at parity with the coverage the extract route
 * already reports — the same arithmetic, expressed in the model's own fields.
 *
 * The route says {pages, pagesFromText, pagesRead, pagesUnread}; here that becomes
 * unitsFound, unitsRead and unitsUnread, with unitsUnread carrying the page NUMBERS
 * rather than a count, so the gap is nameable instead of merely countable.
 *
 * The rule that makes those numbers agree: a page the scorer judged unread counts
 * as UNREAD even when it carried a line of text. That is measured, not conservative
 * — a page whose whole content is a screenshot with a heading above it extracts its
 * heading and nothing a reader came for. Counting it as read is the exact failure
 * the picture-page rule was introduced to end.
 *
 * Every reason the scorer gave is said here too, so the report answers "why" and
 * not only "how many". PURE.
 */
function buildPdfCoverage(
  record: PdfReadRecord,
  decisions: readonly PageReadDecision[],
  thin: readonly number[],
  thinSet: ReadonlySet<number>,
  transcripts: ReadonlyMap<number, string>,
  whole: string,
): DocCoverage {
  const pageTexts = record.pageTexts;
  const unitsFound = record.pageCount > 0 ? record.pageCount : pageTexts.length;
  const notes: string[] = [PDF_NO_VISUALS_NOTE, PDF_NO_GEOMETRY_NOTE, ...pageReadNotes(decisions)];

  if (record.pageCount > 0 && record.pageCount !== pageTexts.length) {
    // A consumer that assumes units.length === unitsFound would be wrong here, so
    // say it rather than quietly reconciling the two.
    notes.push(
      `The document reports ${record.pageCount} page(s) but text was extracted for ${pageTexts.length}.`,
    );
  }

  if (whole) {
    notes.push(
      "Every page holds its content as a picture, so the whole document was transcribed in one pass. The transcript has no page boundaries and is recorded at document level rather than attributed to pages that were never measured.",
    );
    // Read in full — just not attributably per page. That is why unitsRead equals
    // unitsFound here while no individual page unit is marked as read: the claim
    // being made is about the document, and it is true.
    return {
      unitsFound,
      unitsRead: unitsFound,
      unitsUnread: [],
      visualsFound: 0,
      visualsKept: 0,
      visualsUnreadable: 0,
      tablesFound: 0,
      truncated: record.truncated,
      notes,
    };
  }

  const unread = thin.filter((index) => !transcripts.get(index)?.trim());
  const unreadPageNumbers = unread.map((index) => index + 1);
  if (unread.length > 0) {
    notes.push(
      `${unread.length} page(s) hold their content as a picture and were not read; their numbers are listed in unitsUnread.`,
    );
    if (record.requested) {
      const requested = new Set(record.requested);
      const neverSent = unread.filter((index) => !requested.has(index));
      const sentAndEmpty = unread.length - neverSent.length;
      if (neverSent.length > 0) {
        notes.push(
          `${neverSent.length} of those were beyond the per-document read limit and were never sent to be read.`,
        );
      }
      if (sentAndEmpty > 0) {
        notes.push(`${sentAndEmpty} of those were sent to be read and came back with nothing.`);
      }
    }
  }
  // A transcript for a page that was NOT thin is content this parser cannot place
  // in its own accounting: it is kept in the unit, but it must not silently inflate
  // the read count above the page total.
  const strayTranscripts = [...transcripts.keys()].filter(
    (index) => !thinSet.has(index) && Boolean(transcripts.get(index)?.trim()),
  );
  if (strayTranscripts.length > 0) {
    notes.push(
      `${strayTranscripts.length} page(s) were transcribed although their text layer was already readable; both readings are kept.`,
    );
  }

  return {
    unitsFound,
    // Read = every page that was not a picture, plus every picture-page that was
    // transcribed. Equivalent to the route's pagesFromText + pagesRead, written as
    // a subtraction so it cannot exceed the page total.
    unitsRead: Math.max(0, unitsFound - unread.length),
    unitsUnread: unreadPageNumbers,
    visualsFound: 0,
    visualsKept: 0,
    visualsUnreadable: 0,
    tablesFound: 0,
    truncated: record.truncated,
    notes,
  };
}

/**
 * The PDF's own catalog facts: printed page labels and /Info.
 *
 * Cheap next to a text extraction — it opens the document and reads the catalog,
 * not every page — and it is the only way to know that page 4 prints as "ii".
 * Never throws: a file with no labels, or a proxy that refuses either call, yields
 * nulls and the parse carries on without printed labels rather than failing.
 */
export async function readPdfFacts(bytes: Uint8Array): Promise<PdfDocumentFacts> {
  const empty: PdfDocumentFacts = {
    pageLabels: null,
    info: { title: null, producer: null, creator: null },
  };
  // pdf.js DETACHES the ArrayBuffer it is handed — the same trap documented in
  // extract.ts, where an image scan running after extraction found zero images in
  // 83 files that hold 2,949. Hand it a copy so the caller's bytes survive this.
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    return empty;
  }
  let pageLabels: readonly (string | null)[] | null = null;
  try {
    pageLabels = await pdf.getPageLabels();
  } catch {
    pageLabels = null;
  }
  let info: PdfDocumentFacts["info"] = empty.info;
  try {
    // pdf.js types /Info as `Object`, which promises nothing about its keys — read
    // it as an untyped bag and narrow each field by hand rather than trusting it.
    const metadata = (await pdf.getMetadata()) as unknown as { info?: Record<string, unknown> };
    const raw = metadata?.info ?? {};
    const str = (value: unknown): string | null =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    info = { title: str(raw.Title), producer: str(raw.Producer), creator: str(raw.Creator) };
  } catch {
    info = empty.info;
  }
  return { pageLabels, info };
}

/** What the async shell needs beyond the bytes. Everything optional is something a
 *  caller may already have: the route has run extractPdfText and, when vision is
 *  configured, has the transcripts too. */
export interface PdfParseOptions {
  contentHash: string;
  /** Already-extracted text, when the caller has it. Extracted here when absent. */
  read?: ExtractResult;
  transcripts?: ReadonlyMap<number, string>;
  requested?: readonly number[];
  wholeTranscript?: string | null;
  /** Overrides the extractor's own truncation flag — the page-splicing path caps a
   *  different string than extractPdfText does, and only the caller knows which
   *  string went downstream. */
  truncated?: boolean;
  facts?: PdfDocumentFacts | null;
  readScore?: number;
}

/**
 * The thin shell: fetch what only a PDF can answer, then hand it all to the pure
 * mapper. No model is ever called from here — transcripts arrive already read, and
 * this module has no opinion about whether reading them was worth it.
 */
export async function parsePdfDocument(
  bytes: Uint8Array,
  options: PdfParseOptions,
): Promise<ParsedDocument> {
  const read = options.read ?? (await extractPdfText(bytes));
  const facts = options.facts ?? (await readPdfFacts(bytes));
  return buildPdfParsedDocument({
    contentHash: options.contentHash,
    pageTexts: read.pageTexts,
    pageCount: read.meta.pages,
    guessedTitle: read.meta.title,
    truncated: options.truncated ?? read.meta.truncated,
    ...(options.transcripts ? { transcripts: options.transcripts } : {}),
    ...(options.requested ? { requested: options.requested } : {}),
    ...(options.wholeTranscript ? { wholeTranscript: options.wholeTranscript } : {}),
    ...(options.readScore !== undefined ? { readScore: options.readScore } : {}),
    facts,
  });
}
