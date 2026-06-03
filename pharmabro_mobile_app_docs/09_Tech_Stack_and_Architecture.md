# Tech Stack and Architecture — PharmaBro

## Recommended MVP stack

### Frontend

Option A: **React Native + Expo**

Best for:

- Fast solo/small-team development.
- iOS and Android from one codebase.
- Easy iteration.
- Good ecosystem for auth, payments, notifications, and analytics.

Option B: **Flutter**

Best for:

- Highly polished UI.
- Strong cross-platform performance.
- More structured UI layer.

Recommended for this project: **React Native + Expo** unless the team already prefers Flutter.

### Backend

Recommended: **Supabase + custom server**

- Supabase Postgres for relational data.
- Supabase Auth or Clerk/Auth0 for authentication.
- Supabase Storage for generated report files.
- Edge functions or Node/Python API for app-specific logic.
- Separate Python workers for ingestion and evidence processing.

Alternative: Firebase is easier for basic mobile apps, but Postgres is better for drug entities, labels, PubMed records, trials, watchlists, audit logs, and normalized data.

### AI/RAG layer

- Retrieval service pulls relevant source snippets.
- Answer generator uses only retrieved sources for medical claims.
- Store answer trace: prompt version, model, source IDs, retrieval scores, generated answer, safety flags.
- Never generate medical claims without attached sources when source should exist.

### Search

MVP:

- Postgres full-text search.
- pg_trgm extension for misspellings.

Later:

- Typesense, Meilisearch, or Elasticsearch/OpenSearch for fast synonym search.
- Vector search with pgvector for semantic matching.

### Notifications

MVP:

- Email digest.
- In-app notification feed.

Later:

- Expo push notifications.
- User-configurable alert types.

### Payments

- RevenueCat for iOS/Android subscriptions.
- Stripe for web subscriptions later.
- Keep App Store rules in mind for digital subscriptions.

## High-level architecture

```text
Mobile App
   |
   | HTTPS
   v
API Gateway / App Backend
   |
   ├── Auth service
   ├── User/watchlist service
   ├── Drug entity service
   ├── Ask/RAG service
   ├── Source viewer service
   ├── Subscription service
   └── Notification service
          |
          v
Postgres Database
   |
   ├── users
   ├── health_context
   ├── drug_entities
   ├── labels
   ├── pubmed_articles
   ├── clinical_trials
   ├── watchlists
   ├── evidence_scores
   ├── generated_answers
   └── source_audit_logs

Ingestion Workers
   |
   ├── ClinicalTrials.gov API
   ├── NCBI/PubMed E-utilities
   ├── DailyMed API
   ├── openFDA drug label API
   └── FDA safety/label endpoints later
```

## Source integrations

### ClinicalTrials.gov

Use ClinicalTrials.gov API v2 for:

- Study search.
- Trial record details.
- Phase.
- Status.
- Sponsor/collaborators.
- Conditions.
- Interventions.
- Outcomes/endpoints.
- Start/completion dates.
- Results availability.

### PubMed

Use NCBI E-utilities for:

- Search.
- Fetch article metadata.
- Abstracts where available.
- MeSH terms.
- Publication types.
- DOI/journal/year/authors.

Respect rate limits and use API keys.

### DailyMed

Use DailyMed web services for:

- Current structured product labeling.
- SPL metadata.
- Drug label sections.
- Published date.
- Label update detection.

### openFDA

Use openFDA for:

- Drug labels.
- Adverse event reports later.
- Recalls later.
- NDC directory later.

openFDA has clear API-key rate limits, so cache aggressively.

## Data strategy

### Do not query public APIs live for every user request

Instead:

1. User asks question.
2. App searches local cached normalized data.
3. If local data missing/stale, fetch source.
4. Store normalized source metadata.
5. Generate answer from cached/fetched source snippets.
6. Show source freshness.

This reduces latency, rate-limit risk, and costs.

## AI safety architecture

Every AI answer should have:

- Intent classification.
- Source retrieval.
- Medical safety classification.
- Answer generation.
- Citation enforcement.
- Post-generation safety check.
- Source trace.
- User report button.

## Suggested services

```text
/api/search
/api/ask
/api/drugs/{id}
/api/drugs/{id}/sources
/api/trials/search
/api/pubmed/search
/api/watchlist
/api/digest
/api/profile/health-context
/api/subscription
/api/admin/review
```

## Infrastructure

MVP:

- Supabase Postgres.
- Render/Fly.io/Railway for backend.
- GitHub Actions.
- Sentry for error monitoring.
- PostHog or Amplitude for analytics.
- Resend/SendGrid for emails.
- Expo EAS for builds.

Later:

- Queue system: Redis + BullMQ, Celery, or Temporal.
- Dedicated ingestion workers.
- OpenSearch.
- Object storage.
- Admin moderation dashboard.
