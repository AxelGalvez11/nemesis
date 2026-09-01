// Reading ONE named page, ourselves, with no vendor in the middle.
//
// Owner, 2026-09-01: *"also remove firecrawl too, i only want brave (its cheap)."* Brave's
// llm/context searches; it does not fetch a URL you name. That job — "paste a link and Nemesis
// reads it" — was Firecrawl's, 153 times in this project's history and nothing else's. Deleting
// the provider without replacing the job would have deleted the feature, so this is the
// replacement: an ordinary HTTPS request and a plain-text extraction, costing nothing.
//
// 🔴🔴 A SERVER THAT FETCHES ANY URL A USER TYPES IS AN SSRF HOLE, AND THAT IS THE REAL WORK
// HERE. While Firecrawl did the fetching, requests left THEIR network. Now they leave OURS, from
// inside the platform, where "http://169.254.169.254/" is a cloud metadata endpoint and
// "http://localhost:54321" is the database. `safeTarget` is what stands between a text box and
// those, and `readPage` re-checks it on EVERY REDIRECT HOP — a public URL that 302s to
// 169.254.169.254 defeats a check that only ran once, which is the classic way this is got wrong.
//
// PURE except `readPage`, which is the one function that touches the network.

/** The most bytes we will pull down for one page. A textbook chapter is far under this; a video
 *  or an ISO is far over, and would otherwise be read into memory before anything noticed. */
export const READ_MAX_BYTES = 4_000_000

/** How long one page has to answer, redirects included. */
export const READ_TIMEOUT_MS = 15_000

/** How many hops we will follow. Real sites redirect (http→https, apex→www, shorteners); a chain
 *  longer than this is either a loop or something being clever. */
export const READ_MAX_REDIRECTS = 4

/**
 * Hostnames that must never be fetched, whatever the user typed.
 *
 * 🔴 THE LOOPBACK AND LINK-LOCAL RANGES ARE THE POINT, NOT THE NAMES. `localhost` is the obvious
 * one and the least useful to an attacker who can write `127.1`, `0.0.0.0`, or the decimal form of
 * an address. The numeric check below is what actually holds; these names catch the resolvable
 * aliases that never appear as digits.
 */
const BLOCKED_HOSTS = new Set([
  '0.0.0.0',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
  'localhost',
  'metadata',
  'metadata.google.internal'
])

/** Suffixes that only ever name something inside a private network. */
const BLOCKED_SUFFIXES = ['.internal', '.local', '.localdomain', '.localhost']

/** Ports we will talk to. A URL naming 6379 or 5432 is not a web page. */
const ALLOWED_PORTS = new Set(['', '80', '443'])

/**
 * Whether a numeric address belongs to a range that is not the public internet.
 *
 * 🔴 CHECKED IN NUMBERS, NOT IN TEXT. "127.0.0.1".startsWith("127.") is a string test that
 * "0177.0.0.1" and "2130706433" both walk straight past — both of which `fetch` resolves to
 * loopback. Parsing to octets first means the shape of the text stops mattering.
 */
export function isPrivateAddress(host: string): boolean {
  // IPv6, including the ::ffff:10.0.0.1 form that smuggles a v4 private address inside a v6 literal.
  if (host.includes(':')) {
    const bare = host.replace(/^\[|\]$/g, '').toLowerCase()

    if (bare === '::1' || bare === '::' || bare.startsWith('fc') || bare.startsWith('fd') || bare.startsWith('fe80')) {
      return true
    }

    // 🔴🔴 THE HEX FORM IS THE ONE THAT ACTUALLY ARRIVES, AND CHECKING ONLY THE DOTTED ONE LET
    // 10.0.0.1 THROUGH. `new URL("http://[::ffff:10.0.0.1]/").hostname` NORMALISES to
    // `[::ffff:a00:1]` — the parser rewrites the v4 tail as two hextets before anything here sees
    // it, so a regex looking for digits and dots never matched. Found by running the guard, not by
    // reading it. Both spellings are handled: the dotted one because a caller may hand this
    // function a raw string, the hex one because the URL parser produces it.
    const hex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)

    if (hex) {
      const high = Number.parseInt(hex[1], 16)
      const low = Number.parseInt(hex[2], 16)

      return isPrivateAddress(`${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`)
    }

    const dotted = bare.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)

    return dotted ? isPrivateAddress(dotted[1]) : false
  }

  const octets = parseIPv4(host)

  if (!octets) {
    return false
  }

  const [a, b] = octets

  return (
    a === 0 || // 0.0.0.0/8 — "this network", and a common loopback alias
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local — the cloud metadata range
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  )
}

/**
 * A host as four octets, whatever notation it was written in — or null if it is a name.
 *
 * Handles dotted decimal, octal (`0177`), hex (`0x7f`) and the bare 32-bit integer, because
 * `fetch` handles all four and an attacker only needs one of them to be missed.
 */
function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.')

  if (parts.length === 1) {
    const whole = parseIntStrict(parts[0])

    if (whole === null || whole > 0xff_ff_ff_ff) {
      return null
    }

    return [(whole >>> 24) & 0xff, (whole >>> 16) & 0xff, (whole >>> 8) & 0xff, whole & 0xff]
  }

  if (parts.length !== 4) {
    return null
  }

  const octets = parts.map(parseIntStrict)

  if (octets.some(value => value === null || value > 255)) {
    return null
  }

  return octets as [number, number, number, number]
}

/** One number in any of the notations a URL host may use, or null if it is not a number at all. */
function parseIntStrict(text: string): number | null {
  if (!text) {
    return null
  }

  const value = /^0[xX][0-9a-fA-F]+$/.test(text)
    ? Number.parseInt(text.slice(2), 16)
    : /^0[0-7]+$/.test(text)
      ? Number.parseInt(text.slice(1), 8)
      : /^\d+$/.test(text)
        ? Number.parseInt(text, 10)
        : null

  return value === null || Number.isNaN(value) ? null : value
}

/**
 * The URL we are willing to fetch, or a sentence saying why not.
 *
 * 🔴 THE REFUSAL IS A STRING THE LEARNER COULD READ. "blocked" tells someone who pasted an
 * intranet link nothing about what to do; naming the actual reason costs nothing and no attacker
 * learns anything they did not already know by typing the address.
 */
export function safeTarget(raw: string): { url: URL } | { reason: string } {
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    return { reason: 'that is not a valid web address' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { reason: 'only http and https links can be read' }
  }

  // Credentials in a URL are never part of a page a student means to share, and they would be
  // forwarded to whatever the redirect chain ends at.
  if (url.username || url.password) {
    return { reason: 'a link with a username or password in it cannot be read' }
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    return { reason: 'only the standard web ports can be read' }
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '')

  if (!host || BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))) {
    return { reason: 'that address is not on the public web' }
  }

  if (isPrivateAddress(host)) {
    return { reason: 'that address is not on the public web' }
  }

  return { url }
}

// ── HTML to text ────────────────────────────────────────────────────────────

/** Elements whose contents are never page text. `script` and `style` are the ones that would
 *  otherwise pour code into a source; the rest are furniture that repeats on every page. */
const STRIPPED = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'form']

/** Named entities worth resolving. Numeric ones are handled generically below. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

/** The page's own title, or "" — read before the body is stripped, since `<title>` lives in the
 *  head that `mainContent` throws away. */
export function pageTitle(html: string): string {
  const tag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]

  if (tag?.trim()) {
    return decode(tag).replace(/\s+/g, ' ').trim().slice(0, 300)
  }

  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]

  return og ? decode(og).replace(/\s+/g, ' ').trim().slice(0, 300) : ''
}

/**
 * The article, if the page marks one — otherwise the whole body.
 *
 * 🔴 A HINT, NOT A PARSER. `<main>` and `<article>` are the two containers that mean "the thing
 * this page is about", and honouring them is most of what `onlyMainContent` bought us. When a page
 * has neither, taking the body and stripping furniture is strictly better than guessing at
 * densities — a wrong guess silently drops the content, and a source that is quietly half a page
 * is worse than one that carries a menu.
 */
function mainContent(html: string): string {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]

  if (article && article.length > 400) {
    return article
  }

  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]

  if (main && main.length > 400) {
    return main
  }

  return html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html
}

/** `&amp;` and `&#39;` and friends, as the characters they stand for. */
function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
}

/** One decoded character, or "" for anything outside Unicode — `fromCodePoint` THROWS on those,
 *  and a malformed entity in one paragraph must not fail the whole read. */
function codePoint(value: number): string {
  return Number.isFinite(value) && value >= 0 && value <= 0x10_ff_ff ? String.fromCodePoint(value) : ''
}

/**
 * A page's readable text.
 *
 * Block-level tags become line breaks so paragraphs stay paragraphs — running a whole page into
 * one line is what makes scraped text unreadable and unchunkable. Headings keep a blank line
 * above them, list items get a bullet, and everything else collapses.
 */
export function htmlToText(html: string): string {
  let text = mainContent(html)

  for (const tag of STRIPPED) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ')
    // Unclosed or self-closing forms of the same tags, which would otherwise leave their attributes.
    text = text.replace(new RegExp(`<${tag}[^>]*/?>`, 'gi'), ' ')
  }

  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<(h[1-6])[^>]*>/gi, '\n\n')
  text = text.replace(/<li[^>]*>/gi, '\n• ')
  text = text.replace(/<br[^>]*>/gi, '\n')
  // 🔴 `li` IS NOT IN THIS LIST. `<li>` already opens its own line above, so closing one here too
  // put a blank line between every bullet — a list rendered as double-spaced fragments.
  text = text.replace(/<\/(p|div|section|article|tr|h[1-6]|ul|ol|table|blockquote|pre)\s*>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  text = decode(text)

  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── the one function that touches the network ───────────────────────────────

export interface ReadResult {
  text: string
  title: string
  /** Where the text actually came from, after redirects. Not always what was asked for. */
  url: string
}

/**
 * Fetch a page and return its text, or a reason.
 *
 * 🔴🔴 EVERY HOP IS RE-CHECKED. `redirect: 'manual'` rather than letting `fetch` follow, because a
 * URL that passes `safeTarget` and then 302s to 169.254.169.254 is the whole attack. Checking once
 * at the front door and trusting the rest is the mistake this is written to avoid.
 *
 * 🔴 NON-HTML IS REFUSED RATHER THAN DECODED AS TEXT. A PDF read as UTF-8 is a page of mojibake
 * that looks like a successful read; saying "this is a PDF" lets the caller do something about it.
 */
export async function readPage(raw: string, fetcher: typeof fetch = fetch): Promise<ReadResult | { reason: string }> {
  let target = safeTarget(raw)

  if ('reason' in target) {
    return target
  }

  const deadline = AbortSignal.timeout(READ_TIMEOUT_MS)
  let response: Response | null = null

  for (let hop = 0; hop <= READ_MAX_REDIRECTS; hop++) {
    response = await fetcher(target.url.toString(), {
      headers: {
        // Named honestly. A crawler that pretends to be Chrome is a crawler that cannot be blocked
        // by a site that would rather not be read, and being refusable is part of being polite.
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'NemesisBot/1.0 (+https://nemesis.study/bot)'
      },
      redirect: 'manual',
      signal: deadline
    }).catch(() => null)

    if (!response) {
      return { reason: 'that page could not be reached' }
    }

    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null

    if (!location) {
      break
    }

    const next = safeTarget(new URL(location, target.url).toString())

    if ('reason' in next) {
      return { reason: `that link redirects somewhere that cannot be read (${next.reason})` }
    }

    target = next
    response = null
  }

  if (!response) {
    return { reason: 'that link redirects too many times' }
  }

  if (!response.ok) {
    return { reason: `that page returned ${response.status}` }
  }

  const type = response.headers.get('content-type') ?? ''

  if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
    return { reason: `that link is ${type.split(';')[0].trim()}, not a web page` }
  }

  const declared = Number(response.headers.get('content-length') ?? '0')

  if (declared > READ_MAX_BYTES) {
    return { reason: 'that page is too large to read' }
  }

  const body = await response.text().catch(() => null)

  if (body === null) {
    return { reason: 'that page could not be read' }
  }

  // 🔴 CHECKED AGAIN AFTER READING. `content-length` is a claim, and a server that omits it or
  // lies about it would otherwise stream past the cap.
  if (body.length > READ_MAX_BYTES) {
    return { reason: 'that page is too large to read' }
  }

  const text = /text\/plain/i.test(type) ? body.trim() : htmlToText(body)

  if (!text) {
    return { reason: 'that page had no readable text' }
  }

  return { text, title: pageTitle(body) || target.url.hostname, url: target.url.toString() }
}
