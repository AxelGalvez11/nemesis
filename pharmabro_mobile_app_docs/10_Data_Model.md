# Data Model — PharmaBro

## Entity relationship overview

```text
users
 ├── user_health_context
 ├── watchlist_items
 ├── generated_answers
 ├── saved_reports
 └── subscriptions

drug_entities
 ├── drug_aliases
 ├── drug_class_memberships
 ├── label_documents
 ├── evidence_scores
 ├── clinical_trial_links
 ├── pubmed_links
 └── comparison_entities

clinical_trials
 ├── trial_versions
 └── trial_updates

pubmed_articles
 ├── article_topics
 └── evidence_items

source_documents
 ├── source_chunks
 └── source_citations
```

## Core tables

### users

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| email | text | Unique |
| auth_provider | text | apple/google/email |
| created_at | timestamp |  |
| deleted_at | timestamp | Soft delete |
| plan | text | free/pro/student/professional |
| notification_settings | jsonb |  |

### user_health_context

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| user_id | uuid | FK users |
| age_range | text | Optional |
| sex | text | Optional |
| pregnancy_status | text | Optional |
| allergies | jsonb | Optional |
| medications | jsonb | Optional |
| supplements | jsonb | Optional |
| conditions | jsonb | Optional |
| kidney_disease_flag | text | yes/no/unknown |
| liver_disease_flag | text | yes/no/unknown |
| goals | jsonb | Optional |
| consent_version | text |  |
| created_at | timestamp |  |
| updated_at | timestamp |  |

Privacy note: keep this table separate and encrypted where possible.

### drug_entities

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| canonical_name | text | semaglutide |
| entity_type | text | drug/supplement/peptide/biologic/class/company |
| approved_status | text | approved/investigational/research-use/supplement/unknown |
| mechanism_summary | text | Reviewed/generated summary |
| class_id | uuid | FK drug_classes |
| rxnorm_cui | text | Later |
| created_at | timestamp |  |
| updated_at | timestamp |  |
| status_reviewed_by_admin | boolean |  |

### drug_aliases

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| drug_entity_id | uuid | FK |
| alias | text | brand/generic/spelling |
| alias_type | text | brand/generic/synonym/company_code |
| source | text | manual/DailyMed/openFDA/RxNorm |
| confidence | numeric |  |

### drug_classes

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| name | text | GLP-1 receptor agonists |
| description | text |  |
| body_system | text | endocrine/cardiology/psychiatry |
| reviewed | boolean |  |

### label_documents

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| drug_entity_id | uuid | FK |
| source | text | DailyMed/openFDA |
| spl_id | text | DailyMed identifier |
| set_id | text | Label set ID |
| published_date | date | For update detection |
| label_url | text | Original source |
| raw_json | jsonb | If allowed |
| extracted_sections | jsonb | warnings, indications, etc. |
| created_at | timestamp |  |
| updated_at | timestamp |  |

### clinical_trials

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| nct_id | text | Unique |
| brief_title | text |  |
| official_title | text |  |
| phase | text | Phase 1/2/3 |
| status | text | recruiting/completed/etc. |
| sponsor | text |  |
| conditions | jsonb |  |
| interventions | jsonb |  |
| primary_outcomes | jsonb |  |
| secondary_outcomes | jsonb |  |
| start_date | date |  |
| completion_date | date |  |
| results_first_posted | date |  |
| last_update_posted | date |  |
| source_url | text |  |
| raw_json | jsonb |  |
| updated_at | timestamp |  |

### pubmed_articles

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| pmid | text | Unique |
| title | text |  |
| abstract | text | If available |
| journal | text |  |
| publication_date | date |  |
| authors | jsonb |  |
| publication_types | jsonb | RCT/review/etc. |
| mesh_terms | jsonb |  |
| doi | text |  |
| source_url | text |  |
| fetched_at | timestamp |  |

### evidence_scores

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| entity_id | uuid | Drug/claim/class |
| entity_type | text | drug/claim/class |
| score | text | very_strong/strong/moderate/weak/very_weak/unknown |
| rationale | text | Plain-English rationale |
| evidence_counts | jsonb | RCTs, reviews, trials |
| limitations | text |  |
| generated_by_version | text |  |
| reviewed | boolean |  |
| updated_at | timestamp |  |

### watchlist_items

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| user_id | uuid | FK |
| item_type | text | drug/class/trial/company/keyword |
| item_id | uuid/text | FK or keyword |
| alert_types | jsonb | PubMed, label, trial, safety |
| frequency | text | instant/daily/weekly |
| created_at | timestamp |  |

### updates

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| item_type | text | drug/trial/class |
| item_id | uuid/text |  |
| update_type | text | pubmed_new/label_update/trial_status |
| title | text |  |
| summary | text |  |
| source_document_id | uuid | FK |
| source_url | text |  |
| detected_at | timestamp |  |
| importance_score | numeric |  |

### generated_answers

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| user_id | uuid | nullable for guest |
| question | text |  |
| answer | text |  |
| evidence_grade | text |  |
| source_ids | jsonb |  |
| model_name | text |  |
| prompt_version | text |  |
| safety_flags | jsonb |  |
| created_at | timestamp |  |

### source_documents

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| source_type | text | PubMed/DailyMed/ClinicalTrials/openFDA |
| external_id | text | PMID, NCT ID, SPL ID |
| title | text |  |
| url | text |  |
| published_date | date |  |
| fetched_at | timestamp |  |
| raw_content_hash | text |  |
| metadata | jsonb |  |

### source_chunks

| Field | Type | Notes |
|---|---|---|
| id | uuid |  |
| source_document_id | uuid | FK |
| section_name | text | warnings/abstract/outcomes |
| chunk_text | text |  |
| embedding | vector | Optional |
| token_count | int |  |

## Indexing recommendations

- drug_entities.canonical_name
- drug_aliases.alias
- clinical_trials.nct_id
- pubmed_articles.pmid
- label_documents.spl_id
- watchlist_items.user_id
- source_documents.external_id
- full-text search on title/abstract/chunk_text
- trigram index on drug aliases

## Retention policy

- Generated answers: keep unless user deletes account, but anonymize for analytics if consented.
- Health context: delete immediately on user request.
- Guest questions: short retention or no retention.
- Source data: public-source cache can persist.
- Audit logs: retain enough for safety and debugging.
