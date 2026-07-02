# Retrieval Depth — Parallel Multi-Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the number of real, relevant sources the ask engine retrieves and shows (~12/18 today → ~30–40) so answers visibly match the breadth users see in ChatGPT, without weakening the one-safety-scan / one-citation-namespace invariants or the fabrication guard.

**Architecture:** Replace the single dense vector query with a bounded set of parallel sub-queries (query expansion), merge + dedup their results into one larger candidate pool, rerank that pool once, then feed the SAME downstream pipeline (one generate, one safety scan, one citation namespace). The cited slice stays governed by `matchCount`; the "also reviewed" breadth set is what grows. Live augmentation (`augmentWithLive`) is unchanged. No change to the frozen safety files.

**Tech Stack:** Deno edge function (`supabase/functions/ask`), existing pgvector `match_*` RPC, existing reranker, `packages/shared` for any pure helpers.

## Global Constraints

- **NEVER modify** `supabase/functions/ask/safety.ts`, `prompts.ts`, `routing.ts`, `classify.ts` — the frozen safety layer. Retrieval breadth changes live in `retrieve.ts` / `search-query.ts` / `index.ts` orchestration only.
- **One safety scan, one citation namespace, one generate call** — the whole reason we reject open-ended agentic retrieval. Sub-queries fan out ONLY at the recall step; everything downstream of the merged pool is unchanged and single-pass.
- **Fabrication guard intact** — the generator is still grounded ONLY in the merged pool; the guard still checks every cited claim against pool text. A bigger pool is fine; an ungrounded pool is not.
- **Determinism where it matters** — sub-query generation must be deterministic given the same question+classification (no per-call randomness), so saved-chat replays and the guardrail suite stay stable.
- **Cost bounded** — sub-queries run in parallel with a hard cap (≤4) and a per-query row cap; total embedding + RPC cost per ask stays within ~4× today, not unbounded.
- **Guardrail suite must stay green** (48 checks) and the retrieval-eval CI job must not regress — deeper retrieval must not surface unsafe or off-topic sources into the cited slice.
- Deploys stay owner-gated. Plan ends on a branch + PR; engine deploy is a separate explicit step with the live guardrail run.

## Baseline (measured 2026-07-02, live engine, read-only probe scripts/diag/retrieval-depth-baseline.ts)

| Prompt | mode | total shown | cited | reviewed |
|---|---|---|---|---|
| Is sucralose bad for me? | thorough | 18 | 4 | 14 |
| How effective is tirzepatide for weight loss? | thorough | 18 | 6 | 12 |
| How does metformin lower blood sugar? | base | 12 | 4 | 8 |
| Can I take ibuprofen with lisinopril? | thorough | 18 | 6 | 12 |

Root cause confirmed in code: `total shown ≈ pool size = matchCount` (index.ts `MATCH_COUNT=12` / `THOROUGH_MATCH_COUNT=18`), because `reviewed_sources = ret.chunks − cited` (index.ts:435) and `ret.chunks` is a single dense `match_*` RPC returning `match_count` rows (retrieve.ts:47). One query, one cap. ChatGPT shows ~40 for the same prompts.

## File Structure

```
supabase/functions/ask/search-query.ts   (modify — add deterministic sub-query expansion: buildSubQueries)
supabase/functions/ask/search-query.test.ts (modify — cover expansion)
supabase/functions/ask/retrieve.ts        (modify — parallel multi-query recall + merge/dedup, keep single rerank)
supabase/functions/ask/retrieve.test.ts   (new/modify — merge/dedup + cap behavior, mocked RPC)
supabase/functions/ask/index.ts           (modify — RECALL_POOL / REVIEWED_CAP constants; feed bigger pool to reviewed set; cited slice unchanged)
scripts/diag/retrieval-depth-baseline.ts  (exists — rerun as before/after gate)
```

---

## Phase 1 — Deterministic sub-query expansion

### Task 1: `buildSubQueries` — turn one question + classification into ≤4 deterministic search strings

**Files:**
- Modify: `supabase/functions/ask/search-query.ts`
- Test: `supabase/functions/ask/search-query.test.ts`

**Interfaces:**
- Consumes: existing `extractSearchTerms(raw): string` (search-query.ts:89), the classification's `entity_mentions: string[]` and `intent`.
- Produces: `buildSubQueries(question: string, entityMentions: string[], intent: string): string[]` — 1–4 deterministic, deduped query strings, most-general first. Always includes the base `extractSearchTerms(question)` as element 0 (so worst case = today's behavior).

- [ ] **Step 1: Write the failing test** (deterministic expansion: same inputs → same ordered array; an efficacy question with one drug yields base + a drug+outcome variant + a drug+"randomized trial" variant; a question with no entities yields just `[base]`; output never exceeds 4 and never contains duplicates).
- [ ] **Step 2: Run it, confirm it fails** (`buildSubQueries` not defined).
- [ ] **Step 3: Implement** — pure string assembly: element 0 = `extractSearchTerms(question)`; if ≥1 entity mention, add `"<entity> <intent-keyword>"` variants from a small static intent→keyword map (e.g. efficacy→"efficacy randomized trial", safety→"adverse effects safety", mechanism→"mechanism of action"); dedup case-insensitively; slice to 4. No LLM call, no randomness.
- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** (`feat(ask): deterministic sub-query expansion for multi-query recall`).

## Phase 2 — Parallel recall + merge

### Task 2: parallel multi-query recall in `retrieve.ts`, single merged+reranked pool

**Files:**
- Modify: `supabase/functions/ask/retrieve.ts`
- Test: `supabase/functions/ask/retrieve.test.ts`

**Interfaces:**
- Consumes: `buildSubQueries` (Task 1); existing `RetrieveOpts { matchCount, ... }` and the `match_*` RPC caller (retrieve.ts:47).
- Produces: retrieval now runs each sub-query's embedding+RPC concurrently (bounded), unions the rows, dedups by `chunk_id`, keeps the best similarity per chunk, and returns a pool of up to `recallPool` rows (new opt, default = matchCount for back-comat). Existing single rerank runs once over the merged pool. Signature stays `retrieve(opts) → { chunks }`; add `recallPool?: number` and `subQueries?: string[]` to opts.

- [ ] **Step 1: Write the failing test** (mock the RPC to return distinct rows per sub-query; assert the merged pool dedups a chunk that appears in two sub-queries (keeping the higher similarity), respects `recallPool` cap, and that a single-element `subQueries` reproduces today's exact result).
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement** — `Promise.all` over sub-queries (cap concurrency at 4), each calling the existing RPC with a per-query row cap (`recallPool` rows each); merge into a `Map<chunk_id, row>` keeping max similarity; rerank once as today; return `recallPool` slice. All failures of a single sub-query degrade to "that query contributed nothing" — never throw (mirror the existing best-effort fetch style).
- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** (`feat(ask): parallel multi-query recall merged into one reranked pool`).

## Phase 3 — Wire the bigger pool through, cap the cited slice unchanged

### Task 3: raise the reviewed-breadth pool; keep the cited slice governed by matchCount

**Files:**
- Modify: `supabase/functions/ask/index.ts`

**Interfaces:**
- Consumes: Task 2's `recallPool`; existing `MATCH_COUNT=12` / `THOROUGH_MATCH_COUNT=18` (index.ts:89,93) and `reviewedSources = ret.chunks − cited` (index.ts:435).
- Produces: new constants `RECALL_POOL` (base ~28) / `THOROUGH_RECALL_POOL` (~40) passed as `recallPool`; a `REVIEWED_CAP` (~34) bounding the reviewed_sources array so the panel shows breadth without unbounded payloads. **Cited slice is unchanged** — `balanceCitedSlice(ordered, matchCount, labelCap)` still uses `matchCount`, so the answer text and citation enforcement are byte-for-byte governed as today; only the "also reviewed" set grows.

- [ ] **Step 1: Write the failing test / harness note** — this is orchestration; the gate is the before/after live probe + guardrail. Add an assertion in an index-level unit test (if one exists) or document that the reviewed set now reflects the larger pool. If no unit seam exists, state that explicitly and rely on the probe.
- [ ] **Step 2: Implement** — pass `recallPool`/`subQueries` from `index.ts` into `retrieve()`; slice `reviewedSources` to `REVIEWED_CAP`; leave the generator's `top` slice and the fabrication-guard pool derivation exactly as they are (the guard pool must remain the full merged pool so grounding stays honest).
- [ ] **Step 3: Rerun `scripts/diag/retrieval-depth-baseline.ts`** against a preview/deployed build — expect totals ~30–40 (vs 12/18 baseline), cited counts roughly unchanged.
- [ ] **Step 4: Commit** (`feat(ask): surface the full multi-query pool as reviewed breadth`).

## Phase 4 — Validate safety + relevance held

### Task 4: guardrail + retrieval-eval + spot relevance check

- [ ] **Step 1:** Run the live 48-check guardrail suite (`scripts/guardrail-suite.ts`) against the deployed preview — must be fully green (deeper retrieval must not leak unsafe sources into the cited slice).
- [ ] **Step 2:** Run the retrieval-eval CI job — relevance must not regress; specifically confirm the *cited* set precision is unchanged (the cited slice is the same size and same reranker, so this should hold — verify, don't assume).
- [ ] **Step 3:** Manual spot-check via the probe: confirm the new "reviewed" tail is on-topic (not junk padding like the "12 sources for 'hi how are you'" failure mode) — if the tail is noisy, tighten the per-sub-query similarity floor before shipping.
- [ ] **Step 4:** Open PR; engine deploy + live guardrail rerun is the owner-gated ship step.

## Notes / non-goals

- **Not** raising the cited slice — cited count is a precision decision, not a breadth one; ChatGPT's weakness is exactly that it cites a padded, partly-fabricated set. We win by showing more *real reviewed* breadth while keeping the cited set tight and verified.
- **Not** open-ended agentic retrieval — bounded expansion only, per [[pharmaorb-retrieval-agentic-recommendation]].
- The trust layer (just shipped) makes this land harder: 30–40 sources each carrying retraction/tally/cited-by decoration reads as far more substantial than 40 bare links.
- If embedding cost per ask is a concern, sub-query 0 (the base query) can reuse today's single embedding and only the 1–3 variants add cost — bounded at ~4× worst case, typically ~2×.
