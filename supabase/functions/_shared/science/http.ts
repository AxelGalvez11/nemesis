// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * Shared HTTP helper for scientific connectors.
 *
 * Wraps Bun's global `fetch` with the concerns every connector shares:
 *   - request timeout (AbortController)
 *   - a polite, identifiable User-Agent
 *   - automatic retry with exponential backoff on 429 / 5xx
 *   - a small in-memory TTL cache for idempotent GETs
 *   - json()/text() convenience helpers
 *
 * No API keys, no auth — every source used here is public/open. Connectors that
 * need auth should layer it on top explicitly rather than baking it in here.
 */

// 🔴 THE USER-AGENT NAMES US, FOR THE SAME REASON THE MAILTO DOES. It read
// "openscience-science/1.0 (+https://syntheticsciences.ai)" — the upstream project's identity,
// sent on every request to every index. Scholarly APIs read this string to decide rate limits and
// to find an operator, so an inaccurate one gets someone else throttled for our traffic and leaves
// us unreachable. The comment below still holds: no keys, all public sources.
const USER_AGENT = "Nemesis/1.0 (+https://enternemesis.com)"
const DEFAULT_TIMEOUT = 30_000
const DEFAULT_RETRIES = 3
const DEFAULT_CACHE_TTL = 5 * 60_000 // 5 minutes

export interface HttpOptions extends Omit<RequestInit, "signal"> {
  /** Request timeout in ms (default 30s). */
  timeout?: number
  /** Retry attempts on 429/5xx (default 3). */
  retries?: number
  /** External abort signal; combined with the internal timeout signal. */
  signal?: AbortSignal
  /** Cache TTL in ms for this request. 0 disables caching (default: GET=5min, else 0). */
  cacheTtl?: number
}

interface CacheEntry {
  expires: number
  status: number
  headers: Record<string, string>
  body: string
}

const cache = new Map<string, CacheEntry>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599)
}

function combineSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  for (const sig of [a, b]) {
    if (sig.aborted) {
      controller.abort()
      break
    }
    sig.addEventListener("abort", onAbort, { once: true })
  }
  return controller.signal
}

/**
 * Perform an HTTP request with timeout, retry/backoff, and optional caching.
 * Returns a normalized response object with `json()` / `text()` helpers.
 */
export async function request(url: string, opts: HttpOptions = {}) {
  const method = (opts.method ?? "GET").toUpperCase()
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT
  const retries = opts.retries ?? DEFAULT_RETRIES
  const cacheable = method === "GET"
  const ttl = opts.cacheTtl ?? (cacheable ? DEFAULT_CACHE_TTL : 0)
  const cacheKey = ttl > 0 ? `${method} ${url}` : undefined

  if (cacheKey) {
    const hit = cache.get(cacheKey)
    if (hit && hit.expires > Date.now()) return toResponse(hit.status, hit.headers, hit.body)
    if (hit) cache.delete(cacheKey)
  }

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const signal = combineSignals(controller.signal, opts.signal)
    try {
      const res = await fetch(url, { ...opts, method, headers, signal })
      const body = await res.text()
      if (!res.ok && isRetryable(res.status) && attempt < retries) {
        const backoff = backoffMs(res, attempt)
        clearTimeout(timer)
        await sleep(backoff)
        continue
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 500) || res.statusText}`)
      }
      const record: CacheEntry = {
        expires: Date.now() + ttl,
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body,
      }
      if (cacheKey) cache.set(cacheKey, record)
      clearTimeout(timer)
      return toResponse(record.status, record.headers, record.body)
    } catch (err) {
      clearTimeout(timer)
      lastError = err
      // Abort from the caller's signal is terminal; internal timeout retries.
      if (opts.signal?.aborted) throw err
      if (attempt < retries) {
        await sleep(backoffMs(undefined, attempt))
        continue
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`)
}

/** Never retry sooner than this, whatever a server's Retry-After says. */
const MIN_BACKOFF_MS = 1_000
/** Never park a request longer than this, whatever a server's Retry-After says. */
const MAX_BACKOFF_MS = 15_000

/**
 * 🔴🔴🔴 Retry-After IS ADVICE TO BE CLAMPED, NOT AN INSTRUCTION TO BE OBEYED — AND BOTH ENDS BITE.
 *
 * This read `return seconds * 1000` for any finite value, which fails in opposite directions:
 *
 *   Retry-After: 0     → 0ms → RETRY IMMEDIATELY, three times, with no pause at all. Observed live
 *                        2026-08-24: export.arxiv.org sits behind Varnish, and its 503 carries
 *                        exactly `retry-after: 0`. So a server saying "I am overloaded" got answered
 *                        with a burst of three instant retries. That is not a slow client being
 *                        throttled — it is us behaving like the thing rate limits exist to stop,
 *                        which is a plausible reason arXiv has been refusing this caller for hours
 *                        rather than seconds. `if (retryAfter)` also treats the string "0" as
 *                        present-and-truthy, so the header actively made things WORSE than having
 *                        none, which would have fallen through to a 1s exponential backoff.
 *
 *   Retry-After: 3600  → 3_600_000ms → one sleeping hour inside a single request, holding a socket
 *                        on a function with a wall-clock budget measured in seconds.
 *
 * A ceiling AND a floor. Above the ceiling the honest move is to fail now and let the caller decide;
 * a fan-out with a 3s deadline would rather have an empty result than a held connection.
 *
 * 🔴 AN HTTP-DATE Retry-After ("Wed, 21 Oct 2026 07:28:00 GMT") IS LEGAL AND `Number()` MAKES IT
 * NaN. That falls through to the exponential backoff, which is the right answer — a wrong-but-
 * plausible parse here would produce a delay nobody could predict from the header.
 */
function backoffMs(res: Response | undefined, attempt: number): number {
  const retryAfter = res?.headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.max(seconds * 1000, MIN_BACKOFF_MS), MAX_BACKOFF_MS)
    }
  }
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS) + Math.floor(Math.random() * 250)
}

/** Exported for tests only — the retry policy is not observable any other way without a network. */
export const __backoffMs = backoffMs

function toResponse(status: number, headers: Record<string, string>, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: () => body,
    json: <T = unknown>(): T => JSON.parse(body) as T,
  }
}

/** Shorthand: GET + parse JSON. */
export async function getJSON<T = unknown>(url: string, opts?: HttpOptions): Promise<T> {
  const res = await request(url, opts)
  return res.json<T>()
}

/** Shorthand: GET + return text. */
export async function getText(url: string, opts?: HttpOptions): Promise<string> {
  const res = await request(url, opts)
  return res.text()
}

/** Clear the in-memory cache (test/debug helper). */
export function clearCache(): void {
  cache.clear()
}