// Live-monitoring NEWS signal — a SEPARATE, walled-off channel.
//
// THE WALL (non-negotiable, the reason this lives in its own module with its own type):
// a NewsItem is feed metadata ONLY. It is NEVER converted to an evidence record
// (NormalizedSource / Citation / RetrievedChunk), NEVER grounded, NEVER cited, NEVER
// enters the one citation namespace, and NEVER fires an evidence alert. PharmaOrb's
// promise is that every CLAIM is backed by vetted, citable evidence ("shows its work");
// news and press releases are exactly the unvetted, hype-prone sources that would break
// that promise, so they surface in a clearly-labeled "In the news — not verified evidence"
// feed and nowhere else. The distinct type (no provider/license/content fields) means a
// NewsItem cannot be mistaken for an evidence source by the type system.
//
// Source v1 = Google News RSS (free, no API key, no new secret); swappable later for a
// curated medical-news feed. Pure parse + an injected, fault-tolerant fetch (so this module
// is fully unit-testable offline, same discipline as the evidence providers).

/** A single news headline. Deliberately NOT a NormalizedSource — see the wall above. */
export interface NewsItem {
  readonly title: string;
  readonly url: string;
  readonly source: string; // outlet name, e.g. "Reuters" ("" when the feed omits it)
  readonly published_at: string | null; // ISO 8601, or null when unparseable
}

/** Decode the XML/HTML entities (and strip CDATA wrappers) a feed puts in titles. `&amp;`
 *  is decoded LAST so an already-encoded `&amp;#39;` is not double-decoded. */
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/** Inner text of the first `<tag …>…</tag>` in `block`, or null. */
function tagText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

/** RFC-822 (`Mon, 16 Jun 2026 10:30:00 GMT`) → ISO, or null when unparseable. */
function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Build the Google News RSS search URL for a topic (free, no key). */
export function googleNewsSearchUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

/** PURE: parse a Google News RSS document into NewsItems. Skips items missing a title or link;
 *  tolerant of junk/empty input (returns []). No network, no side effects. */
export function parseGoogleNewsRss(xml: string): NewsItem[] {
  if (!xml) return [];
  const items: NewsItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const rawTitle = tagText(block, "title");
    const rawLink = tagText(block, "link");
    if (!rawTitle || !rawLink) continue;
    const title = decodeEntities(rawTitle).trim();
    const url = decodeEntities(rawLink).trim();
    if (!title || !url) continue;
    items.push({
      title,
      url,
      source: decodeEntities(tagText(block, "source") ?? "").trim(),
      published_at: toIso(tagText(block, "pubDate")),
    });
  }
  return items;
}

/** The seen-set key for the news channel — URL-based, namespaced so it never collides with the
 *  evidence known-set ("provider:provider_id"). News diffs are SEPARATE from evidence diffs. */
export function newsKey(item: Pick<NewsItem, "url">): string {
  return `news:${item.url}`;
}

type NewsFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface FetchNewsOpts {
  query: string;
  /** Injected for testing; defaults to global fetch. */
  fetchImpl?: NewsFetch;
  timeoutMs?: number;
  max?: number;
}

/**
 * Fetch + parse the news feed for a topic. Fault-tolerant + time-bounded like the evidence
 * sources: a failed/slow/non-200 fetch yields [] (never throws), so the news channel can never
 * sink a watch check. An empty query skips the network entirely.
 */
export async function fetchGoogleNews(opts: FetchNewsOpts): Promise<NewsItem[]> {
  const { query, fetchImpl, timeoutMs = 4000, max = 10 } = opts;
  if (!query.trim()) return [];
  const doFetch: NewsFetch = fetchImpl ?? ((u, init) => fetch(u, init));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(googleNewsSearchUrl(query), { signal: ctrl.signal });
    if (!res.ok) return [];
    return parseGoogleNewsRss(await res.text()).slice(0, max);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
