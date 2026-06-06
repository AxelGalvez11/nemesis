# Runbook: Initial Corpus Ingest

Step-by-step ops guide for the first end-to-end ingest of Layer 1
authoritative sources into `core_sources` + `core_source_chunks`.

**Pre-requisites**:

- Supabase project with migrations 0101–0106 applied
- `VOYAGE_API_KEY` set in Supabase secrets (voyage-3-large @ 1024-dim,
  preferred). Or `COHERE_API_KEY` (fallback) or `OPENAI_API_KEY` (last
  resort) — embeddings.ts tries them in that order.
- Edge function `core-source-sync` deployed
- Service-role token available for triggering syncs (admin only)

**Out of scope**: PharmD reviewer pipeline (deferred), pricing UI
(deferred), bulk OpenFDA zip parsing (Node script TBD).

---

## Step 1 — apply migrations

```bash
cd /path/to/Ascend_StudyApp
supabase link --project-ref <your-project-ref>
supabase db push
```

Verify: `core_sources` + `core_source_chunks` tables exist; provider
enum has all 24 values; `core_source_chunks.embedding` is `vector(1024)`
(updated in mig 0107 from the original 1536-dim spec).

```sql
SELECT unnest(enum_range(NULL::core_source_provider));
```

---

## Step 2 — set secrets

Pick ONE embedding key (Voyage preferred):

```bash
# Preferred: Voyage AI — voyage-3-large @ 1024-dim
supabase secrets set VOYAGE_API_KEY=pa-...

# Fallback: Cohere — embed-v4.0 @ 1024-dim
# supabase secrets set COHERE_API_KEY=...

# Last resort: OpenAI — text-embedding-3-large truncated to 1024
# supabase secrets set OPENAI_API_KEY=sk-...

# Optional rate-limit raises
supabase secrets set OPENFDA_API_KEY=<optional>
supabase secrets set NCBI_API_KEY=<optional>
```

The embeddings.ts module tries Voyage → Cohere → OpenAI in order.
Set whichever you have. Verify present: `supabase secrets list`.

---

## Step 3 — deploy edge function

```bash
supabase functions deploy core-source-sync
```

Endpoint: `https://<project-ref>.supabase.co/functions/v1/core-source-sync`.

---

## MVP shortcut — focused 10-drug corpus

Before broader bulk expansion, run the focused public-web MVP corpus. This is
the fastest way to improve Ask, evidence briefs, drug workspaces, and watchlist
quality without attempting all-PubMed ingestion.

Dry-run the exact job list:

```bash
deno run --allow-net --allow-env --allow-read scripts/mvp-drug-corpus-ingest.ts --dry-run
```

Run against Supabase:

```bash
SERVICE_KEY="<service-role-key>" SB_URL="https://<project-ref>.supabase.co" \
  deno run --allow-net --allow-env --allow-read scripts/mvp-drug-corpus-ingest.ts
```

Project the ingested sources into the typed drug catalog:

```bash
SERVICE_KEY="<service-role-key>" SB_URL="https://<project-ref>.supabase.co" \
  deno run -A scripts/entity-link.ts
```

Seed drugs:

- atorvastatin
- metformin
- semaglutide
- isotretinoin
- sertraline
- omeprazole
- amoxicillin
- lisinopril
- hydroxychloroquine
- testosterone

Providers: RxNorm, OpenFDA, DailyMed, ClinicalTrials.gov, and targeted PubMed
OA query families for reviews/meta-analyses, randomized trials, recent safety,
interactions, and pharmacology.

---

## Step 4 — trigger Tier 1 bulk ingests (in order)

**Auth**: every call needs `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

```bash
SB_URL="https://<project-ref>.supabase.co/functions/v1/core-source-sync"
SR_KEY="<service-role-key>"

# 4a. DrugBank Open Data — fastest
# (Caller must pre-fetch the CSV from go.drugbank.com/releases/latest)
# See scripts/drugbank-open-csv-fetch.ts (TBD).

# 4b. PubChem — cardiology drugs first
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"pubchem","opts":{"names":["lisinopril","losartan","amlodipine","metoprolol","carvedilol","sacubitril valsartan","spironolactone","dapagliflozin","empagliflozin","atorvastatin","rosuvastatin","clopidogrel","ticagrelor","apixaban","rivaroxaban","warfarin","amiodarone"]}}'

# 4c. RxNorm — query expansion seeds
for drug in lisinopril metoprolol amlodipine atorvastatin metformin; do
  curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"rxnorm\",\"opts\":{\"name\":\"$drug\"}}"
done

# 4d. OpenStax — bulk all 4 books
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openstax","opts":{"bulk":true}}'

# 4e. LiverTox — full book
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"livertox","opts":{"bulk":true}}'

# 4f. LactMed — full book
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"lactmed","opts":{"bulk":true}}'

# 4g. OpenFDA — labels for cardiology drugs (per-query first; bulk via Node script later)
for drug in lisinopril losartan amlodipine metoprolol carvedilol "sacubitril valsartan" spironolactone dapagliflozin empagliflozin atorvastatin rosuvastatin clopidogrel ticagrelor apixaban rivaroxaban warfarin amiodarone; do
  curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"openfda\",\"opts\":{\"query\":\"openfda.generic_name:\\\"$drug\\\"\",\"limit\":5}}"
done

# 4h. DailyMed — same drugs
for drug in lisinopril losartan amlodipine metoprolol carvedilol; do
  curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"dailymed\",\"opts\":{\"drug_name\":\"$drug\",\"pagesize\":10}}"
done

# 4i. ClinicalTrials.gov — cardiology landmark trials
for query in "PARADIGM-HF" "DAPA-HF" "EMPEROR-Reduced" "ALLHAT" "ONTARGET" "RALES" "EPHESUS"; do
  curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"clinicaltrials\",\"opts\":{\"query\":\"$query\",\"pageSize\":5}}"
done
```

**Watch for**: each response should include `"ingested": N` and
`"chunk_count": N`. If 0/0 across the board, check OpenAI key + edge
function logs.

---

## Step 5 — trigger Tier 3 curated guideline ingests

```bash
# AHRQ comparative effectiveness reviews (uses default seed)
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"ahrq"}'

# USPSTF preventive recs
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"uspstf"}'

# NIH NHLBI heart/lung/blood
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"nih_nhlbi"}'

# VA/DoD pain, opioid, depression, diabetes
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"va_dod"}'

# FDA Drug Safety Communications
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"fda_safety"}'

# CDC MMWR
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"cdc_mmwr"}'

# FDA Orange Book hub
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"fda_orange_book"}'

# PharmGKB
curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"pharmgkb"}'
```

---

## Step 6 — Tier 2 PubMed harvest (cardiology)

```bash
for query in "lisinopril hypertension trial" "sacubitril valsartan PARADIGM" "dapagliflozin DAPA-HF" "spironolactone RALES" "atorvastatin primary prevention" "apixaban atrial fibrillation" "warfarin INR target"; do
  curl -X POST "$SB_URL" -H "Authorization: Bearer $SR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"pubmed_oa\",\"opts\":{\"query\":\"$query\",\"retmax\":10}}"
done
```

---

## Step 7 — verify ingest

```sql
-- chunk count per provider
SELECT s.provider, COUNT(c.id) AS chunks, COUNT(DISTINCT s.id) AS sources
FROM core_sources s
LEFT JOIN core_source_chunks c ON c.source_id = s.id
GROUP BY s.provider
ORDER BY chunks DESC;

-- spot-check: top similarity chunks for a known card
SELECT chunk_text, section, provider, similarity
FROM match_core_source_chunks(
  query_embedding := <embed("ACE inhibitor pregnancy contraindication")>,
  match_count := 5
);
```

Open `/admin/curriculum-audit` in browser and click "Run check". Expected
state after Step 7: cardiology citation resolution >70% (some slots may
not match if drugs aren't in the FDA label corpus yet).

---

## Step 8 — schedule periodic re-sync (pg_cron)

```sql
-- Once per week: re-fetch FDA labels (catches relabeling events)
SELECT cron.schedule('weekly-fda-resync', '0 3 * * 0', $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/core-source-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <service-role-key>',
      'Content-Type', 'application/json'
    ),
    body := '{"provider":"openfda","opts":{"query":"_exists_:openfda.brand_name","limit":50,"skip":<random offset>}}'
  );
$$);

-- Monthly: ClinicalTrials.gov refresh
-- Annual: RxNorm full re-pull (Jan, with NLM usage report)
```

---

## Failure modes + recovery

| Symptom                                        | Likely cause                                   | Fix                                                           |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `0 ingested, 0 chunks`                         | All embedding keys missing/invalid             | Set `VOYAGE_API_KEY` (or Cohere/OpenAI fallback), redeploy fn |
| `RPC match_core_source_chunks not found`       | Mig 0105 not applied                           | `supabase db push`                                            |
| `License does not allow commercial use` thrown | Provider returned record w/ unexpected license | Audit per-record license; tighten provider parser             |
| HTTP 429 from OpenFDA                          | Rate limit                                     | Add `OPENFDA_API_KEY` (raises to 120K req/day)                |
| Chunks stored but retrieval returns empty      | Embedding dim mismatch                         | Verify all chunks embedded at 1024-dim (mig 0107)             |

---

## Last updated

2026-05-01 — initial Phase 7 corpus runbook.
