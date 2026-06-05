# PharmaOrb Web-First Ultraplan

Generated: 2026-06-05

## 1. Executive Direction

PharmaOrb should launch web first, then mobile.

The repo already has the hard part partially built: a Supabase evidence substrate,
domain projections for drugs/trials/PubMed/labels, deterministic evidence scoring,
an Ask pipeline with citation enforcement, watchlists, digests, source viewer flows,
and an Expo mobile app. The next step is not to restart. The next step is to add a
production web app on top of the existing backend, introduce real entitlements and
usage controls, then progressively deepen the evidence engine.

Core product positioning:

```text
PharmaOrb is a source-grounded biomedical evidence engine for medications,
supplements, trials, safety updates, and health research.
```

Consumer-facing launch positioning:

```text
Ask evidence-based questions about medications, supplements, and health research,
with citations from trusted public sources.
```

Internal moat:

```text
ChatGPT answers when asked. PharmaOrb continuously watches biomedical evidence,
ranks it, explains it, cites it, and connects it to drugs, conditions, safety
updates, reports, and user watchlists.
```

## 2. Current Repo Architecture

The existing architecture is a strong base and should be preserved.

```text
landing/
  Next.js marketing/waitlist landing page.

apps/mobile/
  Expo + React Native mobile app.
  Current app surfaces: Ask, Explore, Watchlist, Profile, Source Viewer,
  Drug pages, Compare, Health Context, subscription stub.

packages/shared/
  Shared DTOs, answer types, evidence scoring, watchlist/digest ranking,
  health-context types, comparison types.

supabase/
  Migrations, edge functions, source ingestion, Ask pipeline, search,
  compare, account lifecycle, evidence/domain schema.

docs/
  Source strategy, corpus plan, validation artifacts, runbooks.

pharmabro_mobile_app_docs/
  Historical mobile-first product docs, PRD, architecture, monetization,
  compliance, roadmap, QA, risk register.
```

Current Layer A / Layer B split:

```text
Layer A: Evidence substrate
  core_sources
  core_source_chunks
  source providers
  embeddings
  pgvector retrieval
  source license/provenance

Layer B: PharmaOrb domain
  drug_entities
  drug_aliases
  drug_classes
  label_documents
  clinical_trials
  pubmed_articles
  evidence_scores
  updates
  watchlist_items
  digests
  generated_answers
  user_health_context
  saved_reports
  subscriptions
```

Important existing files:

- `IMPLEMENTATION_PLAN.md`: current execution architecture and phase history.
- `README.md`: repo-level architecture summary.
- `supabase/functions/ask/index.ts`: source-grounded Ask pipeline.
- `packages/shared/src/evidence-scoring.ts`: deterministic evidence scoring.
- `supabase/migrations/0109_pharmabro_domain_schema.sql`: core domain schema.
- `supabase/migrations/0116_watchlist_digest.sql`: digest/watchlist update model.
- `apps/mobile/src/app/profile/subscription.tsx`: current subscription stub.
- `landing/`: current public marketing page.

## 3. Target Product Architecture

Add a new production web app:

```text
apps/web/
```

Recommended final app structure:

```text
apps/web/
  app/
    (marketing)/
      page.tsx
      pricing/page.tsx
      legal/
    (app)/
      app/page.tsx
      app/ask/page.tsx
      app/explore/page.tsx
      app/drugs/[id]/page.tsx
      app/source/[id]/page.tsx
      app/watchlist/page.tsx
      app/briefs/page.tsx
      app/saved/page.tsx
      app/reports/page.tsx
      app/reports/[id]/page.tsx
      app/profile/page.tsx
      app/billing/page.tsx
    api/
      stripe/webhook/route.ts
  components/
  lib/
  tests/
```

Keep `landing/` short term. Later either:

1. Keep it as a standalone marketing microsite.
2. Fold it into `apps/web/(marketing)` once the web app is mature.

Do not make mobile the first paid surface. Mobile should become a polished client
after web proves subscriptions, reports, entitlement checks, and retention loops.

## 4. Product Ladder

Target tier ladder:

```text
Free -> Plus -> Pro -> Professional -> Intelligence/Enterprise
```

### Free

Purpose: trust, acquisition, cited answers.

Launch features:

- Limited Ask questions per day.
- Basic citations.
- Drug/supplement/peptide pages.
- Source viewer.
- 3 watchlist items.
- Basic weekly digest.
- Basic evidence grade.
- Safety disclaimers.

### Plus

Purpose: retention and personalization.

Features:

- Higher Ask limit.
- 25 to 50 watchlist items.
- Personalized Orb Briefs.
- Health context.
- Saved folders.
- Hype Detector.
- PubMed keyword alerts.
- ClinicalTrials.gov alerts.
- Daily/weekly personalized feed.

### Pro

Purpose: deliverables.

Features:

- Deep Research Reports.
- Evidence Brief Builder.
- PDF export.
- PowerPoint export.
- Study comparison.
- Journal Club Mode.
- Research manuscript draft support.
- Creator Mode.
- Advanced evidence tables.

### Professional

Purpose: clinician, educator, pharmacy/medical training workflows.

Features:

- Professional answer mode.
- Guideline monitoring.
- Patient handouts.
- Clinical case builder.
- Audit trails.
- Institutional templates.
- Advanced evidence grading.
- Team folders for small groups.

### Intelligence / Enterprise

Purpose: B2B intelligence.

Features:

- Organization accounts.
- Biomedical trend dashboards.
- Competitive intelligence reports.
- Supplement formulation intelligence.
- Drug pipeline dashboards.
- API access.
- White-label reports.
- Automated SLR assistant.
- Claim-risk reports.

## 5. Source and Evidence Strategy

Do not make the LLM decide evidence from memory.

Target pipeline:

```text
Source ingestion
  -> structured normalization
  -> entity linking
  -> source chunks
  -> embeddings and keyword indexes
  -> retrieval
  -> evidence ranking
  -> citation pack
  -> controlled LLM synthesis
  -> citation/safety validation
  -> trace storage
```

Current MVP sources:

- openFDA labels.
- DailyMed fallback.
- PubMed/PubMed OA current provider path.
- ClinicalTrials.gov.
- RxNorm.
- Orange Book.
- Purple Book.
- CMS NADAC provenance/pricing projection.

Future source expansion:

- PubMed baseline XML.
- PubMed daily update XML.
- PMC Open Access full text.
- FDA safety communications.
- FDA recalls/enforcement reports.
- Guideline source metadata and cite-by-reference summaries.
- MeSH normalization.
- LOINC biomarker normalization.
- Better RxNorm/RxNav normalization.

Important source rule:

```text
PubMed abstracts are usually abstract-only. Do not imply full text exists unless
the source is PMC OA or another legally available full-text source.
```

Chunking rules:

```text
PubMed abstract:
  one article = one main canonical chunk

PMC OA full text:
  abstract chunk
  methods chunk
  results chunk
  safety/adverse-events chunk
  discussion chunk
  table/figure-text chunks when useful

FDA/openFDA/DailyMed:
  section-aware chunks: indications, boxed warning, contraindications,
  warnings, adverse reactions, interactions, pregnancy/lactation,
  renal/hepatic, patient counseling

ClinicalTrials.gov:
  study overview chunk
  eligibility chunk
  outcomes chunk
  results chunk when posted
```

## 6. Retrieval Architecture

Current retrieval is good enough for MVP, but the target is hybrid biomedical RAG.

Avoid this:

```text
question -> vector search -> LLM answer
```

Target:

```text
question
  -> classify intent
  -> extract entities
  -> normalize drugs/diseases/labs
  -> expand query
  -> retrieve from structured SQL + BM25 + vector search
  -> evidence-rank and rerank
  -> build citation pack
  -> generate answer/report/brief
  -> enforce citation and safety rules
  -> store trace
```

MVP retrieval stack:

```text
Supabase Postgres
pgvector
Postgres FTS/trgm
structured SQL filters
entity aliases
deterministic evidence scoring
```

Scale retrieval stack:

```text
Postgres = canonical structured data
OpenSearch = BM25/keyword retrieval
Qdrant = scalable vector retrieval
Redis/SQS = queue/cache
Temporal/Celery = ingestion workflows
S3/R2/Supabase Storage = raw source archive
reranker = final citation-pack ranking
```

Ranking inputs:

- Semantic similarity.
- Keyword/BM25 score.
- Exact drug/entity match.
- Disease/topic match.
- Human study flag.
- Publication type.
- Evidence tier.
- Recency.
- Safety relevance.
- Watchlist/user relevance.
- Source authority.
- Retraction/exclusion status.

Evidence quality order:

```text
FDA boxed warning / safety communication
Guideline / consensus statement
FDA label update
Meta-analysis / systematic review
Randomized controlled trial
Phase 3 trial
Phase 2 trial
Large cohort study
Small observational study
Case report
Animal study
In vitro study
Editorial/comment
Retracted source: exclude
```

## 7. Web-First Implementation Phases

### Phase 0: Naming, Scope, and Entitlement Foundation

Goal: align repo and backend with the web-first PharmaOrb plan.

Tasks:

- Decide whether repo remains `PharmaBro` internally or fully renames to PharmaOrb.
- Update user-facing copy to PharmaOrb in web and landing surfaces.
- Keep historical docs as-is unless a deliberate rename pass is scheduled.
- Extend `subscriptions.plan` to support:
  - `free`
  - `plus`
  - `pro`
  - `professional`
  - `enterprise`
- Add an entitlement resolver shared by web, mobile, and edge functions.
- Add backend usage tracking.
- Enforce limits server-side, not just in client constants.

New backend concepts:

```text
plans
plan_entitlements
usage_events
usage_counters
entitlement_checks
```

Acceptance criteria:

- Backend can answer "can this user do X?" for Ask, watchlist, report export,
  professional mode, and saved reports.
- A Free user cannot bypass limits by calling Supabase/edge functions directly.
- Client-side limits are only UX hints, not security boundaries.

### Phase 1: Web MVP

Goal: launch a usable web product on the existing backend.

Build `apps/web`.

MVP routes:

```text
/                       marketing or redirect
/pricing                public pricing
/app                    app dashboard
/app/ask                Ask PharmaOrb
/app/explore            search
/app/drugs/[id]         drug/supplement/peptide page
/app/source/[id]        source viewer
/app/watchlist          follows, updates, digest
/app/saved              saved answers/reports
/app/profile            profile and health context
/app/billing            subscription status
/legal/privacy          privacy
/legal/terms            terms
/legal/disclaimer       medical disclaimer
```

Use existing backend surfaces:

- `ask` edge function.
- `search_entities` RPC.
- drug read RPCs.
- `get_source` RPC.
- `watchlist_items`.
- `get_watchlist_updates`.
- `digests`.
- `user_health_context`.
- `generated_answers`.
- `saved_reports`.

MVP UX requirements:

- Show citations inline.
- Source viewer must be one click from every citation.
- Show evidence grade and source freshness.
- Show "educational, not medical advice" framing without overwhelming every screen.
- Let users add/remove watchlist items.
- Show digest and update feed.
- Let users save answers.

Acceptance criteria:

- A signed-in user can ask a cited question.
- A signed-in user can inspect every cited source.
- A signed-in user can search for a drug/supplement/peptide.
- A signed-in user can follow an item and see updates/digest.
- A Free user sees upgrade prompts at entitlement boundaries.

### Phase 2: Web Monetization and Plus

Goal: convert retention workflows into paid value.

Tasks:

- Add Stripe subscriptions for web.
- Add Stripe webhook to mirror plan/status into `subscriptions`.
- Add pricing page.
- Add upgrade flow.
- Add billing portal.
- Add Plus entitlement limits.
- Add personalized Orb Briefs.
- Expand watchlist limit.
- Add saved folders.
- Add Hype Detector.

Plus features:

- Higher Ask limit.
- 25 to 50 watchlist items.
- Personalized feed.
- Health context-aware educational answers.
- More saved answers/folders.
- PubMed keyword and trial alerts.

Acceptance criteria:

- Stripe checkout upgrades a user to Plus.
- Webhook updates `subscriptions`.
- Entitlement resolver immediately recognizes Plus.
- Plus user can exceed Free watchlist/Ask limits.
- Free user cannot exceed limits via direct API calls.

### Phase 3: Monitoring Moat

Goal: make watchlists the retention engine.

Tasks:

- Upgrade watchlist model from simple `item_type/item_ref` toward richer saved queries.
- Add alert thresholds.
- Add alert type preferences.
- Improve detect-updates jobs.
- Add daily source update runner.
- Add ranked Orb Brief generation.
- Add email digests.
- Add in-app notification feed.

New or expanded schema:

```text
watchlist_queries
watchlist_entities
alert_preferences
notifications
briefs
brief_items
```

Monitoring flow:

```text
daily source update
  -> changed/new source records
  -> entity extraction/linking
  -> update emission
  -> watchlist matching
  -> importance scoring
  -> silent save / digest / alert
  -> Orb Brief generation
```

Alert tiers:

```text
low score: save silently
medium score: weekly digest
high score: in-app alert
very high score: email/push alert
```

Acceptance criteria:

- A user can follow "GLP-1s and fatty liver" as a richer watchlist concept.
- New PubMed/trial/FDA updates can match that watchlist.
- Important updates are ranked above noisy updates.
- Orb Brief explains why each update matters with citations.

### Phase 4: Hybrid Retrieval Upgrade

Goal: improve answer quality and prepare for reports.

Tasks:

- Add query expansion using aliases, RxNorm, MeSH-style synonyms, and curated mappings.
- Add structured retrieval filters by entity, provider, source type, publication type,
  study type, date, and evidence level.
- Add BM25 retrieval. Start with Postgres FTS if needed, then move to OpenSearch.
- Add reranking.
- Add contradiction/limitation retrieval.
- Add source-pack construction separate from answer generation.

Search example:

```text
Question: Does Ozempic help fatty liver?

Normalize:
  Ozempic -> semaglutide
  fatty liver -> NAFLD, MASLD, MASH, NASH, steatohepatitis

Retrieve:
  semaglutide
  Ozempic
  Wegovy
  GLP-1 receptor agonist
  NAFLD/MASLD/MASH/NASH
```

Acceptance criteria:

- Exact entity matches outrank semantically similar but wrong entities.
- Human evidence outranks animal/preclinical evidence for clinical questions.
- Safety/label sources outrank papers for safety and contraindication questions.
- Generated answers can cite both supportive and limiting evidence.

### Phase 5: Pro Reports and Exports

Goal: turn PharmaOrb into a deliverable generator.

Build:

- Deep Research Report.
- Evidence Brief Builder.
- Study Comparison.
- Journal Club Mode.
- PDF export.
- PowerPoint export.
- Citation table export.

New schema:

```text
research_reports
report_sections
report_sources
report_runs
report_exports
export_jobs
saved_folders
folder_items
```

Report trace requirements:

- User prompt.
- Search strategy.
- Databases searched.
- Entities normalized.
- Sources retrieved.
- Sources used.
- Sources excluded or not used when practical.
- Model/prompt version.
- Evidence ranking version.
- Generated sections.
- Citation map.

Acceptance criteria:

- Pro user can generate a cited evidence brief.
- Pro user can generate a deeper research report.
- Pro user can export PDF.
- Pro user can generate a PowerPoint deck.
- Free/Plus users cannot bypass export restrictions.

### Phase 6: PubMed-Scale Corpus

Goal: move from API-scale PubMed support to PubMed-scale ingestion.

Do not scrape PubMed. Do not call the PubMed API millions of times.

Use:

```text
PubMed baseline XML files
PubMed daily update XML files
PMC Open Access full text
```

Pipeline:

```text
download baseline/update file
  -> verify/checksum
  -> store raw file in object storage
  -> stream parse XML
  -> normalize article metadata
  -> upsert pubmed_articles
  -> create/update source rows
  -> chunk abstracts
  -> generate embeddings for changed records only
  -> update keyword/vector indexes
  -> emit update events
```

New infrastructure:

```text
object storage for raw XML
worker queue
ingestion job table
source file manifest
changed-record detector
embedding job queue
ingestion dashboard
```

Acceptance criteria:

- PubMed baseline import can run idempotently.
- Daily update files ingest incrementally.
- Changed records re-embed only when source hash changes.
- Watchlist matching receives new PubMed updates.
- Abstract-only vs full-text source status is explicit.

### Phase 7: Professional Mode

Goal: add professional and educational workflows without overclaiming clinical use.

Build:

- Patient mode vs clinician/professional mode.
- PICO summaries.
- Patient handout generator.
- Clinical case builder.
- Guideline monitoring metadata.
- Institutional templates.
- Audit trail.

Professional mode output:

```text
PICO
population
intervention
comparator
outcomes
effect size when extractable
limitations
PMID/NCT/FDA source links
clinical caveats
```

Patient mode output:

```text
plain-language explanation
what it may mean
what it does not prove
questions to ask a clinician/pharmacist
do not change treatment without professional guidance
```

Acceptance criteria:

- Professional mode is entitlement-gated.
- Professional output is more structured, not more directive.
- High-risk topics continue to route through conservative safety templates.
- Audit trail records source and generation trace.

### Phase 8: Enterprise Foundation

Goal: support B2B without polluting consumer UX.

Build:

- Organizations.
- Organization members.
- Roles and permissions.
- Team workspaces.
- Shared reports.
- API keys.
- White-label templates.
- Enterprise dashboards.

New schema:

```text
organizations
organization_members
organization_roles
team_folders
team_reports
api_keys
api_usage_events
dashboard_configs
white_label_templates
audit_events
```

Enterprise features:

- Biomedical trend dashboard.
- Competitive intelligence report.
- Drug pipeline tracker.
- Supplement formulation evidence map.
- Claim-risk report.
- API access.
- White-label PDF/PPTX exports.

Acceptance criteria:

- Enterprise users belong to orgs, not normal personal subscription accounts only.
- API access is key-scoped, rate-limited, and audited.
- Team reports and folders are isolated by org.

### Phase 9: Mobile Launch

Goal: use the web-proven backend and entitlement model in mobile.

Mobile should not introduce new backend concepts.

Tasks:

- Rename user-facing mobile copy to PharmaOrb.
- Update mobile API clients to use final shared contracts.
- Replace subscription stub with RevenueCat.
- Mirror web entitlements.
- Add push notifications after email/in-app digests work.
- Keep advanced Pro report creation web-first initially.
- Let mobile view reports, saved answers, updates, and brief summaries.

Acceptance criteria:

- Mobile Free/Plus/Pro entitlements match web.
- Mobile uses the same source/citation/answer contracts.
- Mobile does not contain security-critical limits as client-only constants.
- Push notifications are limited to high-signal watchlist updates.

## 8. Anti-Abuse and Usage Controls

Do not rely only on email accounts.

Rate-limit by:

- `user_id`.
- IP address.
- IP subnet/ASN.
- Device/session.
- Email domain.
- Payment/customer ID.
- App install ID for mobile later.

Recommended free limits at launch:

```text
10 lightweight questions/day/account
20 lightweight questions/day/session
30 lightweight questions/day/IP
3 new accounts/day/session
5 new accounts/day/IP
```

Cost-based credits:

```text
simple cited answer: 1 credit
hype detector: 2 credits
evidence brief: 5 credits
deep research report: 10+ credits
PDF/PPTX export: Pro-only
live monitoring: Plus/Pro
```

Suspicious signals:

- Many accounts from same IP.
- Disposable email.
- VPN/proxy/datacenter IP.
- Maxing free quota immediately.
- Same prompts across accounts.
- Rapid account switching.
- Trial hopping.

Risk response:

```text
low risk: normal access
medium risk: CAPTCHA or lower quota
high risk: phone verification
very high risk: require paid plan or block free usage
```

2FA:

- Free: email verification required; phone verification only when suspicious.
- Plus/Pro: optional passkey/TOTP encouraged.
- Professional/team/admin: 2FA required, preferably passkey or TOTP.

Mobile later:

- iOS DeviceCheck/App Attest.
- Android Play Integrity API.
- Receipt validation.
- Subscription/trial identity tracking.

## 9. Compliance and Safety Rules

The product must remain educational unless and until a formal regulatory strategy
supports more.

Allowed:

- Source-backed educational summaries.
- Evidence grading.
- Citation tables.
- Questions to ask a clinician/pharmacist.
- Watchlist alerts and source updates.
- Patient-friendly and clinician-facing educational formats.

Avoid:

- "AI doctor."
- Diagnosis.
- Treatment recommendations.
- Personalized medication changes.
- "Safe for you" claims.
- Drug sourcing.
- Dosing instructions beyond label-based educational context.
- Claims that adverse event signals prove causation.

Safety-critical FDA updates should not be entirely paywalled.

Recommended split:

- Free users can see important safety updates when viewing a relevant page.
- Plus/Pro users get proactive alerts, watchlist matching, digests, and richer summaries.

High-risk topics requiring stricter templates:

- Pregnancy/breastfeeding.
- Pediatrics.
- Overdose.
- Self-harm.
- Opioids/benzodiazepines.
- Anticoagulants.
- Insulin.
- Immunosuppressants.
- Chemotherapy.
- Psychiatric medication changes.
- Research peptides/injectables.
- Drug sourcing.

## 10. Data Model Changes Summary

Near-term migrations:

```text
subscriptions.plan:
  add plus, enterprise

plans:
  id
  code
  name
  active

plan_entitlements:
  plan_code
  entitlement_key
  value_json

usage_events:
  user_id
  event_type
  cost_credits
  metadata
  created_at

usage_counters:
  user_id
  period
  counter_key
  used
  limit_snapshot

entitlement_checks:
  user_id
  entitlement_key
  allowed
  reason
  created_at
```

Monitoring upgrades:

```text
watchlist_queries
watchlist_entities
alert_preferences
notifications
briefs
brief_items
```

Report upgrades:

```text
research_reports
report_sections
report_sources
report_runs
report_exports
export_jobs
saved_folders
folder_items
```

Enterprise upgrades:

```text
organizations
organization_members
team_folders
team_reports
api_keys
api_usage_events
audit_events
```

PubMed-scale upgrades:

```text
source_file_manifests
ingestion_jobs
embedding_jobs
pubmed_update_runs
source_record_versions
```

## 11. Launch Gates

### Web MVP Gate

- Auth works.
- Ask works with citations.
- Source viewer works.
- Search works.
- Drug page works.
- Watchlist works.
- Digest/update feed works.
- Legal/disclaimer/account deletion/export present.
- Free limits enforced server-side.

### Plus Gate

- Stripe checkout works.
- Stripe webhook mirrors subscription.
- Entitlements update immediately.
- Plus watchlist/Ask limits work.
- Orb Briefs produce useful cited summaries.

### Pro Gate

- Report generation trace is stored.
- PDF export works.
- Evidence brief is source-grounded.
- Free/Plus cannot access Pro exports.
- Citation table is exportable.

### PubMed-Scale Gate

- Baseline ingestion is idempotent.
- Daily update ingestion works.
- Embeddings update only for changed records.
- Watchlists receive new PubMed matches.
- Source freshness is visible.

### Mobile Gate

- Web backend contracts stable.
- RevenueCat maps to same entitlement model.
- Client-only limits removed or treated as hints.
- Push notification signal quality is acceptable.

## 12. Immediate Next Actions

1. Create `apps/web`.
2. Add shared entitlement model in `packages/shared`.
3. Add plan/usage migrations in `supabase/migrations`.
4. Update subscriptions plan values.
5. Add an entitlement-check helper for edge functions.
6. Build web Ask/Search/Drug/Source/Watchlist flows.
7. Add Stripe checkout and webhook.
8. Launch Free + Plus web beta.
9. Add Pro reports.
10. Upgrade monitoring and hybrid retrieval.
11. Implement PubMed baseline/daily update ingestion.
12. Launch mobile after web validates retention and paid flows.

## 13. Non-Goals Until After Web Launch

Do not block web launch on:

- Full PubMed baseline ingestion.
- Qdrant.
- OpenSearch.
- Meta-analysis assistant.
- Full drug interaction checker.
- EHR integrations.
- Enterprise dashboards.
- Mobile subscriptions.
- Push notifications.
- Professional dosing modules.
- Formal systematic review workflow.

## 14. Build Principle

The web launch should prove:

```text
Users trust cited answers.
Users follow evidence topics.
Users return for useful updates.
Users pay for monitoring and deliverables.
```

Everything else should compound that loop.

