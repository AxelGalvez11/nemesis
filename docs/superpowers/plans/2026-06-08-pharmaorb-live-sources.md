# Live evidence sources — PubMed + ClinicalTrials on every query (2026-06-08)

**Owner decision:** every question searches the **library AND live PubMed AND live ClinicalTrials**,
always; PubMed + ClinicalTrials first. The cross-encoder reranker (PR1, #30) is the unifier — it
reads text, so it ranks a live PubMed abstract, a live trial summary, and a library chunk on one scale.

## Built + proven this session (no deploy)
- `supabase/functions/ask/live-sources.ts` — `gatherLiveCandidates({query})`: parallel, fault-tolerant
  (one source failing/timing-out → [] for that source, never sinks the answer), time-bounded
  (`LIVE_TIMEOUT_MS=4000`). Reuses the existing ingest providers (`fetchPubMedOA`, `fetchClinicalTrials`)
  so live + library share one shape.
- `eval/live-retrieval-demo.ts` — unified retrieval demo (library + live → rerank → top-K). Measured live:

| query | library / pubmed / ct candidates | live in top-12 |
|---|---|---|
| "latest cardiovascular outcomes for tirzepatide" | 30 / 4 / 0 | **3/12** (incl. 2024 CVOT summit @ #2) |
| "tirzepatide heart failure" | 30 / 10 / 10 | **12/12** (SUMMIT-HF emulation trial @ #1, 2025 reviews) |

The second case is the thesis in one line: on a recent/specific topic the library has nothing
competitive, and live search surfaces a dozen highly-relevant sources the app **could not cite today**.

## Architecture (the loop, every query)
1. **Library** — dense ANN over the embedded corpus (`match_core_source_chunks`), as today.
2. **Live** — `gatherLiveCandidates` → PubMed (E-utilities) + ClinicalTrials.gov v2, concurrently.
3. **Unify** — concat library chunks + live candidates; **rerank all together** (rerank-2.5) → top-K.
4. **Synthesize** — generate the cited answer over the unified top-K (existing `generate.ts`).
5. **Read-through-ingest (optional)** — persist live hits into the library so next time they're in the
   dense index AND have a real `source_id` for citations ("fetch once, keep forever").

## Production wiring (OWNER-GATED — edge code on the frozen-safety path, `supabase functions deploy`)
The plumbing exists; switching it on for real users is a `/ask` change. The work:
- **`ask/index.ts` / `ask/retrieve.ts`** — after the library `retrieve()`, call `gatherLiveCandidates`,
  merge, rerank, cut to `MATCH_COUNT`. (Add a rerank step to the production path — today rerank lives
  only in the eval harness; port `rerankRows` into a shared module.) Behind a `LIVE_SOURCES_ENABLED` flag.
- **ClinicalTrials query terms** — CT.gov term-search wants the **resolved drug/condition**, not the raw
  sentence (the demo's first query returned 0 trials; the drug-forward query returned 10). `/ask` already
  resolves the drug entity (`resolve.ts`) — feed that to CT, not the user's full question.
- **Citations for live sources** — `citation.ts` maps answer tags → retrieved chunks via `source_id`,
  which live hits don't have. Cleanest fix: **read-through-ingest first** (persist via `persist.ts` →
  real `source_id`/`chunk_id` → cite normally). Reuse `core-source-sync` (chunk → embed → upsert);
  license-gated to commercial-friendly (PubMed provider already filters to free-full-text + checks license).
- **Re-freeze the eval baseline** to the live+rerank engine once shipped.

## ⚠️ Safety: live sources CHANGE the refusal logic (the load-bearing decision)
Today "no source → refuse" = the dense cosine floor (>0.5). Once every query also searches live, that
floor is no longer the whole refusal signal: a query the library can't answer may now pull live results.
This collides directly with **today's adversarial-probes finding** (`eval/golden/adversarial-probes.json`):
a class-plausible fake drug ("zenelutide") already pulls real chunks past the cosine floor, and live
PubMed/CT could surface real *class* evidence for it too. So adding live sources **requires** moving
no-source / fabricated-drug refusal to an **answer-layer check** (does a real drug/entity actually exist
for this query? — `resolve.ts` is the natural home), not the retrieval floor. This is P2 work and must
land **with** the live-sources flip, not after. The frozen deterministic safety layer (preScreen /
detectViolations / professional-routing) stays in force around the whole loop.

## Cost / latency
Live adds the two API round-trips (parallel, ≤4s cap) + a larger rerank set. Mitigations: per-source
timeout, parallel fetch, and read-through-ingest (repeat queries hit the library, not the API).
PubMed E-utilities is free (NCBI_API_KEY raises limits); CT.gov v2 is free. Voyage rerank is sub-cent.
