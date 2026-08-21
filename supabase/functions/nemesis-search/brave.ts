// Brave Search as the primary provider for /v2/search (owner 2026-08-06,
// replacing Tavily). The network call lives in index.ts; everything here is pure
// so it can be tested without a key or a socket.
//
// WHY llm/context AND NOT web/search: this endpoint exists for exactly our
// caller — a model deciding what to say next. It returns pre-extracted chunks of
// each page (text, tables, code, structured data) already ranked for machine
// consumption, where web/search returns a one-line SERP snippet. We keep the URL
// and title on every row regardless, so citations survive the swap unchanged.
//
// THE CONTRACT DOES NOT MOVE. Every caller — the agent's web_search tool, the
// web route, the desktop SDK — reads Firecrawl's shape:
//   { success: true, data: { web: [{ title, url, description }] } }
// Brave is mapped into that shape here. This is a provider swap, not an agent
// change, and the tests below are what hold that line.
//
// Docs read 2026-08-06: api-dashboard.search.brave.com/documentation/services/llm-context

/** One row of the response contract every existing caller already parses. */
export interface WebResult {
  title: string
  url: string
  description: string
}

/**
 * Brave rejects a query over 400 characters or 50 words.
 *
 * Tavily has no such limit, so a long query that works today would fail at Brave
 * and fall silently through to the fallback — the symptom is "Brave never wins"
 * with no error anywhere to find. Checking up front means the recorded provider
 * says what actually happened instead.
 */
export const BRAVE_QUERY_MAX_CHARS = 400
export const BRAVE_QUERY_MAX_WORDS = 50

/**
 * How much extracted text one result may carry into `description`.
 *
 * Brave returns an ARRAY of chunks per URL and will happily hand back thousands
 * of characters. Joining them raw would make `description` an order of magnitude
 * longer than anything this endpoint has ever returned — the same shape, but a
 * behaviour change for the model reading it. 1,200 is deliberately a little
 * richer than a Tavily advanced snippet (~500-1,000) without being a different
 * kind of payload. Tune here, not at the call site.
 */
export const BRAVE_DESCRIPTION_MAX_CHARS = 1_200

/** Ask Brave for roughly what we intend to keep, rather than accepting the
 *  50-snippet / 4,096-token-per-URL defaults and throwing most of it away. */
export const BRAVE_MAX_SNIPPETS = 4
export const BRAVE_MAX_TOKENS_PER_URL = 1_024

/**
 * The ceiling on the WHOLE response, which we were not setting at all.
 *
 * 🔴 THE DEFAULT IS 8192 FOR THE ENTIRE CONTEXT, NOT PER PAGE, AND THAT QUIETLY UNDID THE UNCAPPING.
 * Asking for 50 URLs at `maximum_number_of_tokens_per_url = 1024` is a request for ~51k tokens, and
 * an unset total silently held it to 8192 — about 160 tokens a page. The pages arrived; there was
 * almost nothing in them. Brave's own parameter table gives the range as 1024–32768
 * (github.com/brave/brave-search-skills, skills/llm-context/SKILL.md).
 *
 * So it scales with what was actually asked for, and clamps to what Brave will accept.
 *
 * 🔴 THE CEILING IS NOT A NEW STARVATION IN DISGUISE, AND THAT IS WORTH CHECKING RATHER THAN
 * ASSUMING. At the 50-URL maximum the total works out at 32768/50 ≈ 655 tokens a page, less than
 * the 1024 asked for per URL. But `BRAVE_DESCRIPTION_MAX_CHARS` keeps only 1,200 characters of each
 * page — roughly 300 tokens — so what arrives is still about twice what survives the mapping. The
 * budget would have to fall below ~300 tokens a page to cost anything, which needs more than a
 * hundred URLs, and Brave stops at fifty.
 */
export const BRAVE_MIN_TOTAL_TOKENS = 1_024
export const BRAVE_MAX_TOTAL_TOKENS = 32_768

/** Joins the chunks Brave extracted for one page. Visible on purpose: a reader
 *  should be able to tell these are separate extracts, not running prose. */
const SNIPPET_JOIN = ' … '

/** Whether Brave can be asked this at all. False means skip it and let the next
 *  provider answer — never send a request we know the API rejects. */
export function braveCanAnswer(query: string): boolean {
  const trimmed = query.trim()

  if (!trimmed || trimmed.length > BRAVE_QUERY_MAX_CHARS) {
    return false
  }

  return trimmed.split(/\s+/).length <= BRAVE_QUERY_MAX_WORDS
}

/** Query string for GET /res/v1/llm/context. `limit` is the caller's requested
 *  result count, clamped to what the endpoint accepts (1-50). */
/**
 * The most URLs Brave's llm/context endpoint will return for one call.
 *
 * 🔴 A PROVIDER FACT, AND NOW THE ONLY CEILING IN THE PATH. It used to be an unnamed 50 inside the
 * clamp below, while four smaller caps of our own sat above it and never let a request near it: a
 * client constant of 10, the limit the web app sent, this function's caller defaulting to 5, and a
 * final slice that discarded anything past 10 after it had been fetched. One search bills one
 * metered unit whatever the count, so all four were discarding evidence that cost the same either
 * way. How many to read is the model's decision now; this is what the provider will actually give.
 */
export const BRAVE_MAX_URLS = 50

export function braveContextParams(query: string, limit: number): URLSearchParams {
  const urls = Math.min(BRAVE_MAX_URLS, Math.max(1, Math.round(limit)))

  return new URLSearchParams({
    // 🔴 `count` AND `maximum_number_of_urls` ARE NOT THE SAME NUMBER, AND SETTING THEM TO THE SAME
    // ONE MADE SMALL ASKS WORSE. Brave's table: `count` is "Max search results to CONSIDER",
    // `maximum_number_of_urls` is "Max URLs IN RESPONSE" — consider 50, return the best 10. Both
    // used to carry the model's ask, so a request for 3 pages told Brave to look at only 3 results
    // and hand back all 3, rather than weighing fifty and returning its three best. Selection is
    // the whole value of the endpoint and we were switching it off exactly when it mattered most.
    // One request is billed the same however many are considered.
    count: String(BRAVE_MAX_URLS),
    maximum_number_of_snippets: String(BRAVE_MAX_SNIPPETS),
    // Scales with the ask. Left unset it defaults to 8192 for the WHOLE response, which starved
    // every page whenever more than a handful were requested — see BRAVE_MAX_TOTAL_TOKENS.
    maximum_number_of_tokens: String(
      Math.min(BRAVE_MAX_TOTAL_TOKENS, Math.max(BRAVE_MIN_TOTAL_TOKENS, urls * BRAVE_MAX_TOKENS_PER_URL))
    ),
    maximum_number_of_tokens_per_url: String(BRAVE_MAX_TOKENS_PER_URL),
    maximum_number_of_urls: String(urls),
    q: query.trim()
  })
}

/**
 * Map a llm/context payload onto the response contract.
 *
 * Shape (docs 2026-08-06):
 *   { grounding: { generic: [{ url, title, snippets: string[] }] }, sources: {...} }
 *
 * Anything malformed yields [] rather than a partial row, and the caller treats
 * an empty list as "Brave did not answer" and falls through — an empty result set
 * must never be returned to a student as though it were the answer.
 */
export function braveContextToWeb(payload: unknown, limit: number): WebResult[] {
  const generic = (payload as { grounding?: { generic?: unknown } } | null)?.grounding?.generic

  if (!Array.isArray(generic)) {
    return []
  }

  const out: WebResult[] = []

  for (const entry of generic) {
    const row = entry as { url?: unknown; title?: unknown; snippets?: unknown }
    const url = typeof row.url === 'string' ? row.url.trim() : ''

    // A row without a URL cannot be cited, and an uncitable answer is the one
    // thing this product must not produce. Drop it rather than show it.
    if (!url) {
      continue
    }

    const snippets = Array.isArray(row.snippets)
      ? row.snippets.filter((snippet): snippet is string => typeof snippet === 'string' && snippet.trim() !== '')
      : []

    out.push({
      description: snippets.join(SNIPPET_JOIN).slice(0, BRAVE_DESCRIPTION_MAX_CHARS),
      title: typeof row.title === 'string' && row.title.trim() !== '' ? row.title : url,
      url
    })

    if (out.length >= Math.max(1, Math.round(limit))) {
      break
    }
  }

  return out
}
