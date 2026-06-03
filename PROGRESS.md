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
- [x] CP2 — Orange Book real data-file provider (`skip_embed`), proven on a few records ✅
- [x] CP3 — Purple Book provider (`skip_embed`), proven on a few records ✅
- [x] CP4 — confirm `clinicaltrials` + `pubmed_oa` + `rxnorm` fetch (AC5/AC6 not closable on labels alone) ✅
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

#### CP2 — Orange Book provider ✅ (2026-06-03, local stack)
Real FDA TE data, not the old HTML-hub scrape. The `fda_orange_book` dispatch was
repurposed from `curated-pages`(FDA_ORANGE_PAGES) to the data-file provider
`providers/orange-book.ts`. Heavy parse lives in the companion `scripts/orange-book-ingest.ts`
(the drugs-fda house pattern) — the edge fn can't unzip+join ~70k rows in 60s.
Reproduce: `deno run -A scripts/orange-book-ingest.ts --dir=<unzipped EOBZIP> --ingredients=…`

- **Parser (real `~`-delimited files):** 48,215 products / 21,112 patents / 2,110
  exclusivity → 2,730 ingredients; joins patents+exclusivity to products by
  (Appl_No, Product_No), aggregates per ingredient. Spot-checks correct:
  AMLODIPINE BESYLATE → 127 products, generic=true, TE=AB, 18 patents; AMOXICILLIN → 132
  products, generic=true, TE=AB.
- **Ingest (skip_embed):** 58 seed-related ingredients, 0 errors;
  `core_sources` = `{openfda:10, fda_orange_book:58}`.
- **skip_embed verified:** `core_source_chunks` stayed at **127 before and after** — structured
  rows carry provenance/license/hash + structured `metadata`, ZERO chunks (no vector
  pollution). Citeable via the source row (URL + `fda_public`).
- **Structured metadata** (per ingredient): `generic_available`, `te_codes`,
  `rld_trade_name`, `product_count`, `products[]` (TE/RLD/RS/strength/applicant/approval),
  `patents[]` (no/expiry/use-code/flags), `exclusivity[]` — ready for the Phase-2 typed
  projection + drug page (§12).
- Note: `semaglutide` is regulated as a drug (NDA / §505), not a §351 biologic, so it
  belongs to the Orange Book world, not the Purple Book. (Earlier note here had this
  backwards.) Small-molecule seeds all present.

#### CP3 — Purple Book provider ✅ (2026-06-03, local stack)
New provider `providers/purple-book.ts` + migration `0108` (adds `purple_book` + `cms_nadac`
enum values) + license map (`purple_book`→`fda_public`). Companion `scripts/purple-book-ingest.ts`
parses the monthly Purple Book CSV (a full snapshot of licensed biologics + an N/R/U change
annotation) with a quote-aware reader (fields embed commas), aggregates per Proper Name.
Reproduce: `deno run -A scripts/purple-book-ingest.ts --file=<purplebook.csv> --proper=…`

- **Parser (real CSV):** 648 biologics; biosimilar/interchangeable detection from `License
  Type` (351(a) originator / 351(k) / 351(k) Interchangeable), reference product linked via
  `Ref. Product Proper Name`. Spot-checks correct: `adalimumab` (Humira, originator) + 10
  biosimilars (`adalimumab-bwwd`/Hadlima = interchangeable, ref adalimumab; etc.).
- **Ingest (skip_embed):** 78 biologics, 0 errors;
  `core_sources` = `{openfda:10, fda_orange_book:58, purple_book:78}`.
- **skip_embed verified:** `core_source_chunks` still **127** (zero chunks). Citeable via
  source row, `license=fda_public`.
- **Structured metadata** (per biologic): `license_class`, `is_biosimilar`,
  `is_interchangeable`, `ref_product_proper_name/proprietary_name`, `bla_numbers`,
  `proprietary_names`, `products[]` (BLA/strength/form/route/presentation/marketing_status/
  approval/center) — ready for the drug page (§12: biosimilar badge + reference product).
- Migration `0108` applied locally via `supabase migration up` (insert success proves the
  `purple_book` enum value is live). Pricing's `cms_nadac` value is added here too (used by
  CP5's coarse dataset-level provenance row).

#### CP4 — clinicaltrials / pubmed_oa / rxnorm confirmed ✅ (2026-06-03, local stack)
The Phase-1 gate is AC4 **and** AC5/AC6, so labels alone don't close it. These three
forked providers fetch live and embed prose (real chunks — NOT skip_embed):
- `clinicaltrials` (query "semaglutide", pageSize 5): fetched 5, ingested 5, **30 chunks** → AC5.
- `pubmed_oa` (query "metformin lactic acidosis", retmax 3): fetched 3, ingested 3, **7 chunks** → AC6.
- `rxnorm` (name "lisinopril"): fetched 1, ingested 1, 2 chunks.

Corpus now spans 6 providers: `{openfda:10, fda_orange_book:58, purple_book:78, clinicaltrials:5,
pubmed_oa:3, rxnorm:1}`; `core_source_chunks` 127 → **166** (the +39 from CT/PubMed/RxNorm
confirms prose embeds while Orange/Purple stay chunk-free). Full AC5/AC6 *acceptance*
(drug-page panels, /ask summaries) lands in Phases 2–3; the corpus side is proven here.
