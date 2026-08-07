/**
 * Does page N of this PDF carry its own text layer?
 *
 * 🔴 THIS IS THE ONLY THING PDF.JS CONTRIBUTES TO THE DOCLING LANE, ON PURPOSE.
 * Docling's JSON export carries no OCR signal at all — a key sweep over all 322
 * exports in the corpus found no ocr/confidence/source field — so a scan that
 * RapidOCR rescued looks exactly like a page with a real text layer, and a
 * coverage record built from that export alone reports a rescued scan as
 * `unitsNative`. The missing fact is not "what does the page say"; Docling has
 * that. It is the far cheaper "did the page have words of its own", and pdf.js
 * answers it in one `getTextContent()` per page.
 *
 * So: no blocks, no reading order, no figures, no structure. Text presence and
 * page size. Anything more would be a second parser producing a second opinion
 * about the same document, which is the disagreement this lane exists to avoid.
 *
 * 🔴 THE PREDICATE IS IMPORTED, NEVER RESTATED. `pageTextLength` and
 * `THIN_PAGE_CHARS` come from ./pages, the same two the native lane uses in
 * `pdfCoverage`. A second threshold here would let one page be "read natively"
 * on one lane and "a picture" on the other, and the two coverage records would
 * stop being comparable — the same "two engines disagree" bug wearing a hat.
 */

import { MAX_UNITS_PER_PARSE } from "@/lib/notebooks/parse-worker";

import { pageTextLength, THIN_PAGE_CHARS } from "./pages";

/** What one page turned out to be. */
export interface NativePage {
  /** 0-based, so it lines up with `DocBlock.unit` and the coverage buckets. */
  index: number;
  /** True when the page's own text clears `THIN_PAGE_CHARS`. */
  native: boolean;
  /** Characters of readable text, by `pageTextLength`. Kept so a caller can see
   *  HOW thin a page was rather than only which side of the line it fell. */
  chars: number;
  /** Page box at scale 1, in points, rotation applied. */
  width: number;
  height: number;
}

export interface NativeProbe {
  pages: NativePage[];
  /**
   * Pages the FILE declares, which may exceed `pages.length`.
   *
   * Kept separate for the same reason `readPdfStructure` keeps it: a probe that
   * stopped at its cap and reported only what it looked at would quietly rename
   * a 100,000-page document to its own prefix.
   */
  declaredPages: number;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/**
 * Which pages have their own words.
 *
 * 🔴 `bytes` MAY COME BACK DETACHED. pdf.js takes ownership of the buffer it is
 * handed, and a caller that also ships these bytes to the Docling sidecar would
 * find them zeroed. Pass a copy (`new Uint8Array(bytes)`) if the original is
 * still needed afterwards.
 */
export async function probePdfNativeText(
  bytes: Uint8Array,
  options: { maxPages?: number } = {},
): Promise<NativeProbe> {
  const maxPages = options.maxPages ?? MAX_UNITS_PER_PARSE;
  const pdfjs = await loadPdfjs();
  const loading = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  const doc = await loading.promise;
  try {
    const declaredPages = doc.numPages;
    const pages: NativePage[] = [];
    for (let n = 1; n <= Math.min(declaredPages, maxPages); n += 1) {
      const page = await doc.getPage(n);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        // Joined EXACTLY the way unpdf joins it (`str + (hasEOL ? "\n" : "")`,
        // concatenated with no separator), because unpdf is what produced the
        // `pageTexts` the native lane measures. A different join is a different
        // character count, which is a different threshold in disguise.
        const text = content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
          .join("");
        const chars = pageTextLength(text);
        pages.push({
          index: n - 1,
          native: chars >= THIN_PAGE_CHARS,
          chars,
          width: viewport.width,
          height: viewport.height,
        });
      } finally {
        page.cleanup();
      }
    }
    return { pages, declaredPages };
  } finally {
    // 🔴 THE LOADING TASK OWNS THE WORKER, NOT THE DOCUMENT. pdf.js 6 removed
    // `PDFDocumentProxy.destroy`; destroying the task is what releases it, and
    // getting this wrong leaks a worker per file — over a corpus sweep, per file
    // is per hundred. Wrapped, because throwing here would lose a good probe.
    try { await loading.destroy(); } catch { /* the probe already succeeded */ }
  }
}

/**
 * The probe as `doclingCoverage` wants it: unit index -> had its own text.
 *
 * Only probed pages appear. A page beyond the cap is absent rather than false,
 * because "we did not look" and "there was nothing there" are different facts
 * and `doclingCoverage` refuses the first rather than guessing a lane for it.
 * PURE.
 */
export function nativeTextMap(probe: NativeProbe): Map<number, boolean> {
  return new Map(probe.pages.map((page) => [page.index, page.native]));
}
