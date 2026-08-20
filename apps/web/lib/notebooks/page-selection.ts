/**
 * ONE PAGE INDEX, AND EVERY PROVIDER'S DIALECT TRANSLATED AT ITS OWN BOUNDARY.
 *
 * ── THE BUG THIS FILE EXISTS TO PREVENT ───────────────────────────────────────
 *
 * Nemesis reads a document cheaply first: the local reader extracts whatever it
 * can, and only the pages it could not read are sent to a paid provider. That is
 * the whole cost story of ingestion — a 400-page PDF where 380 pages carry their
 * own text should cost twenty pages, not four hundred.
 *
 * But "page 7" is not one thing. The internal model counts from 0 (it is an
 * array index into `perPageText`). Mistral's OCR API takes a `pages` array that
 * also counts from 0. LlamaParse takes `target_pages` as a comma-separated
 * STRING, also 0-based. A human reading a PDF, every page marker the vision lane
 * emits, and every error message a student will ever see count from 1.
 *
 * Five conventions is four chances to be off by one, and an off-by-one here is
 * invisible: the parse succeeds, the pages come back, and the content is
 * attributed to the wrong page. Nothing fails. So the conversion happens in
 * exactly one place per provider, and each one is pinned by a test.
 *
 * 🔴 THE CANONICAL INDEX IS 0-BASED, and every function here takes canonical
 * indices and returns a provider's dialect. Nothing converts in the other
 * direction except `fromDisplay`, which exists so a page number a person typed
 * can enter the system.
 */

/** A canonical page index: 0-based, matching `perPageText` and `thinPages`. */
export type PageIndex = number;

/**
 * What a page needs, decided from what the cheap local read produced.
 *
 * `local` pages never reach a paid provider at all. The other three are the
 * escalation ladder, and which one a page gets is a property of the page rather
 * than of the plan the student is on.
 */
export type PageRoute = "local" | "mistral" | "llamaparse" | "gemini";

export interface PageSignal {
  index: PageIndex;
  /** Readable characters the local reader recovered. */
  textLength: number;
  /** Embedded images the local reader found on the page. */
  imageCount: number;
  /** The local reader saw structure it could not resolve: a table with merged
   *  cells, SmartArt, a grouped shape tree. Office formats only. */
  complexLayout?: boolean;
  /** The page is part of an Office document rather than a PDF. */
  office?: boolean;
}

/** Below this many characters a page has not really been read; whatever it says
 *  is in the picture. Mirrors THIN_PAGE_CHARS in lib/pdf/pages.ts. */
export const THIN_PAGE_CHARS = 120;

/**
 * Where one page should be read, and why.
 *
 *   clean text, no figures        -> local, and nothing is paid for
 *   readable text WITH a figure   -> gemini, for the figure only
 *   complex Office layout         -> llamaparse
 *   scanned or corrupt PDF page   -> mistral
 *
 * 🔴 A PAGE WITH TEXT IS NEVER SENT FOR OCR. The expensive mistake is not
 * choosing the wrong paid provider; it is paying one at all for a page whose
 * words were already free. PURE.
 */
export function routeFor(signal: PageSignal, threshold = THIN_PAGE_CHARS): PageRoute {
  const unread = signal.textLength < threshold;
  if (unread) {
    // An Office page with no text is a layout the local reader could not walk,
    // not a scan: there is no image to OCR, there is a shape tree to resolve.
    if (signal.office) return "llamaparse";
    return "mistral";
  }
  if (signal.office && signal.complexLayout) return "llamaparse";
  // The words are already free. Only the picture needs looking at.
  if (signal.imageCount > 0) return "gemini";
  return "local";
}

export interface RoutedPages {
  local: PageIndex[];
  mistral: PageIndex[];
  llamaparse: PageIndex[];
  gemini: PageIndex[];
}

/** Route a whole document, in page order. PURE. */
export function routePages(signals: readonly PageSignal[], threshold = THIN_PAGE_CHARS): RoutedPages {
  const routed: RoutedPages = { gemini: [], llamaparse: [], local: [], mistral: [] };
  for (const signal of signals) {
    routed[routeFor(signal, threshold)].push(signal.index);
  }
  for (const key of Object.keys(routed) as Array<keyof RoutedPages>) {
    routed[key].sort((a, b) => a - b);
  }
  return routed;
}

/** How much of a document never reached a paid provider. 1 means free to read. */
export function localShare(routed: RoutedPages, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return routed.local.length / totalPages;
}

// ── Adapter boundaries ───────────────────────────────────────────────────────

/**
 * Mistral's OCR `pages` parameter.
 *
 * 0-BASED, the same as ours, so this is an identity map — and it is written as a
 * function anyway. A conversion that happens to be identity today is still the
 * place a future provider change belongs, and an identity map with a test on it
 * is a statement about the API rather than an accident.
 *
 * Returns null when every page is wanted: sending an explicit list of all pages
 * is more fragile than omitting the parameter, because a document whose page
 * count we misread would then be truncated to the list we sent.
 */
export function toMistralPages(pages: readonly PageIndex[], totalPages: number): number[] | null {
  if (pages.length === 0) return [];
  if (pages.length >= totalPages) return null;
  return [...pages].sort((a, b) => a - b);
}

/**
 * LlamaParse's `target_pages`.
 *
 * A comma-separated STRING, 0-based. An empty string is NOT "no pages" to
 * LlamaParse — it is an unset parameter, which means every page — so an empty
 * selection returns null and the caller must not make the request at all.
 */
export function toLlamaTargetPages(pages: readonly PageIndex[], totalPages: number): string | null {
  if (pages.length === 0) return null;
  if (pages.length >= totalPages) return null;
  return [...pages].sort((a, b) => a - b).join(",");
}

/**
 * What a person reads. 1-BASED.
 *
 * 🔴 THE ONLY PLACE THE +1 LIVES. Page markers, error messages, coverage reports
 * and anything a student sees go through here, so a display number can never be
 * fed back into a provider call by accident.
 */
export function toDisplayPage(index: PageIndex): number {
  return index + 1;
}

/** A page number a person typed, back to a canonical index. Clamped at 0 so a
 *  "page 0" cannot become -1 and silently select the last page of an array. */
export function fromDisplay(pageNumber: number): PageIndex {
  return Math.max(0, Math.round(pageNumber) - 1);
}
