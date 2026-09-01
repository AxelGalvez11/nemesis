// Brave Search as the primary provider for /v2/search (owner 2026-08-06,
// replacing Tavily, and since 2026-09-01 the ONLY one). The network call lives in
// index.ts; everything here is pure
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
 * 🔴 THIS USED TO BE A REASON TO SKIP BRAVE — a longer query fell through to Tavily,
 * which has no such limit. Brave is the only provider now, so there is nothing to fall
 * through to and `braveFit` trims to these numbers instead of refusing.
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

/** Whether Brave can be asked this AS WRITTEN. False now means it needs trimming
 *  (see `braveFit`), not that some other provider should take it — there is no
 *  other provider. Kept exported because it states the provider's limit plainly
 *  and `braveFit` is checked against it. */
export function braveCanAnswer(query: string): boolean {
  const trimmed = query.trim()

  if (!trimmed || trimmed.length > BRAVE_QUERY_MAX_CHARS) {
    return false
  }

  return trimmed.split(/\s+/).length <= BRAVE_QUERY_MAX_WORDS
}

/**
 * The same question, cut down to something Brave will accept.
 *
 * 🔴🔴 TRIMMING BEATS REFUSING, AND THAT IS THE WHOLE ARGUMENT. While Tavily sat behind
 * Brave, an over-long query was handed sideways and answered in full. With one provider
 * the only two options are a shortened search or no search at all, and a learner who
 * asked a long question is far better served by an answer to the first fifty words of it
 * than by "web search returned nothing". Nothing is silent about it: the caller logs the
 * trim.
 *
 * 🔴 WORDS FIRST, THEN CHARACTERS, AND BOTH ARE CHECKED. Cutting to 50 words can still
 * leave more than 400 characters (fifty long words), and cutting to 400 characters can
 * split one mid-way — so the character cut runs second and falls back to the last whole
 * word inside the limit. A query that violates neither is returned untouched, trimmed of
 * surrounding whitespace only, so the ordinary case is not reshaped by a rule about the
 * unusual one.
 *
 * PURE. Returns "" only for a query that was empty to begin with.
 */
export function braveFit(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, ' ')

  if (!trimmed) {
    return ''
  }

  const words = trimmed.split(' ').slice(0, BRAVE_QUERY_MAX_WORDS).join(' ')

  if (words.length <= BRAVE_QUERY_MAX_CHARS) {
    return words
  }

  const cut = words.slice(0, BRAVE_QUERY_MAX_CHARS)
  const lastSpace = cut.lastIndexOf(' ')

  // A single word longer than the whole limit has no space to fall back to; the hard
  // cut is then the only thing left, and it is still a better query than nothing.
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut
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

/**
 * How relevant a page must be to be worth putting in front of the model.
 *
 * 🔴🔴 BRAVE'S OWN DEFAULT IS THE LOOSEST SETTING, AND WE WERE TAKING IT. Its parameter table gives
 * `context_threshold_mode` as `strict | balanced | lenient | disabled`, and records that leaving it
 * unset "resolves to `lenient` on the current API version" — the setting that returns the most and
 * filters the least. Nothing here had ever named a value, so every search this product has run has
 * been at the loosest threshold the endpoint offers.
 *
 * That is visible in the product, not just on paper. Reported 2026-08-21: a search whose query was
 * a category rather than a subject came back with two marketing pages for a language app, and those
 * pages were then ingested as a learner's study material. The query was the root cause and is fixed
 * elsewhere; the threshold is why a bad query produced advertising rather than nothing.
 *
 * 🔴 `balanced` RATHER THAN `strict`, AND THE ASYMMETRY IS THE ARGUMENT. This endpoint's job is to
 * ground an answer, and a page that is dropped is a page the model cannot cite — for a genuinely
 * obscure question, `strict` risks returning nothing at all, and an empty search reads to a learner
 * as "Nemesis could not find out", which is a worse failure than one weak page among ten good ones.
 * Brave's own guideline names `balanced` as "good balance between coverage and relevance".
 */
export const BRAVE_THRESHOLD_MODE = 'balanced'

/**
 * How recent a page has to be, when the caller asks.
 *
 * 🔴 A PROVIDER VOCABULARY, VALIDATED HERE RATHER THAN TRUSTED. The model chooses whether a
 * question turns on recency (see `webFreshness` in the turn contract), and that is a reading of
 * language, which is the model's to make. Whether `pw` is a thing Brave accepts is a FACT, and a
 * model guessing `last_week` or `7d` would be forwarded straight into a query string and silently
 * change nothing — the worst kind of failure, because the answer still arrives and is simply stale.
 *
 * Brave's values (parameter table, docs read 2026-08-21): `pd` 24h, `pw` 7 days, `pm` 31 days,
 * `py` 365 days, or an explicit `YYYY-MM-DDtoYYYY-MM-DD` range.
 */
const FRESHNESS_CODES = new Set(['pd', 'pw', 'pm', 'py'])
const FRESHNESS_RANGE = /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/

/** The freshness Brave will accept, or null. Null means "no filter", never a guess at one. */
export function readFreshness(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (FRESHNESS_CODES.has(trimmed)) return trimmed
  // 🔴 THE RANGE IS CHECKED FOR SHAPE, NOT FOR SENSE. Whether 2026-02-30 exists is Brave's problem
  // and it answers for it; what matters here is that nothing outside the documented grammar is
  // forwarded, so an unrecognised value can never reach the wire as a filter that does nothing.
  return FRESHNESS_RANGE.test(trimmed) ? trimmed : null
}

export function braveContextParams(query: string, limit: number, freshness: unknown = null): URLSearchParams {
  const urls = Math.min(BRAVE_MAX_URLS, Math.max(1, Math.round(limit)))
  const recency = readFreshness(freshness)

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
    q: query.trim(),
    context_threshold_mode: BRAVE_THRESHOLD_MODE,
    // 🔴 OMITTED WHEN THERE IS NONE, NEVER SENT EMPTY. Brave's default for `freshness` is the empty
    // string and means "no filter"; sending `freshness=` explicitly would be the same request with
    // a parameter in it, which is a difference nobody can see and everybody has to reason about.
    ...(recency ? { freshness: recency } : {})
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
