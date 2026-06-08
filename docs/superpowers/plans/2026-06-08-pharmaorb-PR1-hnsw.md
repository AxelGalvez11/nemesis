# PharmaOrb Backend — PR1: ivfflat → HNSW index

> **For agentic workers:** This is a single-migration cloud change. The migration file
> `supabase/migrations/0124_hnsw_index.sql` is already written. The only remaining steps are
> **owner-gated**: apply it to the cloud DB and re-measure with the PR0 harness.

**Goal:** Swap the retrieval ANN index from ivfflat to HNSW (with a pinned `hnsw.ef_search`) so retrieval quality holds at the current scale and improves toward millions of vectors — the first change graded by the PR0 eval harness.

**Architecture:** One additive migration. Drop the ivfflat index `core_source_chunks_vec_idx`, recreate it as HNSW (`m=16, ef_construction=64`, `vector_cosine_ops`), and `CREATE OR REPLACE` the retriever RPC with an added `SET hnsw.ef_search = 100` — body/signature otherwise byte-identical to 0113, so the index is the only measured variable. The float vector is kept (halfvec quantization is a later PR).

**Tech Stack:** Supabase Postgres + pgvector HNSW, `supabase db push`, the PR0 retrieval harness.

---

## Status & dependency
- **Migration written:** `supabase/migrations/0124_hnsw_index.sql` (committed on branch `pr1-hnsw`).
- **Depends on PR0 (#26):** acceptance is measured by `eval/retrieval-eval.ts`, which lands on `main` when #26 merges. Sequence: **merge #26 first**, then deploy + measure this.
- **0123 is reserved** by PR #25 (evidence-brief, on `codex/save-claude-artifacts`); this is **0124** to avoid collision.
- **No auto-deploy:** there is no migrate-on-merge workflow. Merging this PR only puts the `.sql` on `main`; it does NOT touch the cloud DB. Applying it is a separate, explicit `supabase db push`.

## What the migration does (already authored)
1. `DROP INDEX IF EXISTS public.core_source_chunks_vec_idx;` (the ivfflat from 0101/0107).
2. `CREATE INDEX core_source_chunks_vec_idx ON public.core_source_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`
3. `CREATE OR REPLACE FUNCTION public.match_core_source_chunks(...)` — identical to 0113 plus `SET hnsw.ef_search = 100`.
4. Defensive `GRANT ... TO authenticated, service_role; REVOKE ... FROM anon, PUBLIC;`.

**Why ef_search=100:** HNSW returns at most `ef_search` candidates, and the harness requests `match_count=50`, so `ef_search` must be ≥ 50. 100 is near-exact at ~9k vectors with latency headroom, and ≥ the 50 the harness needs and the 8 `/ask` uses.

## Owner-gated execution (run when back at a computer)

- [ ] **Step 1 — Merge PR0 (#26)** so the harness + `eval.yml` are on `main`. (Add the CI secrets `SB_URL` + `VOYAGE_API_KEY` first so `eval.yml` can go green.)

- [ ] **Step 2 — Capture the pre-deploy baseline** (sanity; should equal the committed baseline):

```bash
set -a; source supabase/functions/.env; set +a
export SB_URL=https://qyjmivntajbigjswhahb.supabase.co
deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts | tee /tmp/pre-hnsw.json | grep -A6 '"aggregate"'
```

- [ ] **Step 3 — Deploy the migration (cloud write — explicit approval):**

```bash
# from repo root, project linked to ref qyjmivntajbigjswhahb
supabase db push
```

Expected: `0124_hnsw_index.sql` applies. (`db push` runs against the linked remote and does not need local Docker.) If `SET hnsw.ef_search` errors as an unknown GUC, remove that one line, re-push, and set it out of band: `ALTER DATABASE postgres SET hnsw.ef_search = 100;`.

- [ ] **Step 4 — Re-measure (the acceptance gate):**

```bash
deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts | tee /tmp/post-hnsw.json | grep -A6 '"aggregate"'
```

Expected: every aggregate key ≥ committed baseline − 0.03 (the `eval/ci-gate.ts` tolerance). At ~9k vectors HNSW is near-exact, so expect ≈ parity (this PR is scale-prep; the win shows when the corpus is large). `unanswerable_clean === unanswerable_total` must still hold.

- [ ] **Step 5 — Verify the security boundary held** (anon must still be denied the RPC):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$SB_URL/rest/v1/rpc/match_core_source_chunks" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"query_embedding":[0],"match_count":1,"match_threshold":0}'
# Expect 401/403/404 (denied), NOT 200.
```

- [ ] **Step 6 — Confirm the guardrail safety suite is still green** (CI on the PR, or run `scripts/guardrail-suite.ts`). The RPC body is unchanged, so `/ask` behavior must be identical.

- [ ] **Step 7 — Merge PR1.**

## Rollback
If Step 4 regresses beyond tolerance or latency is bad: re-create the ivfflat index and revert the RPC's `ef_search`:

```sql
DROP INDEX IF EXISTS public.core_source_chunks_vec_idx;
CREATE INDEX core_source_chunks_vec_idx ON public.core_source_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- then CREATE OR REPLACE match_core_source_chunks without the `SET hnsw.ef_search` line (0113 body).
```

The index swap is non-destructive (no data change), so rollback is index-only.

## Out of scope (later PRs)
- **PR2** — hybrid dense+sparse (FTS + RRF) + Voyage rerank-2; decide FTS config on the golden set.
- **halfvec quantization + partitioning** — the storage/scale lever (P4), measured the same way.
- **resolveSourceIds** strict-pair fix already landed on #26 (no longer a PR1 follow-up).
