# PharmaOrb Backend — PR2: hybrid retrieval (dense ⊕ sparse FTS via RRF)

> **For agentic workers:** The migration `supabase/migrations/0125_hybrid_retrieval.sql` is
> written. Remaining steps are owner-gated (deploy) + a small harness hook (apply after PR0 #26
> merges). Reranking is carved into a separate follow-up (PR2b) to keep this a clean unit.

**Goal:** Add lexical/keyword retrieval (Postgres FTS) and fuse it with the existing dense vector search via Reciprocal Rank Fusion, so the doc that *literally* answers a question gets promoted — lifting MRR/nDCG (the headroom PR0 exposed) while recall holds and the AC3 refusal guarantee is preserved.

**Architecture:** One additive migration: a STORED `tsvector` column + GIN index on `core_source_chunks`, and a new `hybrid_match_core_source_chunks` RPC that fuses dense ANN (HNSW) and sparse FTS rankings in-SQL via RRF (k=60). `/ask` is untouched (still calls `match_core_source_chunks`) — the hybrid RPC is deployed additively and measured via the harness; a later PR flips `/ask` to it behind a flag. Reranking is PR2b.

**Tech Stack:** Postgres FTS (`tsvector`/GIN/`websearch_to_tsquery`/`ts_rank_cd`), pgvector HNSW, RRF, the PR0 harness.

---

## Status & dependency
- **Migration written:** `supabase/migrations/0125_hybrid_retrieval.sql` (committed on branch `pr2-hybrid`). **Authored but NOT locally tested** (no cloud/Docker here) — validate on first deploy; expect possible minor SQL fix-ups.
- **Depends on PR1 (0124 HNSW)** — the dense arm uses the HNSW index + `hnsw.ef_search`. Apply 0124 first. **Sequence: #26 merge → 0124 deploy → 0125 deploy → measure.**
- **0125** (0123 = PR #25's evidence-brief; 0124 = HNSW).
- Additive + safe: deploying the new RPC changes nothing about `/ask` (which still uses the dense RPC) until a later PR flips it.

## ⚠️ Decision for you (the one real choice) — FTS config
How should drug text be tokenized for keyword search?

| Option | Pro | Con |
|---|---|---|
| **`english` (recommended)** | stems + drops stopwords → "warns"/"warning", "tumors"/"tumor" match; best prose recall (users type prose) | can split exact codes (BPC-157 → bpc, 157) |
| `simple` | preserves exact codes/identifiers | no stemming → "tumors" misses "tumor"; weak prose recall |
| custom/hybrid config | best of both | more moving parts; premature now |

**My recommendation: `english`** — questions are natural language, and the dense arm + RRF fusion cover the rare exact-code case (BPC-157, GLP-1). The migration uses `english`. **Switching later is a one-line config change + reindex.** Validate with an A/B on the golden set *once it has code-heavy items* (the current 43 are mostly approved drugs, so the code edge-case isn't yet represented — that's a golden-set expansion task, not a blocker). If you'd prefer `simple` or a custom config, say so and I'll change the one line.

## What the migration does (already authored)
1. `ALTER TABLE core_source_chunks ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;` + `CREATE INDEX ... USING gin (content_tsv)`.
2. `CREATE OR REPLACE FUNCTION hybrid_match_core_source_chunks(query_embedding, query_text, match_count, match_threshold, rrf_k=60, candidate_count=50, filter_*)` — dense top-N ⊕ sparse top-N fused by RRF, returning the `match_core_source_chunks` shape with `similarity` = dense cosine, rows ordered by RRF score.
3. Defensive/required `GRANT ... TO authenticated, service_role; REVOKE ... FROM anon, PUBLIC` (new function → anon default-grant must be revoked).

**AC3 preserved by construction:** the final SELECT gates every row on `dense_similarity > match_threshold`. A fabricated-drug query (no dense match above threshold) returns ZERO rows even if FTS matches a lexeme; FTS only re-ranks docs that already clear the dense floor. So dense cosine stays the sole no-source-refusal signal and the harness AC3 check is unchanged.

## Harness hook (apply AFTER #26 merges — needs `eval/` on main)
The Retriever contract: any new retriever must be scoreable by the same harness. Add a hybrid path:

**`eval/lib/corpus.ts`** — add alongside `matchChunks`:

```ts
/** Hybrid retriever (PR2). Same ranked (chunk_id, source_id) contract; passes raw query_text for FTS. */
export async function matchChunksHybrid(
  env: Env, jwt: string, embedding: number[], queryText: string,
  matchCount = 50, matchThreshold = 0,
): Promise<MatchRow[]> {
  const res = await fetch(`${env.SB_URL}/rest/v1/rpc/hybrid_match_core_source_chunks`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query_embedding: embedding, query_text: queryText,
      match_count: matchCount, match_threshold: matchThreshold,
    }),
  });
  if (!res.ok) throw new Error(`hybrid match RPC failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return await res.json();
}
```

**`eval/retrieval-eval.ts`** — switch retriever via env (default dense, so the committed baseline is unchanged):

```ts
import { matchChunks, matchChunksHybrid, mintUser, readEnv, resolveSourceIds, teardownUser } from "./lib/corpus.ts";
const RETRIEVER = Deno.env.get("RETRIEVER") ?? "dense"; // "dense" | "hybrid"
// ...in the answerable loop, replace the matchChunks call:
const rows = RETRIEVER === "hybrid"
  ? await matchChunksHybrid(env, user.jwt, emb, item.question, MATCH_COUNT, 0)
  : await matchChunks(env, user.jwt, emb, MATCH_COUNT, 0);
// ...and in the AC3 loop, mirror the same switch at threshold 0.5.
// Also stamp report.retriever = RETRIEVER so baselines are labeled.
```

## Owner-gated execution (when back)
- [ ] Deploy after PR1: `supabase db push` (applies 0125). If `to_tsvector('english', ...)` generated-column errors on immutability, it won't — the 2-arg form is IMMUTABLE; if `ts_rank_cd`/`websearch_to_tsquery` errors, they are core FTS (always present). If `SET hnsw.ef_search` errors, see PR1's note.
- [ ] A/B measure (after applying the harness hook on merged main):

```bash
set -a; source supabase/functions/.env; set +a
export SB_URL=https://qyjmivntajbigjswhahb.supabase.co
RETRIEVER=dense  deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts | grep -A6 '"aggregate"'   # should = PR1 baseline
RETRIEVER=hybrid deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts | grep -A6 '"aggregate"'   # the candidate
```

**Acceptance:** hybrid `recall@k` ≥ dense (no regression) AND `mrr`/`ndcg@10` ↑ (the win — esp. the buried-gold items like omeprazole rank 17). AC3: hybrid `unanswerable_clean === unanswerable_total`. anon denied on `hybrid_match_core_source_chunks` (curl → 401/403/404).
- [ ] If hybrid wins, a FOLLOW-UP PR flips `/ask` retrieval to the hybrid RPC behind a flag and re-freezes the committed baseline to the hybrid numbers (the gate then tracks the live retriever).

## Rollback
Fully additive — `/ask` never used it. To remove: `DROP FUNCTION hybrid_match_core_source_chunks(...); DROP INDEX core_source_chunks_tsv_idx; ALTER TABLE core_source_chunks DROP COLUMN content_tsv;`. No data loss.

## PR2b (follow-up, not this PR) — reranking
Add Voyage **rerank-2** over the fused top-K in the `/ask` retrieval path, behind `RERANK_ENABLED`. It's app/edge code (a cross-encoder API call after retrieval), not SQL — deployed via `supabase functions deploy --use-api`, measured by the answer-eval/retrieval harness (rerank the fused candidates, then score). Pennies per call; gate on net nDCG gain. Kept separate so the SQL change (this PR) and the API change (PR2b) are each independently testable.

## Out of scope (later)
- halfvec quantization + partitioning (scale lever, P4).
- Flipping `/ask` to hybrid + re-freezing the baseline (the follow-up above).
- Golden-set expansion with code-heavy items to validate the FTS-config choice.
