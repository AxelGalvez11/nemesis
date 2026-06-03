# Source Ingestion and Evidence System — PharmaBro

## Purpose

PharmaBro’s moat is not just AI chat. The moat is **structured evidence retrieval, source transparency, and update tracking**.

## Public source stack

### ClinicalTrials.gov

Use for:

- Trial records.
- Drug development status.
- Trial phase/status.
- Conditions and interventions.
- Primary/secondary outcomes.
- Results posting.
- Estimated completion dates.

Important fields:

- NCT ID.
- Brief title.
- Official title.
- Overall status.
- Phase.
- Enrollment.
- Sponsor/collaborators.
- Conditions.
- Interventions.
- Outcome measures.
- Start/completion dates.
- Last update posted.
- Results first posted.

### PubMed / NCBI E-utilities

Use for:

- Literature search.
- Article metadata.
- Abstract retrieval.
- Publication types.
- MeSH terms.
- Journal/year/author metadata.

Important filters:

- Humans.
- Randomized controlled trial.
- Clinical trial.
- Systematic review.
- Meta-analysis.
- Review.
- Last 1 year / 5 years.
- Safety/adverse effects.

### DailyMed

Use for:

- Current structured product labeling.
- FDA-submitted label content.
- Published date.
- Boxed warnings and labeling sections.
- Patient medication guides when available.

### openFDA

Use for:

- Drug label records.
- NDC directory later.
- Adverse event reports later.
- Recall enforcement later.

## Source freshness rules

Every source-backed screen must display:

- Source type.
- Original source date, if available.
- Date fetched.
- Date summary generated.
- Whether content was refreshed recently.

Example:

```text
Source: DailyMed
Label published: 2026-03-12
Fetched by PharmaBro: 2026-06-02
```

## Ingestion tiers

### Tier 1 — On-demand fetch

Used when:

- User searches a drug not in cache.
- User asks a question about a missing entity.
- Drug page has no recent data.

Pros:

- Faster MVP.
- Lower storage.

Cons:

- Slower user answer.
- Rate limit risk.

### Tier 2 — Scheduled refresh

Used for:

- Watchlist items.
- Popular drugs.
- Top medication classes.
- Trending trials.

Frequency:

- Watchlist trials: daily.
- PubMed keywords: daily or weekly.
- DailyMed labels: daily.
- openFDA labels: daily or weekly.
- Entity summaries: refresh after source changes.

### Tier 3 — Curated seed database

Used for:

- Top 100 drugs/compounds.
- Top 10 medication classes.
- Top 10 comparisons.
- High-risk medications.

Pros:

- Better quality.
- Faster app.
- Easier launch.

## Evidence scoring system

### Score labels

| Score | Definition |
|---|---|
| Very Strong | Multiple RCTs/meta-analyses/guidelines and/or strong FDA-approved labeling |
| Strong | Good human trials with consistent findings |
| Moderate | Some human evidence, but limited size/duration or mixed findings |
| Weak | Small human studies, observational evidence, or indirect evidence |
| Very Weak | Animal/preclinical/mechanistic evidence only |
| Unknown | Insufficient reliable evidence |

### Inputs

- FDA approval status.
- DailyMed label presence.
- Number and quality of human trials.
- PubMed publication types.
- ClinicalTrials.gov phase/status/results.
- Sample size.
- Study population.
- Replication.
- Long-term safety data.
- Recency.
- Consistency.

### Output

```json
{
  "score": "moderate",
  "rationale": "Some human trial evidence exists, but long-term safety and comparative data remain limited.",
  "evidence_counts": {
    "rct": 2,
    "systematic_reviews": 0,
    "human_trials": 3,
    "preclinical": 5
  },
  "limitations": [
    "Limited long-term safety data",
    "Trial population may not represent general users"
  ]
}
```

## Evidence score guardrails

- FDA-approved does not automatically mean “Very Strong” for every off-label claim.
- A PubMed abstract does not equal strong evidence.
- Animal studies should not be described as human proof.
- Peptides/research chemicals must be labeled conservatively.
- Supplements should distinguish between deficiency treatment, general wellness claims, and disease claims.
- Claims must be scored individually when possible.

## Claim-level scoring examples

Drug-level:

> Semaglutide for chronic weight management: strong/very strong depending on exact claim and population.

Claim-level:

> Semaglutide improves gym performance: unknown/weak unless evidence supports it.

Compound-level:

> BPC-157 for tendon healing in humans: very weak/unknown if no robust human clinical evidence is found.

## Source ranking

For medication safety and approved use:

1. FDA label / DailyMed.
2. FDA safety communication.
3. Clinical guidelines.
4. Systematic reviews/meta-analyses.
5. Randomized controlled trials.
6. Observational studies.
7. Case reports.
8. Preclinical/animal.
9. Mechanistic speculation.
10. Social media claims.

For investigational drugs:

1. ClinicalTrials.gov.
2. Peer-reviewed trial publications.
3. Company press releases, clearly labeled as non-peer-reviewed.
4. Conference abstracts, clearly labeled.
5. Analyst/news articles, optional and not primary evidence.

## Source viewer schema

```json
{
  "source_id": "uuid",
  "source_type": "DailyMed",
  "external_id": "set_id_or_spl_id",
  "title": "Drug label",
  "section": "Warnings and Precautions",
  "original_url": "...",
  "published_date": "YYYY-MM-DD",
  "fetched_at": "YYYY-MM-DD",
  "summary": "...",
  "limitations": "Label may not include all real-world safety signals."
}
```

## Update detection

### DailyMed/openFDA label updates

Detect:

- New SPL/set ID.
- Changed published date.
- Changed content hash.
- Changed warnings section.
- New boxed warning.
- New adverse reaction section.
- New indications.

### ClinicalTrials.gov updates

Detect:

- Status change.
- Phase change.
- Enrollment change.
- Primary completion date change.
- Study completion date change.
- Results posted.
- New trial matching followed entity.

### PubMed updates

Detect:

- New article by PMID.
- Publication type high-value match.
- New systematic review/meta-analysis.
- New RCT.
- New safety paper.

## Digest ranking

Rank updates by:

1. Watchlist match specificity.
2. Source importance.
3. Evidence quality.
4. Recency.
5. User interest.
6. Whether change affects safety, approval, or trial result.
7. Whether update is duplicate/noisy.

## Human review

Review required for:

- High-risk drug safety summaries.
- Pregnancy/pediatric content.
- Anticoagulants, insulin, opioids, psych meds, immunosuppressants.
- Claims about research-use peptides.
- Anything flagged by users.
- Any answer where AI and source conflict.
