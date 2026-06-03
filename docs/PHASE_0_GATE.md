# Phase 0 — Fork Gate Result

Date: 2026-06-03 · Branch: `phase-0-foundations` · Verdict: **PASS — reuse validated**

## What was tested

Go/no-go reuse smoke test (IMPLEMENTATION_PLAN.md §13): ingest one DailyMed lisinopril
label through the forked Layer-A pipeline, then query
`match_core_source_chunks("lisinopril contraindications")`. Run entirely on the local
Supabase stack (Docker); no cloud project touched.

## Results

**Pipeline, end to end: GREEN.**
- Migration separability: `0100→0101→0105→0106→0107` apply clean to a fresh Postgres.
  Required adding `0100_pharmabro_extensions.sql` — Ascend's migrations assume pgvector
  in the `extensions` schema; a fresh DB needs it installed there explicitly. (This was
  the one real portability defect, now fixed.)
- §6 dimension lock verified live: `embedding = vector(1024)`, match-fn arg
  `vector(1024)`, pgvector in `extensions`, RLS on both tables.
- DailyMed fetch → license gate (`nlm_public`) → `core_sources` upsert → section-aware
  chunk → embed (Voyage `voyage-3-large`, 1024-dim) → `core_source_chunks`: 39 chunks,
  all embedded, 0 errors.
- Query (`input_type=query`) → ANN search → join to license/provider/url: returns rows
  with `similarity`, `section`, `source_url`, `license`.

**Retrieval relevance: GOOD (judged by content, not the label field).**
Top 8 for "lisinopril contraindications":

| rank | sim | content |
|---|---|---|
| 1 | 0.761 | tablet appearance / imprint — noise |
| 2 | 0.738 | Hyperkalemia / cholestatic-jaundice monitoring (Warnings) |
| 3 | 0.723 | renal decline / hyperkalemia incidence |
| 4 | 0.715 | anaphylactoid reactions (LDL apheresis) |
| 5 | 0.694 | symptomatic hypotension post-MI |
| 6 | 0.689 | BOXED WARNING: fetal toxicity |
| 7 | 0.680 | NDC / bottle packaging — noise |
| 8 | 0.673 | potassium-sparing drug interactions |

Six of the top eight are clinical and on-topic. The explicit angioedema
"[see Contraindications (4)]" chunk is rank 9 (0.671). A naive top-k grounding would
cite correct warnings/interactions content.

## Known quality issues (Phase 1, not blockers)

1. **Section labels are wrong but cosmetic.** `chunking.ts SECTION_HEADING_RE` treats any
   all-caps line as a heading, so SPL ingredient/packaging lines ("FERRIC OXIDE YELLOW",
   "NDC …") become "sections." This does **not** affect ranking (the retriever orders by
   vector distance; `filter_section` is null). It will matter once the Ask router uses
   section for boosting/filtering — fix then.
2. **Packaging chunks intrude (ranks 1, 7).** Partly because this is a *repackager* SPL
   (packaging-heavy). Likely needs structured SPL (LOINC-coded) parsing in `dailymed.ts`
   (currently flattened text; "full XML parse deferred") and/or a light packaging filter
   or section-boosted hybrid retrieval. Re-test on a brand label + a few seed drugs.

## Verdict

**Reuse strategy: GO.** Every expensive, reusable piece works — providers, embedding with
fallback, license gate, retriever, schema, change detection, citations. The open items are
chunk/label quality, which would have to be built from scratch anyway. Nothing supports a
build-from-scratch pivot.

**Phase 1 first task:** corpus quality — structured SPL section parsing + retest retrieval
relevance on a brand label and a handful of seed drugs — *before* ingesting the
100-entity seed.
