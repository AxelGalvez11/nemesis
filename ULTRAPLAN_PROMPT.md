# PharmaBro — Ultra-Plan Prompt

> Paste the block below into Claude Code on the web (`/ultraplan`) once the Claude
> GitHub app is installed, OR into any fresh capable agent that has this repo. It is
> self-contained: it carries the `Ascend_StudyApp` reuse facts inline, because the
> cloud session clones **only this repo** and cannot see Ascend.

---

```
ROLE
You are a staff software engineer + product architect. Produce a deep, build-ready
implementation plan for "PharmaBro" — a React Native + Expo mobile app for
evidence-backed medication / supplement / peptide / clinical-trial intelligence.
This is a regulated-adjacent medical-information product: conservative, source-grounded,
NOT an AI doctor (no diagnosis, dosing, or treatment instructions).

READ FIRST (in this repo)
- pharmabro_mobile_app_docs/00..21 — full planning pack (PRD, personas, MVP scope,
  IA/screens, flows, wireframes, tech stack, data model, API, source ingestion +
  evidence system, design system, analytics, QA, monetization, GTM, privacy/legal,
  roadmap, AI answer spec, risk register).
- IMPLEMENTATION_PLAN.md — existing v1 plan. Your job is to validate, deepen, and
  make it execution-ready, not to replace its strategy unless you find it wrong.

CRITICAL EXTERNAL CONTEXT — NOT IN THIS REPO (treat as authoritative)
The core strategy reuses a subsystem from a SEPARATE repo `Ascend_StudyApp` that is
NOT in this repo and you CANNOT read. Plan against this documented spec; if a phase
depends on Ascend source, make "obtain/copy those files" an explicit task.

Ascend's "Layer 1 / core-source" subsystem is a GLOBAL, non-user-scoped, citation-grade
clinical evidence corpus + retriever. Reuse it as PharmaBro's evidence substrate:
  • Tables: core_sources (provider catalog: license, content_hash, effective_at/
    superseded_at versioning, freshness timestamps) + core_source_chunks (embedded
    spans with `section` heading + `span` char-offsets). RLS = authenticated read /
    service-role write. No per-user gate.
  • Retriever: match_core_source_chunks(query_embedding vector(1024), match_count,
    match_threshold, filter_providers text[], filter_section) — cosine ANN, excludes
    superseded sources, joins back for provider + license + source_url.
  • Embeddings: Voyage voyage-3-large @ 1024-dim (Cohere embed-v4.0 / OpenAI
    text-embedding-3-large@1024 fallbacks). LOCK column dim = match-fn dim = model dim
    = 1024 or retrieval silently breaks. (Some Ascend comments say 1536 — stale.)
  • Ingest edge function `core-source-sync`: provider-routed, service-role/pg_cron
    triggered. Provider adapters already exist for: openFDA, DailyMed, PubMed,
    ClinicalTrials, RxNorm, DrugBank, PubChem, LiverTox, LactMed, CDC. Section-aware
    clinical chunker tuned for FDA-label headings (CONTRAINDICATIONS, WARNINGS, etc.).
    License gate rejects non-commercial-friendly sources.
  • Runbooks exist in Ascend: initial-corpus-ingest.md, source-strategy*.md.
  • DO NOT reuse Ascend's per-user RAG (content_embeddings / match_embeddings, 768-dim
    Gemini) — wrong shape (per-user, RLS-locked).
HONEST STATUS: this pipeline is ~70% WRITTEN but 0% VALIDATED — Ascend Layer 1 was
never ingested (no embeddings exist). So a Phase-0 smoke test (one DailyMed record:
fetch→chunk→embed→match) is the GO/NO-GO gate on the whole reuse strategy. If it fails,
the estimate flips from "fork" to "build-and-debug."

ARCHITECTURE TO PLAN AGAINST (two layers)
- Layer A (FORK from Ascend): the evidence substrate above. Maps to doc-10
  source_documents/source_chunks but richer.
- Layer B (NET-NEW): drug_entities, drug_aliases, drug_classes, label_documents,
  clinical_trials, pubmed_articles, evidence_scores (THE differentiating IP — Ascend
  retrieves+cites but does NOT grade evidence), watchlist_items, updates,
  generated_answers, user_health_context; the /ask answer engine; the RN+Expo app.
- THE ONE BRIDGE TO DESIGN: match_core_source_chunks filters by provider+section, not
  by drug. Design how a drug_entity scopes to its source chunks (recommend a
  drug_entity_sources link table + drug_entity_id stamped into core_sources.metadata
  so the match fn gains an optional filter without a rewrite).

HARD CONSTRAINTS / NON-NEGOTIABLES
- Medical safety (doc 20): every medical claim needs a supporting source or it must
  say it can't. FDA/DailyMed prioritized for safety/label; ClinicalTrials.gov for
  trial status; PubMed for evidence. No diagnosis/dosing/start-stop-change advice.
  Emergency/overdose → Poison Control routing. Peptides/research compounds: separate
  human vs animal vs mechanistic evidence; never call them "safe."
- Store an answer trace for every generated answer (prompt version, model, source_ids,
  retrieval scores, safety flags) — doc 20 "required metadata."
- PharmaBro gets its OWN Supabase project. Do NOT couple to Ascend's DB.
- Per-provider ToS/attribution must be re-verified for a COMMERCIAL CONSUMER app
  (openFDA, DailyMed, ClinicalTrials.gov, NCBI) — Ascend's license gate is a head
  start, not a legal pass. Compliance is a LAUNCH GATE, not Phase-8 polish.
- "PharmaBro" is a working title with branding baggage — flag, don't block.

DELIVERABLES (produce all, as sectioned Markdown)
1. Validated architecture diagram + Layer A/B component map.
2. Data-model reconciliation: doc-10 tables ↔ Ascend core_sources/core_source_chunks;
   every net-new table with columns, FKs, indexes, RLS.
3. The Layer A↔B bridge design (concrete SQL sketch).
4. Phase-by-phase build plan (0→launch). Per phase: goal, ordered tasks, deliverables,
   ACCEPTANCE CRITERIA tied to doc-02 §10, rough effort, risks, dependencies.
   Phase 0 must be framed as the reuse go/no-go gate.
5. /ask pipeline detailed design: intent classify → entity detect → safety classify →
   retrieve → generate (doc-20 templates) → citation enforcement → trace store. Include
   the prompt-construction + citation-verification logic and failure paths (no-source,
   emergency).
6. Evidence-scoring engine design (the IP): inputs (FDA status, label presence, PubMed
   pub-types/counts, CT.gov phase/status/results, recency, consistency), scoring
   algorithm, conservative guardrails, claim-level vs drug-level, admin review.
7. Ingestion + freshness + watchlist/digest design: pg_cron jobs, change detection via
   content_hash/superseded_at, update ranking, weekly digest.
8. Safety + compliance plan: guardrail test suite vs doc-20 unsafe list, human-review
   queue, privacy/terms/disclaimer, account + health-context deletion, FDA MMA/CDS
   positioning, source attribution.
9. Mobile app plan: navigation, screen list + states (loading/empty/error/no-source/
   outdated/paywall/guest/offline), auth (Supabase + Apple/Google + guest), Source
   Viewer, offline cache.
10. Open decisions / risks requiring a human call.

METHOD
Be exhaustive and adversarial. Enumerate edge cases. Challenge the reuse assumption
explicitly (Phase 0). Prefer concrete (table columns, function signatures, file paths,
acceptance tests) over generic advice. Where you must assume, state the assumption.
Sequence backend/corpus first (it is the reusable asset and de-risks everything); the
mobile app can start against a frozen API contract after the /ask design is locked.
```

---

## How to use this

- **Cloud `/ultraplan`** (after installing the Claude GitHub app on the repo): run
  `/ultraplan` and paste the block, or just run it — the web session reads this file.
- **Local:** tell me "run this prompt locally" and I'll execute it here (I can also
  fan it out across subagents for a deeper pass if you opt into a multi-agent workflow).
- **Anywhere else:** paste into any agent that has this repo checked out.
