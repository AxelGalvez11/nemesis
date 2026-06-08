# PharmaOrb — Evidence Backend Plan (OpenEvidence-parity → all-of-PubMed → hypotheses)

> **Status:** PLAN (awaiting build-start nod). Supersedes the *forward* portions of
> `2026-06-06-pharmabro-stack-integration.md` for backend priority. Frontend work is
> explicitly deferred until the engine clears the eval bar.

## Mission
The best evidence-RAG backend, **measurably on par with OpenEvidence**: plain-English
answers with **real, faithful citations**. MVP = "ChatGPT/Claude/Perplexity, but every
claim is backed by a real source." Arc: deepen corpus → **all of PubMed + open-access
journals** → **synthesize novel hypotheses + experimental groundwork**. Backend quality
is the gate before any new frontend.

## Decisions locked (owner, 2026-06-08)
- **Backend-first.** Web before mobile. No new frontend until the engine clears eval.
- **MVP corpus = PMC open-access full-text first** (~6M, highest value, fits pgvector+HNSW now),
  then PubMed abstracts (~37M) via baseline + daily update files.
- **Vector infra = Supabase Postgres + pgvector HNSW + halfvec quantization (+ partitioning).** ⚠️ CORRECTION (design pass): **pgvectorscale/StreamingDiskANN is NOT confirmed available on Supabase's managed image** — must verify `pg_available_extensions`. Scale path is HNSW + halfvec(1024) (4KB→2KB/row) + partitioning; pgvectorscale only if Supabase ships it or we self-host. Don't assert it as locked.
- **Hybrid retrieval = embedded RAG corpus + live API tools.** PubMed E-utilities + ClinicalTrials.gov v2
  are **agent-callable tools** for recency / precise filters / recall gaps; results read-through-ingest
  back into the corpus. Default synthesis runs off the corpus; never hostage to a live API call.
- **Agentic RAG with deterministic safety.** Router → tool-using retrieve/grade/retrieve loop
  (corrective/self-RAG) → synthesize with inline citations → faithfulness check. The **frozen
  deterministic safety layer wraps the loop**; the LLM never bypasses preScreen/detectViolations/
  professional-routing/refusals. Safety deterministic; retrieval/synthesis agentic.
- **Chats are first-class:** conversation-aware retrieval (thread context → query contextualization).
- **Projects workspace:** user-owned container grouping conversations + deliverables + tracked topics.
- **"Supremely good" is a number.** Eval harness is built FIRST; nothing ships unless its metrics hold/improve.

## The bar (eval-defined)
Skeptic owns a golden set (incl. an OpenEvidence head-to-head slice) + metrics:
recall@k, nDCG, MRR (retrieval); faithfulness (claim↔cited-chunk NLI support), answer-relevance,
groundedness (answers); multi-turn + freshness checks. Langfuse traces + CI regression gate.

## Gap vs the bar
| Area | Now | Target |
|---|---|---|
| Eval | manual validate scripts | golden set + metrics + faithfulness + CI + OE head-to-head |
| Retrieval | single-stage cosine top-8 ≥0.5 | hybrid dense+sparse (RRF) + Voyage rerank-2 + MeSH/PICO query understanding |
| Citations | existence-checked | NLI faithfulness per claim (deferred Phase-3.5) |
| Index | ivfflat lists=100 | HNSW now → pgvectorscale for 10M–1B |
| Corpus | 3,011 entities / 4,162 chunks | PMC-OA ~6M → PubMed ~37M (baseline + daily) |
| Answers | structured, non-streaming | streaming + multi-hop/agentic + conflict synthesis (tier-weighted) |
| Chats | data layer only | conversation-aware retrieval |
| Projects | none (saved_reports exists) | projects workspace + RLS + entitlements |

## The 3-agent team
| Agent | Owns | Frozen / off-limits | Model |
|---|---|---|---|
| **Librarian** (Corpus/Ingestion) | PubMed/PMC/journal bulk pipeline (download→parse→chunk→embed→dedup/supersede→incremental); index scaling (HNSW, pgvectorscale, partitioning); license enforcement; **chats/projects data model + RLS + entitlements** | `/ask` answer contract; safety layer; evidence-tier engine internals | Opus→Sonnet |
| **Answer Engine** (Retrieval/Synthesis) | hybrid retrieval + RRF; reranking; query understanding; **agentic loop + live-API tools**; conversation-aware retrieval; generate+enforceCitations; **NLI faithfulness**; streaming | deterministic safety layer (`safety.ts`/`templates.ts` frozen); tier-engine internals | Opus |
| **Skeptic** (Eval/Quality) | golden dataset; retrieval+answer metrics; faithfulness; multi-turn+freshness; **OE head-to-head**; regression CI; phase sign-off | n/a — the gate, owns no feature code | Opus/Sonnet |

Orchestration: owner + lead sequence + own prod deploys; Skeptic gates every phase. Each agent
gets a context pack: §8 API contract, frozen-safety rules, file map, `supabase functions deploy --use-api`
rule, anon-REVOKE security rule, the cloud project ref `qyjmivntajbigjswhahb`.

## Phases (Skeptic gates each)
- **P0 — Eval harness first.** Golden Q→source/answer set + OE slice; metrics + Langfuse + CI. Exit: a baseline number for today's engine.
- **P1 — Retrieval quality.** HNSW; hybrid dense+sparse + RRF; Voyage rerank-2; MeSH/PICO. Exit: recall@k + nDCG ↑ vs P0.
- **P2 — Citation faithfulness.** NLI support per cited claim; flag/refuse unsupported sentences. Exit: faithfulness ≥ target.
- **P3 — Agentic answer engine.** Router + tool loop (vector_search/pubmed_search/clinicaltrials_search/get_entity_evidence/rerank); corrective/self-RAG; conversation-aware retrieval; streaming. Exit: MVP cited-answer quality, eval-proven; safety guardrail suite still green.
- **P4 — Scale ingestion.** PMC-OA bulk (AWS Open Data) → embed → pgvectorscale; PubMed baseline + daily updates; dedup/supersession. Exit: corpus at millions; latency + recall hold.
- **P5 — Projects + deliverables.** projects schema + memberships + RLS + entitlements; briefs/overviews/comparisons saved into projects.
- **P6 (future) — Hypothesis synthesis.** Literature-based discovery over the evidence graph (gap-finding, ABC-model link prediction) + experimental-design scaffolding.

## Risks
- **Cost (HIGH):** embedding 37M abstracts — mitigate PMC-first, int8/binary quantization, lite-vs-large tiering.
- **Index scale (MED):** validate pgvectorscale early.
- **Faithfulness latency (MED):** batch + cache NLI.
- **Safety drift (MED):** widening corpus widens answer surface; guardrail suite + safety layer must grow with it.

## Non-goals (for MVP)
New mobile work; hypothesis synthesis (P6); any net-new frontend beyond what the engine strictly needs.

## Execution sequence (from the 3-agent design pass, 2026-06-08)
The three agents converged on this order (each PR is gated by the Skeptic's metrics):

1. **PR0 — Eval harness FIRST (Skeptic).** Golden set (corpus-relative, keyed on `core_sources(provider, provider_id)` = PMID/NCT/SPL) + a cheap deterministic retrieval harness (`recall@k`/`nDCG`/`MRR` via `match_core_source_chunks`, no LLM/quota) + committed baseline artifact + `eval.yml` (enterprise-grant pattern to dodge the 429 quota false-fail). LLM-judge answer/faithfulness suite scaffolded, gated later. **Exit: a committed baseline number for today's engine.** *Without this, nothing else is measurable.*
2. **PR1 — ivfflat→HNSW index (Librarian).** Drop ivfflat, create HNSW(m=16, ef_construction=64) on `core_source_chunks`; `CREATE OR REPLACE match_core_source_chunks` adding tunable `hnsw.ef_search`; **re-REVOKE EXECUTE FROM anon+PUBLIC in the same migration** (drop/recreate re-triggers Supabase's anon default-grant). Measured ≥ ivfflat baseline. Keeps float (single-variable measurement); halfvec is PR-later.
3. **PR2 — Hybrid + rerank (Answer Engine).** Add STORED `tsvector` + GIN; new `hybrid_match_core_source_chunks` RPC fusing dense ANN + FTS via in-SQL RRF (k=60), **dense cosine stays the SOLE no-source refusal signal** (AC3 preserved by construction); Voyage rerank-2 over fused top-K behind `RERANK_ENABLED`. Measured vs PR1.
4. **P2 faithfulness → P3 agentic loop + conversation-aware + streaming → P4 scale ingest (PMC→PubMed) → P5 projects.**

### Cross-agent contracts (the load-bearing interfaces)
- **Gold label** (all): golden `expected_sources` keyed on `core_sources UNIQUE(provider, provider_id)`, resolved to `source_id` at eval time; ingest/supersession changes must reflect in the golden set.
- **Retriever** (Answer Engine → Skeptic): any retriever change must keep a path returning ranked `(chunk_id, source_id)` so `retrieval-eval` scores it; PR1/PR2 measured through the same harness.
- **Faithfulness tag→chunk_id** (Skeptic → Answer Engine, BLOCKS P2): `Citation` has `chunk_tag`+`source_id` but no `chunk_id`/text; trace `retrieval_scores` has `chunk_id` but no tag. Strict per-citation faithfulness needs the Answer Engine to **persist an explicit `{tag→chunk_id}` (or cited chunk text)** in the trace/response. Until then only context-level groundedness is computable.
- **CI auth/quota** (shared): every `/ask`-exercising job mints an ephemeral confirmed user, grants it an `enterprise` subscription (1000/day) before running, paces ~2s, tears down (cascade). Retrieval-only jobs skip the grant.
- **Index ownership** (Librarian ↔ Answer Engine): Librarian owns the `core_source_chunks` index/data-model (PR1 HNSW); Answer Engine builds the hybrid RRF RPC + FTS on top (PR2) — sequence PR1 before PR2 to avoid colliding migrations on the same table.
- **Safety boundary** (do-not-touch): eval/retrieval READ the frozen safety layer (import `detectViolations`) but never modify `safety.ts`/`templates.ts` or the deterministic tier engine. guardrail.yml = safety gate; eval.yml = quality gate — complementary.

### Open decisions for the owner
- **Scale infra:** accept HNSW + halfvec + partitioning on Supabase (recommended) vs hold for pgvectorscale (needs Supabase to ship it / self-host). Verify `pg_available_extensions` on the cloud project.
- **FTS config:** `english` (stemming, prose recall) vs `simple` (preserves drug codes like BPC-157) vs hybrid/custom dictionary — decide via a small recall experiment on the golden set. *Lean hybrid.*
- **Golden-set authorship:** harness-drafts from the corpus + flagged "needs expert review", with the OpenEvidence head-to-head slice expert-reviewed first. Owner to confirm the review bar.
- **Judge + thresholds:** judge model for faithfulness/relevance (engine is on OpenAI gpt-4.1-mini); P0 gates on "no regression vs committed baseline within tolerance," absolute floors set at P1.
- **Projects entitlements:** `project_count` per plan (free/plus/pro/professional/enterprise) — owner sets the numbers; schema/trigger are plan-agnostic.
