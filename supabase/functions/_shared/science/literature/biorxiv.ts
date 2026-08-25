// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
import type { Connector, ConnectorHit, SearchOptions } from "../types.ts"
import { getJSON } from "../http.ts"
import { raw, snippet } from "./shared.ts"
import { relevanceOf } from "../relevance.ts"

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
 * api.biorxiv.org offers retrieval by DOI or by recency and nothing else. Every other index in the
 * literature lane answers a query; this one scans the ~200 newest preprints and decides for itself
 * what counts as a match.
 *
 * 🔴 THE RULE LIVES IN ../relevance.ts AND IS SHARED WITH THE LANE'S OWN FLOOR — moved there rather
 * than copied. It was written here first, to fix preprints being returned as evidence on the
 * strength of a single token: a property-law question answered with a neuroscience preprint because
 * both contained "adverse", and a Thirty Years War question answered with a worm paper because both
 * contained "of". The literature lane then needed the same judgement for the six real indexes, and
 * two copies of a rule like that drift — with the copy nobody is watching being the one that starts
 * fabricating again. biorxiv.test.ts still drives this connector's end of it directly.
 */
export function rankRecent(
  papers: Paper[],
  query: string,
  limit: number,
): { paper: Paper; score: number; matched: number }[] {
  return papers
    .map((paper) => ({
      paper,
      rel: relevanceOf(
        query,
        paper.title ?? "",
        `${paper.abstract ?? ""} ${paper.authors ?? ""} ${paper.category ?? ""}`,
      ),
    }))
    .filter((r) => r.rel.keep)
    .sort((a, b) => b.rel.score - a.rel.score || b.rel.matched - a.rel.matched)
    .slice(0, limit)
    .map((r) => ({ paper: r.paper, score: r.rel.score, matched: r.rel.matched }))
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