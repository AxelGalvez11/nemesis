# Deep Research engine — design

**Date:** 2026-06-10
**Status:** Engine built + unit-tested locally. HTTP endpoint, async run, persistence, Pro gating, and
frontend are a **separate, owner-gated deploy** (new edge function + a `research_report_runs` migration).

## What this is

Deep Research is the first "research mode": instead of a single chat answer, the user gets a **saved,
cited REPORT** built by a multi-step pipeline. It is the trustworthy, premium (Pro-gated) feature the
modes roadmap is built around. Literature Review and Meta-Analysis modes reuse this same shape later.

## Non-negotiable: preserve the frozen guarantees

The /ask answer engine has a deterministic safety layer that must never be bypassed: a pre-screen
(regex) before any LLM, an LLM safety classify, and a post-generation forbidden-string scan
(`detectViolations`). It also guarantees **one citation namespace** and **one safety scan** per
synthesized answer.

Deep Research reuses that exact machinery. It does **not** use open-ended agent loops, which would
fan out into many independent generations — breaking the one-scan / one-namespace guarantee. Instead it
scales up the proven `/ask` `augmentWithLive` shape (parallel gather → merge → rerank → **one**
generate) to produce a multi-section report from a single synthesis.

## Pipeline

`runResearch(question, cfg)` in `supabase/functions/ask/research/orchestrate.ts`:

1. **preScreen** (frozen, no LLM) — emergency / sourcing short-circuit to a template report.
2. **classify** (frozen LLM safety routing) — emergency/overdose/self-harm/sourcing flags also
   short-circuit, exactly as /ask does.
3. **plan** (`plan.ts`) — one cheap LLM call decomposes the question into 3–6 self-contained
   sub-questions. Pure `normalizeSubQuestions` clamps/dedupes; **degrades to `[question]` on any
   failure** (planning is non-load-bearing — it shapes retrieval, it asserts nothing).
4. **gather** (bounded parallel, one task per sub-question) — recall-first broad dense `retrieve()`
   (no provider/entity filter) + flag-gated live sources (PubMed/EuropePMC/CT/openFDA/FAERS),
   **reranked against that sub-question**, top-M kept. Fault-tolerant: a weak sub-question never sinks
   the run.
5. **merge** (`mergeEvidence`, pure) — round-robin across the per-sub-question lists, dedupe by
   chunk identity, cap at K, assign **one** `1..N` citation namespace.
6. **synthesize** (`synthesize.ts`) — **one** generation produces summary + sectioned body +
   uncertainties + safety notes + evidence grade, all citing the single namespace. System prompt
   reuses the **exact frozen HARD RULES** (`BASE_GENERATE_SYSTEM`, now exported — text unchanged, so no
   prompt-version bump).
7. **safety scan** (`detectViolations`, frozen) — **one** scan over the whole assembled report. A
   violation discards the synthesis → conservative `safety_fallback` template report.
8. **enforce + faithfulness** (`faithfulness.ts`) — deterministic citation **existence** check (drop
   body/safety points whose tags aren't real), then a **semantic-support judge** that drops claims a
   cited source does not actually back. This is the NLI/2nd-pass verifier `citation.ts` explicitly
   defers — it is the "trustworthy core" differentiator.
9. **assemble** → `ResearchReport` (shared contract, `packages/shared/src/research.ts`).

## Three decisions (from architecture review)

1. **Flat synthesis schema + large `max_tokens`.** A report is several times bigger than a single /ask
   answer (whose tool JSON truncated at 2048, ships at 4096). Synthesis uses `max_tokens: 8192` and a
   **flat** `points[]` wire schema (each point labeled with its section heading), reassembled into
   `ResearchSection[]` in pure code (`assembleSections`). Flat-as-`compose_answer` avoids the nesting
   depth where structured-output reliability drops.

2. **Rerank per sub-question, then merge — not a global rerank against the original question.** A
   global rerank against the broad original favors its dominant facet and can starve a narrow
   sub-question's best evidence, collapsing the report back to one facet. Each sub-question is reranked
   against itself; `mergeEvidence` then round-robins so every sub-question contributes its top hit
   before any contributes a second (a sub-question only goes unrepresented if all its evidence is
   duplicated by others — i.e. no information lost).

3. **Faithfulness failure is marked, never silent.** `claims_verified` is true **only** when the judge
   returned a verdict for every judged claim *and* the summary held (`isFullyVerified`). A judge error,
   an under-emitted (partial) response, or a flagged summary all set `claims_verified=false` with an
   explicit caution appended to `uncertainties`. The summary (the headline sentence) is judged too —
   against the chunks the body cites — but is never pruned; an unsupported summary just forces the
   unverified mark. The deterministic safety scan and citation existence check always ran, so an
   unverified report is a trust-transparency state, not a safety hole.

### Reviewed divergences from /ask (deliberate)

- **No evidence-grade ceiling.** `/ask` applies a deterministic §9 tier ceiling only when it resolves a
  *single* drug entity; for multi-entity queries it ships the model's self-grade. Deep Research never
  resolves a single entity (broad recall-first retrieval), so it is always in the multi-entity case
  where `/ask` also ships the model grade — parity, not an omission. Adding a single-drug ceiling would
  require entity resolution in the research path; deferred.
- **Safety scan covers model-authored section headings**, which `/ask` does not need (its section names
  are fixed). Headings reach the client, so they are included in the one `detectViolations` scan.

## Files

- `packages/shared/src/research.ts` — `ResearchReport` / `ResearchSection` / `ResearchProgressStep` /
  `ResearchRunStatus` contract (additive; re-exported from `index.ts`).
- `supabase/functions/ask/research/plan.ts` — sub-question planner + `normalizeSubQuestions`.
- `supabase/functions/ask/research/synthesize.ts` — `REPORT_TOOL`, report system prompt,
  `synthesizeReport`, `assembleSections`.
- `supabase/functions/ask/research/faithfulness.ts` — `enforceReportCitations`, `collectClaims`,
  `applyVerdicts`, `checkFaithfulness`, `FAITH_TOOL`.
- `supabase/functions/ask/research/orchestrate.ts` — `runResearch` + pure helpers (`mergeEvidence`,
  `buildCitations`, `assembleReport`, `hasSupportedContent`).
- `supabase/functions/ask/research/research.test.ts` — 19 unit tests over the pure helpers.
- `supabase/functions/ask/prompts.ts` — one-line additive `export` of `BASE_GENERATE_SYSTEM`.

## Verification

- `deno check supabase/functions/ask/research/*.ts` — clean.
- `deno test --allow-env supabase/functions/ask/` — 286 passed / 0 failed (23 new; frozen safety suite
  untouched). Pure helpers only: `mergeEvidence`, `enforceReportCitations`, `applyVerdicts`,
  `isFullyVerified`, `assembleSections`, `buildCitations`, `assembleReport`, `normalizeSubQuestions`.
- `apps/web` `tsc --noEmit` — clean (additive shared export).
- **End-to-end smoke** (real OpenAI + Voyage rerank + Supabase corpus, live sources off): question "what
  is tesamorelin and is it safe for humans?" produced a real, non-template report — 6 planned
  sub-questions, 5 short-labeled cited sections (9 body points), 8 citations (openFDA / ClinicalTrials /
  RxNorm), evidence_grade `strong`, `claims_verified=true`. Confirms all three new tool schemas
  (`PLAN_TOOL`, the flat `REPORT_TOOL`, `FAITH_TOOL`) round-trip through real models — the failure mode
  the pure-helper tests cannot see. (Network surfaces `retrieve`/`rerank`/`gatherLiveCandidates` are
  reused verbatim from the proven /ask path.)

## Gated deploy (NOT done — needs owner OK)

- `research_report_runs` migration (ledger row: status, progress steps, the saved report jsonb).
- HTTP endpoint (`/research`) + async/background execution writing progress steps for live UI.
- Pro entitlement gating (`deep_research_daily_limit`).
- Frontend: a "Deep research" mode toggle, the live-progress panel, and report rendering (reusing the
  chat-persistence saved-revisitable-object pattern).
