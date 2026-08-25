// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
import type { Connector, ConnectorHit, SearchOptions } from "../types.ts"
import { getJSON } from "../http.ts"
import { raw, snippet } from "./shared.ts"

/**
 * bioRxiv / medRxiv preprints via api.biorxiv.org.
 *
 * The public API is retrieval-oriented (by DOI or by date/most-recent window)
 * and offers no full-text search. So:
 *   - a DOI-shaped query resolves the record directly (exact);
 *   - any other query scans the most-recent preprints from both servers and
 *     keeps only those carrying a share of the query's distinctive terms as
 *     whole words. See the matching rule below — with no search engine behind
 *     it, that rule is this connector's entire notion of relevance.
 * `fetch` takes a DOI, optionally prefixed with a server ("medrxiv:10.1101/…").
 *
 * Expect this connector to return NOTHING for most queries, and read that as
 * working. It sees only the newest ~200 preprints on two life-sciences servers,
 * so a genuine overlap is the exception. It is a freshness bonus on top of the
 * six indexes that actually search, never a source of coverage in its own right.
 */

const BASE = "https://api.biorxiv.org/details"
const SERVERS = ["biorxiv", "medrxiv"] as const
type Server = (typeof SERVERS)[number]

interface Paper {
  doi?: string
  title?: string
  authors?: string
  abstract?: string
  category?: string
  date?: string
  version?: string
  server?: string
  published?: string
}

interface Details {
  messages?: { status?: string; count?: number }[]
  collection?: Paper[]
}

function isDoi(q: string): boolean {
  return /^10\.\d{4,9}\//.test(q.trim())
}

/**
 * 🔴🔴🔴 THIS CONNECTOR HAS NO SEARCH ENGINE BEHIND IT, SO THE MATCHING RULE *IS* THE RELEVANCE.
 *
 * api.biorxiv.org offers retrieval by DOI or by recency, and nothing else. Every other index in the
 * literature seven answers a query; this one scans the ~200 newest preprints and decides for itself
 * what counts as a match. That makes the rule below the whole of its judgement.
 *
 * The original rule kept any preprint sharing ONE term of length > 1 with the query, matched as a
 * bare substring. Measured live 2026-08-24 across four fields, it returned exactly 5 hits for every
 * query including ones with no life-sciences content at all:
 *
 *   "adverse possession doctrine property law"      → "Intravenous methylphenidate for acute
 *                                                      traumatic disorders of consciousness"
 *   "causes of the Thirty Years War historiography" → "C. elegans Nuclear Hormone Receptor NHR-49
 *                                                      promotes attractive chemotaxis"
 *
 * The first matched on "adverse" (as in adverse events). The second matched on "of" — two characters
 * cleared the length filter, and "of" appears in essentially every abstract ever written. Substring
 * matching made it worse still: "war" hides inside "warfare" and "toward", "law" inside "flawed".
 *
 * 🔴 THAT IS WORSE THAN RETURNING NOTHING, WHICH IS WHY IT IS A BUG AND NOT A TUNING KNOB. These
 * rows are rendered to a learner as evidence. A law student reading a neuroscience preprint under
 * their own question does not conclude "the preprint server had nothing"; they conclude the system
 * believes this is relevant. Empty is honest. Confident and wrong is not.
 *
 * 🔴 THE FIX IS STRUCTURAL, WITH NO SUBJECT VOCABULARY ANYWHERE. CLAUDE.md forbids scoping a
 * feature to one field, so there is no list of biology words here and no boost for medical topics.
 * It is three field-neutral rules: ignore function words that carry no topic, match on whole words
 * rather than substrings, and require a SHARE of the query's distinctive terms rather than one.
 * A law query then returns nothing from a biology preprint server — which is the correct answer,
 * arrived at without the code knowing what law or biology are.
 */
const STOPWORDS = new Set([
  // Function words: present in every abstract, distinctive of nothing.
  "the", "of", "and", "in", "for", "an", "to", "on", "with", "by", "from", "at", "as", "is", "are",
  "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "or", "not",
  "but", "if", "into", "than", "then", "there", "their", "them", "we", "our", "us", "you", "your",
  "they", "his", "her", "hers", "do", "does", "did", "can", "could", "should", "would", "may",
  "might", "will", "shall", "about", "between", "during", "after", "before", "over", "under",
  "when", "which", "who", "whom", "whose", "how", "what", "why", "also", "such", "both", "each",
  "any", "all", "some", "more", "most", "other", "have", "has", "had",
  // 🔴 SCHOLARLY BOILERPLATE, AND THIS IS THE LINE TO BE CAREFUL WITH. These are not function words
  // — they are words that appear in academic writing of EVERY discipline, so they separate nothing.
  // A history paper, an engineering paper and a virology paper all contain "study" and "results".
  // Anything discipline-specific would belong to a field and therefore must not be here.
  "study", "studies", "research", "paper", "papers", "article", "results", "result", "analysis",
  "using", "used", "use", "based", "new", "novel", "approach", "method", "methods", "data",
])

/** Terms worth matching on: long enough to mean something, not boilerplate, deduplicated. */
function distinctiveTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  ]
}

/**
 * How many of those terms a preprint must carry.
 *
 * 🔴 CLAMPED TO THE NUMBER OF TERMS AVAILABLE, or a one-word query could never be satisfied. A bare
 * "metformin" or "CRISPR" is a legitimate question with exactly one distinctive term, and demanding
 * two matches would silently return nothing for every single-word query — a floor that reads as
 * "no preprints exist" while actually meaning "this rule cannot be met".
 */
function required(termCount: number): number {
  return Math.min(termCount, Math.max(2, Math.ceil(termCount * 0.5)))
}

/**
 * Keep the recent preprints that genuinely meet the query, best first.
 *
 * 🔴 EXPORTED SO THE RULE CAN BE TESTED WITHOUT THE NETWORK. The two regressions this replaced were
 * both invisible to any test that stubbed the ranking away — they lived entirely in which papers
 * survived the filter. biorxiv.test.ts drives this with the real titles that wrongly matched.
 */
export function rankRecent(
  papers: Paper[],
  query: string,
  limit: number,
): { paper: Paper; score: number; matched: number }[] {
  const terms = distinctiveTerms(query)
  // 🔴 NOTHING DISTINCTIVE TO MATCH ON MEANS NO MATCHES — never "here are the newest preprints".
  // The old code fell back to returning the most recent papers unfiltered, which is the same
  // failure in its purest form: rows presented as answers to a question they never met.
  if (terms.length === 0) return []

  // Whole words, not substrings: "war" must not be found inside "warfare", nor "law" inside
  // "flawed". Terms come from a split on [^a-z0-9]+ so they are alphanumeric by construction and
  // carry nothing a regex would treat specially.
  const patterns = terms.map((t) => new RegExp(`\\b${t}\\b`))
  const need = required(terms.length)

  return papers
    .map((paper) => {
      const title = (paper.title ?? "").toLowerCase()
      const rest = `${paper.abstract ?? ""} ${paper.authors ?? ""} ${paper.category ?? ""}`.toLowerCase()
      let matched = 0
      let score = 0
      for (const pattern of patterns) {
        const inTitle = pattern.test(title)
        const inRest = pattern.test(rest)
        if (inTitle || inRest) matched += 1
        // A term in the title is stronger evidence of aboutness than one buried in an abstract, so
        // it counts double. This only orders the survivors; `matched` alone decides entry.
        score += (inTitle ? 2 : 0) + (inRest ? 1 : 0)
      }
      return { paper, score, matched }
    })
    .filter((r) => r.matched >= need)
    .sort((a, b) => b.score - a.score || b.matched - a.matched)
    .slice(0, limit)
}

function server(id: string): { server: Server; doi: string } {
  const colon = id.indexOf(":")
  if (colon > 0) {
    const s = id.slice(0, colon).toLowerCase()
    if (s === "biorxiv" || s === "medrxiv") return { server: s, doi: id.slice(colon + 1) }
  }
  return { server: "biorxiv", doi: id }
}

function link(p: Paper): string | undefined {
  if (!p.doi) return undefined
  const host = (p.server ?? "biorxiv").toLowerCase() === "medrxiv" ? "medrxiv" : "biorxiv"
  return `https://www.${host}.org/content/${p.doi}v${p.version ?? "1"}`
}

function toHit(p: Paper, score?: number): ConnectorHit {
  const meta = [p.authors, p.category, p.date].filter(Boolean).join(". ")
  return {
    id: `${(p.server ?? "biorxiv").toLowerCase()}:${p.doi ?? ""}`,
    title: snippet(p.title, 300) ?? p.doi ?? "Untitled preprint",
    summary: snippet(p.abstract) ?? (meta.length ? meta : undefined),
    url: link(p),
    score,
    extra: raw(p),
  }
}

async function recent(s: Server, count: number, opts?: SearchOptions): Promise<Paper[]> {
  const data = await getJSON<Details>(`${BASE}/${s}/${count}`, { signal: opts?.signal }).catch(() => ({}) as Details)
  return (data.collection ?? []).map((p) => ({ ...p, server: p.server ?? s }))
}

async function byDoi(s: Server, doi: string, opts?: SearchOptions | undefined): Promise<Paper[]> {
  const data = await getJSON<Details>(`${BASE}/${s}/${doi}`, { signal: opts?.signal }).catch(() => ({}) as Details)
  return (data.collection ?? []).map((p) => ({ ...p, server: p.server ?? s }))
}

export const biorxiv: Connector = {
  id: "biorxiv",
  name: "bioRxiv / medRxiv",
  domain: "literature",
  description: "Biology and health-sciences preprints (bioRxiv + medRxiv) via Cold Spring Harbor.",
  homepage: "https://www.biorxiv.org",

  async search(query, opts) {
    const limit = Math.min(opts?.limit ?? 10, 50)
    const only = String(opts?.params?.server ?? "").toLowerCase()
    const targets = SERVERS.filter((s) => !only || s === only)

    if (isDoi(query)) {
      const found = await Promise.all(targets.map((s) => byDoi(s, query.trim(), opts)))
      return found
        .flat()
        .slice(0, limit)
        .map((p) => toHit(p))
    }

    const pool = Math.min(Number(opts?.params?.pool ?? 100) || 100, 200)
    const batches = await Promise.all(targets.map((s) => recent(s, pool, opts)))
    return rankRecent(batches.flat(), query, limit).map((r) => toHit(r.paper, r.score))
  },

  async fetch(id, opts) {
    const parsed = server(id)
    const primary = await byDoi(parsed.server, parsed.doi, opts)
    if (primary.length) return primary[primary.length - 1]
    const other: Server = parsed.server === "biorxiv" ? "medrxiv" : "biorxiv"
    const fallback = await byDoi(other, parsed.doi, opts)
    return fallback.length ? fallback[fallback.length - 1] : null
  },
}