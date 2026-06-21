// Resolve a drug's FDA product photo (pill / packaging) URL from DailyMed (NLM) — server-side, because
// DailyMed's JSON API sends no CORS headers, so a browser fetch is blocked (a client-side two-hop fails
// with "Failed to fetch"). The edge function has no such restriction. The image itself is then a plain
// cross-origin <img> on the client (image loads are CORS-exempt); only the JSON lookup must run here.
//
// DailyMed images are part of the public-domain drug label — no key, no attribution. The lookup is a
// TWO-HOP: drug_name → SPL setid → that label's media list. Pure, testable helpers (URL builders + JSON
// parsers) plus an un-sinkable orchestrator: every failure (or a slow DailyMed) resolves to null and the
// caller simply omits the field — never throws, never delays the answer. Same ethos as augmentWithLive
// ("live sources can never sink an answer"). Most useful for marketed small-molecule pills; biologics
// show packaging and brand-new investigational drugs have no entry, so the photo is then simply absent.

const DAILYMED_V2 = "https://dailymed.nlm.nih.gov/dailymed/services/v2";

/** DailyMed SPL-search URL for a drug name (first result only). Pure. */
export function dailyMedSplsUrl(drug: string): string {
  return `${DAILYMED_V2}/spls.json?drug_name=${encodeURIComponent(drug)}&pagesize=1`;
}

/** DailyMed media-list URL for a resolved SPL setid. Pure. */
export function dailyMedMediaUrl(setid: string): string {
  return `${DAILYMED_V2}/spls/${encodeURIComponent(setid)}/media.json`;
}

/** First SPL setid from a DailyMed spls.json body, or null. Pure; tolerant of any shape. */
export function parseSetid(body: unknown): string | null {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const setid = (data[0] as { setid?: unknown })?.setid;
  return typeof setid === "string" && setid ? setid : null;
}

/** First image URL from a DailyMed media.json body, or null. Pure; tolerant of any shape. */
export function parseMediaUrl(body: unknown): string | null {
  const media = (body as { data?: { media?: unknown } })?.data?.media;
  if (!Array.isArray(media) || media.length === 0) return null;
  const url = (media[0] as { url?: unknown })?.url;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ json: () => Promise<unknown> }>;

/**
 * Resolve a drug name to its DailyMed product-image URL via the two-hop lookup, or null on any miss
 * (no product, no media, malformed response, a thrown fetch, or a timeout). Bounded by `timeoutMs` so a
 * hung DailyMed can never stall the answer. Injectable fetch for unit testing. Never throws.
 */
export async function resolveProductImageUrl(
  drug: string,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<string | null> {
  const name = drug.trim();
  if (!name) return null;
  const fetchImpl = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const ctrl = new AbortController();
  // Bounds the tail latency this can add at assembly (the field is server-rendered, so it must be
  // awaited before responding). It almost always resolves during generation, so this only caps a hung
  // DailyMed; 2.5s keeps the worst case tight for a purely cosmetic image.
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2500);
  try {
    const setid = parseSetid(await (await fetchImpl(dailyMedSplsUrl(name), { signal: ctrl.signal })).json());
    if (!setid) return null;
    return parseMediaUrl(await (await fetchImpl(dailyMedMediaUrl(setid), { signal: ctrl.signal })).json());
  } catch {
    return null; // best-effort: any failure or timeout leaves the product photo absent
  } finally {
    clearTimeout(timer);
  }
}
