# PR1-rerank — cross-encoder reranking measured (2026-06-08)

**Verdict: Voyage `rerank-2.5` over the dense top-50 is a clean, material retrieval win.**
mrr **0.728→0.839 (+0.111)**, ndcg@10 **0.785→0.876 (+0.091)**, recall@10 **0.974→1.0**,
recall@5 +0.026, recall@20 flat (already 1.0), **AC3 4/4 held**. This is the FTS-hybrid
thesis's job done by the right mechanism — a cross-encoder, not lexical fusion.

Measured on the live cloud (43-item golden set, dense `match_core_source_chunks` top-50 →
`rerankRows()` → reorder). Reproduce: `RERANK=on deno run -A --env-file=.env eval/retrieval-eval.ts`
(`RR_MODEL` overrides the reranker; default `rerank-2.5`).

## Numbers (live cloud, 39 answerable + 4 unanswerable)

| metric    | dense (committed baseline) | rerank-2.5 | Δ        |
|-----------|----------------------------|------------|----------|
| recall@5  | 0.8462                     | 0.8718     | +0.0256  |
| recall@10 | 0.9744                     | 1.0000     | +0.0256  |
| recall@20 | 1.0000                     | 1.0000     | 0        |
| ndcg@10   | 0.7848                     | 0.8756     | +0.0909  |
| mrr       | 0.7281                     | 0.8389     | +0.1108  |
| AC3 clean | 4/4                        | 4/4        | ✓ held   |

Per-item: **9 improved, 3 worsened, 27 unchanged.** The gains are large and concentrated on
the buried items; the losses are tiny and stay inside the buried zone:

| improved (rank dense→rerank) | | worsened (rank dense→rerank) |
|---|---|---|
| sertraline-pregnancy 7→1 · sema-sideeffects 5→1 | | sema-boxed-thyroid 5→8 |
| lisinopril-pregnancy 5→1 · metformin-lactic 2→1 | | isotretinoin-pregnancy 4→5 |
| amoxicillin-indications 2→1 · amox-hpylori 2→1 | | sertraline-suicidality 7→8 |
| metformin-renal 6→2 · atorvastatin-myopathy 5→3 · **omeprazole-indications 17→10** | | |

The 27 unchanged are the already-rank-1 items — rerank did **not** demote the easy wins. The
3 small regressions are the source-granularity artifact (gold source's chunk loses to a
sibling source's chunk that's a better *literal* answer to the query); net is strongly positive.

## Why this works where hybrid didn't
PR2 (FTS ⊕ dense via RRF) was flat/negative — even omeprazole-indications (gold label literally
contains "indications") stayed at rank 17 under hybrid. Lexical overlap ≠ relevance: a drug's
label has dozens of chunks all containing the drug name, so FTS can't tell the *indications*
chunk from the *adverse-reactions* chunk. A cross-encoder reads the query and the chunk jointly
and scores actual answerhood — exactly the buried-label failure mode. Recall is corpus-bound
(recall@20 already 1.0); the headroom was always in **ranking**, and rerank is the ranking tool.

## AC3 preserved by construction
Rerank only **reorders** what the dense retriever returned above its 0.5 floor — it never adds
rows. The no-source-refusal signal stays 100% dense (the unanswerable path is untouched). 4/4
clean held empirically.

## Cost / latency
One Voyage rerank call per query over the top-50 chunks: sub-cent, a few-hundred-ms added —
cheap next to the embedding + LLM generation already in `/ask`. Tunable: rerank fewer candidates
(top-20) or use `rerank-2.5-lite` if latency-bound. No new DB object, no migration.

## Recommendation (eval-proven; SHIP step is owner-gated)
1. **Adopt reranking as the P1 retrieval win; drop FTS-hybrid** (PR2 RPC stays deployed but
   unused — additive, harmless; do not flip `/ask` to it).
2. **Shipping** = add the rerank step to the `/ask` retrieval path. ⚠️ More than "insert a call":
   the eval reranks the **top-50 at threshold 0**, but production `/ask` retrieves a small
   **top-K (~8) at threshold ~0.6**. Shipping therefore requires `/ask` to first **widen its
   candidate pool** — retrieve ~50 at a low threshold → rerank → cut to the top-8 the synthesizer
   sees. That's edge code on the FROZEN-safety path → owner-gated
   `supabase functions deploy`, behind a `RERANK_ENABLED` flag, then **re-freeze the committed
   baseline to the rerank numbers**. NOT done here (this PR is measurement only; committed
   baseline stays dense so CI keeps gating today's live engine).
3. This harness hook (`RERANK=on`) makes the win reproducible and lets the answer-eval (P2/P3)
   measure rerank's effect on answer quality before the flip.
