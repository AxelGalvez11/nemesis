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
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  maxSimilarity: number;
}

export async function retrieve(opts: RetrieveOpts): Promise<RetrieveResult> {
  const embeddings = await embedCoreTexts([opts.question], "query");
  const queryEmbedding = embeddings[0];
  if (!queryEmbedding) throw new Error("query embedding failed");

  const rows = await rpc<MatchRow[]>(opts.sbUrl, opts.serviceKey, "match_core_source_chunks", {
    query_embedding: queryEmbedding,
    match_count: opts.matchCount,
    match_threshold: opts.threshold,
    filter_providers: opts.providers,
    filter_section: null,
    filter_drug_entity: opts.entityId,
  });

  if (rows.length === 0) return { chunks: [], maxSimilarity: 0 };

  // source_id values come from a SECURITY DEFINER RPC (UUID column), but validate
  // before interpolating into the PostgREST in.(...) filter — defense in depth.
  const sourceIds = [...new Set(rows.map((r) => r.source_id))]
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const titles = await fetchSourceMeta(opts.sbUrl, opts.serviceKey, sourceIds);

  const chunks: RetrievedChunk[] = rows.map((r, i) => {
    const meta = titles.get(r.source_id);
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
    };
  });

  return { chunks, maxSimilarity: Math.max(...rows.map((r) => r.similarity)) };
}

interface SourceMeta {
  title: string | null;
  effective_at: string | null;
}

async function fetchSourceMeta(
  sbUrl: string,
  serviceKey: string,
  sourceIds: string[],
): Promise<Map<string, SourceMeta>> {
  const url = new URL(`${sbUrl}/rest/v1/core_sources`);
  url.searchParams.set("id", `in.(${sourceIds.join(",")})`);
  url.searchParams.set("select", "id,title,effective_at");
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return new Map();
  const rows = await res.json() as Array<{ id: string; title: string | null; effective_at: string | null }>;
  return new Map(rows.map((r) => [r.id, { title: r.title, effective_at: r.effective_at }]));
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
