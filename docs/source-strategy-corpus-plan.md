# Source Strategy — Initial Corpus Ingest Plan

This document is the master ingestion plan for Ascend's Layer 1 corpus.
It enumerates every authoritative source we ingest, the ingestion method
per source, license posture, estimated size + embedding cost, and the
deploy order.

**Goal**: build the corpus FIRST, then draft curriculum content against
real Layer 1 chunks. Drafting on stub citations creates technical debt
and false claims.

**Posture**: every source is public domain or commercial-friendly
licensed. License gate (`assertCommercialFriendly`) blocks anything
else at ingest. Per-record license stored in `core_sources.license`.

---

## Tier 1: Bulk-downloadable (one-shot, full corpus)

These sources publish bulk archives. Single download → parse → ingest
the entire corpus. Far cheaper than per-query API calls.

| Source                                                      | Method                                     | Size             | Records              | Embed Cost (est) | Provider          |
| ----------------------------------------------------------- | ------------------------------------------ | ---------------- | -------------------- | ---------------- | ----------------- |
| **OpenFDA drug labels**                                     | Bulk archive (`api.fda.gov/download.json`) | ~2 GB compressed | ~80,000 SPL labels   | ~$50             | `openfda`         |
| **DailyMed SPL**                                            | Quarterly full archive                     | ~5 GB            | ~120,000 SPL records | ~$80             | `dailymed`        |
| **RxNorm**                                                  | Monthly RRF release                        | ~500 MB          | ~500,000 concepts    | ~$20             | `rxnorm`          |
| **DrugBank Open Data**                                      | CSV download (CC0)                         | ~10 MB           | ~12,000 drugs        | ~$1              | `drugbank_open`   |
| **OpenStax A&P 2e**                                         | JSON archive (full book)                   | ~50 MB           | ~30 chapters         | ~$2              | `openstax`        |
| **OpenStax Microbiology**                                   | JSON archive                               | ~40 MB           | ~26 chapters         | ~$2              | `openstax`        |
| **OpenStax Biology 2e**                                     | JSON archive                               | ~80 MB           | ~47 chapters         | ~$3              | `openstax`        |
| **OpenStax Chemistry 2e**                                   | JSON archive                               | ~60 MB           | ~21 chapters         | ~$2              | `openstax`        |
| **NIH LiverTox**                                            | Full Bookshelf walk                        | ~30 MB           | ~700 drug chapters   | ~$8              | `livertox`        |
| **NIH LactMed**                                             | Full Bookshelf walk                        | ~25 MB           | ~1,100 drug chapters | ~$10             | `lactmed`         |
| **PubChem** (drugs only)                                    | REST PUG API by drug list                  | ~5 MB            | ~3,000 compounds     | ~$1              | `pubchem`         |
| **ClinicalTrials.gov** (cardiology, diabetes, ID, oncology) | API w/ topic queries                       | ~500 MB          | ~10,000 trials       | ~$30             | `clinicaltrials`  |
| **FDA Orange Book**                                         | Quarterly download                         | ~50 MB           | ~25,000 products     | ~$3              | `fda_orange_book` |

**Tier 1 totals**: ~10 GB raw, ~720,000 records, **~$210 one-time embedding cost**.

---

## Tier 2: API harvest (targeted by topic)

These sources have APIs but no full bulk dump. We harvest by topic
relevant to drafted modules.

| Source                  | Method                  | Cardiology    | Diabetes | ID     | Other modules |
| ----------------------- | ----------------------- | ------------- | -------- | ------ | ------------- |
| **PubMed Open Access**  | E-utils search by query | ~5,000 papers | ~3,000   | ~4,000 | ~10,000       |
| **CDC pages** (curated) | Per-URL fetch           | ~10 pages     | ~10      | ~20    | ~30           |
| **CDC MMWR**            | RSS + curated           | ~5 reports    | ~3       | ~30    | ~10           |

**Tier 2 totals**: ~22,000 papers + ~120 pages, **~$300 embedding cost** for cardiology + diabetes + ID modules. Add ~$200 per additional module.

---

## Tier 3: Curated guideline pages (hand-picked, no bulk APIs)

These bodies don't expose APIs. We curate per-module URL whitelists in
`supabase/functions/core-source-sync/providers/curated-whitelists.ts`.

| Source                                 | Default whitelist size | Real coverage target           |
| -------------------------------------- | ---------------------- | ------------------------------ |
| **AHRQ Effective Health Care Program** | 5 pages (seed)         | ~50 pages (every CER)          |
| **USPSTF**                             | 4 pages (seed)         | ~80 recommendations            |
| **NIH NHLBI**                          | 4 pages (seed)         | ~30 condition pages            |
| **VA/DoD CPGs**                        | 4 pages (seed)         | ~25 PDFs                       |
| **FDA Drug Safety**                    | 2 hub pages (seed)     | ~100 communications            |
| **CDC MMWR**                           | 2 pages (seed)         | as needed per topic            |
| **OpenStax (per-page mode)**           | 3 pages (seed)         | superseded by bulk-book ingest |
| **PharmGKB**                           | 2 pages (seed)         | ~50 drug-gene annotations      |

**Tier 3 totals**: ~340 pages at full coverage, **~$30 embedding cost** total.

---

## Excluded sources (license fail or copyright wall)

These will NEVER pass the license gate:

- **DiPiro Pharmacotherapy** — copyrighted (Pearson)
- **Goodman & Gilman** — copyrighted (McGraw-Hill)
- **Harrison's Internal Medicine** — copyrighted
- **Lexicomp / Micromedex / Clinical Pharmacology** — commercial license required
- **DrugBank Academic** — CC BY-NC (non-commercial)
- **StatPearls** — CC BY-NC-ND
- **LibreTexts pharmacy** — CC BY-NC-SA
- **KDIGO guidelines** — CC BY-NC
- **WHO most documents** — CC BY-NC-SA
- **NICE (UK)** — copyrighted
- **USP-NF** — copyrighted, expensive
- **NABP NAPLEX outline** — copyrighted (red zone per TERMS §4.5)
- **AACP COEPA verbatim** — copyrighted (referenced only, never reproduced)
- **RxPrep / UWorld / Kaplan / BoardVitals / TrueLearn / Sketchy / Picmonic** — competitor red zone

---

## Total corpus estimates

| Phase                                   | Sources        | Records           | Embed cost         | Storage            |
| --------------------------------------- | -------------- | ----------------- | ------------------ | ------------------ |
| Tier 1 bulk                             | 13 sources     | ~720K             | ~$210              | ~5 GB chunks       |
| Tier 2 API (cardiology + diabetes + ID) | 3 sources      | ~22K papers       | ~$300              | ~600 MB chunks     |
| Tier 3 curated                          | 8 sources      | ~340 pages        | ~$30               | ~50 MB chunks      |
| **Total**                               | **24 sources** | **~742K records** | **~$540 one-time** | **~5.7 GB chunks** |

Storage at Supabase Pro: well within $25/mo plan.

Embedding cost on `voyage-3-large` (primary) @ $0.06/1M tokens. Cost
drops by half vs OpenAI text-embedding-3-large baseline. Voyage's
MTEB medical retrieval is top-3 globally — best-in-class quality at
half the price. Cohere embed-v4 (fallback) at $0.10/1M produces
similar accuracy. OpenAI text-embedding-3-large (last resort) at
$0.13/1M, truncated to 1024-dim to match schema.

---

## Deploy order (recommended)

1. **Apply migrations** 0101–0106 to remote DB (`supabase db push`)
2. **Set secrets** (one of the embedding keys is required):
   - `VOYAGE_API_KEY` (preferred — voyage-3-large @ 1024-dim, top MTEB
     medical retrieval, ~$0.06/1M tokens)
   - `COHERE_API_KEY` (fallback — embed-v4.0 @ 1024-dim, ~$0.10/1M)
   - `OPENAI_API_KEY` (last resort — text-embedding-3-large truncated
     to 1024-dim, ~$0.13/1M)
   - `OPENFDA_API_KEY` (optional, raises rate limit from 240 req/min)
   - `NCBI_API_KEY` (optional, raises PubMed rate limit)
3. **Deploy edge fn**: `supabase functions deploy core-source-sync`
4. **Tier 1 ingest** (cheap, full coverage):
   - `drugbank_open` — fastest, smallest
   - `pubchem` — drug structure context for cardiology drugs
   - `rxnorm` — drug nomenclature
   - `openstax` (bulk all 4 books) — A&P + Micro + Bio + Chem foundation
   - `livertox` (bulk) — full hepatotox book
   - `lactmed` (bulk) — full lactation book
   - `openfda` (bulk) — drug labels (heavy)
   - `dailymed` (bulk) — drug labels (heaviest)
   - `clinicaltrials` (cardiology query first)
   - `fda_orange_book`
5. **Tier 3 curated** (per-module guideline pages):
   - `ahrq` — comparative effectiveness reviews
   - `uspstf` — preventive recs
   - `nih_nhlbi` — heart/lung/blood
   - `va_dod` — pain, opioid, depression, diabetes CPGs
   - `fda_safety` — drug safety communications
   - `cdc_mmwr` — immunization, antimicrobial stewardship
   - `pharmgkb` — pharmacogenomics
6. **Tier 2 API** (per-module topic harvest):
   - `pubmed_oa` — landmark trials per drug class
   - `cdc` — curated public health pages
7. **Verify**:
   - Run `auditCitationResolution` on cardiology — expect >80% slot resolution
   - Spot-check 10 random cards: do citations resolve? Do retrieved chunks make sense?
   - Run pharmacy golden eval — expect quality lift vs. pre-ingest baseline

---

## Operational compliance

- **Annual NLM RxNorm usage report** — January each year. Track
  monthly request count.
- **DMCA takedown inbox** — `takedown@ascend.app`, 24-48hr response
  per TERMS.md
- **Quarterly source freshness audit** — re-fetch sources whose
  `retrieved_at` > 90 days; mark stale ones in admin queue
- **License-change monitoring** — annual check on PharmGKB, OpenStax,
  PubMed OA per-record licenses; some authors switch CC variants

---

## Last updated

2026-05-01 (Phase 7 corpus expansion). Update this file whenever a new
provider is added or a license posture changes.
