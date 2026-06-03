# PharmaBro — Build Progress

Running log of the phased build (see `IMPLEMENTATION_PLAN.md` §13 for the phase table
and acceptance criteria). One branch + PR per phase. A phase is DONE only when its ACs
pass **with evidence** recorded here.

---

## Phase 0 — Foundations & fork gate ✅ MERGED (PR #2)

Monorepo scaffold; Ascend Layer-A fork (migrations `0100–0107`, `core-source-sync` +
~15 providers); local + cloud (`qyjmivntajbigjswhahb`) schema live. Gate PASSED — reuse
validated end-to-end (ingest→embed→retrieve→cite). See `docs/PHASE_0_GATE.md`.

Decision (memory `label-source-openfda-primary`): **openFDA is the primary label
source** (clean FDA-parsed sections); DailyMed = coverage fallback only.

---

## Phase 1 — Evidence corpus 🚧 IN PROGRESS (branch `phase-1-corpus`)

**Goal:** Layer A live. Confirm providers (openFDA + PubMed + ClinicalTrials + RxNorm +
new Orange/Purple/pricing); seed 100 entities / 10 classes; pg_cron refresh.
**Gate (§13):** corpus retrievable + cited (enables AC4/AC5/AC6); changed label
supersedes correctly.

### Decisions locked this phase
- **Structured FDA/CMS data is NOT embedded.** Orange Book, Purple Book and pricing are
  structured lookups, not semantic retrieval. They ingest with `skip_embed:true` →
  a `core_sources` provenance/license/hash row with **zero chunks**, surfaced via typed
  projections + intent-routed structured queries at `/ask`. Embedding tabular strings
  pollutes the vector space (a price chunk surfacing on a "side effects" query). Citeable
  via the source row (URL/license/retrieved_at) — "cite like any source" ≠ "must be a chunk".
- **Pricing ≠ Orange/Purple.** Orange/Purple Books are document-like (quarterly, stable)
  → fit `core_sources`. CMS NADAC is a **weekly time series** → dedicated projection
  table refreshed on schedule with one **coarse dataset-level** provenance row, NOT one
  source row per NDC (per-NDC rows would churn supersession + spam the updates feed).
  Build pricing **last** (messiest).
- **ANN index:** `ivfflat lists=100` (mig 0107) is fine for validation (≈130 rows →
  planner seq-scans → exact NN) but wrong for the 742k target (wants ~√n ≈ 860) and
  ivfflat-built-empty needs REINDEX after bulk load. Plan: separate migration swaps to
  **hnsw** (no training, good recall at all scales); verify recall **after** the bulk seed.

### Task status
- [x] **CP1 — openFDA validated on ~10 seed drugs** (the prove-before-bulk gate) ✅
- [ ] CP2 — Orange Book real data-file provider (`skip_embed`), proven on a few records
- [ ] CP3 — Purple Book provider (`skip_embed`), proven on a few records
- [ ] CP4 — confirm `clinicaltrials` + `pubmed_oa` + `rxnorm` fetch (AC5/AC6 not closable on labels alone)
- [ ] CP5 — pricing projection table + NADAC refresh (build last)
- [ ] CP6 — 100-entity / 10-class seed ingest (only after all providers proven)
- [ ] CP7 — pg_cron refresh jobs (§10)

### Evidence log

#### CP1 — openFDA validation gate ✅ (2026-06-03, local stack)
Reproduce: `bash scripts/phase1-validate.sh` (ingests via the real `core-source-sync`
edge-function entrypoint, then `scripts/validate-openfda.ts` for retrieval). Full raw
ranked output: `docs/phase1-openfda-validation.json`.

- **Ingest:** 10/10 seed drugs (lisinopril, metformin, atorvastatin, semaglutide,
  warfarin, amoxicillin, sertraline, omeprazole, amlodipine, levothyroxine) ingested via
  openFDA, **127 chunks total, zero errors**. Per-drug chunk counts 3–15.
- **Cross-entity retrieval — 10/10 right drug ranked #1** (full list inspected at
  `match_threshold=0`, raw cosine; query = "<drug> contraindications", embedded
  `input_type=query`):
  - Correct label #1 for every drug, sim **0.70–0.77**; top sections are
    `CONTRAINDICATIONS` / `WARNINGS AND PRECAUTIONS` — clean openFDA sectioning confirmed
    across all 10 (generalizes the earlier lisinopril-only result).
  - Caveats: `omeprazole` label is sparse (3 chunks) so its #2/#3 bleed to other drugs
    (own label still #1); `limit:1` occasionally grabbed a combo product
    (metformin→ZITUVIMET, lisinopril→+HCTZ) — still discriminates. For the 100-seed:
    prefer monotherapy labels / ingest >1 label per drug.
- **Supersession (content_hash):** unchanged re-ingest → `{ingested:0, skipped_unchanged:1}`;
  mutated stored hash + re-ingest → `{ingested:1, chunk_count:13}` (old chunks wiped +
  re-embedded). Per advisor, this gate = content_hash detection only; `updates`-feed rows
  are Layer B / Phase 2.

**Infra note:** local Docker Desktop crashed mid-run (a stale `core-source-sync` server
from a prior session held a DB connection that blocked `db reset`'s database drop;
concurrent `serve` + compile tipped Docker over). Recovered via force-quit → restart →
`supabase start -x storage-api,imgproxy,realtime,studio,logflare,vector,inbucket,pooler,supavisor`
(the corrupted `storage` volume failed health checks and aborted a full start; those
services aren't needed for ingest/retrieve). Lesson applied: never run `db reset` + `serve`
+ compile concurrently; one heavy op at a time.
