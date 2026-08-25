// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
import type { Connector, ConnectorHit } from "../types.ts"
import { getJSON } from "../http.ts"
import { raw, snippet } from "./shared.ts"

/**
 * Crossref REST API — DOI metadata for ~150M scholarly works.
 *
 * `mailto` opts the requests into Crossref's "polite pool" (no key required).
 * Abstracts, when present, are JATS XML and are stripped to plain text.
 */

const BASE = "https://api.crossref.org/works"
// 🔴🔴 OUR CONTACT, NOT THE UPSTREAM PROJECT'S. This read support@syntheticsciences.ai — the
// address of the open-source project these connectors were derived from, not of anyone who runs
// this service. Crossref's polite pool treats `mailto` as WHO IS CALLING and uses it to reach an
// operator whose traffic is misbehaving, so shipping it meant our requests were attributed to a
// third party and any warning would have gone to people with no way to act on it. Same defect as
// the OpenAlex fallback fixed alongside it; harmless only while the connectors were switched off.
const MAILTO = "mailto=support@enternemesis.com"

interface Author {
  given?: string
  family?: string
  name?: string
}

interface Work {
  DOI?: string
  title?: string[]
  subtitle?: string[]
  abstract?: string
  author?: Author[]
  "container-title"?: string[]
  publisher?: string
  type?: string
  URL?: string
  score?: number
  "is-referenced-by-count"?: number
  issued?: { "date-parts"?: number[][] }
}

interface SearchResponse {
  message?: { items?: Work[]; "total-results"?: number }
}

interface WorkResponse {
  message?: Work
}

function year(w: Work): number | undefined {
  return w.issued?.["date-parts"]?.[0]?.[0]
}

function authors(w: Work): string | undefined {
  const names = (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean)
  if (names.length === 0) return undefined
  return names.length > 4 ? `${names.slice(0, 4).join(", ")} et al.` : names.join(", ")
}

function toHit(w: Work): ConnectorHit {
  const meta = [authors(w), w["container-title"]?.[0], year(w)].filter(Boolean).join(". ")
  return {
    id: w.DOI ?? "",
    title: snippet([w.title?.[0], w.subtitle?.[0]].filter(Boolean).join(": "), 300) ?? w.DOI ?? "Untitled",
    summary: snippet(w.abstract) ?? (meta.length ? meta : undefined),
    url: w.URL ?? (w.DOI ? `https://doi.org/${w.DOI}` : undefined),
    score: typeof w.score === "number" ? w.score : undefined,
    extra: raw(w),
  }
}

/**
 * 🔴🔴🔴 CROSSREF INDEXES THE PAPER *AND* ITS PAPERWORK, AND ONLY ONE OF THOSE IS A SOURCE.
 *
 * A DOI is minted for many things besides the article: the referee reports, the editor's decision
 * letter, each figure, the journal issue that contains it. Crossref returns them all, correctly —
 * they are real records with real DOIs, and `type` says which is which. This connector was reading
 * every field except that one.
 *
 * Measured live 2026-08-24, a metformin query returned, in the same list of ten:
 *     Review for "First-Line Dapagliflozin, Metformin, or Combination Therapy…"
 *     Decision letter for "First-Line Dapagliflozin, Metformin, or Combination Therapy…"
 * Both are `peer-review`. Both are perfectly on-topic — a relevance rule cannot catch them, because
 * they carry the title of the paper they are about. And neither is something a student can read,
 * quote or cite. Two of ten slots spent on a journal's internal correspondence.
 *
 * 🔴 A DENY-LIST, NOT AN ALLOW-LIST, AND THAT IS THE CAUTIOUS DIRECTION HERE. Crossref adds work
 * types over time; an allow-list would silently drop each new one, and the failure would be
 * invisible — scholarship quietly missing from a student's results with nothing to notice. A
 * deny-list lets an unrecognised type through, which is the error worth having.
 *
 * 🔴 CONTAINERS AND COMPONENTS GO TOO, for the same reason and not as tidiness. A `journal-issue`
 * is a table of contents, a `component` is one figure lifted out of an article. Both cite as if
 * they were the work itself.
 */
const NOT_A_WORK = new Set([
  "peer-review",
  "component",
  "grant",
  "journal",
  "journal-issue",
  "journal-volume",
  "book-series",
  "book-set",
  "proceedings-series",
  "report-series",
  "standard-series",
])

export const crossref: Connector = {
  id: "crossref",
  name: "Crossref",
  domain: "literature",
  description: "Cross-publisher DOI metadata: titles, authors, venues, references, and citations.",
  homepage: "https://www.crossref.org",

  async search(query, opts) {
    // Over-fetch, because the filter below removes rows and the caller asked for `limit` PAPERS.
    // Without this a query whose top hits are referee reports returns short for no visible reason.
    const rows = Math.min(opts?.limit ?? 10, 50)
    const data = await getJSON<SearchResponse>(
      `${BASE}?query=${encodeURIComponent(query)}&rows=${Math.min(rows * 3, 100)}&select=DOI,title,subtitle,abstract,author,container-title,publisher,type,URL,score,is-referenced-by-count,issued&${MAILTO}`,
      { signal: opts?.signal },
    )
    return (data.message?.items ?? [])
      .filter((item) => !NOT_A_WORK.has((item.type ?? "").toLowerCase()))
      .slice(0, rows)
      .map(toHit)
  },

  async fetch(id, opts) {
    const doi = id.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim()
    const data = await getJSON<WorkResponse>(`${BASE}/${encodeURIComponent(doi)}?${MAILTO}`, {
      signal: opts?.signal,
    })
    return data.message ?? null
  },
}