# Deep Research MVP Plan

## Product Decision

Deep research should be a paid feature, but not every report-like output should be locked away.

Use three levels:

- Free: cited Ask plus an occasional short evidence brief preview.
- Plus: full evidence briefs and basic exports.
- Pro: deep literature overview, systematic-review-style workflows, PowerPoint decks, and higher report volume.

Do not market the Pro workflow as a true "systematic review" until the product supports reproducible search strategy, inclusion/exclusion criteria, study screening, duplicate handling, and audit logs. Use "literature overview" or "deep evidence report" for MVP.

## MVP Loop

The strongest MVP workflow is:

Ask a biomedical question -> get a cited answer -> generate a saved evidence brief -> follow the topic.

This proves PharmaOrb is more than a chatbot without building the full researcher platform first.

## What Ships First

1. Focused 10-drug RAG corpus.
   - Seed drugs: atorvastatin, metformin, semaglutide, isotretinoin, sertraline, omeprazole, amoxicillin, lisinopril, hydroxychloroquine, testosterone.
   - Sources per drug: RxNorm, OpenFDA, DailyMed, ClinicalTrials.gov, and targeted PubMed OA query families.
   - Run with `scripts/mvp-drug-corpus-ingest.ts`, then project with `scripts/entity-link.ts`.

2. Evidence brief from an existing cited Ask trace.
   - Uses the stored answer, citations, and retrieved source IDs.
   - Cheap and auditable.
   - Saves into `saved_reports`.

3. Entitlement counters.
   - `evidence_brief_daily_limit`
   - `deep_research_daily_limit`
   - `report_export_enabled`
   - `ppt_export_enabled`

4. Pro-only deep research placeholder.
   - The entitlement exists now.
   - The expensive multi-query retrieval and synthesis workflow ships later.

## MVP Corpus Runbook

Dry-run the exact ingest plan:

```bash
deno run --allow-net --allow-env --allow-read scripts/mvp-drug-corpus-ingest.ts --dry-run
```

Run the live ingest:

```bash
SERVICE_KEY=... SB_URL=https://<project-ref>.supabase.co \
  deno run --allow-net --allow-env --allow-read scripts/mvp-drug-corpus-ingest.ts
```

Project the ingested sources into the drug catalog/drug pages:

```bash
SERVICE_KEY=... SB_URL=https://<project-ref>.supabase.co \
  deno run -A scripts/entity-link.ts
```

Then check:

- source/chunk counts by provider
- 10 seed drugs resolve in Explore
- each seed drug has label, PubMed, and trial surfaces where available
- Ask answers cite the new chunks
- evidence brief generation saves `saved_reports`

## Later Deep Research Workflow

Deep research should run a new backend job:

1. Expand the user's question into subquestions.
2. Retrieve from structured drug facts, DailyMed/FDA labels, PubMed, ClinicalTrials.gov, and source chunks.
3. Separate evidence by type: label, guideline, systematic review, RCT, observational, case report, mechanistic.
4. Generate evidence tables and limitations.
5. Save every source, query, and generated section.
6. Export to Markdown/PDF first, then PowerPoint.

## Pricing Fit

Plus should include evidence briefs because it is the most visible upgrade from Ask.

Pro should include deep literature overviews and PPT export because those are expensive and closer to researcher/business value.

Recommended initial limits:

- Free: 1 evidence brief/day, 0 deep research/day.
- Plus: 5 evidence briefs/day, 0 deep research/day.
- Pro: 20 evidence briefs/day, 3 deep research/day.
- Professional: 50 evidence briefs/day, 10 deep research/day.
- Enterprise: custom/high limits.

## Mature Direction

The mature app becomes an evidence deliverables platform:

- cited answers
- evidence briefs
- deep literature reports
- report exports
- slide decks
- watchlists
- API
- MCP tools
- CLI

The app remains the user-facing proof of the evidence engine. API/MCP/CLI come after report traceability and exports are reliable.
