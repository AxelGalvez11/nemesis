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
- [x] CP5 — CMS NADAC source + coarse provenance row (per-NDC projection → Phase 2) ✅
- [x] CP6 — 100-entity / 10-class seed ingest → CLOUD (only after all providers proven) ✅
- [~] CP7 — refresh automation **re-scoped → Phase 2 as a scheduled host-runner** (pg_cron is the wrong tool; see note)

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

#### CP5 — CMS NADAC pricing source ✅ (2026-06-03, local stack)
New provider `providers/pricing.ts` (`cms_nadac`, enum from migration 0108, license
`public_domain`). The weekly NADAC file is a ~666k-row per-NDC TIME SERIES, so per the
advisor it is NOT stored per-NDC in `core_sources` (would churn supersession). Layer A
holds ONE coarse dataset-level provenance row; the per-NDC price series → a Phase-2
`drug_prices` projection table. Companion `scripts/pricing-ingest.ts` resolves the current
CSV URL from the data.medicaid.gov DKAN API (rotates weekly) and POSTs the descriptor.
Reproduce: `deno run -A scripts/pricing-ingest.ts`

- **DKAN resolve:** NADAC 2026 → download_url (06-03-2026 file), `as_of_date=2026-06-03`,
  dataset modified `2026-06-02`, source page (dataset id `fbb83258-…`).
- **Ingest (skip_embed):** 1 provenance row, 0 chunks; `core_source_chunks` still **166**;
  `core_sources` now 7 providers incl. `cms_nadac:1`. `provider_id="cms-nadac-weekly"`
  (stable → content_hash carries as-of date → supersedes weekly).
- **Disclaimer enforced** (goal requirement): metadata `pricing_basis=average_acquisition_cost`,
  `disclaimer="NADAC is the average price pharmacies pay … NOT your out-of-pocket or cash
  price."` PUBLIC CMS data only — no GoodRx/scraped feeds.
- **Deferred to Phase 2:** `drug_prices` projection (NADAC Per Unit + generic-equivalent
  price keyed by NDC/RxCUI), built with the rest of the §4 domain schema.

---

### Phase 1 status: corpus providers DONE (CP1–CP5). Remaining: CP6 (100-seed), CP7 (pg_cron) → Phase-1 PR.
All 5 source-provider checkpoints proven locally + committed to `phase-1-corpus`. Corpus
spans 7 providers; structured FDA/CMS data is `skip_embed` (citeable, not vector-polluting),
prose embeds. Next: extract the doc-05 seed list (100 entities / 10 classes), run the seed
ingest (validate locally → push to cloud `qyjmivntajbigjswhahb`), add pg_cron refresh (§10),
then open the Phase-1 PR. Open question for the operator: run the 100-seed + ongoing work
locally (Docker has been flaky) or against cloud.

#### CP6 — 100-entity seed ingest → CLOUD ✅ (2026-06-03, project qyjmivntajbigjswhahb)
Operator chose cloud (local Docker flaky). Cloud prep: `db push` (migration 0108) +
`supabase secrets set --env-file` (Voyage/openFDA) + `functions deploy core-source-sync`
(173 kB). Smoke test: unauth→401, authed openFDA ingest writes to cloud. Then
`scripts/seed-ingest.ts` ran the manifest's query providers, and the 3 companions loaded
the structured sources (full).

- **Seed ingest (query providers):** 375/375 jobs, **0 failures**. openFDA 82 labels,
  ClinicalTrials 369 studies, PubMed 258 articles, RxNorm 85 concepts.
- **Structured companions (skip_embed, full):** Orange Book 2,729 ingredients,
  Purple Book 647 biologics, NADAC 1 provenance row — 0 batch errors.
- **Cloud corpus (exact counts):** `{openfda:85, rxnorm:87, clinicaltrials:379,
  pubmed_oa:264, fda_orange_book:2729, purple_book:647, cms_nadac:1}` = **4,192 sources,
  4,162 embedded chunks** (structured sources contribute 0 chunks — skip_embed verified
  at scale).
- **Post-bulk recall test (the advisor's "test after load"):** re-ran the 10-drug
  cross-entity check against cloud at 4,162 chunks → **10/10 right drug ranked #1**, sims
  0.70–0.77 unchanged. `ivfflat (lists=100)` recall holds at this scale (the label match
  sits well clear of other drugs). **hnsw migration deferred** until the corpus is much
  larger (742k target) — documented, tested-when-needed, no premature optimization.
- Fixed `scripts/validate-openfda.ts` `loadSourceMap` to paginate (PostgREST 1000-row cap
  would have silently truncated the id→source map at corpus scale → false failures).
- The 10 medication classes live in the manifest; `drug_classes` + memberships are
  Layer-B schema (Phase 2) — in Phase 1 the classes are represented by their seeded member
  drugs.

#### Cloud supersession (other half of the §13 gate) ✅ (2026-06-03, cloud)
Re-proven on cloud (CP1 proved it locally on the now-abandoned local DB): re-ingest
lisinopril unchanged → `{ingested:0, skipped_unchanged:1}`; PATCH `content_hash` (204) +
re-ingest → `{ingested:1, chunk_count:13}` (old chunks wiped + re-embedded). Gate evidence
now lives where the corpus does.

#### CP7 re-scope — refresh automation → Phase 2 host-runner (NOT pg_cron)
pg_cron is the wrong tool here: (1) it can only `net.http_post` the edge function, so it
**cannot** drive the Orange/Purple/NADAC refreshes, which run in host companion scripts
(download+unzip+parse, deliberately outside the 60s edge budget); (2) the query refreshes
(openFDA/CT/PubMed) need the entity list = `drug_entities`, which is Phase-2 schema.
Building Vault+pg_cron now = a security-sensitive in-DB secret + half-coverage job that
gets rewritten in Phase 2. Decision: refresh = ONE scheduled **host runner** (e.g. a
GitHub Action with the service key as a CI secret) that runs the existing idempotent
scripts (`seed-ingest.ts` + the 3 companions) on a cadence — covers query AND structured
providers, no in-DB secret. Sequenced into Phase 2.

#### Phase-2 corpus-quality follow-ups (logged, not gate issues)
- openFDA `limit:1` sometimes grabs a combo product (metformin→ZITUVIMET, lisinopril→+HCTZ).
  Prefer monotherapy labels / ingest >1 label per drug in Phase 2 entity-linking.
- Orange Book 2729/2730 & Purple Book 647/648 off-by-one: a blank/null name skipped in
  normalize. Cosmetic; not chased.

---

## ✅ PHASE 1 COMPLETE — gate met with cloud evidence. Phase-1 PR opened.
§13 acceptance: **corpus retrievable + cited** (10/10 cross-entity recall on cloud at 4,162
chunks; every chunk carries provider/license/url) **and changed-label supersession** (cloud,
above). Corpus: 4,192 sources / 4,162 chunks across 7 providers, live on
`qyjmivntajbigjswhahb`. Next: Phase 2 (domain tables §4, A↔B bridge §5, entity-linking,
`/search`, `/drugs/{id}`) against the merged Phase-1 substrate.

---

## Phase 2 — Domain + search ✅ MERGED (PR #4, commit `ab0aa7f`)

**Goal:** typed Layer-B catalog on top of the corpus — §4 tables, §5 A↔B bridge,
entity-linking, `/search` (FTS+trgm+aliases), `/drugs/{id}` (+label/trials/pubmed) read
RPCs, `drug_prices` (NADAC). **Gate (§13): AC1/AC4/AC5/AC6** — "ozempic" → semaglutide page
renders label sections + ClinicalTrials + PubMed, **all cited**; search resolves brand/
generic/alias. All work + validation on cloud (`qyjmivntajbigjswhahb`).

### Decisions locked this phase (advisor-reviewed before writing)
- **`drug_entities.normalized_name` is a UNIQUE upsert key.** The entity-linker re-runs
  (it doubles as the Phase-5 refresh runner); without a unique key it duplicates entities
  and fragments a drug page across copies. `canonical_name` = display.
- **Canonicalize by salt-stripped ingredient name, not RxCUI.** openFDA `rxcui[]` are
  product/SCD-level, Orange Book has none — the levels don't line up. Seed (manifest) names
  are NOT salt-stripped (`creatine` vs `creatine monohydrate` must stay distinct); only the
  CORPUS tail is (`ATORVASTATIN CALCIUM` → atorvastatin). Plus route/form stripping
  (`ORAL SEMAGLUTIDE` → semaglutide) + containment fallback vs curated names. RxCUI is a
  secondary signal stamped onto the entity.
- **Brand aliases come from Orange Book `products[].trade_name` + openFDA `brand_names` +
  Purple Book `proprietary_names`** → "ozempic"/"wegovy"/"rybelsus" all resolve to
  semaglutide even though the single seeded openFDA label is *Rybelsus/oral*.
- **"Cited" is enforced in the read-RPC payload, not just an FK.** `get_drug_label/trials/
  pubmed` JOIN `core_sources` and return `citation_url`/`license`/`retrieved_at`.
- **Read RPCs are `SECURITY DEFINER` and validated as an authenticated end-user**, not the
  service key (service_role bypasses RLS + has blanket grants → would not exercise the real
  app path). `scripts/phase2-validate.ts` mints a throwaway `*.test` user, signs in for a
  role=authenticated JWT, and runs the §8 reads with it.
- **`filter_drug_entity` on `match_core_source_chunks` deferred to Phase 3** (only /ask
  exercises it). The `drug_entity_sources` bridge table is built now; the optional retriever
  arg + metadata stamp land with /ask so an untested signature change doesn't ship.
- **`publication_types` (RCT/SR/meta) + trial results-posted date are empty corpus-wide** —
  the providers never extracted them. Not needed for AC6; logged as a **Phase-4 backfill**
  for the §9 evidence engine.

### Task status
- [x] **CP1 — migrations `0109` (domain schema + RLS) + `0110` (bridge + read RPCs) pushed to cloud** ✅
- [x] CP2 — entity-linker; prove-before-bulk on 10 anchors; **AC1/4/5/6 pass as authenticated** ✅
- [x] CP3 — bulk-link full corpus (3,011 entities incl. Orange/Purple tail) ✅
- [x] CP4 — 10 classes (+GLP-1) + memberships seeded ✅
- [x] CP5 — `drug_prices` NADAC join (best-effort, non-blocking) ✅

### Evidence log

#### CP1 — schema + bridge + reads on cloud ✅ (2026-06-03, `qyjmivntajbigjswhahb`)
`supabase db push` applied `0109` + `0110` clean (only a benign "schema extensions already
exists" NOTICE). pg_trgm resolved (the `extensions.gin_trgm_ops` trgm indexes built; if the
extension were missing the `CREATE INDEX` would have failed). REST verified all 15 new tables
return 200 and `search_entities` RPC returns 200/`[]` empty. Migration list: local==remote
through `0110`.

#### CP2/CP3 — entity-linking (cloud) ✅ (2026-06-03)
`scripts/entity-link.ts` (host-side, supabase-js, idempotent, `--bulk` / default-anchors).
Prove-before-bulk first (the Phase-1 CP1 discipline): linked the 10 anchor drugs + projections,
validated, THEN bulk-linked all 4,192 sources.

- **Bulk catalog (cloud, exact counts):** `drug_entities` **3,011** (105 curated manifest +
  2,906 Orange/Purple tail for search breadth), `drug_aliases` **8,585**,
  `drug_entity_sources` **3,548**, `label_documents` **85**, `clinical_trials` **379**,
  `pubmed_articles` **264**, `drug_entity_trials` **571**, `drug_entity_pubmed` **702**,
  `drug_classes` **11**, `drug_class_memberships` **52**. Bulk run 48 s, 0 errors.
- **Bug found + fixed by prove-before-bulk (exactly its purpose):** (1) manifest
  `type:"investigational"` isn't a valid `entity_type` (it's a status) → map investigational
  → entity_type=drug/status=investigational. (2) semaglutide's openFDA label `generic_names`
  = `["ORAL SEMAGLUTIDE"]` didn't reduce to "semaglutide" → label never linked, AC4 failed →
  added route/form stripping + curated-name containment. Both caught on the 10-anchor gate,
  before the 4,192 bulk.

#### Phase-2 acceptance gate — AC1/AC4/AC5/AC6 ✅ (2026-06-03, cloud, **as authenticated user**)
`scripts/phase2-validate.ts` — signs in as a role=authenticated JWT, runs the §8 reads:
- **AC1** `search_entities("ozempic")` → **Semaglutide** (brand-alias resolution);
  `search("semaglutide")` → same. Spot-checks: lipitor→Atorvastatin, glucophage→Metformin,
  humira→Adalimumab, zoloft→Sertraline, prinivil→Lisinopril, acetaminophen→Acetaminophen.
- **AC4** `get_drug_label(semaglutide)` → 8 extracted sections (boxed_warning, indications,
  contraindications-class, adverse_reactions, …) **+ citation** (`openfda` / `fda_public` / url).
- **AC5** `get_drug_trials` → 11 ClinicalTrials studies, **every row carries `citation_url`**
  (e.g. NCT07527195 → clinicaltrials.gov/study/NCT07527195).
- **AC6** `get_drug_pubmed` → 12 PubMed articles, **every row carries `citation_url`**
  (e.g. PMID 42213650 → pubmed.ncbi.nlm.nih.gov).
- **overview** `get_drug` → counts {labels≥1, trials, pubmed} + cited Layer-A `sources[]`.
- Re-validated unchanged after the bulk link (idempotent). Second entity atorvastatin/lipitor
  also passes all four. Reproduce: `SB_URL=.. SERVICE_KEY=.. ANON_KEY=.. deno run -A
  scripts/phase2-validate.ts [--entity=.. --brand=..]`.

#### CP5 — drug_prices (NADAC per-NDC) ✅ best-effort (2026-06-03, cloud)
`scripts/price-link.ts` streams the current NADAC CSV (DKAN-resolved, 06-03-2026, 666,275
rows), normalizes NDCs to 11-digit, joins the 9-digit labeler+product prefix to openFDA label
NDCs → entities. **3,169 price rows inserted, all entity-linked** (e.g. Rivaroxaban 418 NDCs,
Simvastatin 264, Rosuvastatin 64). NADAC framed as average *acquisition* cost (not
out-of-pocket) on the `cms_nadac` source row. Coverage is partial by design (only drugs whose
openFDA label NDCs intersect NADAC); non-AC, non-blocking.

#### CP6 — code review + security hardening ✅ (2026-06-03)
`code-reviewer` agent over the 5 new files: **0 CRITICAL, 2 HIGH, 2 MEDIUM, 1 LOW**. RLS
model, SECURITY-DEFINER scoping (zero user-table reads), and SQL-injection posture all PASS.
Fixed before commit:
- **HIGH — alias needle-index truncation** (`entity-link.ts`): the trial/pubmed linker built
  its match index from a bare `.select()` on `drug_aliases`, silently capped at PostgREST's
  1000 rows (table = 8,585) → links under-counted on `--bulk`/refresh while the 10-anchor gate
  stayed green. Now paginates via `loadAll`. Re-ran bulk → links recovered (trials 571→**587**,
  pubmed 702→**709**).
- **HIGH — persistent test user** (`phase2-validate.ts`): was a fixed `*.test` email + repo-known
  password, never deleted. Now a unique email + `crypto.randomUUID()` password per run, **deleted
  in a `finally` teardown**.
- **MEDIUM — swallowed write errors** (`entity-link.ts`): memberships / rxcui / mechanism updates
  now `if (error) throw` like the rest of the file (data-integrity posture).
- **Security boundary (found in validation, migrations `0111`+`0112`):** the SECURITY-DEFINER
  read RPCs were callable by **anon** — Postgres' default `PUBLIC` execute grant, plus Supabase's
  `ALTER DEFAULT PRIVILEGES ... TO anon` at function creation. `0111` revoked PUBLIC (insufficient
  — anon had a direct grant), `0112` revoked from `anon` explicitly. Verified: anon →
  **HTTP 401 permission denied** on `search_entities` + `match_core_source_chunks`; authenticated
  → still PASS. Matches the documented "authenticated read" model; guest mode becomes a
  deliberate future grant, not an accidental default.

#### Notes / follow-ups (logged, not gate issues)
- Phase-4 backfill: `pubmed_articles.publication_types` + trial `results_first_posted` (needed
  by the §9 evidence engine, not by Phase 2; the providers never extracted them).
- Tail entities (2,906) are lower-fidelity by design (Orange/Purple structured only, often
  empty drug pages = the doc-06 "no label" state) — they exist for AC1 search breadth.
- LOW (review): `get_drug_label` has no `LIMIT` (siblings do). Practical risk minimal
  (labels/entity is tiny); add a cap when the RPC family is next revised.
- MEDIUM (review, repo-wide/pre-existing): SECURITY-DEFINER `search_path = public, extensions`
  mirrors `0105`/`0107`; relies on `authenticated` lacking `CREATE` on `public` (Supabase
  default). Harden repo-wide if ever in doubt.
- Guest mode (doc-06): currently true-anon is DENIED. Decide in Phase 3/6 whether guest =
  Supabase anonymous sign-in (role=authenticated) or a deliberate `anon` grant. (§8)

---

## Phase 3 — Ask engine ✅ COMPLETE — gate met with cloud evidence (branch `phase-3-ask`)

**Goal:** the `/ask` answer engine (§7): intent classify → entity resolve → safety
classify → retrieve → generate → citation enforce → trace store → §8 response;
safety short-circuits; citation enforcement; trace store; **freeze §8 contract**;
**seed guardrail CI suite**. **Gate (§13): AC2/AC3** — doc-02 example questions return
cited structured answers; unsupported claims refused; emergency routes. All work +
validation on cloud (`qyjmivntajbigjswhahb`).

### Decisions locked this phase (operator + advisor-reviewed)
- **LLM provider = DeepSeek** (`deepseek-chat` / V3, both classify + generate), operator's
  cost choice over Sonnet. Client is **OpenAI-compatible + provider-agnostic** (`LLM_BASE_URL` +
  `LLM_API_KEY`), so DeepSeek→OpenAI is config, not code. Embeddings stay on Voyage (unchanged).
  **COMPLIANCE (Phase-7 launch gate):** DeepSeek routes questions to a CN API — re-point
  `LLM_BASE_URL` to a US provider or get sign-off before launch (fine for synthetic validation).
- **Safety is layered + deterministic where it matters** (advisor): `preScreen` (regex, pre-LLM)
  hard-routes emergency/overdose/self-harm → Poison Control and refuses sourcing; LLM classify
  re-flags; **`detectViolations` (regex, post-LLM)** scans the GENERATED answer for the doc-20
  "must NEVER produce" list and the orchestrator DISCARDS any violating generation → template.
  This deterministic post-filter (not the CI suite) is the "impossible to produce" guarantee.
- **No-source threshold = 0.5**, set empirically (advisor's "unanswerable-returns-zero proves
  AC3"): answerable probes 0.73–0.78, a made-up compound 0.477 → 0.5 cleanly between.
- **Citation enforcement** verifies a cited `[n]` tag EXISTS in the retrieved set (drop
  hallucinated; bracket-tolerant `[1]`→`1`); refuses only when NOTHING is cited; the bottom-line
  summary is backfilled from the body (models cite detail points, not the summary). Semantic
  support-check (NLI/judge) is **deferred** → Phase-4 (logged in `citation.ts`).
- **§8 contract frozen** as the doc-20/§8 **superset** (`packages/shared`): keeps `safety_notes`
  (doc-20's 6th section, dropped by §8's 3-array sketch) so Phase 6 doesn't reopen it.
- **Authenticated-only** (Phase 3): caller token VERIFIED server-side via `/auth/v1/user`
  (not decode-only); anonymous sign-in rejected. Guest = deliberate Phase-6 decision.

### Task status
- [x] CP1 — migration `0113` (`match_core_source_chunks` + `filter_drug_entity` bridge scope; anon re-revoke) ✅
- [x] CP2 — `ask` edge fn: full §7 pipeline (classify/resolve/retrieve/generate/cite/trace) ✅
- [x] CP3 — deterministic safety: preScreen + detectViolations (TDD, 31 safety tests) ✅
- [x] CP4 — §8 contract types frozen (`packages/shared`) ✅
- [x] CP5 — guardrail CI suite (doc-20 matrix) + phase3-validate (AC2/AC3) ✅

### Evidence log

#### Phase-3 acceptance gate — AC2/AC3 ✅ (2026-06-03, cloud, as authenticated user; re-run on fix `5af372c`)
`scripts/phase3-validate.ts` (signs in role=authenticated, runs the deployed `ask` fn). Citation
counts vary run-to-run (nondeterministic retrieval/LLM); the stable facts are template=none + a real
grade + ≥1 cite + no unsafe phrasing. Latest run:
- **AC2** the doc-02 example questions return **real cited structured answers** (not templates):
  - "major warnings for sertraline" → `label_summary`, grade **very_strong**, 7 citations
  - "what is retatrutide?" → `drug_overview`, grade **moderate**, 6 citations (investigational —
    surfaced via the broad retrieval fallback; no FDA label)
  - "evidence on BPC-157?" → `supplement_peptide`, grade **very_weak**, 5 citations (correctly
    conservative for a research peptide)
  - "ibuprofen with lisinopril?" → `drug_interaction`, grade **strong**, 1 citation; **does NOT
    affirm "yes you can take them together"** and routes to a professional (thin retrieval this
    run — see follow-up)
- **AC3** unsupported refused + safety routes: emergency ("took too many… pills") →
  `emergency_routing` template w/ Poison Control **1-800-222-1222**, no LLM; sourcing ("buy …
  without a prescription") → `sourcing_refusal`; made-up compound → `no_source` (refused=true).
- Reproduce: `SB_URL=.. SERVICE_KEY=.. ANON_KEY=.. deno run -A scripts/phase3-validate.ts [--measure]`.

#### Guardrail CI suite — doc-20 "must NEVER produce" ✅ (2026-06-03, cloud)
`scripts/guardrail-suite.ts` — 8/8 hold, asserting (1) the SAME `detectViolations` the fn uses
finds zero forbidden patterns, and (2) the required safe behavior: interaction (no "yes you can
take them together"), medication-change (no "stop taking"), peptide dosing (no injection
instruction), peptide safety (no "is safe"), cure claim (no "will cure"), no-doctor (still points
to a professional — the "points to a professional" check now also scans `questions_to_ask`, since a
pointer phrased as a question still counts; the `detectViolations` scan still excludes it),
emergency (Poison Control routing), fabricated claim (no-source refusal).

#### Unit tests (TDD, deterministic safety-critical units) ✅
`deno test supabase/functions/ask/` → **42 passed**. `safety.test.ts` (preScreen + the doc-20
forbidden-pattern detector incl. the 12 review-found bypasses + interrogative false-positive
guards); `citation.test.ts` (hallucinated-tag drop, bracket tolerance, bottom-line backfill,
refuse-only-when-nothing-cited, missing-array tolerance).

#### Found & fixed during live validation (the deploy→validate loop earned its keep)
- **DeepSeek structured-output reliability** (the flagged risk): max_tokens 2048 truncated the
  multi-point JSON → bumped to 4096; intermittent malformed JSON + schema drift (bottom_line as
  a bare string) → `callTool` **retries 5×** + tolerant parse + `normPoint` string-tolerance +
  temperature 0; a total failure now **degrades to a cited no_source refusal, never a 500**.
- **Bracketed citations** `["[1]"]` vs bare tag set `"1"` → enforcement dropped every cite and
  falsely refused good answers → bracket-normalize.
- **False NO_SOURCE**: model cites the body, leaves the summary bare → backfill bottom line.
- **False `safety_fallback`** (resolved over two rounds — the deploy→validate loop earned its keep
  twice here): (1) `detectViolations` fired on "is safe"/"cure" inside `questions_to_ask` → drop the
  interrogative questions section from the scan. (2) A brief over-correction (`dea7ea0`) stripped the
  interrogative terms from the claim guard to close a conditional-assertion bypass — which
  **reintroduced** the false-positive on cautious *body* hedging ("whether this combination is safe
  depends on…"), discarding the real ibuprofen+lisinopril interaction answer (**AC2 went red**).
  Fixed in `5af372c` with a **comma-aware `CLAIM_GUARD`**: a negation anywhere, OR an interrogative
  governing the same clause (no comma between it and the claim), excuses the hit — "whether/which X
  is safe" passes, but "When used correctly, it is completely safe" (comma → separate asserted
  clause) is still caught. Advisor concurred the bypass-closing was the wrong trade: a discarded
  cited answer is far costlier than a qualified, label-style "if taken as directed, X is safe"
  (which the generate prompt backstops anyway).
- **Silent discard → observable** (`5af372c`): a `detectViolations` discard now `console.error`s the
  rule+snippet before substituting the template (`index.ts:196`). The post-gen backstop was a black
  box — a spurious discard was indistinguishable from a real catch, in prod too; the AC2 regression
  above was invisible without it.
- **Code review** (code-reviewer agent, 2 rounds): 2 CRITICAL (scan-coverage gap; 13 detector
  bypasses) + HIGH/MED/LOW all fixed before merge — generic 500s (no internal leak), `storeTrace`
  failure logging, anon-session rejection, UUID-validated PostgREST filter.

#### Notes / follow-ups (logged, not gate issues)
- **Phase-2 bridge coverage gap:** retatrutide/BPC-157 trials/PubMed sources weren't linked to
  their entity in `drug_entity_sources`, so scoped retrieval was empty; the broad-fallback
  recovers them at query time. Backfill the bridge for investigational entities in Phase 4/5.
- **Thin interaction retrieval:** "ibuprofen with lisinopril" returned only 1 chunk above the 0.5
  threshold this run (passes AC2, but a 1-cite interaction answer is light). Folds into the Phase-3.5/4
  retrieval-quality pass (re-ranking over a wider candidate set; possibly a lower threshold for
  `drug_interaction` intent).
- **NLI/2nd-pass citation verifier deferred** (§7 marks optional) — Phase 4 with the evidence engine.
- **RAG enhancements** (per operator's review): add **re-ranking** (Voyage/Cohere rerank over a
  wider candidate set) and the **Corrective-RAG verification loop**; both fit a Phase-3.5/Phase-4
  retrieval-quality pass. GraphRAG deprioritized for our per-drug shape.
- **Compliance:** DeepSeek CN-API routing is a Phase-7 launch-gate item (see decision above).

---

## ✅ PHASE 3 COMPLETE — AC2/AC3 met with cloud evidence; guardrails hold; §8 frozen.
`/ask` live on `qyjmivntajbigjswhahb` (migrations through `0113`). Next: Phase 4 (evidence-scoring
engine §9, the IP) — or Phase 6 mobile against the now-frozen §8 contract.

---

## Phase 4 — Evidence-scoring engine (the IP) ✅ COMPLETE — AC9 met with cloud evidence (branch `phase-4-evidence`)

**Goal:** the §9 deterministic + auditable evidence-scoring engine — signal extraction →
ordered tiering → guardrail overrides → persist to `evidence_scores`; admin review queue.
**Gate (§13): AC9** — drug/compound pages show score + rationale + counts + limitations;
**off-label < approved**. All work + validation on cloud (`qyjmivntajbigjswhahb`).

### Decisions locked this phase (advisor-reviewed before writing)
- **Deterministic TIER, LLM PROSE ONLY** (the §9 mandate; same discipline as the safety layer).
  `packages/shared/src/evidence-scoring.ts` is a PURE core (`extractSignals`/`deriveSignals`/
  `tier`/`applyOverrides`/`scoreSignals`); the LLM writes only `rationale`/`limitations` and can
  never change the tier. Overrides may only **lower**. TDD'd (32 tests) against the §9 worked
  examples BEFORE any backfill (the gate-critical artifact needs no data).
- **The squishy signals are the real risk** (advisor's headline), so each is pinned with an exact
  computation + conservative default, documented as the spec table in `evidence-scoring.ts`:
  `findings_consistent` = synthesis/replication/approval adjudicated it (`n_meta≥1 ∨ n_sr≥1 ∨
  n_rct≥2 ∨ fda_approved`, else false); `sample_size_adequate` = max interventional enrollment
  ≥ 100 (false when unknown); `only_evidence_is_abstract`/`indirect_evidence_only` reserved=false
  (no shaky detector). One documented §9 strengthening: `moderate` floors on ANY human-grade
  evidence so a lone meta-analysis can't fall through to `unknown`.
- **Backfill was REQUIRED, not a re-project** (advisor's "verify before deriving"): trial
  `enrollment`/`results_first_posted`/`study_type` and pubmed `publication_types` were ALL null
  corpus-wide (the providers under-captured into `core_sources.metadata`; the projections had no
  `study_type` column at all). `scripts/backfill-evidence-signals.ts` re-fetches CT.gov v2 by NCT
  + NCBI efetch by PMID. (Migration `0115` adds `clinical_trials.study_type`.)
- **AC9 "off-label < approved" needs CLAIM-level rows** (a drug-level score is its approved use).
  We lack per-claim retrieval, so the worked-example claims are CURATED (`scripts/evidence-claims.ts`)
  — the curator asserts the claim-scoped evidence posture; the TIER is still computed
  deterministically. entity_type/approved_status/is_off_label are NOT curatable (pinned from the
  entity) so a claim can't escape the peptide/research-use cap.
- **Admin review API is SERVICE-ROLE ONLY** (`0114`): the default-grant trap again — `REVOKE
  EXECUTE FROM PUBLIC + anon + authenticated`, `GRANT TO service_role`, `search_path` pinned.
- **§8 contract touch-up (advisor-caught):** the frozen `evidence_score` shape in
  `packages/shared/src/search.ts` was written in Phase 2 when `limitations` was `text` — it typed
  `score: string`, `evidence_counts: Record<string,number>`, `limitations: string|null`. The engine
  persists the frozen `EvidenceTier` + `EvidenceCounts` (max_trial_phase is a string) and a
  `limitations[]` array (jsonb, `0114`). Corrected the read-contract to reference the frozen
  evidence types at the source of truth, BEFORE Phase 6 consumes it (the freeze permits corrective
  tightening while no consumer exists; a rename after Phase 6 would be the breaking change).
- **Scope split** (advisor): NLI citation support-verify + retrieval re-ranking + Corrective-RAG
  are orthogonal RAG-quality work, NOT the AC9 gate → carried forward as **Phase 3.5** (the goal
  prompt bundled them under P4; logged here, not silently dropped).

### Task status
- [x] **CP1 — deterministic tier core + signal spec (`packages/shared`), TDD 32 green** ✅
- [x] CP2 — backfill signals (trials v2 re-fetch + pubmed efetch) ✅
- [x] CP3 — scoring engine (extractSignals + LLM rationale w/ template fallback + batch writer) ✅
- [x] CP4 — curated off-label claim rows (semaglutide weight vs gym; BPC-157 tendon) ✅
- [x] CP5 — review queue + admin RPCs (`0114`); `study_type` column (`0115`) ✅
- [x] CP6 — code-review (2 HIGH fixed) + security-review (clean) before commit ✅

### Evidence log

#### Phase-4 acceptance gate — AC9 ✅ (2026-06-03, cloud, **as authenticated end-user**)
`scripts/phase4-validate.ts` (signs in role=authenticated, runs the deployed reads):
- **AC9 page** `get_drug(semaglutide)` → `evidence_score` block: score **very_strong**, non-empty
  rationale, `evidence_counts{}`, `limitations[]`.
- **AC9 off-label < approved** semaglutide claims: "chronic weight management" (approved) →
  **very_strong**; "gym / physique performance" (off-label) → **unknown**. unknown < very_strong ✓.
- **Research peptide conservative** BPC-157 drug-level → **weak** (peptide cap holds; it has one
  real Phase-1 n=42 interventional trial, so "weak" is the honest tier, not very_weak); the
  curated claim "tendon healing in humans" → **very_weak** (the §9 example).
- **Admin API locked**: anon → 401, authenticated → 403, service_role → 200 (review queue);
  `mark_score_reviewed` authenticated → 403, service_role → true.
- Reproduce: `SB_URL=.. SERVICE_KEY=.. ANON_KEY=.. deno run -A scripts/phase4-validate.ts`.

#### Backfill (cloud) ✅
- Trials: **379/379** updated from CT.gov v2 — 363 with enrollment, 93 with results_posted,
  study_type populated, 18 multi-phase trials pipe-joined (→ highest phase). 0 errors.
- PubMed: **263/264** updated via efetch — publication_types extracted (5 RCTs, 12 reviews/meta
  across the seed corpus) + mesh refreshed.

#### Scoring (cloud) ✅
- `scripts/evidence-score.ts` wrote **395 evidence_scores** (392 drug-level over the
  evidence-bearing catalog + 3 curated claims); **23 flagged for human review**. Tier
  distribution: moderate 137 · unknown 123 · strong 88 · very_strong 22 · very_weak 14 · weak 11.
- Anchor spot-check: Semaglutide/Tirzepatide very_strong; statins/SSRIs strong (high-risk flagged);
  Retatrutide moderate; BPC-157/TB-500 weak (research_use flagged); Creatine very_weak (corpus has
  no creatine RCTs linked — honest reflection of LINKED evidence, not absolute literature).

#### Code review (code-reviewer agent) — 0 CRITICAL, 2 HIGH (both fixed before commit) ✅
- **HIGH — claim spread order**: `CuratedClaim.evidence` could override entity_type/approved_status
  and slip past the peptide/research-use cap → closed via `Omit` of identity fields + pinning them
  after the spread (the determinism invariant's one leak path).
- **HIGH — `phases[0]`**: multi-phase trials stored only the first phase (Phase2/3 → "PHASE2"),
  under-counting `max_trial_phase` → `phases.join("|")` (parsePhase resolves the highest);
  re-backfilled + re-scored. (Display-only — the tier ladder does not read max_trial_phase.)
- MEDIUM/LOW: named caps, clarifying comments on the intentional findings_consistent/very_strong
  narrowing + the reserved overrides, nct_id shape-validation, test-section comment.

#### Security review (security-reviewer agent) — 0 CRITICAL/HIGH/MEDIUM ✅
Default-grant trap correctly handled in `0114` (verified live: anon 401 / authenticated 403 /
service_role 200); secrets stay in env; no injection (uuids/curated text); LLM tier deterministic;
SSRF nil (hardcoded base + DB-sourced ids, now shape-validated). 4 optional LOWs noted.

#### Notes / follow-ups (logged, not gate issues)
- **Phase 3.5 — RAG quality** (deferred from P3, bundled under P4 by the goal prompt): NLI/2nd-pass
  citation SUPPORT-verify (today existence-verified only), Voyage/Cohere re-ranking over a wider
  candidate set, Corrective-RAG verification loop, thin `drug_interaction` retrieval.
- **Rationale LLM reliability:** DeepSeek structured output is intermittently malformed (same as
  Phase 3); the template fallback fired for ~half the prove set and the full bulk pass is
  deterministic-template by design. Persisted rationales are the deterministic template (more
  auditable); per-entity LLM prose is a refinement (pacing/retry).
- **Claim-level scoring is curated** (per-claim retrieval = the deeper IP, future). Supplement
  claim_type taxonomy (deficiency/wellness/disease) deferred — supplements use the standard ladder.
- **Phase-2 bridge backfill** for investigational entities (retatrutide/BPC-157 broad-fallback) and
  **MED — pubmed XML regex parse** (mirrors the provider; robust DOMParser if it ever mis-parses)
  remain open.

---

## ✅ PHASE 4 COMPLETE — AC9 met with cloud evidence; engine deterministic + reviewed.
Evidence scores live on `qyjmivntajbigjswhahb` (migrations through `0115`); drug pages render
score+rationale+counts+limitations, off-label < approved. Next: Phase 5 (watchlist + digest,
§10 → AC7/AC8) — or Phase 3.5 (RAG quality) / Phase 6 mobile against the frozen §8 contract.

---

# Phase 5 — Watchlist + weekly digest (§10 → AC7, AC8)

**Branch** `phase-5-watchlist`. Retention loop: follow items → detect-updates emits `updates`
from genuine corpus events → weekly digest ranks them per the doc-12 key. Migrations `0116`+`0117`
live on `qyjmivntajbigjswhahb`.

### Decisions (advisor-shaped)
- **No fabricated updates.** The phase narrative said "label change → update", but `persist.ts`
  supersedes IN PLACE (same `core_sources` id; `superseded_at` is only ever set to null) and emits
  nothing — so there is no honest label-change signal today, and **0** sources are superseded
  cloud-wide. Emitting a `label_update` for an unchanged label would manufacture a non-event, exactly
  what "auditable, not vibes" forbids. So detect-updates emits ONLY append-only EVENT signals where a
  new row IS the event: `pubmed_new` (bridged article) + `trial_results` (bridged trial with
  `results_first_posted`). **AC8 is anchored on `pubmed_new`** (the literal AC is "a digest can be
  generated"; any real update satisfies it). `label_update`/`trial_status` emission is deferred WITH
  the supersede→emit freshness pipeline.
- **Locked seam:** a drug follow is `item_type='drug', item_ref=<entity_id uuid as text>`;
  detect-updates emits that SAME key, with article/trial identity in `source_id`+`title`+`source_url`
  (NOT in `item_ref`). That is how `get_watchlist_updates` joins a follow to its updates while the
  dedup key still separates one article from the next. Gate asserts the seam end-to-end.
- **`detected_at` = detection time** ("surfaced to you this week"), with the real publish date in the
  `summary` — not a soft temporal fabrication of "published this week".
- **Ranking lives in ONE place.** The pure doc-12 comparator (`packages/shared/digest-ranking.ts`)
  is the only ranking logic; the live `get_watchlist_updates` RPC is intentionally just recency, so
  the two never drift.

### Migrations
- **`0116_watchlist_digest.sql`** — `digests` (per-user weekly snapshot; owner-read RLS, service-role
  write; unique `(user_id,period_start,period_end)` ⇒ idempotent generation); `get_watchlist_updates(int)`
  (frozen §8 `GET /watchlist/updates`; SECURITY DEFINER, `search_path` pinned, joins `updates`↔caller
  `watchlist_items` on `(item_type,item_ref)` for `auth.uid()`, recency-ordered; **REVOKE anon, GRANT
  authenticated** — user-facing, unlike the 0114 admin RPCs); `updates_dedup_idx
  (item_type,item_ref,update_type,source_id) NULLS NOT DISTINCT` (idempotency key — exact for
  append-only signals; in-place-superseded sources would need `content_hash`, deferred).
- **`0117_watchlist_user_default.sql`** — `watchlist_items.user_id DEFAULT auth.uid()`. The frozen
  §8 `POST /watchlist` body omits `user_id`; the 0109 column had no default, so an authenticated
  insert 403'd on RLS `WITH CHECK`. Surfaced by the AC7 gate (no authenticated watchlist insert had
  ever been exercised). WITH CHECK still pins ownership; anon (uid null) is rejected.

### What shipped
- **detect-updates.ts** (service-role, idempotent): emitted **859** real updates — **709 pubmed_new +
  150 trial_results**, 0 skipped (all bridged rows carry `source_id`), 0 errors. Re-run = **0 new /
  859 already present** (dedup index proven). `--only`/`--limit`/`--dry-run`. Exits non-zero on any
  batch error (no silent partial emit).
- **digest-ranking.ts** (PURE, **14 TDD tests**, RED→GREEN): doc-12 ordered key verbatim
  (specificity → source_importance → evidence_quality → recency → safety_affecting → dedupe), total
  deterministic order (id tiebreak) so digests are reproducible. Full shared suite **46 pass**.
- **watchlist.ts**: §8 shared shapes (WatchItemType, UpdateType, WatchlistItem, WatchlistUpdate,
  DigestEntry, Digest).
- **generate-digest.ts** (service-role): per weekly user, match `updates`↔follows on the seam within
  `[period_start,period_end)` (server-side window filter), join DRUG-LEVEL `evidence_scores` for
  `evidence_rank`, `rankDigest`, upsert one `digests` row per (user,period). Exits non-zero on upsert
  error.

### AC7 + AC8 gate (`phase5-validate.ts`, role=authenticated JWT — not the service key) — PASS ✅
Run live on `qyjmivntajbigjswhahb`; 11/11 checks green:
- **AC7** — insert 3 follows → **201, 3 rows**; semaglutide follow `item_ref == entity_id` (seam);
  `GET /watchlist` returns the user's **3** follows.
- **AC8** — shells detect-updates(sema, idempotent no-op) + generate-digest(user) → **17 ranked
  updates** (sema's 12 `pubmed_new` + 5 from the 2 other followed drugs); `get_watchlist_updates`
  surfaces a semaglutide `pubmed_new`; matched update carries `item_ref == entity_id` (seam
  end-to-end); the user's `digests` row has `update_count=17` and **CONTAINS the specific update id**
  (containment, not just non-empty — the silent-empty-digest risk).
- **Security** — user-2 (follows nothing) gets an empty feed and **cannot read** user-1's digest (RLS
  owner-only); **anon → `get_watchlist_updates` 401**.

### Code review (code-reviewer agent) — 0 CRITICAL, 3 HIGH + 1 MEDIUM (all fixed before the cloud run) ✅
- **HIGH — silent write failure**: detect-updates + generate-digest exited 0 even if every batch/upsert
  failed → the gate could pass on an empty emit. Both now `Deno.exit(1)` on any error.
- **HIGH — evidence_rank poisoning**: claim rows share `entity_id` with the drug, so an unfiltered
  first-wins load could let a CLAIM tier win the entity's `evidence_rank` → generate-digest now reads
  drug-level only (`entity_type=drug & claim_text is null`).
- **HIGH — null source_id collapse**: `NULLS NOT DISTINCT` would collapse distinct source-less
  articles/trials into one → detect-updates skips + logs them (0 today; provenance is required anyway).
- **MEDIUM — scale**: generate-digest filters `updates` server-side + paginated, not a full-table pull.

### Security review (security-reviewer agent) — Phase-5 diff CLEAN; 1 pre-existing CRITICAL flagged
- **CONFIRMED CORRECT (the cruxes):** `get_watchlist_updates` grant posture (`search_path` pinned;
  `auth.uid()` scoping leak-proof — only `updates` columns projected, `watchlist_items` used only as a
  filter; REVOKE PUBLIC+anon, GRANT authenticated+service_role; `max_results` clamped [1,500]); and
  `digests` RLS (owner-read SELECT only, no authenticated write policy → users cannot forge/read
  others' digests; FK cascade on user delete). No injection in the host scripts; no command injection
  in the validator's subprocess (fixed-literal args); test users torn down.
- **CRITICAL (pre-existing, OUTSIDE the diff) — secrets at rest in `supabase/functions/.env`**: live
  `SERVICE_KEY`/DB password/provider keys. **Gitignored and never committed (verified)** — nothing
  leaked — but present on disk. NOT rotated by me (operator decision; rotating mid-run would break the
  authorized validation). Carry-forward below.

### Carry-forwards (documented, NOT gate issues)
- **Scheduling**: pg_cron jobs (`refresh_*`, `weekly_digest`) + Vault-stored creds — Phase 5 runs the
  jobs by hand. **Delivery**: Resend email + Expo push. **Frequencies**: `instant`/`daily` (Phase 5
  ships `weekly`).
- **Change-event emission**: `label_update`/`trial_status` need a supersede→emit freshness pipeline
  (persist.ts currently updates in place and emits nothing; the dedup key will gain `content_hash` then).
- **Security ops**: rotate the six credentials in `supabase/functions/.env` + add a `gitleaks`/
  `detect-secrets` pre-commit hook (the repo's husky/lefthook point exists).
- **Watchlist paywall** (>3 followed items, doc-06) is a Phase-6/monetization concern, not AC7.

---

## ✅ PHASE 5 COMPLETE — AC7 + AC8 met with cloud evidence; reviewed + secured.
`updates` (859) + `digests` + `get_watchlist_updates` live on `qyjmivntajbigjswhahb` (migrations
through `0117`). Follow → detect → weekly digest works end-to-end as a verified authenticated user,
ranked by the deterministic doc-12 key, with cross-user isolation and anon denial enforced. Next:
Phase 6 (mobile, RN+Expo against the frozen §8 contract) — or Phase 3.5 (RAG quality).

---

# Phase 6a — §8 backend gaps the mobile app depends on (`get_source` + `compare`)

Phase 6 (mobile) builds against the frozen §8 contract, but two read endpoints it needs weren't built
in Phases 2–5. This sub-phase lands them, headlessly verified as an authenticated end-user (same gate
discipline as Phases 2–5). The RN/Expo app (6b) follows separately in plan mode — a UI phase's
validation bar shapes the build, so those decisions get settled with the operator first.

### What shipped
- **`0118_get_source.sql`** — `get_source(p_id uuid) RETURNS jsonb`, the §8 `GET /sources/{id}`
  source-viewer record (doc-12): provider, title, url, `external_id` (provider_id), license/attribution,
  `published_at`/`fetched_at`/`retrieved_at`, `superseded_at` + `is_current` (drives the doc-06
  "outdated" state), `sections` (distinct chunk sections), metadata. SECURITY DEFINER, `search_path`
  pinned; **REVOKE PUBLIC+anon, GRANT authenticated+service_role** (mirrors get_drug + the 0111/0112
  read-lock). `SourceDetail` type added to `packages/shared/src/search.ts`. Applied to cloud.
- **`supabase/functions/compare`** — `GET /compare?left&right` → structured side-by-side (doc-11):
  `mechanism`, `approved_uses`, `evidence_strength`, `trial_status`, `safety`, `cost_access` (6 section
  groups) + unioned `sources`. Composes the existing authenticated reads (`get_drug` + `get_drug_label`
  + `get_drug_trials`) for both entities; the client renders, never computes. Pure `buildComparison`
  (4 unit tests) + IO wrapper (verify authenticated non-anonymous caller; validate `left`/`right` are
  uuids and differ; service-role reads). `Comparison` type in `packages/shared/src/compare.ts`.
  Deployed to cloud via `--use-api` (server-side bundle — the default Docker bundler wedged locally).

### Reviews
- **code-reviewer**: 0 CRITICAL, 0 HIGH; 4 MEDIUM addressed (log verifyUser cause; robust label-section
  flatten for string/array/object; sources-from-bridge + get_drug-null-convention doc notes).
- **security-reviewer**: both cruxes CONFIRMED CORRECT — `get_source` anon-revoke + `search_path`
  pinned; `compare` rejects anon/anonymous, uuid-validates, no injection / no secret-leak. `metadata`
  exposure is ≤ the already-authenticated-readable `core_sources` table (no new exposure).

### Gate (`scripts/phase6a-validate.ts`, authenticated end-user, cloud) — PASS
```
[6a] get_source — the Source Viewer record
  ✓ get_source returns the record (authenticated) — status=200
  ✓   └ provider + title + url present; external_id present
  ✓   └ is_current is a boolean (drives 'outdated' state) — true
  ✓   └ sections is an array — 15 sections
  ✓ anon → get_source DENIED — status=401
[6a] compare — structured side-by-side (6 section groups)
  ✓ compare returns 200 (authenticated); left/right headers present
  ✓   └ mechanism / approved_uses / evidence_strength / trial_status / safety / cost_access all left+right
  ✓   └ sources is an array — 3 sources; trial_status.left has a count
  ✓ anon → compare DENIED — status=401
  ✓ compare rejects a non-uuid (400); rejects left===right (400)
✅ PHASE 6a GATE PASS (get_source + compare)
```

### Notes / carry-forwards
- `get_source` returns `200 null` for a missing id (same convention as `get_drug`); the client treats
  null as not-found.
- No per-function rate limiting on `compare` (matches `ask`; auth-gated + platform backstop).
- `compare` requires authenticated non-anonymous; guest scope is a 6b decision.

## ✅ PHASE 6a COMPLETE — `get_source` + `compare` live on `qyjmivntajbigjswhahb` (migrations through
`0118`), the §8 read surface the mobile app needs. Gate green as a verified authenticated user. Next:
Phase 6b (RN/Expo app) — to plan mode for the validation-bar / auth-scope / PR-granularity decisions.

---

# Phase 6b — mobile app (RN + Expo): PLANNED & APPROVED (build deferred to operator go-ahead)

Full plan: `~/.claude/plans/immutable-rolling-whale.md` (approved 2026-06-03).

**Decisions (operator):** (1) validation = headless **Playwright on Expo-web vs cloud as a real
authenticated user** + a **required human device-checklist** for the native parts; (2) **5 sub-PRs**
— 6b-1 scaffold/auth/typed-client/Playwright-harness → 6b-2 Explore+Drug+SourceViewer (AC1/4/5/6/9) →
6b-3 Ask (AC2/3) → 6b-4 Watchlist+Compare (AC7/8) → 6b-5 Profile+legal+8-state polish (AC10
affordances); (3) auth = **guest + email now**, Apple/Google OAuth deferred to operator native
config; (4) **build nothing until the operator says "build 6b-1."**

**Stack:** Expo Router + react-native-web + supabase-js + TanStack Query. App ships `EXPO_PUBLIC_*`
anon key + user JWT **only** (service key never in the bundle — the REVOKE-anon/GRANT-authenticated
posture from 0111/0112/0118 is the payoff). Playwright global-setup seeds a confirmed test user via
the admin API (lift `scripts/phase6a-validate.ts:37-55`).

**Honesty guard:** AC10's delete *cascade* + independent health-context delete + export = **Phase 7**;
6b shows AC10 affordances only. "On device" = the human checklist, not headless.

**Status: 6b-1 BUILT + gate-green (see below); awaiting merge. Remaining: 6b-2…6b-5.**

---

## Phase 6b-1 — Expo scaffold + auth + typed §8 client + RNW fidelity gate — DONE (gate green; awaiting merge)

The mobile foundation, built against the frozen §8 contract and validated **headlessly as a real
authenticated end-user against cloud** — the project's gate discipline, now applied to the app surface.

### What shipped
- **Expo SDK 56 + Expo Router + react-native-web** in the pnpm/turbo monorepo (`.npmrc`
  `node-linker=hoisted`, monorepo `metro.config.js`, `babel-preset-expo`; `reactCompiler` off).
  Native-only template UI libs (`@expo/ui`/glass/symbols) dropped — web-safe primitives only.
- **4-tab shell** (Ask·Explore·Watchlist·Profile), auth-guarded; screens are labelled stubs for
  6b-2…6b-5. **8-state primitives** (`src/components/states/`) with doc-06 verbatim empty copy.
- **Auth** (`src/auth/AuthProvider`): email sign-in + sign-out + a guest browse-only UI state. App
  ships `EXPO_PUBLIC_*` anon key + user JWT only — service key never in the bundle.
- **Typed §8 client** (`src/api/`) over supabase-js — `get_drug`, returning `@pharmabro/shared`
  DTOs; the jsonb→DTO cast guards mandatory fields (Deno unit test, 4/4).
- **Data-bound drug screen** rendering a real `get_drug` under react-native-web (uuid- + session-
  gated). **Playwright gate** (`e2e/`): admin-seeded confirmed user, real UI sign-in, AC-visible
  walk; teardown deletes the user + removes the local seed file.
- `DEVICE_CHECKLIST.md` — the human gate for native parts (exercised at 6b-5).

### Gate (`e2e/phase6b-1.spec.ts`, real authenticated user, cloud `qyjmivntajbigjswhahb`) — PASS
```
  ✓ 6b-1: sign-in → 4-tab shell → authenticated get_drug render → sign-out (3.3s)
  ✓ 6b-1: guest UI state renders (browse-only, no session) (0.6s)
  2 passed (8.5s)
```
Proves: web boot + react-native-web fidelity + monorepo Metro resolution of `@pharmabro/shared` +
the typed §8 client + supabase email auth + an authenticated `get_drug` read + 4-tab paint + guest
UI state. Also: `tsc` clean; `deno test cast.test.ts` 4/4.

### Reviews (both before commit)
- **code-reviewer**: 0 CRITICAL/HIGH, 2 MEDIUM + 5 LOW — ALL addressed (getSession `.finally` so the
  route guards can't spin forever; cast validates mandatory fields; memoized AuthProvider; normalized
  `drugId`; de-duped loading testIDs; dropped the unused `@pharmabro/db` dep → re-added in 6b-4;
  `.env` added to the app `.gitignore`; commented the deferred `signUpEmail`).
- **security-reviewer**: anon-key-only posture **UPHELD** (no service-key leak; confined to the Node
  e2e setup; `.env` gitignored; no SQLi/XSS; route guard + query session-gating correct). Fixes:
  uuid-gate the drug query; teardown now logs failures + always removes the plaintext seed file.

### Carry-forwards (not 6b-1 blockers)
- **Guest reads**: real anonymous reads need Supabase anonymous-sign-in enabled (a cloud auth change)
  + the anon role; 6b-1 ships guest as a UI state only. Settle in 6b-2.
- **Web session storage**: supabase-js uses `localStorage` on web (XSS-exposed) — fine for the e2e
  path; harden (sessionStorage adapter / chunked SecureStore) before any public web build.
- **Transitive `uuid@7.0.3`** (moderate, GHSA-w5hq-g745-h8pq) via `expo→@expo/cli→xcode` — build/
  config-time only, not bundled at runtime; monitor for an `@expo/config-plugins` bump.
- **`packages/db` gen types** moved to 6b-4 (where watchlist table-row types are needed).
- SDK 56 is bleeding-edge; node v24 is ahead of its tested range (no issues observed).

---

## Phase 6b-2 — Explore + Drug page + Source Viewer — DONE (gate green) → AC1/AC4/AC5/AC6/AC9 visible

The read surface: search a drug, open its page (label · trials · pubmed · evidence — every item
cited), and open any citation in the doc-12 Source Viewer. Built against the frozen §8 contract,
validated headlessly **as the real seeded authenticated user against cloud** — and with **zero
backend changes** (every RPC already existed and is anon-REVOKEd; the payoff of the 0110/0111/0112/
0118 grant posture).

### What shipped
- **Explore** (`src/app/(tabs)/explore.tsx`): debounced `search_entities` → results → drug page.
  Guest sees a sign-in affordance; idle/loading/empty/error states.
- **Drug page** (`src/app/drug/[id].tsx`): overview (name·status·mechanism·brands) + **EvidenceCard**
  (AC9: score+rationale+counts+limitations) + **LabelSections** (AC4) + **TrialList** (AC5) +
  **PubmedList** (AC6). Four §8 reads run in parallel; each section owns its doc-06 load/error/empty
  state. "Related" = the drug's `classes` rendered as **display-only** chips (no class-members RPC
  exists — not navigable).
- **Source Viewer** (`src/app/source/[id].tsx`): `get_source` → provider·title·license·sections·
  is_current + "open original" (http(s)-guarded). State chosen by the pure, unit-tested
  `sourceViewState` (not-found / outdated / ok).
- **Typed client** (`src/api/`): `search.ts`, `sources.ts`, `drugs.ts` (+label/trials/pubmed),
  app-local read-row view types (`types.ts`) — the frozen `@pharmabro/shared` is not reopened.
  jsonb→DTO casts (`cast.ts`) guard the field each renderer dereferences.
- **"All cited"** (Phase-2 acceptance, row 673): **every** row carries a non-null `source_id` —
  verified across all rows for semaglutide (label 1/1, trials 11/11, pubmed 12/12), not just the
  first → a `SourceLink` to its Source Viewer; the gate asserts the affordance per section.

### Gate (`e2e/phase6b-2.spec.ts`, real authenticated user, cloud `qyjmivntajbigjswhahb`) — PASS
```
  ✓ 6b-1: sign-in → 4-tab shell → authenticated get_drug render → sign-out (3.5s)
  ✓ 6b-1: guest UI state renders (browse-only, no session) (0.6s)
  ✓ 6b-2: search ozempic → semaglutide page (label/trials/pubmed/evidence, all cited) → Source Viewer (2.7s)
  ✓ 6b-2: unknown source id → no-source state (real get_source null path) (2.1s)
  4 passed (13.7s)
```
- **AC1** — "ozempic" (brand alias) → result resolves to Semaglutide → tap → drug page.
- **AC4/AC5/AC6** — label sections, ≥1 trial, ≥1 pubmed render, **each with a visible citation**
  (semaglutide real counts: labels 1, trials 11, pubmed 12).
- **AC9** — evidence score (`very_strong`) + rationale + counts + limitations all visible.
- Source Viewer — a citation opens `get_source` (provider/title/sections/url); unknown uuid → the
  real null path → no-source state.
- Also: `tsc` clean; `deno test cast.test.ts derive.test.ts` **17/17**.

### Honesty guard — what this PR does NOT close
- **"Outdated" state has no live trigger**: the corpus has **0 superseded sources**
  (`core_sources WHERE superseded_at IS NOT NULL == 0`), so `is_current` is always true. The doc-06
  outdated branch is therefore proven **prop-driven** (`sourceViewState` unit test), **not** via a
  live Playwright source. No gate line claims a real-data outdated path.
- **AC9 "off-label < approved"** is the **Phase-4 engine** guarantee (already green in PROGRESS); the
  UI renders the drug-level (approved) score. 6b-2 surfaces the score; it does not re-prove the
  ordering in the UI (no claim-level off-label score is rendered).
- **Guest = UI affordance only** (no real anonymous reads). Real guest reads need Supabase
  anonymous-sign-in enabled — a **cloud auth-config change**, deliberately not flipped. The gate
  user is the seeded email account.
- **Add-to-watchlist** deferred to 6b-4 (AC7), where watchlist CRUD lands — no half-built follow
  button in 6b-2.

### Reviews (both before commit)
- **code-reviewer**: 0 CRITICAL/HIGH, 2 MEDIUM + 2 LOW — ALL addressed: guard `status` in
  `castSearchResults` + `?? ""` on `approved_status` (no `.replace` on a possibly-null field);
  extracted the duplicated `UUID_RE`→`src/lib/validation.ts` and `Centered`→`components/ui.tsx`;
  `Linking.openURL` now scheme-guarded + `.catch`; dropped the redundant `isFetching`.
- **security-reviewer**: anon-key-only posture **UPHELD** — no service-key leak (confined to the Node
  e2e setup), no string-built SQL/URLs (supabase-js `.rpc` binding), uuid route-guard adequate, **no
  new RPCs/migrations** (nothing to REVOKE), no XSS (RN `<Text>` sinks). LOW: external-URL scheme
  guard (applied); RPC error strings surfaced to UI (consistent with 6b-1 — uniform polish in 6b-5).

### Carry-forwards (not 6b-2 blockers)
- **Guest anonymous reads** + **web `localStorage` session** + **transitive `uuid@7`** — unchanged
  from 6b-1.
- **RPC error messages → UI**: replace raw `error.message` with a generic copy in the 6b-5 8-state
  polish pass (avoid leaking internal Postgres text).
- **Trial jsonb columns** (conditions/interventions/primary_outcomes) rendered minimally; richer
  display deferred to device polish (6b-5).

---

## Phase 6b-3 — Ask (cited answers + safety routing) — DONE (gate green) → AC2/AC3 visible

Ask a medication question → a cited, structured answer, or a deterministic safety/refusal template.
Built against the frozen §8 `AskResponse`, validated headlessly **as the real seeded authenticated
user against the live `ask` edge function** (DeepSeek-backed) — **zero backend changes** (the `ask`
fn was deployed + authenticated-only in Phase 3).

### What shipped
- **Ask tab** (`src/app/(tabs)/index.tsx`): question input + submit (`useMutation`) + idle/guest/
  loading/error states; follow-up `questions_to_ask` chips re-ask. Authenticated-only (the fn
  rejects anonymous) → guest sees a sign-in affordance.
- **AnswerView** (`src/components/AnswerView.tsx`): renders every `AskResponse` variant — the doc-20
  structured answer (bottom line + evidence-grade badge + what-we-know/don't-know/safety-notes cited
  bullets + follow-ups + a numbered **Sources** list) and the deterministic templates. Citations
  **reuse the 6b-2 Source Viewer** (`source_id` → `SourceLink` → `/source/[id]`).
- **SafetyBanner** (`src/components/SafetyBanner.tsx`): emergency (urgent-care) + caution (sensitive
  class) tones.
- **Typed client**: `src/api/ask.ts` (`supabase.functions.invoke('ask')`), `toAskResponse` cast
  (guards answer_id+summary+sections; **coerces** safety_flags/citations/evidence_grade so a
  field-light body degrades instead of white-screening on a safety path).

### Gate (`e2e/phase6b-3.spec.ts`, real authenticated user, cloud) — PASS
```
  ✓ 6b-2: search ozempic → semaglutide page (… all cited) → Source Viewer (2.7s)
  ✓ 6b-2: unknown source id → no-source state (real get_source null path) (1.6s)
  ✓ 6b-3: ask a medication question → cited structured answer → Source Viewer (AC2/AC3) (14.1s)
  ✓ 6b-3: emergency phrasing → deterministic urgent-care routing (safety) (2.9s)
  6 passed (31.1s)
```
- **AC2** — "side effects of semaglutide" → a structured answer (bottom line + what-we-know section).
- **AC3** — ≥1 cited source rendered (intent `side_effects`, grade `very_strong`, 2 citations), each
  opening the Source Viewer.
- **Safety** — emergency phrasing → the deterministic urgent-care banner carrying the backend
  call-emergency/poison-control copy (no LLM, ~2-3s). Preserves the live preScreen + detectViolations
  + interrogative-aware CLAIM_GUARD already in the `ask` fn.
- Also: `tsc` clean; `deno test cast.test.ts derive.test.ts` **24/24** (incl. the prop-driven
  `answerKind` render-shape tests).

### Honesty guard — what this PR does NOT close
- **no_source / unsupported-claim refusal is not asserted via a live LLM call**: against this corpus a
  made-up compound ("flogiston-7") still retrieves diabetes neighbors and returns a *safe grounded*
  answer ("no evidence it exists"), not a hard `refused_unsupported`/`no_source` template — so a live
  Playwright refusal assertion would be non-deterministic. Coverage instead: (a) the refusal *logic*
  is **Phase-3 script-gated** (already green) server-side; (b) the AnswerView **render-shape**
  decision — emergency / refused / normal — is extracted to the pure `answerKind` selector and
  **unit-tested prop-driven** (the same discipline as 6b-2's `sourceViewState`), so the `refused`
  render branch is covered even though it has no live trigger. The e2e gate asserts the deterministic
  emergency short-circuit end-to-end.
- **Health context** not wired here — `askQuestion` sends `use_health_context: false` (the
  user_health_context read/edit lands in 6b-5).
- **Saved answers** deferred — no §8 read RPC for a user's `generated_answers`; out of AC scope.
- **Ask latency** ~13s observed (doc-02 target <10s) — surfaced as an explicit loading state; a
  perceived-latency pass (streaming / optimistic copy) is a 6b-5/Phase-8 item.

### Reviews (both before commit)
- **code-reviewer**: 0 CRITICAL, **1 HIGH** + 2 LOW — HIGH addressed (coerce safety_flags/citations/
  evidence_grade in `toAskResponse` so the renderer can't crash on a field-light safety body; locked
  with a test). LOW: follow-up `key={q}`.
- **security-reviewer**: anon-key-only posture **UPHELD** — no key leak (`functions.invoke` auto-
  attaches the JWT; service key server-side only), question flows as a JSON body field (no URL/SQL
  interpolation), answer text rendered via inert RN `<Text>` (no XSS), **no new RPCs/migrations**,
  `use_health_context=false`, no question/answer logging. LOW (applied): `encodeURIComponent` on the
  `SourceLink` path; `maxLength={500}` on the Ask input.

### Carry-forwards
- Unchanged from 6b-1/6b-2 (guest anon reads · web `localStorage` · `uuid@7` · RPC errors→UI copy).
- Health-context toggle + saved answers + perceived-latency polish → 6b-5 / Phase 8.

---

## Phase 6b-4 — Watchlist + Compare — DONE (gate green) → AC7/AC8 visible

The first **write path**: follow/unfollow drugs, see the live update feed + the weekly digest,
and compare two entities. Built against the frozen §8 DTOs, validated headlessly as real
authenticated users against cloud — **zero backend changes** (tables/RPCs/compare fn all from
Phase 5/6a; the `authenticated` role's table GRANTs were Phase-5-verified). The threat model shifts
from "anon can't read" to "user A can't read or mutate user B's rows" — gated explicitly.

### What shipped
- **Watchlist tab** (`(tabs)/watchlist.tsx`): the follows list (PostgREST `watchlist_items`, owner-
  scoped) with per-row drug-name resolve + unfollow; the live **update feed** (`get_watchlist_updates`);
  the latest **weekly digest** snapshot (`digests`); a paywall hint at the free cap.
- **FollowButton** (drug page, the 6b-2 deferral): follow/unfollow toggle; at `FREE_WATCHLIST_LIMIT=3`
  it becomes the doc-06 **paywall stub** (real entitlement = Phase 8). A "Compare with another" link too.
- **Compare** (`compare.tsx` + `ComparisonView`): `/compare?left&right` (deep-linkable; picker for the
  missing side) → the `compare` edge fn (GET `?left&right` + JWT — NOT `functions.invoke`, which POSTs)
  → the 6 doc-11 groups + the union of cited sources (each a `SourceLink`).
- **Typed client**: `api/watchlist.ts` (from()/rpc()), `api/compare.ts` (direct functions fetch);
  casts `castWatchlistItems`/`castWatchlistUpdates`/`toDigest`/`toComparison`.

### Gate (`e2e/phase6b-4.spec.ts`, real users, cloud) — PASS
```
  ✓ 6b-4: cross-user RLS isolation (watchlist_items + digests + get_watchlist_updates) (1.2s)
  ✓ 6b-4: follow 3 items via UI (AC7) + weekly digest renders (AC8) + paywall stub (5.9s)
  ✓ 6b-4: compare renders the 6 doc-11 groups + unioned sources (2.6s)
  9 passed (1.1m)   ← incl. 6b-1/6b-2/6b-3 regressions
```
- **AC7** — follow 3 drugs via the UI follow button → the watchlist holds 3; a 4th → the paywall stub.
- **AC8** — a weekly digest, generated by the **real** `generate-digest` (gate setup, `--user` + explicit
  bounds) with semaglutide's 12 real updates, renders in the digest view (`digest-item-0`).
- **Cross-user RLS isolation** (the write-path security bar): A and B each follow a *different* drug;
  each sees EXACTLY its own row (A's read excludes B's follow and vice-versa); B's `get_watchlist_updates`
  never contains A's updates; B sees 0 of A's `digests`; B's insert with `user_id=A` → **403** (WITH CHECK)
  AND a service-key read-back confirms **no row was planted** (so a 409-dup or 204-mask can't pass it).
- Also: `tsc` clean; `deno test` **28/28**.

### AC8 generation strategy (honest)
The `digests` table is a **service-role-written weekly snapshot** (Phase 5 cron) — a fresh user has none,
and there is no user-facing "generate now" endpoint. So the gate **runs the real generator** for user A
in setup (`scripts/generate-digest.ts --user=A`, wide window bracketing the corpus updates), asserts the
digest is non-empty (fail-fast), then **unfollows** the seed item — the snapshot persists (verified), so
AC7's UI-follow flow starts from 0 follows, decoupled from AC8. The app's job (display the generated
digest) is what's gated here; generation itself is the already-green Phase-5 capability.

### Reviews (both before commit)
- **code-reviewer**: 0 CRITICAL/HIGH, 1 MEDIUM + 3 LOW — MEDIUM addressed (digest/updates query
  `isError` branches, no silent failure on a safety-update feed); LOW: dead `onPress` on the disabled
  paywall removed, `ComparisonView` guards `sections[key]?.left`, `compare.tsx` `String()`-coerces params.
- **security-reviewer**: anon-only posture **UPHELD**; cross-user isolation **genuinely server-enforced**
  (RLS, not client filtering — `followItem` sends no `user_id`); no new DDL; no logging. MEDIUM addressed:
  the gate's evil-insert assertion was non-discriminating (`!=201` could pass on a 409/204) → now asserts
  **403 + service-key read-back** + bidirectional isolation + a `digests` cross-user probe.

### Carry-forwards
- **`FREE_WATCHLIST_LIMIT` is a client UX stub** — trivially bypassable via direct PostgREST; the real
  per-tier cap is **Phase-8** server-side entitlement (RevenueCat). Not a security boundary.
- Unchanged: web `localStorage` session · `uuid@7` · RPC errors→UI copy (6b-5 polish).
- Compare/watchlist rich detail (trial jsonb, alert-type editing, instant/daily cadence) → device polish.

---

## Phase 6b-5 — Profile + legal + 8-state polish (AC10 affordances) — DONE (code; device sign-off pending)

Last 6b sub-PR. Adds the Profile hub, **My Health Context** (the second authenticated WRITE
path — and the most sensitive: PII), the **AC10** legal/data affordances, and completes the
**doc-06 8-state matrix**. **No backend changes** — `user_health_context` already had owner RLS;
the app sets `user_id` from the JWT (the table has no `DEFAULT auth.uid()`, unlike watchlist).

### Gate (`e2e/phase6b-5.spec.ts`, real users, cloud) — PASS
```
  ✓ 6b-5: My Health Context CRUD round-trip through the UI (the new write path) (4.1s)
  ✓ 6b-5: health-context cross-user RLS isolation + anon cannot read (PII) (1.3s)
  ✓ 6b-5: AC10 affordances are present on Profile and each screen is reachable (3.2s)
  ✓ 6b-5: 8-state matrix — global offline banner + guest affordances on the key screens (2.6s)
  13 passed (1.1m)   ← incl. 6b-1/6b-2/6b-3/6b-4 regressions
```
- **AC10** — Profile links to Privacy, Terms, Educational disclaimer, Export, Delete-account; each
  screen renders. The disclaimer + consent copy are **verbatim from doc-18**; privacy/terms render
  doc-18's required-section structure with an explicit pre-launch note (doc-18 says an attorney drafts
  final). "Present + reachable," which is what AC10 asks at Phase 6.
- **My Health Context** — real owner-scoped CRUD: edit + doc-18 consent gate → **save** → reload shows
  it persisted → **delete** removes it (independent of the account, the doc-18 "Health context deletion").
  This is the first INSERT into `user_health_context`, so the green gate also **de-risks the GRANT** (the
  authenticated role can write — no migration needed).
- **8-state matrix** — the 30-cell ledger is `apps/mobile/STATE_MATRIX.md`, reconciled to the real
  `getByTestId` assertions: **9 LIVE · 5 GLOBAL (offline) · 3 PROP · 2 TRANSITIVE · 11 BRANCH** (5 load +
  5 error + Drug/no-source). So **19/30 are proven by execution**; the 11 BRANCH cells are primitive-proven +
  per-screen branch present, not force-exercised (load is transient; live error injection vs cloud is
  non-deterministic — stated plainly rather than faked). New this PR: the global `OfflineBanner` (a
  `navigator.onLine` hook — not NetInfo; driven by `setOffline`), the Ask **outdated** cell (`answerFreshness`
  on `oldest_source_date` + inline banner, unit-tested), and three deterministic **empty** cells now asserted
  LIVE (Search/Drug/Watchlist).

### PII isolation (the security bar — matches + exceeds 6b-4)
A and B each save their own `user_health_context` row; each reads EXACTLY its own (A's read excludes B's
and vice-versa). **Anon** read → **HTTP 200 RLS-filtered to 0 rows** while both rows exist (proves RLS is
*enabled*, the Supabase footgun — not merely that the grant is absent). B→A spoofs are blocked on all three
verbs: **INSERT** `{user_id:A}` → **403** (WITH CHECK) + service-key read-back = 0 planted; **UPDATE** of A's
row → 0 rows matched + A's value untouched (ground-truthed). SELECT/INSERT/UPDATE parity + anon-denied.

### Honest scope (what 6b-5 does NOT close)
- **Account deletion + data export are affordances only** (present + reachable + honest "finalized for
  launch"). The real cascade delete + export generation are **Phase 7** — no half-delete is wired (verified
  by review: the buttons set a status flag, touch no data). The independent **health-context delete is real**.
- **Legal text is pre-launch**, not attorney-final (doc-18's own "Important note").
- Two matrix cells (Drug/Watchlist **outdated**) are **TRANSITIVE** via the Source Viewer's live `is_current`
  state, documented in the ledger — not a separate per-screen path (0 superseded sources = no live trigger).

### Reviews (both before commit)
- **code-reviewer**: 0 CRITICAL/HIGH; 2 MEDIUM + 2 LOW — MEDIUMs fixed (delete-mutation now shows
  `hc-delete-error`, no silent PII-delete failure; `goals` given an editor field so save no longer clobbers
  it to `[]`); LOW fixed (stale "Saved." cleared on edit via `save.reset()`).
- **security-reviewer**: 0 CRITICAL/HIGH; PII write path correctly owner-scoped (WITH CHECK pins `user_id`
  server-side regardless of client); gate isolation assertions verified **discriminating** (specific-403 +
  read-back, anon-200-empty). LOWs applied: gate now asserts the anon **200** status + an **evil-UPDATE**
  probe (full RLS parity); delete-account lead copy made honest (no "deleted" implication pre-click). No
  health data in logs/analytics/query-keys/URLs; no service key in any shipped file (anon key + JWT only).

### Carry-forwards
- **Saved answers** (doc-06 Ask · §12) — NOT built in 6b-5 (not in the plan's 6b-5 line; no AC needs it).
  Cheap when wanted: `generated_answers` is already read-own (RLS `ga_read_own`), so a "your questions" list
  is a read + a screen. Logged here so it's an explicit deferral, not a silent omission.
- **AC10 backend** (cascade account-delete, export generation, health-context hard-delete audit) → **Phase 7**.
- Apple/Google OAuth (native config) · push/email digest delivery (Phase-5) · RevenueCat real entitlement
  (Phase 8) — unchanged.
- Header/back affordance on stacked screens (drug/source/compare/profile sub-screens use browser/native back;
  no in-app chevron) → device polish.

### Phase 6 device sign-off — PENDING (human gate, cannot self-sign)
`apps/mobile/DEVICE_CHECKLIST.md` is updated and READY. Phase 6 is "done" once the operator runs it on a
physical iOS/Android device and records the sign-off (date + device/OS) here. The code + headless gate +
8-state matrix are complete and green; the on-device loop is the remaining human gate.
