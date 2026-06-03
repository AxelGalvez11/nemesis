# PharmaBro — Implementation Plan

Generated: 2026-06-02
Status: Draft v1 (pre-build)
Source of truth for requirements: `pharmabro_mobile_app_docs/` (docs 00–21)

---

## 0. TL;DR

PharmaBro is an evidence-backed medication / supplement / peptide / clinical-trial
intelligence **mobile app**. The product loop is: **Ask → read cited answer →
explore source-backed page → follow (watchlist) → return for updates.**

**The strategic decision driving this plan:** PharmaBro's hard part — a global,
authoritative, citation-grade clinical evidence corpus with retrieval, source
transparency, and freshness tracking — **already exists** in the
`Ascend_StudyApp` repo as its "Layer 1 / core-source" subsystem. We **fork and
adapt** that subsystem as PharmaBro's evidence substrate, and build the
PharmaBro-specific domain layer (drug entities, evidence scoring, watchlist,
the Ask answer engine) and the mobile app **on top** of it.

This is **fork-and-adapt into PharmaBro's own Supabase project** — two separate
products, separate databases. "Reuse" never means "couple the two apps' DBs."

---

## 1. Architecture: two layers

### Layer A — Evidence substrate (FORKED from Ascend `core-source-sync`)

Global, non-user-scoped, service-role-written, authenticated-read. This is the moat.

> **Honest status: ~70% *written*, 0% *validated*.** Every asset below has been
> read from `Ascend_StudyApp` source, but migration `0107` confirms Layer 1 has
> **never been ingested** ("DROPS any existing embeddings — none exist yet"). The
> pipeline is scaffolded, not proven on real clinical data. Phase 0's smoke test
> is the go/no-go gate (see §6).

| Asset (Ascend path) | What it does | PharmaBro reuse |
|---|---|---|
| `supabase/migrations/0101_core_sources.sql` | `core_sources` (provider catalog: license, `content_hash`, `effective_at`/`superseded_at`, freshness) + `core_source_chunks` (embedded spans w/ `section` + `span` char offsets) + RLS (auth read / service write) | Fork ~as-is. Maps to PharmaBro doc-10 `source_documents` + `source_chunks`, but richer (license gating, supersede versioning). |
| `0105` / `0107_voyage_1024_embeddings.sql` | `match_core_source_chunks()` ANN search — filters by provider + section, excludes superseded, joins back for license + URL | Fork as-is. This is the citation-grade retriever. |
| `0106_expand_core_source_providers.sql` | Provider enum incl. `openfda`, `dailymed`, `pubmed_oa`, **`clinicaltrials`**, `fda_safety`, `livertox`, **`lactmed`** (lactation), `pubchem`, `pharmgkb`, `rxnorm` | Fork. Already covers all 4 PharmaBro sources + pregnancy/lactation safety + drug normalization. |
| `functions/core-source-sync/` (`chunking.ts`, `embeddings.ts`, `persist.ts`, `license.ts`, `providers/*`) | Section-aware clinical chunker (tuned for FDA-label headings), Voyage embeddings, license gate, **provider adapters for openFDA, DailyMed, PubMed, ClinicalTrials, RxNorm, DrugBank, PubChem, LiverTox, CDC** | Fork. Provider-routed, service-role/pg_cron triggered. |
| `functions/source-fetch/`, `functions/extract-drug-interactions/`, `0093_drug_interactions.sql` | On-demand source fetch; drug-interaction extraction | Fork; `extract-drug-interactions` informs the (Later) interaction feature. |
| `docs/runbooks/initial-corpus-ingest.md`, `docs/source-strategy*.md` | The ingest playbook | Follow directly to seed PharmaBro's 100 entities. |

**Do NOT fork** the per-user RAG (`content_embeddings` / `match_embeddings`,
768-dim Gemini) — wrong shape (per-user, RLS-locked). It is for a student's own
notes, not a shared corpus.

### Layer B — PharmaBro domain + app (NET-NEW)

Everything that makes PharmaBro PharmaBro. Not present in Ascend.

| Component | Doc | Notes |
|---|---|---|
| Domain tables: `drug_entities`, `drug_aliases`, `drug_classes`, `label_documents`, `clinical_trials`, `pubmed_articles`, `comparison_entities` | 10 | The normalized entity layer on top of the raw `core_sources` corpus. |
| **Evidence scoring** (`evidence_scores` + scoring engine) | 12, 02 §5.7 | The real new IP. Grades claim/drug evidence Very Strong→Unknown. Ascend retrieves + cites but does **not** grade. |
| **Ask answer engine** (`/ask`, `generated_answers` trace) | 11, 20 | Intent → entity → safety → retrieve → generate → citation-enforce → store. Answer-spec templates in doc 20 are the contract. |
| Watchlist + updates + digest (`watchlist_items`, `updates`, pg_cron jobs) | 11 | Built on `content_hash`/`superseded_at` change-detection already in `core_sources`. |
| Mobile app (RN + Expo): Ask/Explore/Watchlist/Profile, drug pages, Source Viewer | 06, 07, 08, 13 | Ascend is a webapp — UI is entirely new. |
| Safety/compliance: guardrails, human-review queue, privacy/terms/disclaimers, deletion | 18, 02 §9 | Launch-blocking for a medical app. |
| Health context (optional, encrypted, deletable) | 02 §5.9 | Separate table, explicit consent, never used to diagnose/dose. |
| Monetization (RevenueCat), analytics (PostHog), admin panel | 14, 16 | |

---

## 2. Repo layout (pnpm + turbo monorepo, mirrors Ascend)

```
PharmaBro/
├── apps/
│   └── mobile/                 # React Native + Expo
├── packages/
│   ├── db/                     # generated Supabase types
│   └── shared/                 # answer-spec types, evidence enums, citation types
├── supabase/
│   ├── migrations/             # forked core_sources + net-new domain tables
│   └── functions/              # core-source-sync (forked), ask, embed, digest jobs
├── docs/                       # runbooks (forked) + pharmabro_mobile_app_docs
└── IMPLEMENTATION_PLAN.md
```

**No Python `services/ingest` needed.** Ascend's Python service extracts
user-uploaded PDF/PPTX/DOCX. PharmaBro ingests JSON/XML from public APIs, fully
handled by the Deno provider adapters. Drop it.

---

## 3. The one schema bridge to design (Phase 2)

`match_core_source_chunks()` filters by provider + section, not by drug. To scope
retrieval/citation to a specific `drug_entity` (for drug pages and entity-scoped
Ask), add the bridge:

- **Recommended:** `drug_entity_sources(drug_entity_id uuid, source_id uuid)` link
  table, populated during ingest when a provider record is matched to a canonical
  entity (via RxNorm CUI / name normalization), **plus** stamp `drug_entity_id`
  into `core_sources.metadata` so the existing match fn can gain an optional
  `filter_drug_entity` arg without a structural rewrite.
- Open-domain Ask ("compare X vs Y") needs no scope — the query embedding handles it.
- Drug-page panels (`/drugs/{id}/label|trials|pubmed`) read the normalized domain
  tables (`label_documents`, `clinical_trials`, `pubmed_articles`), which are
  populated from `core_sources` during the entity-linking step.

This single bridge is the only non-trivial schema design connecting Layer A ↔ B.

---

## 4. Embedding model decision (porting gotcha — settle in Phase 0)

Ascend's history has a skew: `0101` created chunks at **1536-dim /
text-embedding-3-large**; `0107` migrated to **1024-dim / Voyage `voyage-3-large`**
(Cohere `embed-v4.0` → OpenAI `text-embedding-3-large@1024` fallbacks). Some code
comments (e.g. `core-source-sync/index.ts` header) still say 1536 — **stale**.

**Decision for PharmaBro:** standardize on **Voyage `voyage-3-large` @ 1024-dim**
(top MTEB medical retrieval, ~half the cost of OpenAI 3-large). Lock all three to
1024: `core_source_chunks.embedding vector(1024)` = `match_core_source_chunks`
query arg = embed-model output. A mismatch fails silently. Requires `VOYAGE_API_KEY`.

---

## 5. Phased build

Backend/corpus first — it is the reusable asset and a working evidence engine
de-risks everything downstream. Mobile comes after the API contract is real.

### Phase 0 — Foundations & fork verification
- Scaffold pnpm+turbo monorepo; create PharmaBro Supabase project.
- Fork Layer-A migrations + `core-source-sync` function + providers + runbooks.
- `supabase db push`; deploy `core-source-sync`; smoke-test against **one**
  openFDA + one DailyMed record end-to-end (fetch → chunk → embed → `match_*`).
- Settle embedding model (§4). Set `VOYAGE_API_KEY`, `OPENFDA_API_KEY`, `NCBI_API_KEY`.
- **Acceptance:** `match_core_source_chunks("contraindications for lisinopril")`
  returns real DailyMed chunks with section + URL + license.

### Phase 1 — Evidence corpus (Layer A live)
- Confirm/port provider adapters for the 4 required sources + RxNorm.
- Follow `initial-corpus-ingest.md` to ingest the **100 seed entities** (doc 05:
  GLP-1s, peptides, supplements) + 10 classes.
- Wire pg_cron for scheduled refresh (daily labels, weekly PubMed) — reuses
  `content_hash`/`superseded_at` change detection.
- **Acceptance:** 100 entities' labels/trials/abstracts are retrievable + cited;
  re-ingest correctly supersedes changed labels.

### Phase 2 — Domain entity layer + search
- Net-new migrations: `drug_entities`, `drug_aliases`, `drug_classes`,
  `label_documents`, `clinical_trials`, `pubmed_articles`, `comparison_entities`.
- Build the **Layer A↔B bridge** (§3) + entity-linking during ingest.
- `/search` (Postgres FTS + `pg_trgm` for misspellings; RxNorm aliases).
- `/drugs/{id}`, `/drugs/{id}/label|trials|pubmed`.
- **Acceptance:** search "ozempic" → semaglutide entity → page renders label
  sections, linked trials, PubMed list, all citing `core_sources`.

### Phase 3 — Ask answer engine (RAG)
- `/ask` pipeline (doc 11 steps): intent-classify → entity-detect →
  **safety-classify** (doc 20 flags) → `match_core_source_chunks` retrieve →
  generate with Claude using doc-20 templates → **citation enforcement** (no
  unsupported claim; FDA/DailyMed prioritized for safety) → store
  `generated_answers` trace (prompt/model version, source_ids, safety_flags).
- No-source path: refuse to assert; offer source-backed alternatives.
- Emergency/overdose path: Poison Control routing, halt normal answer.
- **Acceptance:** doc-02 example questions return structured cited answers;
  unsupported claims are refused; peptide answers separate human/animal/mechanistic.

### Phase 4 — Evidence scoring (new IP)
- `evidence_scores` + scoring engine: inputs = FDA status, DailyMed presence,
  PubMed publication types/counts, CT.gov phase/status/results, recency,
  consistency (doc 12). Conservative guardrails (FDA-approved ≠ Very Strong for
  off-label; animal ≠ human proof).
- Claim-level scoring where possible; admin review for high-risk.
- **Acceptance:** drug pages show a score + rationale + evidence counts +
  limitations; off-label claims score lower than approved indications.

### Phase 5 — Watchlist + updates + digest
- `watchlist_items`, `updates` tables; follow drugs/classes/trials/PubMed-keywords.
- pg_cron jobs: `refresh_daily_labels`, `refresh_pubmed_keywords`,
  `refresh_clinical_trials`, `weekly_digest` (rank by importance, doc 12).
- Email digest first (Resend); push later (Expo).
- **Acceptance:** label change creates an update; watcher gets weekly digest.

### Phase 6 — Mobile app (RN + Expo)
- Auth: Supabase + Apple/Google + guest mode.
- Tabs: Ask, Explore, Watchlist, Profile (Classes inside Explore for MVP).
- Drug/Compound page, **Source Viewer** (tap citation → section + date + excerpt +
  original link + "why used" + limitations), Compare (Should-have).
- All screen states (loading/empty/error/no-source/outdated/paywall/guest/offline).
- Design system from doc 13.
- **Acceptance:** full loop on device: search → drug page → Ask → tap citation →
  add to watchlist → see digest.

### Phase 7 — Safety, compliance, legal (launch gate)
- Guardrail QA suite vs doc-20 "unsafe behavior" list; human-review queue for
  flagged/high-risk answers; admin review panel.
- Privacy policy, terms, educational-use disclaimer; account deletion +
  health-context deletion endpoints; data export.
- Position **away from FDA "medical device"** lane (CDS/MMA guidance, doc 18):
  educational, no diagnosis/treatment/dosing.
- **Per-provider ToS/attribution re-verification** (openFDA, DailyMed, CT.gov,
  NCBI) for a *consumer* app — Ascend's license gate is a head start, not a pass.
- **Acceptance:** no unsafe template passes QA; legal screens shipped; deletion works.

### Phase 8 — Monetization, analytics, launch
- RevenueCat (free: 3 watchlist items; pro: more + keyword watch + saved reports).
- PostHog events (doc 14: activation/engagement/safety metrics incl. citation
  coverage, unsupported-answer rate, user-report rate).
- Seed 10 comparison pages; finalize 100 entities / 10 classes.
- TestFlight → App Store / Play submission.
- **Acceptance:** doc-02 §10 MVP acceptance criteria all green.

---

## 6. Risks & open decisions

- **Branding:** "PharmaBro" carries Shkreli baggage (doc 00). Treat as working
  title; brand-test before store submission. Alts: DrugLens, EvidenceRx, RxLens, MedSignal.
- **Phase 0 is go/no-go on the entire reuse strategy.** The forked core-source
  pipeline is read-but-never-run (§1). If the smoke test does **not** return clean
  DailyMed chunks, the estimate flips from "fork" to "build-and-debug" and Phases
  1–2 expand accordingly. Validate before anchoring on the reuse savings.
- **Evidence scoring is the hardest net-new piece** and the differentiator — do not
  under-resource it. "Reuse the RAG" does **not** mean "90% done."
- **Medical safety is launch-blocking**, not a Phase-8 polish. Guardrails are wired
  into Phase 3 and gated in Phase 7.
- **ClinicalTrials.gov** is a registered provider in the fork, but confirm the
  adapter returns the doc-10 trial fields (phase/status/outcomes/results-posted)
  before relying on trial retrieval (Phase 1 task).
- **License obligations differ for a commercial consumer app** vs Ascend's use —
  legal review owns this (Phase 7), engineering surfaces attribution metadata.
- Solo/small-team assumption (doc 09); phases are sequential but 6 (mobile) can
  start in parallel against mocked API contracts after Phase 3 freezes them.

---

## 7. Immediate next actions

1. Confirm fork-and-adapt strategy (this plan) — approve or adjust scope.
2. Phase 0, step 1: scaffold monorepo + create PharmaBro Supabase project.
3. Copy Layer-A migrations + `core-source-sync` + runbooks from `Ascend_StudyApp`.
4. Run the one-record openFDA→DailyMed smoke test to prove the forked retriever works.

> Re-running `/ultraplan` now works (git initialized) if a cloud multi-agent
> expansion of this plan is wanted.
