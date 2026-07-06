// Adapter: _shared/science literature Connectors -> NormalizedSource, so the 4 net-new
// literature connectors (bioRxiv/medRxiv, Crossref, Semantic Scholar, arXiv) can be wired into
// gatherLiveCandidates (live-sources.ts) as ordinary LiveSourceDef entries. GATED behind
// SCIENCE_CONNECTORS=on (default OFF) in index.ts/live-sources.ts — this file itself has no gate,
// it is only ever invoked from the gated branch.
//
// pubmed, europepmc, openalex are DELIBERATELY NOT wired here: they already have dedicated
// live-sources.ts entries (fetchPubMedOA/fetchEuropePmc/fetchOpenAlex). Adding them again would
// just get dropped by the (provider, provider_id) dedupe in live-sources.ts's fanOut — wasted
// latency for zero net breadth.
//
// Pure mapping only (no network here) so this file is unit-testable without hitting any API.

import type { Connector, ConnectorHit } from "../_shared/science/types.ts";
import { biorxiv } from "../_shared/science/literature/biorxiv.ts";
import { crossref } from "../_shared/science/literature/crossref.ts";
import { semanticScholar } from "../_shared/science/literature/semantic-scholar.ts";
import { arxiv } from "../_shared/science/literature/arxiv.ts";
import type { CoreSourceLicense, CoreSourceProvider } from "../core-source-sync/license.ts";
import type { NormalizedSource } from "../core-source-sync/normalized-source.ts";
import { sha256Hex } from "../core-source-sync/embeddings.ts";

/** NormalizedSource minus content_hash — the pure mapper below has no async sha256 dependency,
 *  so it stays synchronously unit-testable. fetchLiteratureConnector fills in content_hash. */
export interface MappedLiteratureSource {
  readonly provider: CoreSourceProvider;
  readonly provider_id: string;
  readonly title: string;
  readonly source_url: string;
  readonly license: CoreSourceLicense;
  readonly content_text: string;
  readonly metadata: Record<string, unknown>;
}

/** One entry per net-new literature connector this adapter wires in. */
export interface LiteratureConnectorDef {
  /** live-sources.ts `origin` label for this source. */
  origin: string;
  /** The underlying _shared/science Connector. */
  connector: Connector;
  /** CoreSourceProvider value used when the hit carries no PMID (the connector's own long tail). */
  provider: CoreSourceProvider;
}

export const LITERATURE_CONNECTOR_DEFS: readonly LiteratureConnectorDef[] = [
  { origin: "biorxiv", connector: biorxiv, provider: "biorxiv" },
  { origin: "crossref", connector: crossref, provider: "crossref" },
  { origin: "semantic_scholar", connector: semanticScholar, provider: "semantic_scholar" },
  { origin: "arxiv", connector: arxiv, provider: "arxiv" },
];

/** "10.1101/2024.01.01.573922" <- "https://doi.org/10.1101/..." or a bare DOI already. */
function normalizeDoi(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const d = String(raw).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
  return d.length ? d : undefined;
}

/** "12345678" <- "PMID:12345678" / "12345678" / numeric-looking strings; undefined otherwise. */
function normalizePmid(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).replace(/^pmid:?/i, "").trim();
  return /^\d+$/.test(s) ? s : undefined;
}

/**
 * Extract a PMID and/or DOI from a ConnectorHit, per-connector — each of the 4 exposes external
 * ids in a different shape in `extra` (see per-source comments below). Best-effort: returns
 * undefined fields when the hit doesn't carry them, never throws.
 */
export function extractExternalIds(
  origin: string,
  hit: ConnectorHit,
): { pmid?: string; doi?: string } {
  const extra = (hit.extra ?? {}) as Record<string, unknown>;

  if (origin === "crossref") {
    // crossref.ts: hit.id IS the bare DOI (see toHit in crossref.ts); no PMID available.
    return { doi: normalizeDoi(hit.id || (extra.DOI as string | undefined)) };
  }

  if (origin === "semantic_scholar") {
    // semantic-scholar.ts: hit.id is an opaque Semantic Scholar paperId, USELESS for dedupe.
    // External ids live at extra.externalIds.{PubMed,DOI}.
    const ext = (extra.externalIds ?? {}) as Record<string, unknown>;
    return {
      pmid: normalizePmid(ext.PubMed),
      doi: normalizeDoi(ext.DOI as string | undefined),
    };
  }

  if (origin === "biorxiv") {
    // biorxiv.ts: hit.id = "<server>:<doi>" (colon-joined); the bare doi is also at extra.doi.
    // bioRxiv/medRxiv preprints predate any PMID assignment, so no PMID field exists.
    const doi = (extra.doi as string | undefined) ?? hit.id.split(":").slice(1).join(":");
    return { doi: normalizeDoi(doi) };
  }

  if (origin === "arxiv") {
    // arxiv.ts: hit.id is the bare arXiv id (e.g. "2101.00001"); a published DOI, when the
    // preprint was later published in a journal, is at extra.doi. No PMID field.
    return { doi: normalizeDoi(extra.doi as string | undefined) };
  }

  return {};
}

/**
 * True only when the hit carries a REAL abstract, not the metadata fallback. Every connector's own
 * `toHit` (see literature/*.ts) sets `summary: snippet(abstract) ?? meta` — when a work has no
 * abstract, `summary` silently becomes an "Authors. Venue. Year." stub instead of undefined, and
 * that stub would otherwise pass a bare `!hit.summary` check. Reading the RAW field straight off
 * `extra` (the connector's own passthrough record — see `raw()` in shared.ts) tells the two cases
 * apart. Mirrors fetchOpenAlex, which returns null when `reconstructAbstract` yields "" — no
 * groundable text, don't mint a citation stub for it.
 */
function hasRealAbstract(origin: string, hit: ConnectorHit): boolean {
  const extra = (hit.extra ?? {}) as Record<string, unknown>;
  // arxiv's Atom <summary> IS the abstract (there is no separate meta-only fallback field distinct
  // from it), so extra.summary is the right raw field to check for that connector.
  const raw = origin === "arxiv" ? extra.summary : extra.abstract;
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Map one ConnectorHit to a NormalizedSource, choosing (provider, provider_id) so it dedupes
 * correctly both against the existing pubmed_oa/europepmc live sources AND across the 4 new
 * connectors themselves:
 *   - PMID present  -> provider "pubmed_oa", provider_id = bare pmid (collapses into the existing
 *     PubMed/Europe PMC hit for the same paper — first-registered source wins in live-sources.ts).
 *   - no PMID, DOI present -> the SHARED provider "doi_lit" (NOT this connector's own name),
 *     provider_id = "doi:<doi>" — this is what collapses the SAME paper when it's surfaced by TWO
 *     DIFFERENT new connectors (e.g. a Crossref hit and a Semantic Scholar hit for the same DOI):
 *     keying by the origin connector's own provider name would leave them as two "different
 *     provider" candidates and the dedupe in live-sources.ts would silently no-op for that case.
 *   - neither -> this connector's own provider (biorxiv/crossref/semantic_scholar/arxiv),
 *     provider_id = the hit's native id.
 * Returns null when the hit lacks a real abstract (see hasRealAbstract) or a title — mirrors
 * fetchOpenAlex, which returns null rather than citing a bare "Authors. Venue. Year." stub with no
 * groundable text — so this can never mint a citation with nothing behind it.
 */
export function connectorHitToNormalizedSource(
  def: LiteratureConnectorDef,
  hit: ConnectorHit,
): MappedLiteratureSource | null {
  const title = (hit.title ?? "").trim();
  const summary = (hit.summary ?? "").trim();
  if (!title || !summary || !hasRealAbstract(def.origin, hit)) return null;

  const { pmid, doi } = extractExternalIds(def.origin, hit);
  const provider: CoreSourceProvider = pmid ? "pubmed_oa" : doi ? "doi_lit" : def.provider;
  const provider_id = pmid ? pmid : doi ? `doi:${doi}` : hit.id;
  if (!provider_id) return null;

  const source_url = hit.url ?? (doi ? `https://doi.org/${doi}` : undefined);
  const content_text = `${title}\n\n${summary}`;

  return {
    provider,
    provider_id,
    title,
    source_url: source_url ?? "",
    // Conservative default; see PROVIDER_DEFAULT_LICENSE comment in license.ts — none of these 4
    // connectors surface a verifiable per-record open license, so every hit is restricted
    // (cc_by_nc): citable live, never eligible for storage.
    license: "cc_by_nc",
    content_text,
    metadata: {
      source: def.origin,
      pmid,
      doi,
      score: hit.score,
    },
  };
}

/**
 * Fetch one literature connector live, mapped to NormalizedSource[]. Never throws: any connector
 * failure (network error, HTTP error, timeout) resolves to [] so a single bad connector can't sink
 * gatherLiveCandidates — mirrors every other provider in core-source-sync/providers/.
 */
export async function fetchLiteratureConnector(
  def: LiteratureConnectorDef,
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<NormalizedSource[]> {
  try {
    const hits = await def.connector.search(query, { limit, signal });
    const out: NormalizedSource[] = [];
    for (const hit of hits) {
      const mapped = connectorHitToNormalizedSource(def, hit);
      if (!mapped) continue;
      out.push({ ...mapped, content_hash: await sha256Hex(mapped.content_text) });
    }
    return out;
  } catch (err) {
    console.error(`literature connector ${def.origin} failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}
