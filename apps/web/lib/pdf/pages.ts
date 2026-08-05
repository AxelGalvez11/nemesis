// Which pages of a PDF were never actually read, and how their transcripts get
// folded back in.
//
// MEASURED against the owner's real course (83 PDFs, 3,945 pages, 2026-07-24):
// 88 pages have NO text layer at all, spread over 22 files that DO have text
// elsewhere — 15 of the 36 pages of one drug-metabolism lecture. The scanned-PDF
// fallback in vision.ts never fired for any of them, because it only fires when
// the WHOLE document comes back empty. A file with one readable page and forty
// pictures of pages counted as read.
//
// A LOW page is missed as completely as an empty one. Page 36 of the pregnancy
// recitation extracts 49 characters — "Breastfeeding Considerations: Enoxaparin
// LexiDrug" — and everything a student is examined on is inside the screenshot
// underneath it ("...its passage into milk and subsequent risk to a nursing
// infant should be considered negligible"). Opened and read by eye to confirm it.
// So the rule is not a test for zero — but it is not a character count either. How
// much text a page needs before it counts as read is scored from several measured
// signals in lib/pdf/page-read.ts, because 120 characters is a great deal of
// Chinese and almost no English, and a character floor sends real content pages of
// one language to be re-read as pictures while letting empty ones of another
// through. Everything below asks that module and then decides what to DO about the
// answer.
//
// WHY THE PAGE, NOT THE PICTURE. In a .pptx a figure is a discrete file, so the
// picture is the unit. In a PDF the figure is drawn INTO the page — most of these
// decks hold their diagrams as vector operators, and where there are bitmaps they
// are often one figure sliced into strips (one file here has 1,132 images across
// 49 pages). Describing strips is worthless. The page is the only unit that is
// always the thing a human would look at.
//
// PURE: page text in, decisions and merged text out.

import { capText } from "@/lib/pdf/extract";
import { type PageReadDecision, type PageReadOptions, scorePagesRead } from "@/lib/pdf/page-read";

// The decision itself, re-exported so a caller that has this module does not need
// to know the scorer's file name to read the answer it hands back.
export {
  PAGE_READ_SCORER_VERSION,
  scorePagesRead,
  type PageReadDecision,
  type PageReadOptions,
  type PageReadReason,
  type PageReadSignals,
} from "@/lib/pdf/page-read";

/**
 * Most pages of one document sent to be read. A bound on spend and on how long an
 * import can take, NOT a judgement that the rest do not matter — whatever it
 * excludes is counted and reported, never dropped in silence.
 */
export const MAX_VISION_PAGES = 40;

/** Pages per request. Small enough that one failure costs a few pages, not a
 *  lecture. */
export const PAGE_BATCH_SIZE = 8;

/** Requests in flight at once. Each carries a slice of PDF, and the provider
 *  rate-limits per key. */
export const PAGE_CONCURRENCY = 3;

/** How many characters of readable text a page has, ignoring layout whitespace.
 *  A measurement, not the rule: whether a page counts as read is scored in
 *  lib/pdf/page-read.ts, where a character is not the unit. PURE. */
export function pageTextLength(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

/**
 * Indices (0-based) of EVERY page the scorer judged was not read from its own text
 * layer, in page order. Separate from unreadPages() because the coverage report
 * needs the true total: a page dropped to the cap is not "read from its text
 * layer", and counting it as one would turn the cap into exactly the silent loss it
 * exists to bound. PURE.
 */
export function thinPages(perPageText: readonly string[], options?: PageReadOptions): number[] {
  return unreadFrom(scorePagesRead(perPageText, options));
}

/** The same list, from decisions already made — so a caller that needs both the
 *  list and the reasons scores the document once. PURE. */
function unreadFrom(decisions: readonly PageReadDecision[]): number[] {
  return decisions.filter((decision) => !decision.read).map((decision) => decision.index);
}

/**
 * Which of those pages to actually send, capped at `max` and in page order.
 * Least-read first when the cap bites: a page with nothing at all is a worse loss
 * than one that at least has its heading, and the score already says which is
 * which — it is the same ordering as before, over a measurement that now holds in
 * every script rather than only in English. PURE.
 */
export function unreadPages(
  perPageText: readonly string[],
  max = MAX_VISION_PAGES,
  options?: PageReadOptions,
): number[] {
  return pickForReading(scorePagesRead(perPageText, options), max);
}

function pickForReading(decisions: readonly PageReadDecision[], max: number): number[] {
  const thin = decisions.filter((decision) => !decision.read);
  if (thin.length <= max) return thin.map((decision) => decision.index);
  return thin
    .slice()
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, max)
    .map((decision) => decision.index)
    .sort((a, b) => a - b);
}

/**
 * What kind of read this document needs.
 *
 *   "text"  — every page carries its own words. Nothing to do.
 *   "whole" — EVERY page is a picture. One request reads the entire document with
 *             no per-document page cap, which is strictly better than slicing:
 *             page-slicing a 100-page scan would read 40 and call the other 60
 *             unreadable, worse than the behaviour it replaced.
 *   "pages" — some pages are pictures inside a document that is otherwise fine.
 *             This is the common case in real lecture material and the one that
 *             was missed entirely.
 *
 * Every plan carries the per-page decisions that produced it, including on the
 * "text" plan where nothing is sent. That is what makes the routing auditable
 * afterwards: a caller can record WHY each page went where it went, and "no page
 * needed reading" is itself a claim worth being able to check.
 *
 * PURE.
 */
export type PdfPlan =
  | { kind: "text"; decisions: readonly PageReadDecision[] }
  | { kind: "whole"; decisions: readonly PageReadDecision[] }
  | { kind: "pages"; needed: number[]; decisions: readonly PageReadDecision[] };

export function planPdfRead(
  perPageText: readonly string[],
  max = MAX_VISION_PAGES,
  options?: PageReadOptions,
): PdfPlan {
  // Scored ONCE and shared by all three answers below. Scoring is document-level —
  // one signal compares a page with the rest of its document — so re-deriving it
  // per question would also be re-deriving the document statistic.
  const decisions = scorePagesRead(perPageText, options);
  const thin = unreadFrom(decisions);
  if (thin.length === 0) return { kind: "text", decisions };
  if (thin.length === perPageText.length) return { kind: "whole", decisions };
  return { kind: "pages", needed: pickForReading(decisions, max), decisions };
}

/** The marker the model is asked to put before each page's transcript. */
export const PAGE_MARKER = /^\s*\[\[\s*page\s+(\d{1,4})\s*\]\]\s*$/i;

/**
 * Split a marked reply into one transcript per page of the slice that was sent.
 *
 * Every page carries its OWN number in the reply, so a page the model skipped
 * (a genuinely blank one) costs that page and leaves the rest correctly aligned.
 * That is the difference from parseFigureDescriptions, where order was the only
 * link and a miscount had to void the whole batch: here a wrong count is
 * survivable, and only a reply with no markers at all is unusable. PURE.
 */
export function parsePageTranscripts(reply: string, expected: number): string[] | null {
  if (expected <= 0) return [];
  const out = new Array<string>(expected).fill("");
  let current: number | null = null;
  let buffer: string[] = [];
  let sawMarker = false;

  const flush = () => {
    if (current !== null && current >= 1 && current <= expected) {
      out[current - 1] = buffer.join("\n").trim();
    }
    buffer = [];
  };

  for (const line of reply.split(/\r?\n/)) {
    const marker = PAGE_MARKER.exec(line);
    if (marker) {
      flush();
      sawMarker = true;
      current = Number(marker[1]);
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  flush();
  return sawMarker ? out : null;
}

/**
 * Put each transcript back where its page was, and join the document.
 *
 * A transcribed page is labelled. A student who exports a note and finds a
 * paragraph they never wrote should be able to see, on the page, that a machine
 * read a picture for them — and so should the model, which is otherwise free to
 * quote a transcription as if it were the lecturer's own words. Pages that were
 * needed and not read are labelled too: a gap the reader can see beats a seam
 * they cannot. PURE.
 */
export function splicePages(
  perPageText: readonly string[],
  transcripts: ReadonlyMap<number, string>,
  needed: readonly number[] = [],
): string {
  const neededSet = new Set(needed);
  const parts: string[] = [];
  perPageText.forEach((text, index) => {
    const own = text.replace(/[^\S\r\n]+/g, " ").trim();
    const seen = transcripts.get(index)?.trim();
    if (seen) {
      // The page's own scraps (a heading above a screenshot) come first, then the
      // read of the picture — the heading is the lecturer's exact words and the
      // transcript is not, so they must not be blended into one voice.
      parts.push([own, `[Read from the page image]\n${seen}`].filter(Boolean).join("\n"));
      return;
    }
    if (neededSet.has(index)) {
      parts.push([own, "[This page is an image and could not be read]"].filter(Boolean).join("\n"));
      return;
    }
    if (own) parts.push(own);
  });
  return parts.join("\n").trim();
}

/**
 * The finished text for the page-slicing path, and whether it had to be clipped.
 *
 * splicePages builds from the RAW per-page text, which capText has never touched —
 * `extractPdfText` caps the joined string it returns, not the array. So reading
 * even one picture-page of a very long document used to hand back the whole thing
 * uncapped: for the 2,116-page book in this corpus, a single blank page was enough
 * to trigger it. The cap is a contract with every caller downstream (the request
 * body, the saved note, the chunker), and it has to hold on BOTH paths, so the
 * spliced result is capped here rather than at the one call site that remembered.
 * PURE.
 */
export function finishPdfPages(
  perPageText: readonly string[],
  transcripts: ReadonlyMap<number, string>,
  needed: readonly number[],
  cap: number,
): { text: string; truncated: boolean } {
  return capText(splicePages(perPageText, transcripts, needed), cap);
}
