// Where a link points INSIDE a document, and how a document link is written.
//
// `/library/source/<id>?page=7&q=commerce+clause` means: open this source, go to
// unit 7, and highlight the passage that reads "commerce clause". A citation is
// only ever CONSUMED here — this module reads an anchor that something else
// measured and turns it into scroll-and-highlight. It never invents one.
//
// `unit` rather than `page` internally, because a page, a slide and a sheet are
// the same kind of answer: "the seventh thing in this document". The query
// parameter stays `page=` (and accepts `slide=`) because that is what a person
// types and what existing links already carry.

export interface ReaderAnchor {
  /** 1-based page / slide / sheet. Null = wherever the document opens. */
  unit: number | null;
  /** Text to find and highlight, verbatim. Null = highlight nothing. */
  query: string | null;
}

export const NO_ANCHOR: ReaderAnchor = { unit: null, query: null };

/** A source's own page. Anchors are appended only when they were measured. */
export function readerHref(sourceId: string, anchor: ReaderAnchor = NO_ANCHOR): string {
  const params = new URLSearchParams();
  if (anchor.unit !== null && Number.isInteger(anchor.unit) && anchor.unit > 0) params.set("page", String(anchor.unit));
  if (anchor.query) params.set("q", anchor.query);
  const query = params.toString();
  return `/library/source/${encodeURIComponent(sourceId)}${query ? `?${query}` : ""}`;
}

function readParam(params: URLSearchParams | Record<string, string | undefined>, key: string): string | null {
  const raw = params instanceof URLSearchParams ? params.get(key) : (params[key] ?? null);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Reads ?page= / ?slide= / ?q=. Anything that is not a positive whole number
 *  is dropped rather than clamped: a link saying "page banana" is a broken
 *  link, and silently landing on page 1 hides that. */
export function parseReaderAnchor(params: URLSearchParams | Record<string, string | undefined>): ReaderAnchor {
  const rawUnit = readParam(params, "page") ?? readParam(params, "slide");
  const unit = rawUnit !== null && /^\d+$/.test(rawUnit) ? Number(rawUnit) : null;
  return {
    unit: unit !== null && unit > 0 ? unit : null,
    query: readParam(params, "q"),
  };
}

/** Clamp an anchor to a document that turned out to be shorter than the link
 *  claimed. Returns null for the unit when it does not exist, so the reader can
 *  say "this document has 12 pages" instead of pretending it went there. */
export function resolveAnchorUnit(anchor: ReaderAnchor, unitCount: number): number | null {
  if (anchor.unit === null || unitCount <= 0) return null;
  return anchor.unit <= unitCount ? anchor.unit : null;
}
