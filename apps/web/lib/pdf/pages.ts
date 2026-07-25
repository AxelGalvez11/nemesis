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
// So the rule is a floor on characters, not a test for zero.
//
// WHY THE PAGE, NOT THE PICTURE. In a .pptx a figure is a discrete file, so the
// picture is the unit. In a PDF the figure is drawn INTO the page — most of these
// decks hold their diagrams as vector operators, and where there are bitmaps they
// are often one figure sliced into strips (one file here has 1,132 images across
// 49 pages). Describing strips is worthless. The page is the only unit that is
// always the thing a human would look at.
//
// PURE: page text in, decisions and merged text out.

/**
 * Below this many characters, a page has not really been read — whatever it says
 * is in the picture. Set from the real corpus: section dividers ("Lactation 04",
 * 12 chars) and full-page screenshots with a heading ("Breastfeeding
 * Considerations: Enoxaparin LexiDrug", 49 chars) both land here, and reading a
 * divider costs a fraction of a cent and returns its own title. Erring high is
 * how a content page avoids being mistaken for a divider.
 */
export const THIN_PAGE_CHARS = 120;

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

export interface PdfCoverage {
  /** Pages in the document. */
  pages: number;
  /** Pages whose own text layer carried them. */
  pagesFromText: number;
  /** Pages that had to be read as pictures, and were. */
  pagesRead: number;
  /** Pages that needed reading and did not get it — over the cap, too large to
   *  send, or a failed request. The number that keeps this honest. */
  pagesUnread: number;
  /** True when the extracted text hit TEXT_CAP and the tail was dropped. */
  truncated: boolean;
}

/** How much readable text a page really has, ignoring layout whitespace. PURE. */
export function pageTextLength(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

/**
 * Indices (0-based) of EVERY page whose content is a picture, in page order.
 * Separate from unreadPages() because the coverage report needs the true total:
 * a page dropped to the cap is not "read from its text layer", and counting it as
 * one would turn the cap into exactly the silent loss it exists to bound. PURE.
 */
export function thinPages(perPageText: readonly string[], threshold = THIN_PAGE_CHARS): number[] {
  return perPageText
    .map((text, index) => ({ index, length: pageTextLength(text) }))
    .filter((page) => page.length < threshold)
    .map((page) => page.index);
}

/**
 * Which of those pages to actually send, capped at `max` and in page order.
 * Thinnest first when the cap bites: a page with nothing at all is a worse loss
 * than one that at least has its heading. PURE.
 */
export function unreadPages(
  perPageText: readonly string[],
  max = MAX_VISION_PAGES,
  threshold = THIN_PAGE_CHARS,
): number[] {
  const thin = thinPages(perPageText, threshold);
  if (thin.length <= max) return thin;
  return thin
    .map((index) => ({ index, length: pageTextLength(perPageText[index] ?? "") }))
    .sort((a, b) => a.length - b.length || a.index - b.index)
    .slice(0, max)
    .map((page) => page.index)
    .sort((a, b) => a - b);
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
