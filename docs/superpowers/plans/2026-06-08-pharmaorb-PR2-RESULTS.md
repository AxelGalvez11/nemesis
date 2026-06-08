# PR2 hybrid retrieval — measured result (2026-06-08)

**Verdict: hybrid does NOT beat dense on the current golden set. `/ask` NOT flipped. Dense stays live.**
The `hybrid_match_core_source_chunks` RPC + tsvector/GIN index are deployed (migration 0125,
verified: anon-denied, HNSW intact), and the eval harness can score it (`RETRIEVER=hybrid`).
But on the acceptance bar (recall must not drop AND mrr/ndcg must rise) it fails.

## Numbers (live cloud, 39 answerable + 4 unanswerable)

| metric    | dense (baseline) | hybrid (RRF k=60) | Δ        |
|-----------|------------------|-------------------|----------|
| recall@5  | 0.8462           | 0.8205            | −0.0257  |
| recall@10 | 0.9744           | 0.9744            | 0        |
| recall@20 | 1.0000           | 1.0000            | 0        |
| ndcg@10   | 0.7848           | 0.7777            | −0.0071  |
| mrr       | 0.7281           | 0.7195            | −0.0086  |
| AC3 clean | 4/4              | 4/4               | ✓ held   |

`rrf_k` sweep {10,30,60,100} (harness-only, no redeploy): **identical** to k=60 → tuning k
doesn't help. Fusion mechanism works (aggregate shifted from dense), it's just net-negative.

## Why (root cause = eval saturation, not a bug)
Dense is already near-saturated on these 43 items (recall@10=0.97, recall@20=1.0). They are
mostly approved-drug, prose questions — there is **no lexical/code-exact case for FTS to win**
(BPC-157 / GLP-1 style items are not in the set, exactly as the plan flagged). On already-good
items the sparse arm can only displace gold downward (unweighted RRF gives sparse equal weight),
so hybrid slightly hurts the head while the tail it was meant to rescue isn't represented.

## What this means
- **AC3 preserved** (dense-floor gate works): fabricated probes still return 0 rows under hybrid.
- The harness correctly **blocked shipping a non-improving change** — the point of backend-first.
- Hybrid's thesis (FTS rescues buried/lexical gold) is **untested**, not disproven, because the
  golden set lacks the items where FTS wins.

## Proper next step to re-evaluate hybrid (future, NOT this run)
1. **Golden-set expansion** with lexical/code-heavy + buried-gold items (peptides, exact drug
   codes, label-section-specific Qs). This both (a) de-saturates the gate so retrieval changes
   are measurable, and (b) creates the cases where FTS should win.
2. Then re-measure hybrid; if still flat, try **weighted RRF** (down-weight sparse — an RPC
   change/redeploy) so dense ranking is preserved and sparse only breaks ties / rescues.
3. Only flip `/ask` (edge code, frozen-safety path, owner-gated `supabase functions deploy`)
   if hybrid wins, behind a flag, and re-freeze the committed baseline to the live retriever.

## Deployed + safe to leave
Migration 0125 is additive; `/ask` never calls the hybrid RPC. No rollback needed. Rollback if
ever wanted: `DROP FUNCTION hybrid_match_core_source_chunks(...); DROP INDEX core_source_chunks_tsv_idx; ALTER TABLE core_source_chunks DROP COLUMN content_tsv;`
