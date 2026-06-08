// eval/lib/voyage.ts
const VOYAGE_MODEL = "voyage-3-large";
// Cross-encoder reranker (PR1-rerank experiment). rerank-2.5 = Voyage's current best.
// Override via RR_MODEL for A/B (e.g. rerank-2, rerank-2.5-lite).
const RERANK_MODEL = Deno.env.get("RR_MODEL") ?? "rerank-2.5";

export async function embedQuery(text: string, apiKey = Deno.env.get("VOYAGE_API_KEY")): Promise<number[]> {
  if (!apiKey) throw new Error("VOYAGE_API_KEY required");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: "query" }),
  });
  if (!res.ok) throw new Error(`voyage embed failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  return body.data[0].embedding as number[]; // 1024 floats
}

/**
 * Cross-encoder rerank: reorder `rows` by Voyage rerank relevance of each row's
 * chunk_text against `query`, returning a NEW array (most-relevant first). Pure
 * re-ordering — no rows added/removed, so the dense no-source-refusal floor (AC3)
 * is untouched: rerank only runs over what the dense retriever already returned.
 */
export async function rerankRows<T extends { chunk_text: string }>(
  query: string,
  rows: T[],
  apiKey = Deno.env.get("VOYAGE_API_KEY"),
): Promise<T[]> {
  if (!apiKey) throw new Error("VOYAGE_API_KEY required");
  if (rows.length === 0) return rows;
  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: RERANK_MODEL, query, documents: rows.map((r) => r.chunk_text ?? ""), truncation: true }),
  });
  if (!res.ok) throw new Error(`voyage rerank failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  // body.data: [{ index, relevance_score }] sorted by relevance_score desc.
  return (body.data as Array<{ index: number }>).map((d) => rows[d.index]);
}
