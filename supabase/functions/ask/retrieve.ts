// Step 4: retrieve. Embed the question with Voyage (query input_type, 1024-dim,
// reusing the corpus embedder so query/document vectors match), then ANN over
// core_source_chunks via match_core_source_chunks with intent->provider priority
// and optional single-entity scoping (the bridge filter added in 0113).
//
// The match RPC returns provider/license/url/retrieved_at but not title /
// published_date, so we enrich the distinct source_ids from core_sources in one
// follow-up select.

import { embedCoreTexts } from "../core-source-sync/embeddings.ts";
import type { RetrievedChunk } from "./citation.ts";

interface MatchRow {
  id: string;
  source_id: string;
  chunk_text: string;
  section: string | null;
  provider: string;
  license: string | null;
  source_url: string | null;
  retrieved_at: string | null;
  similarity: number;
}

export interface RetrieveOpts {
  question: string;
  providers: string[] | null;
  entityId: string | null;
  threshold: number;
  matchCount: number;
  sbUrl: string;
  serviceKey: string;
  /**
   * Deterministic sub-query strings (Task 1's buildSubQueries), run concurrently and merged
   * into one pool. Optional — absent or length <= 1 reproduces today's single-embed/single-RPC
   * behavior byte-for-byte (back-compat requirement).
   */
  subQueries?: string[];
  /**
   * Total merged rows to keep after dedup + rerank. Defaults to matchCount for back-compat.
   * Only meaningful when subQueries has > 1 element; each sub-query's RPC call requests up to
   * this many rows so the merge has enough candidates to choose from.
   */
  recallPool?: number;
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  maxSimilarity: number;
}

// Bound on concurrent sub-query fan-out (cost control — global-constraints.md). buildSubQueries
// already caps output at 4, so this is a defensive ceiling, not the primary limiter.
const MAX_CONCURRENT_SUB_QUERIES = 4;

/**
 * Pure merge step for multi-query recall: dedups rows across per-query result arrays by chunk
 * id (`r.id`), keeping the row with the HIGHER similarity on a collision, sorts the merged set
 * by similarity desc, and slices to `recallPool`. No network, no randomness — fully unit
 * testable. A single-array input is returned in its original (already similarity-desc) order,
 * subject only to the recallPool cap.
 */
export function mergeMatchRows(perQueryRows: MatchRow[][], recallPool: number): MatchRow[] {
  const byId = new Map<string, MatchRow>();
  for (const rows of perQueryRows) {
    for (const row of rows) {
      const existing = byId.get(row.id);
      if (!existing || row.similarity > existing.similarity) {
        byId.set(row.id, row);
      }
    }
  }
  const merged = [...byId.values()].sort((a, b) => b.similarity - a.similarity);
  return merged.slice(0, recallPool);
}

export async function retrieve(opts: RetrieveOpts): Promise<RetrieveResult> {
  const subQueries = opts.subQueries;
  const recallPool = opts.recallPool ?? opts.matchCount;

  const rows = subQueries && subQueries.length > 1
    ? await retrieveMultiQuery(opts, subQueries, recallPool)
    : await retrieveSingleQuery(opts);

  if (rows.length === 0) return { chunks: [], maxSimilarity: 0 };

  // source_id values come from a SECURITY DEFINER RPC (UUID column), but validate
  // before interpolating into the PostgREST in.(...) filter — defense in depth.
  const sourceIds = [...new Set(rows.map((r) => r.source_id))]
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const titles = await fetchSourceMeta(opts.sbUrl, opts.serviceKey, sourceIds);

  const chunks: RetrievedChunk[] = rows.map((r, i) => {
    const meta = titles.get(r.source_id);
    const md = (meta?.metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : undefined);
    const strArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined);
    return {
      tag: String(i + 1),
      chunk_id: r.id,
      chunk_text: r.chunk_text,
      source_id: r.source_id,
      provider: r.provider,
      title: meta?.title ?? null,
      section: r.section,
      url: r.source_url,
      license: r.license,
      published_date: meta?.effective_at ? meta.effective_at.slice(0, 10) : null,
      retrieved_at: r.retrieved_at,
      similarity: r.similarity,
      authors: strArr(md.authors),
      journal: str(md.journal_iso) ?? str(md.journal),
      year: str(md.year),
      volume: str(md.volume),
      issue: str(md.issue),
      pages: str(md.pages),
      publication_types: strArr(md.publication_types),
      study_type: str(md.study_type),
      trial_status: str(md.status),
      trial_phase: undefined,
    };
  });

  return { chunks, maxSimilarity: Math.max(...rows.map((r) => r.similarity)) };
}

// Back-compat path: byte-identical to pre-Task-2 retrieve() — embed the single question, one
// RPC call requesting opts.matchCount rows. Used whenever subQueries is absent or has <= 1
// element, so any caller not yet passing subQueries sees no behavior change whatsoever.
async function retrieveSingleQuery(opts: RetrieveOpts): Promise<MatchRow[]> {
  const embeddings = await embedCoreTexts([opts.question], "query");
  const queryEmbedding = embeddings[0];
  if (!queryEmbedding) throw new Error("query embedding failed");

  return await rpc<MatchRow[]>(opts.sbUrl, opts.serviceKey, "match_core_source_chunks", {
    query_embedding: queryEmbedding,
    match_count: opts.matchCount,
    match_threshold: opts.threshold,
    filter_providers: opts.providers,
    filter_section: null,
    filter_drug_entity: opts.entityId,
  });
}

// Multi-query recall (Task 2): embed all sub-queries in one batched call, fan the match RPC out
// concurrently (bounded), and merge into a single similarity-ranked pool. A single sub-query's
// RPC failure degrades to "contributed nothing" (mirrors the best-effort fetch style elsewhere
// in this module) rather than failing the whole request — only when EVERY sub-query fails does
// this return [] (same shape as the "no rows" path already handled by the caller).
async function retrieveMultiQuery(
  opts: RetrieveOpts,
  subQueries: string[],
  recallPool: number,
): Promise<MatchRow[]> {
  const bounded = subQueries.slice(0, MAX_CONCURRENT_SUB_QUERIES);
  const embeddings = await embedCoreTexts(bounded, "query");

  const perQueryRows = await Promise.all(
    embeddings.map(async (queryEmbedding) => {
      if (!queryEmbedding) return [];
      try {
        return await rpc<MatchRow[]>(opts.sbUrl, opts.serviceKey, "match_core_source_chunks", {
          query_embedding: queryEmbedding,
          match_count: recallPool,
          match_threshold: opts.threshold,
          filter_providers: opts.providers,
          filter_section: null,
          filter_drug_entity: opts.entityId,
        });
      } catch (e) {
        console.warn("sub-query RPC failed, contributing no rows:", (e as Error).message);
        return [];
      }
    }),
  );

  return mergeMatchRows(perQueryRows, recallPool);
}

interface SourceMeta {
  title: string | null;
  effective_at: string | null;
  metadata: Record<string, unknown> | null;
}

async function fetchSourceMeta(
  sbUrl: string,
  serviceKey: string,
  sourceIds: string[],
): Promise<Map<string, SourceMeta>> {
  const url = new URL(`${sbUrl}/rest/v1/core_sources`);
  url.searchParams.set("id", `in.(${sourceIds.join(",")})`);
  url.searchParams.set("select", "id,title,effective_at,metadata");
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return new Map();
  const rows = await res.json() as Array<{ id: string; title: string | null; effective_at: string | null; metadata: Record<string, unknown> | null }>;
  return new Map(rows.map((r) => [r.id, { title: r.title, effective_at: r.effective_at, metadata: r.metadata ?? null }]));
}

async function rpc<T>(
  sbUrl: string,
  serviceKey: string,
  fn: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${sbUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`rpc ${fn} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return await res.json() as T;
}
