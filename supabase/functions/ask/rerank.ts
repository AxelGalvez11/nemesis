// Cross-encoder reranking for the answer engine. The dense ANN retriever ranks by embedding cosine;
// the reranker (Voyage rerank-2.5) re-reads the actual chunk TEXT against the question and reorders
// on one scale — which is what lets library chunks and live candidates (different providers, no shared
// embedding space guarantees) be compared head-to-head. PR1 proved this is the real retrieval win
// (mrr +0.111) in the eval harness; here it unifies the library + live sets at answer time.
//
// Reorder-only: no rows added or removed. The fabrication refusal and citation enforcement run on the
// reranked set, so the safety floors are unchanged by reordering.

import type { RetrievedChunk } from "./citation.ts";

const RERANK_MODEL = Deno.env.get("RR_MODEL") ?? "rerank-2.5";
const RERANK_URL = "https://api.voyageai.com/v1/rerank";

export interface RankedChunk extends RetrievedChunk {
  rerank_score: number;
}

/**
 * Rerank chunks by `query`, most-relevant first, attaching the relevance score. Requires chunk_text
 * on every chunk (the cross-encoder reads it). Returns a NEW array; input is not mutated. Throws on a
 * missing key or a non-OK response — the caller decides whether to degrade to dense order.
 */
export async function rerankChunks(query: string, chunks: RetrievedChunk[]): Promise<RankedChunk[]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("VOYAGE_API_KEY required for rerank");
  if (chunks.length === 0) return [];

  const documents = chunks.map((c) => c.chunk_text ?? "");
  const res = await fetch(RERANK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: RERANK_MODEL, query, documents, truncation: true }),
  });
  if (!res.ok) throw new Error(`voyage rerank failed ${res.status}: ${(await res.text()).slice(0, 160)}`);

  const body = await res.json();
  const data = body.data as Array<{ index: number; relevance_score: number }>;
  // Invariant: reorder must not drop, duplicate, or invent rows. A wrong count (a future top_k), an
  // out-of-range index (chunks[undefined] → an all-undefined chunk that silently passes the fabrication
  // guard and citation layer), or a repeated index all corrupt the downstream refusal logic. Fail loudly.
  if (!Array.isArray(data) || data.length !== chunks.length) {
    throw new Error(`rerank returned ${data?.length ?? 0} of ${chunks.length} rows`);
  }
  const indices = new Set(data.map((d) => d.index));
  if (indices.size !== chunks.length || data.some((d) => d.index < 0 || d.index >= chunks.length)) {
    throw new Error(`rerank returned invalid/duplicate indices for ${chunks.length} rows`);
  }
  return data.map((d) => ({ ...chunks[d.index], rerank_score: d.relevance_score }));
}
