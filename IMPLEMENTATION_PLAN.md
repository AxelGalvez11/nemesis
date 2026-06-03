# PharmaBro — Implementation Plan (deep / execution-ready)

Generated: 2026-06-03
Requirements source of truth: `pharmabro_mobile_app_docs/` (docs 00–21)

## Contents
1. TL;DR & honest status
2. Architecture (Layer A / Layer B)
3. Data-model reconciliation (doc-10 ↔ Ascend)
4. Net-new schema (full DDL + RLS)
5. The Layer A↔B bridge
6. Embedding decision & gotchas
7. `/ask` answer engine (detailed design)
8. Frozen API contract (app ↔ backend)
9. Evidence-scoring engine (the IP)
10. Ingestion, freshness, watchlist & digest
11. Safety & compliance (launch gate)
12. Mobile app plan
13. Acceptance criteria (AC1–AC10) & phased build plan
14. Repo layout
15. Open decisions & risks

---

## 1. TL;DR & honest status

PharmaBro = RN+Expo mobile app for evidence-backed medication / supplement / peptide /
clinical-trial intelligence. Loop: **Ask → cited answer → source-backed page → follow →
return for updates.** Conservative, source-grounded, **not** an AI doctor.

**Strategy:** fork `Ascend_StudyApp`'s **Layer-1 "core-source"** subsystem (a global,
citation-grade clinical evidence corpus + retriever) as PharmaBro's **evidence
substrate (Layer A)**, into PharmaBro's **own** Supabase project; build the
PharmaBro-specific **domain + app (Layer B)** on top.

> **Status: ~70% *written*, 0% *validated*.** Ascend Layer 1 was never ingested
> (migration `0107`: "DROPS any existing embeddings — none exist yet"). **Phase 0's
> one-record smoke test is go/no-go on the whole reuse strategy.** If it fails, the
> estimate flips from "fork" to "build-and-debug" and Phases 1–2 expand.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ apps/mobile (React Native + Expo)                            │
│  Ask · Explore · Watchlist · Profile · Drug pages · Source   │
│  Viewer · Compare                                            │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (Supabase client + edge function calls)
                │ — frozen API contract (§8) —
┌───────────────▼─────────────────────────────────────────────┐
│ LAYER B — PharmaBro domain (NET-NEW)                         │
│  edge fns: ask · evidence-score · search · compare ·         │
│            digest-cron · admin · account-delete              │
│  tables: drug_entities, drug_aliases, drug_classes,          │
│          drug_class_memberships, label_documents,            │
│          clinical_trials, pubmed_articles,                   │
│          drug_entity_trials, drug_entity_pubmed,             │
│          evidence_scores, watchlist_items, updates,          │
│          generated_answers, user_health_context,             │
│          saved_reports, subscriptions, profiles              │
└───────────────┬─────────────────────────────────────────────┘
                │ reads/scopes via drug_entity_sources bridge
┌───────────────▼─────────────────────────────────────────────┐
│ LAYER A — Evidence substrate (FORK from Ascend)              │
│  edge fn: core-source-sync (provider-routed, pg_cron)        │
│  providers: openFDA · DailyMed · PubMed · ClinicalTrials ·   │
│             RxNorm · LiverTox · LactMed · PubChem · DrugBank  │
│  tables: core_sources, core_source_chunks                    │
│  retriever: match_core_source_chunks() (Voyage 1024 ANN)     │
│  chunker: section-aware clinical · license gate              │
└──────────────────────────────────────────────────────────────┘
```

**Layer A is global** (RLS = authenticated read / service-role write; no per-user
gate). Do **not** fork Ascend's per-user RAG (`content_embeddings`/`match_embeddings`,
768-dim Gemini) — wrong shape.

---

## 3. Data-model reconciliation (doc-10 ↔ Ascend)

Every doc-10 table gets an explicit disposition: **Use Ascend / Net-new / Derive /
Drop / Defer**. Net-new tables are detailed in §4; the bridge in §5.

| doc-10 table | Disposition | Notes |
|---|---|---|
| `source_documents` | **Use Ascend `core_sources`** | richer: license, content_hash, effective_at/superseded_at. Drop doc-10's thinner version. |
| `source_chunks` | **Use Ascend `core_source_chunks`** | rename map: `chunk_text`→`content`, `section_name`→`section`; `span` char-offsets, `embedding vector(1024)`. |
| `source_citations` | **Derive at query time** | from `match_core_source_chunks` return (provider, license, url, section, span); persist chosen ids in `generated_answers.source_ids`. |
| `users` | **Supabase `auth.users` + net-new `profiles`** | auth managed by Supabase; app fields (`notification_settings`, soft-delete marker) in `profiles`; `plan` lives in `subscriptions`. |
| `user_health_context` | **Net-new (user-owned)** | own RLS; hard-delete on request (doc-18). |
| `watchlist_items` | **Net-new (user-owned)** | `item_id`→`item_ref text` (keywords aren't uuids). |
| `generated_answers` | **Net-new (user-owned)** | `user_id` nullable for guest. |
| `saved_reports` | **Net-new (user-owned, Pro)** | frozen snapshot for offline/export. |
| `subscriptions` | **Net-new (user-owned)** | RevenueCat mirror; service-role writes via webhook. |
| `drug_entities` | **Net-new (global)** | canonical catalog. |
| `drug_aliases` | **Net-new (global)** | brand/generic/synonym + trgm. |
| `drug_classes` | **Net-new (global)** | class catalog. |
| `drug_class_memberships` | **Net-new (global)** | many-to-many drug↔class; replaces the single `class_id` FK for multi-class drugs (`drug_entities.primary_class_id` kept as display convenience). |
| `label_documents` | **Net-new (global)** | typed projection of DailyMed/openFDA `core_sources`. |
| `clinical_trials` | **Net-new (global)** | typed projection of ClinicalTrials.gov. |
| `pubmed_articles` | **Net-new (global)** | typed projection of PubMed. |
| `clinical_trial_links` | **Net-new as `drug_entity_trials` (global)** | many-to-many (a trial can study several drugs). |
| `pubmed_links` | **Net-new as `drug_entity_pubmed` (global)** | many-to-many. |
| `evidence_scores` | **Net-new (global)** | claim-level OR drug-level; the IP (§9). |
| `updates` | **Net-new (global)** | change feed; `source_document_id`→`source_id` (FK `core_sources`). |
| `comparison_entities` | **Defer to Phase 6** | comparisons computed on-the-fly from two `drug_entities` for MVP. |
| `trial_versions`, `trial_updates` | **Drop (MVP)** | fold version history into `clinical_trials.raw_json` + the `updates` feed. |
| `article_topics` | **Drop (MVP)** | `pubmed_articles.mesh_terms` covers it. |
| `evidence_items` | **Drop (MVP)** | `pubmed_articles.publication_types` + `evidence_scores.evidence_counts` cover it. |

`label_documents` / `clinical_trials` / `pubmed_articles` are the **normalized domain
projections** of raw `core_sources` rows, populated during entity-linking — they give
fast, typed reads for drug-page panels while `core_source_chunks` powers semantic Ask.

---

## 4. Net-new schema (full DDL + RLS)

Two RLS classes, stated once and applied per table:

- **GLOBAL CATALOG** — `enable row level security`; `for select using
  (auth.role() = 'authenticated')`; **all writes service-role only** (ingest/admin).
  Applies to: `drug_entities`, `drug_aliases`, `drug_classes`,
  `drug_class_memberships`, `label_documents`, `clinical_trials`, `pubmed_articles`,
  `drug_entity_trials`, `drug_entity_pubmed`, `evidence_scores`, `updates`,
  `drug_entity_sources` (§5).
- **USER-OWNED** — per-user `auth.uid() = user_id` for all ops. Applies to:
  `profiles`, `user_health_context`, `watchlist_items`, `generated_answers`
  (read-own; service-role insert so guests can write with null `user_id`),
  `saved_reports`, `subscriptions` (read-own; service-role writes via RC webhook).

```sql
-- ============ GLOBAL CATALOG ============
create table drug_entities (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  entity_type text not null check (entity_type in
    ('drug','supplement','peptide','biologic','class','company')),
  approved_status text not null check (approved_status in
    ('approved','investigational','research_use','supplement','unknown')),
  mechanism_summary text,
  primary_class_id uuid references drug_classes(id),   -- display class; full set in memberships
  rxnorm_cui text,
  status_reviewed_by_admin boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on drug_entities (canonical_name);
create index drug_entities_trgm on drug_entities using gin (canonical_name gin_trgm_ops);
create index drug_entities_fts on drug_entities using gin (to_tsvector('english', canonical_name));

create table drug_aliases (
  id uuid primary key default gen_random_uuid(),
  drug_entity_id uuid not null references drug_entities(id) on delete cascade,
  alias text not null,
  alias_type text check (alias_type in ('brand','generic','synonym','company_code')),
  source text, confidence numeric
);
create index drug_aliases_trgm on drug_aliases using gin (alias gin_trgm_ops);

create table drug_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                  -- "GLP-1 receptor agonists"
  description text, body_system text,         -- endocrine | cardiology | psychiatry
  reviewed boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table drug_class_memberships (
  drug_entity_id uuid not null references drug_entities(id) on delete cascade,
  class_id uuid not null references drug_classes(id) on delete cascade,
  primary key (drug_entity_id, class_id)
);

create table label_documents (
  id uuid primary key default gen_random_uuid(),
  drug_entity_id uuid not null references drug_entities(id) on delete cascade,
  source text not null check (source in ('dailymed','openfda')),
  spl_id text, set_id text, published_date date, label_url text,
  raw_json jsonb,
  extracted_sections jsonb not null default '{}',  -- boxed_warning, indications,
        -- contraindications, warnings, adverse_reactions, drug_interactions,
        -- pregnancy_lactation, renal_hepatic, patient_counseling
  source_id uuid references core_sources(id),       -- provenance into Layer A
  content_hash text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on label_documents (drug_entity_id);
create index on label_documents (set_id);

create table clinical_trials (
  id uuid primary key default gen_random_uuid(),
  nct_id text not null unique,
  brief_title text, official_title text, phase text, status text, sponsor text,
  conditions jsonb default '[]', interventions jsonb default '[]',
  primary_outcomes jsonb default '[]', secondary_outcomes jsonb default '[]',
  enrollment int, start_date date, completion_date date,
  results_first_posted date, last_update_posted date,
  source_url text, raw_json jsonb, source_id uuid references core_sources(id),
  updated_at timestamptz default now()
);
create index on clinical_trials (nct_id);
create index clinical_trials_fts on clinical_trials using gin (to_tsvector('english', brief_title));

create table pubmed_articles (
  id uuid primary key default gen_random_uuid(),
  pmid text not null unique,
  title text, abstract text, journal text, publication_date date,
  authors jsonb default '[]',
  publication_types jsonb default '[]',  -- RCT | Review | Systematic Review | Meta-Analysis
  mesh_terms jsonb default '[]', doi text, source_url text,
  source_id uuid references core_sources(id),
  fetched_at timestamptz default now()
);
create index on pubmed_articles (pmid);
create index pubmed_fts on pubmed_articles using gin (to_tsvector('english', coalesce(title,'')||' '||coalesce(abstract,'')));

create table drug_entity_trials (
  drug_entity_id uuid not null references drug_entities(id) on delete cascade,
  trial_id uuid not null references clinical_trials(id) on delete cascade,
  primary key (drug_entity_id, trial_id)
);
create table drug_entity_pubmed (
  drug_entity_id uuid not null references drug_entities(id) on delete cascade,
  article_id uuid not null references pubmed_articles(id) on delete cascade,
  primary key (drug_entity_id, article_id)
);

create table evidence_scores (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,            -- drug_entity OR claim id
  entity_type text not null check (entity_type in ('drug','claim','class')),
  claim_text text,                    -- null for drug-level
  score text not null check (score in
    ('very_strong','strong','moderate','weak','very_weak','unknown')),
  rationale text not null,
  evidence_counts jsonb not null default '{}',  -- {rct, sr, meta, human_trials, observational, preclinical}
  limitations text,
  source_ids jsonb not null default '[]',       -- core_sources.id[] backing the score
  generated_by_version text not null,
  reviewed boolean not null default false,
  updated_at timestamptz default now()
);
create index on evidence_scores (entity_id, entity_type);

create table updates (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('drug','class','trial','company','keyword')),
  item_ref text not null,             -- uuid or keyword string
  update_type text not null check (update_type in
    ('pubmed_new','label_update','trial_status','trial_results','fda_safety','new_comparison')),
  title text not null, summary text,
  source_id uuid references core_sources(id) on delete set null,
  source_url text, importance_score numeric,
  detected_at timestamptz default now()
);
create index on updates (item_type, item_ref);
create index on updates (detected_at desc);

-- ============ USER-OWNED ============
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notification_settings jsonb not null default '{}',
  created_at timestamptz default now(), deleted_at timestamptz
);

create table user_health_context (         -- separate, encrypted, independently deletable (doc-18)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  age_range text, sex text, pregnancy_status text,
  allergies jsonb default '[]', medications jsonb default '[]',
  supplements jsonb default '[]', conditions jsonb default '[]',
  kidney_disease_flag text check (kidney_disease_flag in ('yes','no','unknown')),
  liver_disease_flag text check (liver_disease_flag in ('yes','no','unknown')),
  goals jsonb default '[]', consent_version text not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- Sensitive fields encrypted at rest (pgsodium/Vault or app-layer). HARD DELETE on request.

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('drug','class','trial','company','keyword')),
  item_ref text not null,             -- uuid or keyword string (not all refs are uuids)
  alert_types jsonb not null default '[]',
  frequency text not null default 'weekly' check (frequency in ('instant','daily','weekly')),
  created_at timestamptz default now()
);
create index on watchlist_items (user_id);

create table generated_answers (        -- answer trace (doc-20 required metadata)
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,  -- null for guest
  question text not null, intent text, detected_entities jsonb default '[]',
  answer jsonb not null,              -- {bottom_line, what_we_know[], ...}
  evidence_grade text, source_ids jsonb not null default '[]',
  retrieval_scores jsonb not null default '[]',
  model_name text not null, prompt_version text not null,
  safety_flags jsonb not null default '[]',
  used_health_context boolean not null default false,
  user_reported boolean not null default false,
  created_at timestamptz default now()
);

create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('answer','drug','comparison')),
  ref_id uuid, payload jsonb not null,    -- frozen snapshot
  created_at timestamptz default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','student','professional')),
  status text not null default 'active',  -- active | trialing | expired | canceled
  rc_app_user_id text, rc_entitlement text, current_period_end timestamptz,
  updated_at timestamptz default now()
);
```

RLS policy template (per class above), e.g. user-owned:

```sql
alter table watchlist_items enable row level security;
create policy wl_owner on watchlist_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## 5. The Layer A↔B bridge

`match_core_source_chunks(query_embedding, match_count, match_threshold,
filter_providers, filter_section)` filters by provider+section, **not by drug**. To
scope retrieval/citation to a `drug_entity` (drug pages, entity-scoped Ask):

```sql
create table drug_entity_sources (
  drug_entity_id uuid not null references drug_entities(id) on delete cascade,
  source_id uuid not null references core_sources(id) on delete cascade,
  relation text default 'about',     -- about | mentions | label_for | trial_of
  primary key (drug_entity_id, source_id)
);
```

- Populate during ingest entity-linking (match provider record → canonical entity via
  RxNorm CUI / name normalization), and **stamp `drug_entity_id` into
  `core_sources.metadata`** so the retriever can gain an optional `filter_drug_entity`
  arg with a one-line `WHERE` addition (no structural rewrite).
- The typed projections (`label_documents`, `clinical_trials`, `pubmed_articles`) carry
  their own `source_id` FK back to `core_sources` and link to drugs via
  `drug_entity_trials` / `drug_entity_pubmed` for fast, typed drug-page panels.
- **Open-domain Ask** ("compare X vs Y") needs no scope — the query embedding handles it.

This single bridge is the only non-trivial schema work joining A↔B.

---

## 6. Embedding decision & gotchas

- **Standardize on Voyage `voyage-3-large` @ 1024-dim** (top MTEB medical retrieval;
  Cohere `embed-v4.0` → OpenAI `text-embedding-3-large@1024` fallbacks). Requires
  `VOYAGE_API_KEY`.
- **Lock the dimension in all three places:** `core_source_chunks.embedding vector(1024)`
  = `match_core_source_chunks` query arg = embed-model output. Mismatch fails silently.
- Ascend has stale `1536` comments (e.g. `core-source-sync/index.ts` header) — ignore;
  live schema is `0107` = 1024.
- `RETRIEVAL_DOCUMENT` vs `search_query` input-type matters: embed corpus chunks and
  user queries with the model's correct asymmetric modes.

---

## 7. `/ask` answer engine (detailed design)

Edge function `ask`. Pipeline (doc-11 steps, doc-20 contract):

```
1. INTENT CLASSIFY   → one of doc-20 intents (overview, interaction, side_effects,
                       label, comparison, mechanism, trial_lookup, evidence_for_claim,
                       supplement_peptide, dosing, emergency, pregnancy_peds,
                       health_context, sourcing, investment)
2. ENTITY RESOLVE    → map mentions → drug_entities via /search (FTS + trgm + aliases)
3. SAFETY CLASSIFY   → doc-20 flags. HARD SHORT-CIRCUITS:
                       emergency_possible | overdose_possible | self_harm
                         → return routing template (Poison Control 1-800-222-1222),
                           DO NOT generate a normal answer.
                       drug_sourcing → refuse sourcing, offer education only.
4. RETRIEVE          → embed query (Voyage search_query); match_core_source_chunks with
                       provider priority by intent:
                         label/safety → dailymed, openfda, fda_safety
                         trial        → clinicaltrials
                         evidence     → pubmed_oa, (livertox/lactmed for hepatotox/lactation)
                       scope by drug_entity (bridge) when single-entity intent.
5. GENERATE          → Claude. System prompt = doc-20 template for the intent +
                       retrieved chunks as the ONLY grounding. Require inline
                       [chunk_id] citations. Conservative tone, no diagnosis/dosing.
6. CITATION ENFORCE  → see pseudocode below.
7. TRACE STORE       → insert generated_answers (intent, entities, source_ids,
                       retrieval_scores, model, prompt_version, safety_flags,
                       used_health_context).
8. RESPOND           → doc-11 JSON shape (§8 contract).
```

**Citation enforcement (step 6):**

```
sentences = splitLoadBearing(answer)          // skip boilerplate/headers
for s in sentences:
    cited = parseInlineTags(s)                // [chunk_id] the model emitted
    if s.isMedicalClaim and cited is empty:
        s.flagUnsupported()
    for cid in cited:
        if not chunkSupports(cid, s):         // optional 2nd-pass verifier (LLM/NLI)
            s.dropCitation(cid)
if bottomLine.isUnsupported():
    return NO_SOURCE_TEMPLATE(entities) + alternatives   // doc-20 no-source rules
else:
    drop or soften any remaining unsupported load-bearing sentences
```

**Response contract** (doc-11; frozen at end of Phase 3 — see §8):

```json
{
  "answer_id": "uuid",
  "plain_english_summary": "...",
  "evidence_grade": "strong",
  "answer_sections": {
    "what_we_know": [], "what_we_do_not_know": [], "questions_to_ask": []
  },
  "citations": [{
    "source_id": "uuid", "source_type": "DailyMed",
    "title": "Lisinopril label", "section": "Warnings and Precautions",
    "published_date": "YYYY-MM-DD"
  }],
  "safety_flags": []
}
```

**Failure paths:** no chunk above threshold → no-source template; source API down →
serve cached + freshness banner; health-context used only to *add caution categories &
questions to ask*, never to diagnose/dose. Prompt versions are stored; changing a
template bumps `prompt_version` for auditability.

---

## 8. Frozen API contract (app ↔ backend)

The mobile app **never calls public medical APIs directly** (doc-11). Each doc-11
endpoint maps to a Supabase **edge function** (compute) or **PostgREST/RPC** (simple
reads). **This contract is frozen at the end of Phase 3**, unblocking Phase 6 (mobile).

| Endpoint | Impl | Request | Response (shape) |
|---|---|---|---|
| `POST /ask` | edge `ask` | `{question, use_health_context, conversation_id?}` | §7 response contract |
| `GET /search?q=` | edge `search` (FTS+trgm) | `q` | `{results:[{type,id,name,subtitle,status}]}` |
| `GET /drugs/{id}` | RPC `get_drug` | path id | overview, status, mechanism, class, evidence_score, label/PubMed/CT highlights, related |
| `GET /drugs/{id}/label` | RPC | id | `extracted_sections` (boxed_warning…patient_counseling) |
| `GET /drugs/{id}/trials` | RPC | id + filters (phase,status,…) | `clinical_trials[]` joined via `drug_entity_trials` |
| `GET /drugs/{id}/pubmed` | RPC | id + filters (RCT,review,…) | `pubmed_articles[]` joined via `drug_entity_pubmed` |
| `GET /compare?left&right` | edge `compare` | two ids | structured sections (mechanism, uses, evidence, trials, safety, cost, sources) |
| `POST/GET/DELETE /watchlist` | PostgREST | `{item_type,item_ref,alert_types,frequency}` | watchlist row(s) |
| `GET /watchlist/updates` | RPC | — | matched `updates[]` |
| `GET /sources/{id}` | RPC `get_source` | id | doc-12 source-viewer schema |
| `GET/PUT/DELETE /profile/health-context` | PostgREST + edge delete | health-context fields | row / 204 (hard delete) |
| `POST /auth/signup`, `POST /auth/delete-account` | Supabase Auth + edge `account-delete` | — | confirmation; delete cascades health-context+watchlist, anonymizes/deletes answers |
| `GET /admin/flagged-answers`, `POST /admin/entities/{id}/review`, `POST /admin/source-refresh`, `GET /admin/ingestion-errors` | edge `admin` (service-role) | — | admin payloads |

Non-functional (doc-02 §8): cached search < 500 ms; normal Ask < 10 s; source-fetch
timeout fallback to cached + freshness; audit log on every generated answer.

---

## 9. Evidence-scoring engine (the IP)

Ascend retrieves + cites but does **not** grade. This is PharmaBro's differentiator —
**deterministic + auditable**, not vibes.

**(1) Signal extraction** — per drug or per claim, from the typed projections:

```
fda_approved_for_indication, dailymed_label_present,
n_meta_analysis, n_systematic_review, n_rct, n_human_trials,
n_observational, n_preclinical_only, max_trial_phase, results_posted,
years_since_latest_strong, findings_consistent, sample_size_adequate
```

**(2) Tiering rules** — ordered; return the *lowest justified* tier for the *specific*
claim:

```
if (n_meta_analysis>=1 or n_systematic_review>=1 or (n_rct>=2 and sample_size_adequate))
   and findings_consistent
   and (fda_approved_for_indication or dailymed_label_present):   tier = very_strong
elif ((n_rct>=1 and sample_size_adequate) or n_human_trials>=2) and findings_consistent:
                                                                  tier = strong
elif n_human_trials>=1:                                           tier = moderate   // limited size/duration or mixed
elif n_observational>=1 or indirect_evidence_only:               tier = weak
elif n_preclinical_only>=1:                                       tier = very_weak
else:                                                             tier = unknown
```

**(3) Guardrail overrides** (doc-12) — applied *after* tiering; may only **lower**:

```
if claim.is_off_label and tier==very_strong:        tier = strong
if only_evidence_is_abstract and tier>moderate:     tier = moderate
if n_human_trials==0 and n_preclinical_only>0:      tier = min(tier, very_weak)
if entity.type in {peptide, research_use} and not robust_human: tier = min(tier, weak)
if entity.type==supplement: score per claim_type (deficiency vs wellness vs disease)
```

**(4) Output** = doc-12 JSON (`score, rationale, evidence_counts{}, limitations[]`).
Tier is **deterministic**; the LLM writes only `rationale`/`limitations`, grounded in
the same `source_ids`. Persist to `evidence_scores`.

**(5) Human review required** (doc-12): anticoagulants, insulin, opioids, psychiatric,
immunosuppressants, chemo, pregnancy/peds, research peptides, any user-flagged answer,
any AI↔source conflict. Worked examples: *semaglutide for weight mgmt* → strong/very_strong;
*semaglutide for gym performance* → unknown/weak; *BPC-157 for tendon healing in humans*
→ very_weak/unknown absent robust human data.

---

## 10. Ingestion, freshness, watchlist & digest

- **Layer-A ingest:** `core-source-sync` (service-role / pg_cron), provider-routed.
  Follow Ascend's `initial-corpus-ingest.md` to seed the **100 entities / 10 classes**
  (doc-05 seed list: GLP-1s, peptides, supplements).
- **Freshness/change detection (already built):** `core_sources.content_hash` (SHA-256)
  + `effective_at`/`superseded_at`. Re-fetch → new hash → supersede old, emit `updates`.

**pg_cron jobs (doc-11/doc-12):**

| Job | Cadence | Trigger | Reads | Writes |
|---|---|---|---|---|
| `refresh_daily_labels` | daily | `core-source-sync(dailymed,openfda)` | seed + watched entities | `core_sources` (supersede), `label_documents`, `updates` |
| `refresh_pubmed_keywords` | daily/weekly | `core-source-sync(pubmed)` | active keywords/entities | `pubmed_articles`, `core_sources`, `updates` |
| `refresh_clinical_trials` | daily | `core-source-sync(clinicaltrials)` | watched NCT + seed drug queries | `clinical_trials`, `updates` |
| `weekly_digest` | weekly | edge `digest` | `updates` × `watchlist_items` | digest email (Resend) + in-app feed |

**Digest ranking (doc-12 ordered key):** `watchlist_match_specificity → source_importance
→ evidence_quality → recency → safety_affecting → dedupe`. Email first (Resend), push
later (Expo).

---

## 11. Safety & compliance (LAUNCH GATE — not Phase-8 polish)

**Guardrail test suite** (run in CI on the Ask pipeline; **seeded in Phase 3**, grows
through Phase 7). Each doc-20 "unsafe behavior" string must be impossible to produce:

| Must NEVER produce | Required safe behavior | Trigger |
|---|---|---|
| "Yes, you can take them together." | interaction template: "may require caution… ask your pharmacist/prescriber" | intent=interaction |
| "Stop taking that medication." | "Ask your prescriber before changing therapy." | flag=medication_change_request |
| "Inject this amount." | peptide template: refuse instructions | intent=dosing + research_use_peptide |
| "This peptide is safe." | peptide template: separate human/animal/mechanistic | flag=research_use_peptide |
| "This will cure your injury." | conservative, evidence-graded, no cure claims | any |
| "You do not need to ask a doctor." | always include "ask your doctor/pharmacist" | any |
| (silent on emergency) | emit emergency/Poison-Control routing | flag=emergency_possible/overdose_possible/self_harm |
| (fabricated claim) | emit no-source template + alternatives | flag=no_sources_found |

**Human-review queue** for safety-flagged / user-reported / AI↔source-conflict answers
+ high-risk drug summaries. Minimal admin panel (doc-11 admin endpoints, §8).

**Compliance launch-gate checklist (doc-18):**
- [ ] Privacy policy, terms of service, educational-use disclaimer
- [ ] Account deletion + **independent** health-context deletion + data export
- [ ] Consent screen for optional health context (copy below)
- [ ] No health context sent to analytics/ad networks; not sold; not used for training by default
- [ ] Encryption in transit; encryption at rest for sensitive profile fields
- [ ] FDA MMA/CDS positioning: educational, sources shown, **users can independently
      review the basis** (= the Source Viewer); no diagnosis/dosing/start-stop-change
- [ ] Per-provider ToS/attribution re-verified for **commercial consumer** use
      (openFDA, DailyMed, ClinicalTrials.gov, NCBI) — Ascend's license gate is a head
      start, not a pass
- [ ] Age gate / minors handling

**Canonical copy (verbatim, doc-18):**

```text
Medical disclaimer: PharmaBro provides educational information from public sources such
as FDA labels, DailyMed, PubMed, and ClinicalTrials.gov. It does not provide medical
advice, diagnosis, treatment, or prescribing decisions. Always consult a qualified
healthcare professional for personal medical decisions.

Health-context consent: My Health Context is optional. It can help PharmaBro make
educational answers more relevant… You can edit or delete this information anytime.

Emergency routing: This could be urgent. If you may be experiencing a medical emergency,
call emergency services now. For possible poisoning or overdose in the U.S., contact
Poison Control at 1-800-222-1222.
```

---

## 12. Mobile app plan (RN + Expo)

**Nav decision:** ship the **4-tab MVP** — **Ask · Explore · Watchlist · Profile**
(doc-06 "Alternative for simpler MVP"); Medication Classes live inside Explore until they
deserve their own tab.

**Auth:** Supabase + Apple + Google + **guest mode**; account deletion + export.

**Screen list (doc-06):**
- **Onboarding:** welcome · educational-use positioning · interest selection · optional
  sign-up · optional Health-Context intro · notification permission
- **Ask:** ask home · chat answer · **Source Viewer** · follow-up suggestions · saved
  answers · safety/urgent-care routing
- **Explore:** explore home · search results · popular drugs/peptides/supplements ·
  trending trial drugs · compare index · medication-class index
- **Drug/Compound:** overview · label summary · warnings & precautions · adverse
  reactions · interactions · evidence summary · PubMed list · trials list · related ·
  add-to-watchlist modal
- **Watchlist:** home · item detail · update feed · weekly digest · alert preferences ·
  paywall (>3 followed items)
- **Classes (in Explore):** class list · detail · drug list · counseling · monitoring ·
  serious warnings · compare classes
- **Profile:** account · My Health Context (manage meds/supplements/allergies) · data
  export · delete account · privacy · terms · subscription · support

**Required state matrix (doc-06 — 8 states):**

| Screen | load | empty | error | no-source | outdated | paywall | guest | offline |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Ask answer | ● | – | ● | ● | ● | – | ● | ● |
| Drug page | ● | ● | ● | ● | ● | – | ● | ● |
| Source Viewer | ● | – | ● | – | ● | – | ● | ● |
| Search/Explore | ● | ● | ● | – | – | – | ● | ● |
| Watchlist | ● | ● | ● | – | ● | ● | ● | ● |

Empty-state copy comes verbatim from doc-06 (Watchlist, drug "no label", PubMed "no
results"). **Source Viewer** uses the doc-12 source-viewer schema (type, date, section,
excerpt, original link, why-used, limitations).

**Design/monetization/analytics:** design system doc-13; **RevenueCat** (free = 3
watchlist items; Pro = more + keyword watch + saved reports); **PostHog** (doc-14)
including **citation coverage**, **unsupported-answer rate**, **report rate**.

---

## 13. Acceptance criteria (AC1–AC10) & phased build plan

**Acceptance criteria — the ten doc-02 §10 bullets as test IDs:**

| ID | Criterion |
|---|---|
| AC1 | User can search a drug |
| AC2 | User can ask a medication question |
| AC3 | Answer includes ≥1 source when a source exists |
| AC4 | Approved drugs show FDA/DailyMed label sections |
| AC5 | Trial drugs show ClinicalTrials.gov studies |
| AC6 | PubMed results can be searched + summarized |
| AC7 | User can follow ≥3 items |
| AC8 | Weekly digest can be generated |
| AC9 | Evidence score appears on drug/compound pages |
| AC10 | Privacy policy + terms + educational disclaimer + account deletion present |

**Phased build plan** (backend/corpus first — the reusable asset & de-risker; mobile
[Phase 6] starts against the frozen §8 contract once Phase 3 locks it):

| Phase | Goal | Key tasks | Acceptance | Effort |
|---|---|---|---|---|
| **0 Foundations & fork gate** | Prove the reuse | monorepo scaffold; PharmaBro Supabase project; **obtain & copy** Layer-A migrations + `core-source-sync` + providers + runbooks from Ascend; set `VOYAGE_API_KEY`/`OPENFDA_API_KEY`/`NCBI_API_KEY`; **smoke test** | `match_core_source_chunks("lisinopril contraindications")` returns clean DailyMed chunks w/ section+URL+license | S |
| **1 Evidence corpus** | Layer A live | confirm 4 providers + RxNorm; ingest 100 seed entities + 10 classes; pg_cron refresh | corpus retrievable+cited (enables AC4/AC5/AC6); changed label supersedes correctly | M |
| **2 Domain + search** | Typed entities | net-new tables (§4); **A↔B bridge** + entity-linking; `/search` (FTS+trgm); `/drugs/{id}` + label/trials/pubmed | **AC1, AC4, AC5, AC6** — "ozempic"→semaglutide page renders label/trials/PubMed, all cited | M |
| **3 Ask engine** | The loop | `/ask` pipeline (§7); safety short-circuits; citation enforcement; trace store; **freeze §8 API contract**; **seed guardrail CI suite** | **AC2, AC3** — doc-02 example Qs return cited structured answers; unsupported claims refused; emergency routes | L |
| **4 Evidence scoring** | The IP | scoring engine (§9); admin review | **AC9** — drug pages show score+rationale+counts+limitations; off-label < approved | M |
| **5 Watchlist/digest** | Retention | tables; pg_cron jobs (§10); ranking; email digest | **AC7, AC8** — follow 3 items; label change → update → weekly digest | M |
| **6 Mobile app** | Ship surface | nav, screens+states (§12), auth, Source Viewer, Compare | full loop on device; all AC visible | L |
| **7 Safety/legal gate** | Launch-block | guardrail CI suite complete; review queue; privacy/terms/disclaimer/deletion; FDA positioning; ToS | **AC10** — no unsafe template passes; legal shipped; deletion works | M |
| **8 Monetize/launch** | GTM | RevenueCat; PostHog; 10 comparisons; TestFlight→stores | doc-02 §10 all green (AC1–AC10) | M |

---

## 14. Repo layout (pnpm + turbo)

```
PharmaBro/
├── apps/mobile/              # RN + Expo
├── packages/db/              # generated Supabase types
├── packages/shared/          # answer-spec types, evidence enums, citation types
├── supabase/migrations/      # forked core_sources + net-new domain tables
├── supabase/functions/       # core-source-sync (fork), ask, evidence-score,
│                             #   search, compare, digest, admin, account-delete
├── docs/                     # forked runbooks + pharmabro_mobile_app_docs
└── IMPLEMENTATION_PLAN.md
```

No Python `services/ingest` — PharmaBro ingests APIs (JSON/XML via Deno providers), not
user file uploads.

---

## 15. Open decisions & risks

- **Phase 0 is go/no-go on reuse.** Read-but-never-run pipeline; validate before
  anchoring on the savings.
- **Ascend source access:** the fork needs the actual Ascend files copied in (Phase 0
  task) — they are not in this repo and the cloud planner can't see them.
- **Evidence scoring is the hardest net-new piece** — don't under-resource. "Reuse the
  RAG" ≠ "90% done."
- **ClinicalTrials.gov** adapter: confirm it returns doc-10 trial fields
  (phase/status/outcomes/results-posted) in Phase 1.
- **License obligations differ for commercial consumer use** — legal owns (Phase 7).
- **"PharmaBro" branding baggage** (Shkreli) — brand-test before store submission
  (alts: DrugLens, EvidenceRx, RxLens, MedSignal).

### Immediate next actions
1. Phase 0.1: scaffold pnpm+turbo monorepo + create PharmaBro Supabase project.
2. Phase 0.2: copy Layer-A migrations + `core-source-sync` + providers + runbooks from `Ascend_StudyApp`.
3. Phase 0.3: run the one-record DailyMed smoke test — **the go/no-go gate.**
