# API and Backend Requirements — PharmaBro

## API design principles

- Mobile app should not call public medical APIs directly.
- Backend should cache and normalize public data.
- Every generated answer should be traceable to source IDs.
- Source freshness should be visible to users.
- Medical claims should be blocked or caveated if no source supports them.

## Authentication endpoints

### POST /auth/signup

Create account.

Request:

```json
{
  "email": "user@example.com",
  "password": "..."
}
```

Response:

```json
{
  "user_id": "uuid",
  "plan": "free"
}
```

### POST /auth/delete-account

Deletes user account and health context.

Requirements:

- Confirm identity.
- Delete health context.
- Delete watchlist.
- Anonymize or delete generated answers depending on policy.
- Return confirmation.

## Search endpoints

### GET /search?q=

Search drugs, aliases, classes, trials, companies, and PubMed topics.

Response:

```json
{
  "results": [
    {
      "type": "drug",
      "id": "uuid",
      "name": "Semaglutide",
      "subtitle": "GLP-1 receptor agonist",
      "status": "approved"
    }
  ]
}
```

## Ask endpoints

### POST /ask

Request:

```json
{
  "question": "Can I take ibuprofen with lisinopril?",
  "use_health_context": true,
  "conversation_id": "optional"
}
```

Backend steps:

1. Classify intent.
2. Identify entities.
3. Identify safety risk.
4. Retrieve sources.
5. Generate answer.
6. Enforce citation rules.
7. Store answer trace.
8. Return answer.

Response:

```json
{
  "answer_id": "uuid",
  "plain_english_summary": "...",
  "evidence_grade": "strong",
  "answer_sections": {
    "what_we_know": [],
    "what_we_do_not_know": [],
    "questions_to_ask": []
  },
  "citations": [
    {
      "source_id": "uuid",
      "source_type": "DailyMed",
      "title": "Lisinopril label",
      "section": "Warnings and Precautions",
      "published_date": "YYYY-MM-DD"
    }
  ],
  "safety_flags": []
}
```

## Drug endpoints

### GET /drugs/{id}

Returns:

- Overview.
- Status.
- Mechanism.
- Drug class.
- Evidence score.
- FDA/DailyMed summary.
- PubMed highlights.
- ClinicalTrials.gov highlights.
- Related drugs.

### GET /drugs/{id}/label

Returns extracted label sections.

Sections:

- Boxed warning.
- Indications.
- Contraindications.
- Warnings/precautions.
- Adverse reactions.
- Drug interactions.
- Pregnancy/lactation.
- Renal/hepatic considerations.
- Patient counseling.

### GET /drugs/{id}/trials

Returns linked trials.

Filters:

- phase
- status
- condition
- recruiting
- completed
- results posted

### GET /drugs/{id}/pubmed

Returns linked PubMed articles.

Filters:

- RCT
- review
- systematic review
- recent
- human
- safety

## Watchlist endpoints

### POST /watchlist

Request:

```json
{
  "item_type": "drug",
  "item_id": "uuid",
  "alert_types": ["pubmed_new", "trial_update", "label_update"],
  "frequency": "weekly"
}
```

### GET /watchlist

Returns user's watchlist.

### DELETE /watchlist/{id}

Removes item.

### GET /watchlist/updates

Returns matched updates.

## Source endpoints

### GET /sources/{id}

Returns:

- Source type.
- Title.
- Original URL.
- External ID.
- Published/fetched dates.
- Relevant sections.
- Summary.
- Limitations.

### GET /sources/{id}/raw

Admin-only or controlled display.

## Compare endpoints

### GET /compare?left={id}&right={id}

Returns structured comparison.

Sections:

- Mechanism.
- Approved uses.
- Evidence strength.
- Trial status.
- Safety.
- Warnings.
- Cost/access category.
- Sources.

## Profile endpoints

### GET /profile/health-context

Returns optional health context.

### PUT /profile/health-context

Updates optional health context.

Requirements:

- Explicit consent.
- Separate deletion.
- Do not require for app use.

### DELETE /profile/health-context

Deletes health context only.

## Admin endpoints

### GET /admin/flagged-answers

Review answers with safety flags or user reports.

### POST /admin/entities/{id}/review

Mark drug entity as reviewed.

### POST /admin/source-refresh

Force refresh source.

### GET /admin/ingestion-errors

Debug source pipelines.

## Ingestion jobs

### Job: refresh_daily_labels

- Pull recent DailyMed/openFDA label updates.
- Compare content hashes.
- Create update records.
- Notify watchlist matches.

### Job: refresh_pubmed_keywords

- For each active keyword/entity.
- Search PubMed by query.
- Store new PMIDs.
- Generate update summaries.

### Job: refresh_clinical_trials

- Pull watched NCT IDs.
- Pull high-priority disease/drug queries.
- Compare trial status, phase, completion date, results.
- Create updates.

### Job: weekly_digest

- Match updates to users.
- Rank by importance.
- Generate digest.
- Send email/in-app notification.

## Error handling

- If source API fails, show cached data with freshness date.
- If no source exists, state that no source was found.
- If answer cannot be supported, refuse to make the claim and suggest source-backed alternatives.
- If medical emergency language is detected, provide urgent-care routing.
