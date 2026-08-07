/**
 * The Docling lane: a converted document becomes the SAME `ParsedDocument` every
 * other lane produces.
 *
 * 🔴 THIS IS THE ONLY PLACE DOCLING TOUCHES NEMESIS. Downstream of here nothing
 * knows the document was read by a different program: the chunker, the citation
 * builder, the fact extractors and the artifact writers all receive a
 * `DocumentModel` and an `ExtractionCoverage`, exactly as they do from our own
 * parsers. That is the "do not let Docling become a second source of truth" rule
 * expressed as a type rather than as a comment.
 *
 * 🔴 AND THIS IS WHERE "SUCCESS" STOPS MEANING "COMPLETE". Docling reports
 * ConversionStatus.SUCCESS for documents it understood partially — measured, it
 * returns SUCCESS on 8 corpus files where it declared more units than it filled
 * (one 26-slide deck came back with 2 slides empty). For most of this branch's
 * life the adapter's observations had no consumer at all, which meant a Docling
 * parse would have arrived with no coverage record and rendered as fully read.
 * `buildDoclingParse` is the caller the adapter's doc comment always claimed
 * existed. Nothing may route a format to Docling without going through here.
 *
 * The Nemesis-owned bounds that apply to every parse apply here too, and for the
 * same reasons they exist on the built-in lanes:
 *
 *   * MAX_UNITS_PER_PARSE — cost tracks unit count, not bytes. A few hundred KB
 *     of generated PDF can declare a hundred thousand pages, and the sidecar
 *     would happily try. Units past the cap are TRUNCATED AND DISCLOSED as
 *     unread, never silently dropped.
 *   * TEXT_CAP — the same ceiling every other format gets, reported as an amount.
 *   * an empty read is a VERDICT about the file, not an exception.
 */

import {
  adaptDoclingDocument,
  doclingCoverage,
  documentToText,
  withTruncation,
  type DocBlock,
  type DoclingObservations,
  type DocumentModel,
} from "@nemesis/shared";

import { extractCut } from "./extract-coverage";
import { MAX_UNITS_PER_PARSE } from "./parse-worker";
import type { DocumentKind, ParseOutcome } from "./parse-document";
import { capText, TEXT_CAP } from "@/lib/pdf/extract";

/** Formats the sidecar may own. `image` is never routed there — see the router. */
export type DoclingKind = Exclude<DocumentKind, "image">;

export interface DoclingParseInput {
  /** Docling's JSON export, already parsed. Treated as untrusted throughout. */
  document: unknown;
  /** Docling's own status string, carried verbatim into the coverage record. */
  status: string;
  kind: DoclingKind;
  /**
   * The title, when the caller knows one from somewhere trustworthy.
   *
   * 🔴 NEVER DOCLING'S `name`, WHICH IS THE FILENAME. And never the first
   * heading: a title is the author's words or nothing, and inventing one gives
   * every citation a source it can misattribute.
   */
  title?: string | null;
  /**
   * Which pages carried their own text layer, 0-based, from PDF.js.
   *
   * 🔴 OMITTED MEANS UNKNOWN, AND UNKNOWN IS REPORTED AS ALL-NATIVE, WHICH IS
   * WRONG FOR A SCAN. Docling's JSON carries no OCR signal at all — a key sweep
   * over all 322 corpus exports found none — so without this map a page RapidOCR
   * rescued from pixels is indistinguishable from a page with real embedded
   * text. That is why PDF.js still runs on this lane: not to extract structure,
   * but to answer the one question Docling cannot. Supply it for every PDF.
   */
  nativeText?: ReadonlyMap<number, boolean>;
  /** Units the cap allows. Injected only so a test need not build 5,000 pages. */
  maxUnits?: number;
}

export type DoclingParseOutcome =
  | ParseOutcome
  /**
   * The record would not reconcile, so no record is written.
   *
   * 🔴 THIS IS NOT A VERDICT ABOUT THE FILE AND MUST NOT BE SHOWN AS ONE. It
   * means our two readers disagree about the document's shape — most plausibly
   * PDF.js and Docling counting different numbers of pages — and the honest
   * response is to hand the document to the parser that can still describe it
   * completely, not to publish a coverage record we know is unreconciled.
   */
  | { ok: false; reason: "unreconciled"; detail: string };

/**
 * Adapt, bound, and grade one converted document.
 *
 * Returns the same `ParseOutcome` shape the built-in parser returns, so the
 * worker's success and refusal paths are literally the same code.
 */
export function buildDoclingParse(input: DoclingParseInput): DoclingParseOutcome {
  const cap = Math.max(1, input.maxUnits ?? MAX_UNITS_PER_PARSE);
  const adapted = adaptDoclingDocument(input.document, {
    format: input.kind,
    status: input.status,
    title: input.title ?? null,
  });

  // 🔴 A PDF WITHOUT THE PAGE MAP IS REFUSED, NOT GRADED GENEROUSLY. This is the
  // blocker in one line. Docling's export cannot say which pages were OCR'd, so
  // grading a PDF without PDF.js's answer means reporting every rescued scan as
  // though it had a real text layer — and the corpus contains 7 documents where
  // that would be false. Decks and Word files are exempt because neither has a
  // scanned-page failure mode: a slide's text is XML and a flowing document has
  // no pages to split.
  if (input.kind === "pdf" && !input.nativeText) {
    return { ok: false, reason: "unreconciled", detail: "a pdf needs the native-text page map to be graded" };
  }

  const { model, observations } = boundUnits(adapted.model, adapted.observations, cap);

  const whole = documentToText(model).trim();
  const { text } = capText(whole, TEXT_CAP);

  const built = doclingCoverage(observations, {
    format: input.kind,
    unitsInModel: model.units.length,
    // A flowing document has no pages, and `doclingCoverage` refuses a page map
    // for one rather than quietly ignoring it. Only paginated formats send it.
    ...(input.nativeText && input.kind !== "docx" ? { nativeText: input.nativeText } : {}),
  });
  if (typeof built === "string") {
    // 🔴 THE FALLBACK MUST NOT BE CHEERFUL — and it must not be a second, looser
    // attempt either. Retrying without the page map would produce a record that
    // reconciles by calling every rescued scan "native", which is the exact lie
    // the map was added to remove. Refusing sends the document to our own
    // parser, which can still produce a split it has evidence for.
    return { ok: false, reason: "unreconciled", detail: built };
  }

  const coverage = withTruncation(built, extractCut(TEXT_CAP, text.length, whole.length));

  if (!text) return { ok: false, kind: input.kind, reason: "empty" };
  return {
    ok: true,
    document: {
      coverage,
      kind: input.kind,
      model,
      skippedFigures: 0,
      text,
      title: model.title,
      // Named so a parse record says which program produced it. The version and
      // Docling's own status ride along in `coverage.parserVersion`.
      readBy: "docling",
    },
  };
}

/**
 * Apply the unit cap, and tell the truth about what it cost.
 *
 * 🔴 A DROPPED UNIT MUST STILL BE COUNTED. `doclingCoverage` derives unread units
 * from `declaredUnits` minus the units that hold content, so the cap reaches the
 * student for free — but ONLY if the filled-unit bookkeeping is recomputed after
 * the blocks are cut. Leaving the original counts would say we read 100,000 pages
 * of a document we read 5,000 of: complete, nothing missing, a file quietly
 * renamed to its own prefix.
 *
 * Units past the cap are counted, never materialised. The cap exists precisely
 * for files whose declared unit count is adversarially large, and building
 * 100,000 empty unit records to represent them would be the same denial of
 * service wearing a different hat.
 */
function boundUnits(
  model: DocumentModel,
  observations: DoclingObservations,
  cap: number,
): { model: DocumentModel; observations: DoclingObservations } {
  if (model.units.length <= cap) return { model, observations };

  const units = model.units.slice(0, cap);
  const blocks: DocBlock[] = model.blocks.filter((block) => block.unit < cap);
  const filled = [...new Set(blocks.map((block) => block.unit))].sort((a, b) => a - b);
  return {
    model: { ...model, units, blocks },
    observations: {
      ...observations,
      // `declaredUnits` stays at what the FILE claims — that is the number the
      // unread count is measured against, and shrinking it would hide the cut.
      unitsWithContent: filled.length,
      ...(observations.unitIndexesWithContent ? { unitIndexesWithContent: filled } : {}),
      pictures: blocks.filter((block) => block.kind === "figure").length,
      picturesWithRect: blocks.filter((block) => block.kind === "figure" && block.rect).length,
    },
  };
}

/**
 * A one-line reason for the parse record when the lane could not be used.
 *
 * 🔴 ALWAYS FALL BACK, AND ALWAYS SAY SO. A document the student uploaded must be
 * read by something, and a parse that came from the second choice must never be
 * recorded as though it came from the first.
 */
export function doclingFallback(reason: string, detail?: string): string {
  return `docling unavailable (${reason}${detail ? `: ${detail}` : ""}); read with the built-in parser`;
}
