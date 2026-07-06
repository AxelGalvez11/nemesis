# PharmaOrb → "Evidence OS" — Feature Implementation Audit

_Audit date: 2026-06-19. Branch audited: `feat/ui-overhaul-chatgpt` (138 commits ahead of `main`; an in-progress ChatGPT-style UI overhaul). Backend status cross-verified against the live Supabase prod project `qyjmivntajbigjswhahb`._

## TL;DR

The **evidence-intelligence core is already mature and largely deployed** — graded evidence, science-state, study-type classification, two-stage retrieval+rerank, real meta-analysis (pooled RR + heterogeneity + forest plots), citations across ~20 data-source providers, a deep-research engine, and a built (schema-deployed) live-monitoring backbone. That's the hard part, and it's mostly done.

What's missing is **the unifying layer the user correctly identified as the keystone**: a first-class, persisted **claim/topic entity** with a **directional conclusion** (likely/unlikely/mixed/unknown + confidence + evidence-for/against) that **updates in place** as monitoring finds new evidence. Today the pieces exist but live in separate places (a *static* report + a *separate* watch feed) and there is **no persisted claim object** to hang them on.

Most of the consumer/workspace features (PDF ingestion, role modes, claim checker, interaction checker, research maps, personal-library organization, teams, public API/MCP) are **not built**, but several attach cleanly to existing machinery.

### Status at a glance

| # | Feature | Status | Effort | Notes |
|---|---------|--------|--------|-------|
| 1 | Living claim pages | 🟡 Partial (foundation ❌) | **L** | Conclusion-state engine + persisted `claims` entity missing; report + watch halves exist |
| 2 | Evidence grading engine | 🟡 Partial | **M** | Per-*entity* grading + study-type **deployed**; per-*paper* scoring missing |
| 3 | PDF / paper ingestion workspace | ❌ Missing | **L** | Only a disabled "Attach — coming soon" button |
| 4 | Data extraction tables + compare | 🟡 Partial | **M** | Drug-vs-drug compare live; PICO/result/limitations table + "which is strongest" missing |
| 5 | Clinical-trial intelligence | 🟡 Partial | **M** | CT.gov ingested (526 trials) + new-trial alerts; status/results "following" missing |
| 6 | Drug/supplement safety intelligence | 🟡 Partial | **S** | Labels + FAERS ("signal not proof") **deployed**; FDA recalls/enforcement is the one gap |
| 7 | Topic memory | 🟡 Partial | **M** | Watch seen-set + cursor built; persisted prior-conclusion diff ("what changed") deferred |
| 8 | Journal-club mode | 🟡 Partial | **M** | PPTX/DOCX + stats/meta exist; speaker notes, PICO, flashcards, handout, the *mode* missing |
| 9 | Meta-analysis / systematic-review workspace | 🟡 Partial | **L** | Pooling/forest/PICO/abstract built (Pro); RoB + PRISMA deliberately excluded |
| 10 | Wet-lab / protocol draft mode | 🟡 Partial | **M** | `lab_draft` mode scaffolded in engine but filtered out of UI / not deployed |
| 11 | Claim reliability checker | ❌ Missing | **M** | `evidence_for_claim` intent + curated claim scores exist; no verdict taxonomy / paste UI |
| 12 | Interaction checker | ❌ Missing | **M–L** | Single-drug label text only; no pairwise DDI dataset/table |
| 13 | Personal evidence library | 🟡 Partial | **M** | Reports/chats/watches saved; no folders/notes/highlights/saved-papers |
| 14 | Role-based modes | ❌ Missing | **M** | Only output-format modes; no audience/persona param threaded |
| 15 | Research maps | ❌ Missing | **L** | Only ForestPlot; no graph lib / relationship data |
| 16 | "What should I read first" | 🟡 Partial | **S–M** | Reranker + study-type metadata exist; no bucketed read-first surface / citation-count signal |
| 17 | Team / collaboration workspaces | ❌ Missing | **L** | Single-owner RLS everywhere; review queues adjacent but not collab |
| 18 | API / MCP layer | ❌ Missing | **L** (+M MCP) | Edge functions are internal-only; usage-ledger foundation exists |

Effort: **S** ≈ days · **M** ≈ 1–2 weeks · **L** ≈ multi-week / foundational schema work.

---

## Deployment reality (important context)

- **Deployed to prod (verified):** the `/ask` engine; evidence-grade ceiling; science-state + study-type badges; entity-vs-entity `compare`; watchlist digest ranking; Voyage rerank-2.5 retrieval; CT.gov ingestion (`clinical_trials` = 526 rows, `drug_entity_trials` = 798); FDA-label + FAERS providers; conversations; saved reports; entitlements/billing (`consume_usage`).
- **Schema deployed, runtime dormant:** the **live topic-monitoring** system (`evidence_watches`, `watch_known_sources`, `watch_events`, pg_cron jobs — migrations applied 2026-06-18). It no-ops until the owner sets Vault secrets (`watch_check_url`, `watch_service_role_key`) and Resend email creds. **Turning monitoring on is config, not code.**
- **Code-complete but Pro-gated / unconfirmed in prod / on the WIP branch:** Deep Research, Meta-analysis + forest plots, `structured_review`, `lab_draft`, and the new ChatGPT-style UI surfaces. The current branch is explicitly "INCOMPLETE, do not deploy."
- **The honesty doctrine is real and deliberate:** scores/states/pools are pure deterministic code; the LLM only writes rationale or transcribes numbers that are re-grounded. Several "missing" sub-pieces are *intentional guardrails* (PRISMA/risk-of-bias overclaims are actively blocked by `forbidden-phrases.ts`; FAERS is labeled "not proof of causation"). Respect these when building #9/#6/#11.

---

## Per-feature detail

### 1 — Living claim pages 🟡 (foundation ❌) · Effort L · **THE KEYSTONE**
- **Have:** two honest per-answer axes — `evidence_grade` (very_weak…very_strong, deterministically ceiling-capped) in `ask/evidence-grade.ts` + `answer.ts`, and `science-state` (well_studied/emerging, positive-only) in `packages/shared/src/science-state.ts`; reranked best-evidence `citations[]`; honest `gaps[]`. UI: `/app/reports/[id]` renders a *static* claim-like object (summary + grade + evidence table + gaps); `/app/monitor/[id]` provides the *living* feed; a report can sit under a `saved_question` watch.
- **Missing:** (a) a **directional conclusion** (likely/unlikely/mixed/unknown) + confidence distinct from strength — neither existing axis is a verdict; (b) an explicit **evidence-against** set (the `conflicting` gap type is declared but never emitted; no contradiction partitioning); (c) a **persisted `claims` entity** — today a "claim" is only a text string on an `evidence_scores` row; (d) a **merged living page** that re-summarizes in place on new evidence.
- **Attaches to:** `science-state.ts` + `evidence-grade.ts` + `answer.ts` (conclusion engine); new `claims` table linking drug/class entities + evidence sources + grade history; `evidence_watches.kind='saved_question'` (the living-update hook); `/app/reports/[id]` + `WatchDetail` (the merged surface).
- This is the single highest-leverage build — see "Keystone build" below.

### 2 — Evidence grading engine 🟡 · Effort M
- **Have (deployed):** `packages/shared/src/evidence-scoring.ts` — a pure, auditable grader, but **per-entity aggregate** (counts n_meta/n_rct/n_human/n_preclinical, max trial phase → tier) with derived booleans (`findings_consistent`, `sample_size_adequate ≥100`, `robust_human`) and one-directional overrides. Per-paper **study-type** classification via `study-type.ts:studyTypeLabel()` from PubMed PublicationType / CT.gov fields.
- **Missing:** a **per-paper** scoring object — population match (human/healthy/patient/athlete), per-paper sample size, endpoint quality (surrogate vs clinical), bias risk, relevance-to-question, conclusion-impact. (`only_evidence_is_abstract`/`indirect_evidence_only` are reserved-but-inert.)
- **Attaches to:** `evidence-scoring.ts` + `study-type.ts`; add a per-paper signal extractor (LLM-extract behind a deterministic grader) feeding the existing tier ladder.

### 3 — PDF / paper ingestion workspace ❌ · Effort L
- **Have:** nothing user-facing — a disabled "Attach — coming soon" composer button. Server-side PICO extraction (`ask/research/pico.ts`) exists but only over API-retrieved papers, not uploads.
- **Missing:** upload UI, Supabase Storage bucket, PDF parser (pdfjs/unpdf), extraction pipeline (design/dose/AEs/PICO over uploaded bytes), a per-paper workspace, RLS.
- **Attaches to:** reuse `pico.ts` extraction prompts; new Storage bucket + new edge function + `/app/papers/[id]` route reusing `EvidencePanel`/`ResearchReportView`.

### 4 — Data extraction tables + compare 🟡 · Effort M
- **Have:** `compare` edge fn (entity-vs-entity: mechanism/uses/evidence/trial-status/safety/cost) — **deployed**. A study-characteristics table in **meta mode** (`MetaStudyCharacteristics`, 2×2 + outcome + weight). `citation-meta.ts:evidenceRows()` flat body-of-evidence table.
- **Missing:** a multi-paper PICO+result+limitations table (population/intervention/comparator/duration/outcome/result/limitations); paper-vs-paper compare; a computed **"which is strongest"** verdict.
- **Attaches to:** `compare.ts` (add a strongest-pick verdict over §9 + study-type signals); `meta-analysis.ts` extraction pattern + `research` orchestrator for the richer table. Export today = DOCX/PPTX only; **CSV/Sheets/Notion not supported** (would be a small add).

### 5 — Clinical-trial intelligence 🟡 · Effort M
- **Have (deployed):** full CT.gov v2 ingestion (`core-source-sync/providers/clinicaltrials.ts` → `clinical_trials` row with phase/status/results dates/outcomes), linked via `drug_entity_trials`, fed to `/ask` live + the watch monitor. New late-phase trials fire `new_high_tier_study` alerts.
- **Missing:** "follow a trial through **status changes / results posted**" — `watch-detect.ts` keys on NCT id, so a trial that changes status keeps the same key and never re-surfaces. The columns exist (`results_first_posted`, `status`); the value-diff detector does not.
- **Attaches to:** `watch-detect.ts` + `watch/watch-cycle.ts` — add a status/results diff trigger + a new alert reason.

### 6 — Drug/supplement safety intelligence 🟡 · Effort S (recalls)
- **Have (deployed):** openFDA SPL labels (boxed warnings, contraindications, adverse reactions, single-drug interaction text) in `providers/openfda.ts`; **FAERS** adverse-event summary in `providers/faers.ts` with the **verbatim "signal not proof" disclaimer**; drugs@FDA / Orange Book / Purple Book; safety routing in `/ask`.
- **Missing:** **FDA recalls / enforcement** (`api.fda.gov/drug/enforcement`) — no provider, no table. This is the one missing safety pillar and the cheapest high-value add.
- **Attaches to:** add `providers/enforcement.ts` following the openFDA pattern; register in the `LIVE_SOURCES` registry (`ask/live-sources.ts`). _(Note: live-source augmentation in `/ask` is gated behind the `LIVE_SOURCES` env var; whether it's on in prod is not determinable from code.)_

### 7 — Topic memory 🟡 · Effort M
- **Have:** the watch substrate is real — `watch_known_sources` is an accumulating per-watch seen-set; `last_checked_at` is an exact resumable cursor; change is detected by diffing dated source-API results against the seen-set (not by diffing engine output — the deliberate anti-jitter keystone). Cold-start baseline is silent.
- **Missing:** **no persisted prior-conclusion object** — the graded conclusion is never stored or diffed, so "what changed in the *conclusion* since last month," evidence-grade shifts, meta-significance crossings, and outdated/superseded citations are explicitly deferred. Today the system answers "a new high-tier paper / retraction appeared," not "the answer changed."
- **Attaches to:** store a per-topic conclusion snapshot (depends on #1's claim entity) and add recompute-over-accumulated-set triggers to `watch-cycle.ts`.

### 8 — Journal-club mode 🟡 · Effort M
- **Have:** report → **PowerPoint** (title/methods/limitations/evidence-table/safety/gaps/references) and **Word** export (`lib/export/pptx.ts`, `docx.ts`, Vancouver/AMA toggle); meta mode covers the stats slice; "Methods & Limitations" ≈ methods critique.
- **Missing:** the **Journal Club mode/entry point**; **speaker notes** (`addNotes` absent); PICO block, strengths/weaknesses, discussion questions, **flashcards** (no Anki code), one-page **handout** format.
- **Attaches to:** add a mode to the Ask `MODES` array; extend `pptx.ts`/`docx.ts` + `ResearchReportView` export bar. _(Easiest feature to monetize per the proposal — students/clinicians get it instantly.)_

### 9 — Meta-analysis / systematic-review workspace 🟡 · Effort L
- **Have (Pro-gated):** real pooled risk-ratio (IV-fixed + DerSimonian-Laird random, Q/I²/τ², validated vs metafor) in `meta-analysis.ts`; forest plot model + SVG; PICO extraction; structured IMRaD abstract; `structured_review` mode with an honest code-authored method section; strong wording gates.
- **Missing (partly by design):** **risk-of-bias and PRISMA are intentionally excluded** and PRISMA/"systematic review"/"records identified" overclaims are *actively blocked*. Also missing: search-strategy builder, inclusion/exclusion + screening queue, deduplication, citation-manager export, OR/RD metrics.
- **Attaches to:** `meta-analysis.ts` + `forest-plot.ts` + the `research` meta orchestrator. Building a true RoB/PRISMA workspace means deliberately relaxing a guardrail — do it carefully and keep the honesty framing.

### 10 — Wet-lab / protocol draft mode 🟡 · Effort M
- **Have:** a `lab_draft` mode is scaffolded in the research engine, but it's **filtered out of the selectable UI modes and the engine isn't deployed**.
- **Missing:** finish + gate the deliverable (hypothesis/design/controls/materials/methods/endpoints/stats/safety/citations) and the "for review by a qualified researcher" framing; expose in UI.
- **Attaches to:** the existing research mode machinery + Ask `MODES`.

### 11 — Claim reliability checker ❌ · Effort M
- **Have:** an `evidence_for_claim` ask-intent (free-text RAG Q&A); curated `evidence_scores` claim rows (~395, manually authored); a fabrication guard; per-claim citation chips.
- **Missing:** the reverse "paste assertion → structured verdict" path — no verdict taxonomy (`supported/exaggerated/unsupported/contradicted`), no claim-vs-source alignment scorer, no paste UI. _(This is the most viral consumer feature — "is berberine nature's Ozempic?")_
- **Attaches to:** wrap the `/ask` `evidence_for_claim` pipeline with a post-generation verdict layer + a paste UI.

### 12 — Interaction checker ❌ · Effort M–L
- **Have:** `drug_interaction` ask-intent (RAG over single-drug label/PubMed prose, **no pair awareness**); `compare` (no interactions field); openFDA single-drug `drug_interactions` label text.
- **Missing:** a pairwise DDI dataset/table, a multi-substance "stack" input, severity/mechanism/evidence per pair. `rxnorm.ts` is name→RxCUI only (no RxNav interaction API).
- **Attaches to:** new `drug_interaction_pairs` table + an ingestion source (RxNav interaction API or DrugBank DDI) + a `check-interactions` endpoint (or extend `compare/build.ts`) + UI. **Needs strong disclaimers + always show source/reasoning** (FDA clinical-decision-support guidance).

### 13 — Personal evidence library 🟡 · Effort M
- **Have:** three saved surfaces — Reports library (`/app/reports`), saved chats (rail history → `conversations`), Monitoring watches. All owner-RLS'd; `export_my_data()` bundles them.
- **Missing:** saved *papers/PDFs*, notes, highlights, folders/collections, decks-as-library, a unified index. "Projects" is an inert placeholder. No per-user paper/claim store — "library" today means the *global* `core_sources` corpus.
- **Attaches to:** new owner-RLS'd `library_folders` + polymorphic `library_items` (source/answer/report/claim) + `notes`/`tags`; the "Projects" rail slot.

### 14 — Role-based modes ❌ · Effort M
- **Have:** only **output-format** modes (Quick/Deep/Meta/Lab-draft). No audience param; `use_health_context` hardcoded `false`.
- **Missing:** a persona selector + an `audience` request param threaded through `ask`/`research` + audience-conditioned generation (enthusiast/student/clinician/researcher/MSL).
- **Attaches to:** composer mode menu (`app/app/ask/page.tsx`) + `askQuestion`/`startResearch` bodies + backend prompt conditioning. _(UI trivial; the substance is backend.)_

### 15 — Research maps ❌ · Effort L
- **Have:** only `ForestPlot` (a statistical chart). No graph/viz library installed.
- **Missing:** a relationship-extraction data model (mechanisms/targets/authors/trials/timeline) + a visualization layer.
- **Attaches to:** a new `/app/maps` route or `/app/drugs/[id]` panel; reuse evidence/citation metadata. Good premium/visual feature, but net-new.

### 16 — "What should I read first" 🟡 · Effort S–M
- **Have:** two-stage retrieval + Voyage rerank (relevance-ordered citations); pure `digest-ranking.ts`; per-source study-type metadata.
- **Missing:** a bucketed "read-first" surface (most-cited / best-RCT / best-review / best-safety / field-changing) and a most-cited signal (no citation-count in the data model — OpenAlex could supply it).
- **Attaches to:** a deterministic categorizer over `rerank` score + study-type, modeled on `digest-ranking.ts`; a view reusing `EvidenceTable`/`EvidencePanel`.

### 17 — Team / collaboration workspaces ❌ · Effort L
- **Have:** nothing for teams — strictly single-owner `auth.uid()=user_id` RLS. Adjacent only: single-operator review queues (`0114`, `0120`), which are admin, not collaboration.
- **Missing:** org/workspace entity, membership + roles, shared ownership (team watchlists/libraries/reports), comments, review assignment, audit trail, version history — requires reworking single-owner RLS across every owned table.
- This is the path from $20/mo consumer to lab/clinic/company plans; it's the largest data-layer lift.

### 18 — API / MCP layer ❌ · Effort L (API) + M (MCP)
- **Have:** the engine is internal Supabase edge functions (CORS-locked to `app.pharmaorb.app`, JWT/service-role auth, no key auth, no versioned contract). The shared usage/credit ledger (`usage_counters`/`usage_events`/`consume_usage`) — the intended metering substrate — **exists and is deployed**.
- **Missing:** a public, contract-stable API (versioned routes, `api_keys` table + key auth, per-key quotas debiting the ledger, audit events), then a thin MCP server wrapping it.
- _(Already in the team's `docs/PHARMAORB_WEB_FIRST_ULTRAPLAN.md` as the platform direction — this audit confirms the foundation is in place.)_

---

## The keystone build (do this next)

The user's instinct is correct and the audit confirms it: **a first-class claim/topic entity with a living, directional conclusion is the center the rest attaches to** — and most of the supporting machinery already exists. Concretely:

1. **`claims` table** (new): canonical id, normalized claim text, linked `drug_entities`/`drug_classes`, attached evidence `source_ids`, current grade + **grade history**, and a 1:1 link to an `evidence_watches.kind='saved_question'` row. _(L — foundational schema; nothing else like it exists.)_
2. **Conclusion engine** (new, pure + LLM-extract): emit a directional verdict (likely/unlikely/mixed/unknown) + confidence, and **partition citations into for / against** (finally emit the declared-but-unused `conflicting` dimension). Build it alongside `science-state.ts` + `evidence-grade.ts`, keeping the deterministic-aggregate / LLM-rationale split.
3. **Living page**: merge `/app/reports/[id]` (static body) with `WatchDetail` (the feed) into one "as-of" surface that **re-summarizes in place** when monitoring finds new high-tier evidence — closing the #7 topic-memory gap by snapshotting + diffing the stored conclusion.

This single thread delivers #1, unblocks #7 (real "what changed in the conclusion"), and is the natural home for #11 (claim checker = "create a claim from a pasted assertion"). Everything else — chat asks it, monitoring updates it, PDF feeds it, trials enrich it, safety warns it, deliverables export from it — then attaches to the claim object.

## Reassessed roadmap (vs. the proposed tiers)

- **MVP+ (1–6):** Smart chat+citations ✅, monitoring ✅ (flip the runtime on — config only), evidence grading 🟡 (add per-paper), report/deck gen 🟡 (have DOCX/PPTX). **Living claim pages 🟡→ the one real build.** → _Mostly done; the gap is the claim entity + conclusion engine._
- **Pro (7–12):** CT.gov ✅ (add status-change following), data-extraction tables 🟡, journal-club 🟡 (add notes/PICO/flashcards/handout), systematic-review 🟡 (have the math), library 🟡 (add organization), claim-checker ❌. → _Strong base; mostly additive surfaces._
- **Enterprise (13–18):** teams ❌, safety intelligence 🟡 (add recalls — cheap), competitive intel (MSL mode) ❌, API/MCP ❌ (ledger ready), audit logs ❌. → _Net-new platform layer; sequence after the claim core proves out._

### Quick wins (high value / low effort)
- **Turn on monitoring** (Vault secrets + Resend) — the whole live-watch system is built and schema-deployed; it's dormant on config.
- **FDA recalls source** (#6) — one `enforcement.ts` provider, S effort, closes the safety story.
- **"Read first" surface** (#16) — reuses the reranker + study-type metadata.
- **Role-mode selector** (#14) — high perceived value; UI is trivial, then thread an `audience` param.

### Watch out
- **Two coexisting watch systems** (`watchlist_items` vs `evidence_watches`, with two separate limit keys `watchlist_limit`/`watch_limit`) — consolidate or the UI will read the wrong gate.
- **`subscriptions.plan` permits `'student'`** but no `student` row is seeded in `plan_entitlements` → a student-plan user fails every gate. Vestigial; clean it up.
- **Honesty guardrails are deliberate** (PRISMA/RoB blocked, FAERS "not proof") — don't "fix" them; build #9/#6/#11 within them.
