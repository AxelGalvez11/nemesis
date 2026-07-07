# Competitive-Parity Implementation Plan

_Created 2026-07-03. Source of truth for the gaps: [`docs/research/competitor-ui-feature-synthesis.md`](../../research/competitor-ui-feature-synthesis.md). Grounded against the live codebase (`supabase/functions/ask/`, `packages/shared/src/`, `apps/web/`) and the prior feature audit (`docs/EVIDENCE_OS_FEATURE_AUDIT.md`)._

## North star (owner, 2026-07-03)

**PharmaOrb = the ChatGPT + Manus _shell_ (UI/UX) wrapped around the Consensus + Elicit + Scite + NotebookLM _tools & engine_, on top of our own evidence engine + safety.**
- **Shell / feel:** ChatGPT's clean chat + workspace, plus Manus's agent/plan/scheduled framing.
- **Composer tools:** every competitor's chat-bar power — Corpus switch (All / Medical / My Library), quality filters, attachments/import, mode + tool launcher.
- **Engine / deliverables:** our graded evidence + per-claim honesty + monitoring, plus the copied tools (per-paper detail, deliverables studio, supported/disputed, meter, research map).

This reframes the plan into two tracks that run together: an **Engine/Tools track** (WS-1…8, below) and a **Shell/UX track** (WS-9, WS-10, added below).

## Plain-English goal (for the owner)

The teardown found we win on the hard, invisible half (real graded evidence, per-claim honesty, safety, monitoring) and have already built more of the workspace than we gave ourselves credit for (evidence map, projects, Word/PPT/PDF reports). This plan closes the three places a rival is genuinely ahead — **per-paper evidence detail (Consensus)**, **media deliverables like audio/flashcards/quizzes (NotebookLM)**, and **a "does the evidence support this claim, yes or no" split (Scite)** — and then builds the one thing *nobody* has: a **living claim page** that keeps a verdict up to date as new evidence lands. Everything here bolts onto machinery we already run; none of it is a rebuild.

## Non-negotiable constraints (carried from prior work — every workstream must honor these)

1. **Honesty doctrine.** Scores, states, verdicts, and pooled stats are computed in **deterministic code**. The LLM may only write rationale or transcribe numbers that were re-grounded. Never let an LLM vote-count or guess a grade. (See `evidence-scoring.ts`, `evidence-grade.ts`, `forbidden-phrases.ts`.)
2. **Frozen safety layer.** Do **not** touch the deterministic safety scan / emergency routing (`ask/safety.ts`, the single per-request safety pass). New features read its output; they don't alter it. One safety scan, one citation namespace per turn.
3. **No overclaim guardrails stay.** `forbidden-phrases.ts` blocks PRISMA/risk-of-bias/causation overclaims; FAERS stays "signal not proof." New surfaces respect these.
4. **Deploy is owner-gated.** Edge-function deploys and schema migrations ship only on an explicit owner "go." Function deploys before the web that binds to them.
5. **Frozen answer path is byte-stable.** Changes are additive; existing `/ask` answer output stays identical unless a workstream explicitly changes it (and then guardrail 48/48 must re-pass post-deploy).

## Model assignment (orchestration)

Fable 5 orchestrates and reviews. Implementation is delegated:
- **Opus 4.8** — schema/migrations, the conclusion engine, evidence-against partitioning, per-paper grader (deterministic logic where a wrong call is a trust failure).
- **Sonnet 5** — UI surfaces, deliverable renderers, composer controls, provider integrations, tests.
Each task below carries a suggested model.

---

## Phase 1 — Per-paper trust + transparency (cheap, high-trust, independent)

_These four ship independently, each behind a flag, each additive to the existing answer. Highest trust-per-day-of-work. Do these first._

### WS-1 · Per-paper evidence intelligence  ⟶ _Opus 4.8 (grader) + Sonnet 5 (panel)_
> **Progress (2026-07-03):** Blueprint at `docs/superpowers/sdd/2026-07-03-ws1-per-paper-intelligence.md`. **Slice A COMPLETE + verified** — branch `feat/ws1-per-paper-intelligence` off `main`, commit `7af99a0` (not pushed). New pure `packages/shared/src/paper-quality.ts` (deterministic Q1–Q4 tier from OpenAlex `2yr_mean_citedness`; DOAJ/OA are positive-only modifiers) + gated OpenAlex step-2 fetch in `enrich-source/providers.ts` behind `WS1_PER_PAPER`. Tests: paper-quality 9/9 · providers 19/19 · enrich-source suite 32/32 · shared suite 224/224. Leak check `grep paper-quality supabase/functions/ask/` = **zero** (tier never reaches the answer path). Not deployed (owner-gated). Finding: the verbatim supporting quote (goal b) + citation count already ship — only the tier was net-new. **Slice B COMPLETE + verified** — commit `63c680c` on the same branch (`feat/ws1-per-paper-intelligence`, now 2 ahead of `origin/main`). Added: journal-tier pill (Q1–Q4, hidden for unranked) next to the cited-by chip + a per-source "Supporting quote" `<details>` expander, both gated on `NEXT_PUBLIC_WS1_PER_PAPER`. Only `apps/web/` touched (env.ts, enrichment.ts, cite.ts, ask/page.tsx, EvidencePanel.tsx, shell.css); `tsc --noEmit` clean; flag-off render byte-identical; nothing under `ask/` or ranking touched. **OPS gotcha:** two flags to enable — server `WS1_PER_PAPER=on` (Deno) + client `NEXT_PUBLIC_WS1_PER_PAPER=true` (Next). Not deployed. Slice C = display-only quality filter (folds into WS-3). **WS-1 is ready to PR (owner-gated push).**
**Gap:** Consensus shows journal quality (Q1 SJR), citation counts, influential-citation counts, and **verbatim supporting quotes** per source. We show type/design/n/cited-by but not quality tier or quotes.
**Attaches to:**
- `packages/shared/src/evidence-scoring.ts` (per-*entity* today) + `study-type.ts` → add a **per-paper** signal object: population match, per-paper n, endpoint quality (surrogate vs clinical), journal tier, citation count.
- `supabase/functions/ask/source-support.ts` + `support-span.ts` (already compute claim↔source support) → extend to emit the **verbatim supporting quote span** per cited claim (this is the Consensus "5 supporting quotes" feature; the span machinery already exists).
- `supabase/functions/enrich-source/` (trust layer, shipped) → add **journal-quality** enrichment from **OpenAlex** (host_venue, is_oa, cited_by_count) — CC0, free — and map to a Q1–Q4-style tier deterministically. No SJR license needed; OpenAlex + DOAJ (`ask/doaj-registry.ts` already present) cover it.
- `apps/web/components/EvidencePanel.tsx` → render per-paper badges (tier, cited-by, "N supporting quotes" expander showing the grounded span).
**Deterministic rule:** tier and counts come from OpenAlex fields; the "supporting quote" is the actual source span, not an LLM paraphrase. No LLM grading.
**Acceptance:** each cited source in the panel shows a quality tier + citation count + at least one verbatim grounded quote; frozen answer text unchanged; guardrail 48/48.

### WS-2 · Surface the sub-queries  ⟶ _Sonnet 5_
**Gap:** Elicit/Consensus show "we ran these 6 searches." We run multi-query retrieval internally but only show a generic "Thought through evidence" trail.
**Attaches to:**
- `supabase/functions/ask/retrieve.ts` + `search-query.ts` (multi-query already happens) → include the executed sub-queries + per-query hit counts in the `/ask` response payload (additive field).
- The answer's reasoning-trail UI (the "Thought through evidence" expander in the ask page) → render the sub-query list with counts, mirroring our own Reports "5 sub-questions" pattern.
**Acceptance:** expanding the trail shows the real sub-queries and hit counts; no change to the answer body.

### WS-3 · Evidence-quality filters  ⟶ _Sonnet 5_
**Gap:** Consensus has a filter drawer (journal rank, min citations, exclude preprints, Medical mode, methodology). Our "+" tools menu has News/Communities filters but no quality filters.
**Attaches to:**
- `supabase/functions/ask/retrieve.ts` + `rerank.ts` → accept optional filter params (min citations, exclude preprints, journal tier floor, study-type floor) applied pre-rerank. Metadata already available after WS-1.
- The composer "+" tools menu (ask page) → add a **"Highest-quality sources" / Medical mode** toggle + an advanced filter sheet. Keep it simpler than Consensus (one toggle first, drawer later).
**Depends on:** WS-1 metadata.
**Acceptance:** toggling "highest-quality" measurably narrows the pool to top-tier sources; default (off) leaves current behavior byte-identical.

### WS-4 · Claim → meter conversion  ⟶ _Sonnet 5 (+ Opus 4.8 for the classifier rule)_
**Gap:** Consensus, on a non-yes/no question, *offers* to convert it into a measurable yes/no claim to run its meter. Our per-claim confidence meter and "Verify a claim" intent exist but we don't coach the user toward a measurable claim.
**Attaches to:**
- `supabase/functions/ask/classify.ts` / `query-understanding.ts` → detect when a question is open-ended (not directional) and generate 1–3 candidate yes/no reframings (deterministic template + light LLM phrasing, re-grounded).
- Ask page → render the reframings as suggested-action chips that route into the existing "Verify a claim" flow.
**Acceptance:** asking "what is retatrutide" surfaces a chip like "Verify: Does retatrutide improve HbA1c in T2D?" that runs the confidence-meter path.

**Phase 1 exit:** four flags, each deployable alone, each with guardrail 48/48 re-run. This is the "catch and pass Consensus on trust surface" phase.

---

## Phase 2 — Media deliverables shelf (the most visible deficit)

### WS-5 · Deliverables Studio on every Report  ⟶ _Sonnet 5 (renderers) + Opus 4.8 (structured extractors)_
**Gap:** NotebookLM turns one corpus into audio, video, slide deck, mind map, flashcards, quiz, infographic, data table. We have document deliverables (Word/PPT/PDF + citation styles) but no **media** deliverables.
**Attaches to:**
- `apps/web/components/ResearchReportView.tsx` + `apps/web/app/app/reports/[id]` → add a **"Studio" shelf** next to the existing export buttons.
- `packages/shared/src/research.ts` + `meta-abstract.ts` (report structure already computed) → feed the same grounded report object into new renderers. **Reuse, don't re-retrieve.**
- New deterministic extractors (Opus): **flashcards** (claim → Q/A from graded facts), **quiz** (MCQ from the evidence table + gaps), **mind map** (entity/mechanism/trial/safety tree — we already build this data for the answer), **data table** (PICO+result+limitations — the meta-mode `MetaStudyCharacteristics` pattern already exists).
- **Audio overview** (Sonnet): script generated from the grounded report (LLM writes prose from real numbers only), rendered via a TTS provider. Start with audio + mind-map + flashcards + quiz (highest value / lowest risk); defer video + infographic.
**Honesty note:** every media artifact is generated from the **already-grounded report object**, so no new un-cited claims can appear. Flashcards/quiz answers carry their source.
**Sequencing:** ship **mind map + flashcards + quiz** first (pure structure over existing data, no new provider), then **audio** (needs TTS provider — owner cost decision), then **video/infographic** last.
**Acceptance:** any Report yields a mind map, a flashcard deck, and a quiz derived from its cited evidence; each item traces to a source.

---

## Phase 3 — The keystone + the map (defensible whitespace)

### WS-6 · Supported-vs-disputed (evidence-against set)  ⟶ _Opus 4.8_
**Gap:** Scite classifies citations as supporting / mentioning / contrasting. Our audit calls the evidence-against set the "keystone" gap. The `conflicting` gap type is declared but never emitted.
**Attaches to:**
- `packages/shared/src/claim-relation.ts` (**already exists**) + `supabase/functions/ask/source-support.ts` → partition cited sources into **supports / neutral / disputes** the answer's key claims, deterministically from the support spans (does the span affirm or contradict the claim direction).
- `packages/shared/src/answer.ts` → actually emit the `conflicting` gap; `EvidencePanel.tsx` → show a supports/disputes split.
**Honesty note:** classification is from grounded spans, not an LLM opinion; when direction is ambiguous, it stays neutral (never forced).
**Depends on:** WS-1 (span quotes make the disputes legible).
**Acceptance:** an answer with mixed literature shows a real "disputes" column with grounded quotes; a one-sided topic shows none (no fabricated conflict).

### WS-7 · Living claim page (THE keystone — nobody else has this)  ⟶ _Opus 4.8_
**Gap:** No competitor fuses a **directional verdict** (likely / unlikely / mixed / unknown + confidence) with **live monitoring** that updates it in place. We have both halves separately (Reports = static, Monitoring/Missions = live) but no persisted claim object joining them.
**Attaches to:**
- **New migration:** a `claims` entity — text + linked drug/class entities + evidence sources + a **conclusion** (direction + confidence, distinct from evidence-strength) + grade history. Owner-gated.
- `packages/shared/src/science-state.ts` + `evidence-grade.ts` + `answer.ts` → a **conclusion engine**: combine science-state (well-studied/emerging), evidence-grade (strength), and the WS-6 supports/disputes split into a **directional verdict**. Deterministic; the LLM writes the rationale only.
- `packages/shared/src/watch-detect.ts` + Missions (`missions.ts`, live) → when monitoring finds new evidence for a claim, **re-run the conclusion engine and update the claim in place**, recording what changed ("was mixed → now likely").
- `apps/web/app/app/reports/[id]` + `WatchDetail.tsx` → a **merged living-claim surface**: the verdict, the evidence-for/against, the grade, and a "what changed" timeline.
**Depends on:** WS-6 (evidence-against) + WS-1 (per-paper). This is the capstone.
**Acceptance:** a claim page shows a directional verdict with confidence + evidence-for/against; adding a watch to it and simulating a new high-tier study flips/updates the verdict in place with a logged diff.

### WS-8 · Citation-network Research Map  ⟶ _Sonnet 5 (graph) + Opus 4.8 (relationship data)_
**Gap:** ResearchRabbit/Consensus show a citation-network graph; Obsidian is the owner's north-star visual. We have a strength×recency Evidence Map but no citation network.
**Attaches to:**
- Source metadata + OpenAlex references/citations (from WS-1 enrichment) → build a claim/paper relationship graph, scoped to a **Project** (Projects is live).
- New graph component (reuse a lightweight force-graph lib, self-contained) as a **Project tab** and/or a third tab beside Sources/Map in `EvidencePanel.tsx`.
**Depends on:** WS-1 metadata; Projects (live).
**Acceptance:** a Project renders a navigable citation graph of its sources; clicking a node opens the source (matching our existing "click a dot" Map interaction).

---

---

## Shell / UX track (added on owner direction 2026-07-03)

_This is the "ChatGPT + Manus shell with everyone's composer tools" half of the north star. It runs alongside the engine track. Both WS-9 and WS-10 are UI-led → each starts with a **design pass** (frontend-design skill + plan-design-review) before code, because getting the feel right is the point._

### WS-9 · Unified composer / chat-bar tools parity  ⟶ _design pass → Sonnet 5 (UI) + Opus 4.8 (retrieval params)_
**Goal:** one composer that matches or beats every competitor's chat bar. Supersedes/absorbs WS-3.
**Controls to build (sourced from the teardown):**
- **Corpus switcher** (Consensus) — a first-class dropdown: **All literature / Medical-only** (top journals + guidelines, via WS-1 tier + study-type) **/ My Library** (user's saved papers/uploads). Default All.
- **Quality filter drawer** (Consensus) — journal rank Q1–Q4 (uses WS-1 `journal_tier`), min citations, exclude preprints, study-type floor, date range, open-access. **Display/retrieval-filter only — never re-weights the cited set silently; the applied filter is shown.**
- **Attachments / import** (Consensus/NotebookLM/ResearchRabbit) — upload PDFs, import by DOI/PMID/BibTeX/**Zotero**, and use **saved collections / a Project** as grounding context. (Ties to PDF-ingestion, audit item #3.)
- **Tool + mode launcher** — consolidate our scattered chips (Verify a claim, Deep research, Monitor, Compare, Find gaps) + Fast/Thorough/**Deep** into one clean "+" launcher with the Elicit-style workflow modes (Find papers / Chat with papers / Extract data).
**Attaches to:** `supabase/functions/ask/retrieve.ts` + `rerank.ts` + `search-query.ts` (accept corpus + filter params, already partly there from WS-3 design), the composer in `apps/web/app/app/ask/page.tsx`, WS-1 metadata.
**Constraint:** filters change *what is retrieved/shown*, not the safety scan or the deterministic grade. Default (no filter) = current behavior byte-identical.
**Effort:** M–L. **Ships behind a flag.**
> **Progress (2026-07-03):** **Slice 1 (Playbooks in the composer launcher) COMPLETE** — branch `feat/shell-ux-parity`, commit `c2ef65e`. Added the one-click recipes (Evidence brief, Deep-check a claim, Compare two treatments, Find the research gaps) into the composer `+` tools menu so they're reachable mid-thread, not just on the welcome screen. Reuses `lib/playbooks.ts` PLAYBOOKS + the same `setMode`/`setQuestion` behavior; pure frontend, no engine change, all functional (no "Soon"). `tsc` clean, only `ask/page.tsx` touched. **Slice 2 (Corpus switcher preview) COMPLETE** — commit `4e7d0b6`. Consensus-style Corpus dropdown (All literature · Medical · My Library) left of the textarea, reusing the `.mode`/`.acct-menu` idiom (no new CSS); only "All" selectable, Medical/My-Library honest "Soon"; gated on `NEXT_PUBLIC_WS9_COMPOSER`; composer byte-identical when off. `tsc` clean. **Next composer slices are now BLOCKED on the WS-3 retrieval backend** (Corpus scoping + quality-filter params consumed pre-retrieval) — an engine change, owner-gated. Remaining pure-frontend composer polish (the filter-drawer UI in preview) has diminishing value until WS-3 lands. **Recommend: push branches + preview the 4 built features before more preview UI or the WS-3 engine slice.**

### WS-10 · App-shell UI/UX parity — ChatGPT + Manus across all pages  ⟶ _design pass → Sonnet 5_
**Goal:** every workspace page feels like a ChatGPT/Manus-grade product, not just the chat.
**Surfaces (build/restyle to the ChatGPT + Manus language):**
- **Left rail / nav** — ChatGPT-clean: New · Ask · Reports · Monitoring · **Projects** · **Scheduled** · **Apps** · **Library** · account/plan footer. (We have Ask/Reports/Monitoring/Projects; Scheduled/Apps/Library are new or need surfacing.)
- **Projects page** (ChatGPT Projects) — polished project workspace grouping chats + reports + watches (exists; restyle + deepen).
- **Scheduled page** (Manus "Scheduled") — surface **Missions** (already live) as a first-class scheduled-agent page with plan/checklist framing (Manus's task-plan look).
- **Apps / Connectors page** (ChatGPT connectors + Manus Plugins) — integrations & export targets: Zotero, Google Drive, export to Word/PPT/PDF/Notion, plus our MCP surface (audit item #18). Start with the ones we can honor.
- **Library page** (Elicit/ResearchRabbit/Consensus "My Library") — saved papers, uploads, collections, highlights (audit item #13, "personal evidence library").
- **Agent/plan framing for Missions** — adopt Manus's "deploy your agent / plan checklist / progress" language for our Missions so the agentic story reads clearly.
**Attaches to:** `apps/web/components/AppShell.tsx`, `apps/web/app/app/*` routes, existing `projects`/`monitor` pages; new `scheduled`, `apps`, `library` routes.
**Constraint:** pure frontend + read/write of existing data; no engine/safety changes. Reuse existing components (EvidencePanel, ResearchReportView, WatchDetail).
**Effort:** L (multi-surface). **Best split into per-page slices; each behind its route.**
**Process:** run **frontend-design** + **plan-design-review** on the shell system (nav, page templates, the Manus/ChatGPT visual tokens) BEFORE building pages, so all pages share one design system.
> **Progress (2026-07-03):** Design blueprint at `docs/superpowers/sdd/2026-07-03-shell-ux-parity-design.md`. **Slice 1 (Scheduled page) COMPLETE + verified** — branch `feat/shell-ux-parity` off `origin/main`, commit `b65415e`. New `apps/web/app/app/scheduled/page.tsx` (Manus-style: mission list w/ cadence/next-run/last-run + plan-checklist strip, create + pause/resume + delete, honest empty state, delete-confirm), flag-gated nav item + title in `AppShell.tsx`, flag `scheduledPageEnabled` (`NEXT_PUBLIC_WS10_SCHEDULED`) in `env.ts`. `tsc --noEmit` clean; only `apps/web/` touched; reuses existing mission CRUD + shell.css + engine-step atoms. **Correction:** the blueprint (read stale code) claimed Missions were unsurfaced — on `origin/main` they already appear in a "Scheduled research" section inside Monitoring; this slice *elevates* them to a top-level page. Not deployed. **Ops:** subagent dispatch hit a re-delegation loop (agents describing work instead of doing it); built directly by the orchestrator instead — prefer direct builds or `agentType` without the Agent/Task tool for future UI slices.

---

## Sequencing & dependency summary

```
Phase 1 (parallel, cheap, independent):  WS-1 ─┬─ WS-3 (needs WS-1 metadata)
                                          WS-2  │
                                          WS-4  │
Phase 2 (independent, big surface):       WS-5 (reuses report object)
Phase 3 (capstone chain):                 WS-1 ─→ WS-6 ─→ WS-7  (keystone)
                                          WS-1 ─→ WS-8  (map)
```

**Recommended order:** WS-1 → (WS-2, WS-3, WS-4 in parallel) → WS-5 → WS-6 → WS-7 → WS-8.
WS-1 is the linchpin: it unblocks WS-3, WS-6, WS-7, and WS-8, and is itself the cheapest high-trust win. Do it first.

## Rough effort (S ≈ days · M ≈ 1–2 wks · L ≈ multi-week)

| WS | Feature | Effort | Model | Ships behind flag |
|----|---------|--------|-------|-------------------|
| 1 | Per-paper intelligence | M | Opus+Sonnet | yes |
| 2 | Surface sub-queries | S | Sonnet | yes |
| 3 | Quality filters _(absorbed into WS-9)_ | S–M | Sonnet | yes |
| 4 | Claim→meter conversion | S–M | Sonnet+Opus | yes |
| 5 | Media deliverables | L | Sonnet+Opus | per-artifact |
| 6 | Supported/disputed | M | Opus | yes |
| 7 | Living claim page | L | Opus | yes (migration) |
| 8 | Research map | M–L | Sonnet+Opus | yes |
| 9 | Composer/chat-bar tools parity (Corpus, filters, import, launcher) | M–L | Sonnet+Opus | yes |
| 10 | App-shell UI/UX parity (ChatGPT+Manus; Projects/Scheduled/Apps/Library) | L | Sonnet (design-led) | per-page |

**Two tracks, run together:** Engine/Tools (WS-1,2,4,5,6,7,8) and Shell/UX (WS-9 absorbs WS-3; WS-10). WS-9/10 are UI-led → design pass first.

## Per-workstream definition of done

For every WS: (a) unit tests for the deterministic core (grader/partition/conclusion) with the honesty invariants asserted; (b) the frozen `/ask` answer path proven byte-identical when the flag is off; (c) guardrail 48/48 HOLD re-run after any engine-touching deploy; (d) function deployed before the web that binds it; (e) owner-gated deploy ask with a one-paragraph plain-English "what changed."

## Owner decisions (locked 2026-07-03)

1. **Media deliverables scope:** ship the **free-to-build set first** — mind map, flashcards, quiz, data table (zero new provider cost). **Audio/video/infographic deferred** to a fast-follow pending a TTS-provider budget decision.
2. **`claims` table migration (WS-7):** **approved in principle**; design + code proceed, but the migration runs on prod only after an explicit owner "go" at deploy time.
3. **Starting workstream:** **WS-1 (per-paper intelligence)** — the linchpin.

## Branch reconciliation (resolved 2026-07-03)

Investigation found the local `feat/chatgpt-ui-parity` branch is a **stale draft** — all 6 of its commits are already superseded on **`origin/main`** via PRs #86 (ChatGPT UI + ask-v16), #87 (trust layer + evidence map + per-claim meter), and #90 (Missions). `origin/main` is the **live, canonical trunk** (it's what the deployed app runs). The current working tree's uncommitted changes are mostly older/regressed versions of shipped code + session artifacts (graphify-out JSON, screenshots, docs); the only genuinely-novel file is `Turnstile.tsx` (already on its own branch). **Owner decision: adopt `origin/main` as trunk, leave the stale working tree untouched (nothing discarded).** All new work branches from `origin/main`. WS-1's branch was rebased onto `origin/main` (now at `93d7a41`, clean, tests green). **This unblocks WS-1 Slice B and all UI slices** — we're now on the current main with the live `EvidencePanel` + enrichment wiring.
```
