# MVP Scope and Feature Backlog — PharmaBro

## MVP principle

The MVP should prove that users want a **source-grounded drug intelligence loop**:

> Ask → read cited answer → explore source-backed page → follow topic → return for updates.

Do not start with every possible medical feature. Start with the tight loop.

## MVP v1 — Must-have

| Feature | Priority | Notes |
|---|---:|---|
| Email/Apple/Google auth | Must | Guest mode also recommended |
| Ask Tab | Must | Medication Q&A with citations |
| Drug search | Must | Generic/brand names, supplements, peptides |
| Drug/compound page | Must | Status, mechanism, label/trials/PubMed |
| FDA/DailyMed label summary | Must | Approved drugs only |
| PubMed search + summary | Must | Use NCBI E-utilities |
| ClinicalTrials.gov trial lookup | Must | Use v2 API |
| Evidence Score | Must | Conservative grading |
| Source Viewer | Must | Trust feature |
| Watchlist | Must | 3 free items |
| Weekly digest | Must | Email or in-app first |
| Safety guardrails | Must | No diagnosis/treatment instructions |
| Privacy policy / terms | Must | Required before launch |
| Admin review panel | Must | Minimal internal tool |
| Basic analytics | Must | Activation, engagement, retention |

## MVP v1 — Should-have

| Feature | Priority | Notes |
|---|---:|---|
| Push notifications | Should | Useful after digest works |
| Medication Classes | Should | Start with 10 classes |
| Compare pages | Should | Start with 10 high-search comparisons |
| Saved reports | Should | Useful for paid |
| Optional My Health Context | Should | Add after safety review |
| Drug aliases/synonyms | Should | RxNorm integration later |
| Popular/trending page | Should | Can start manually curated |
| PubMed keyword watchlist | Should | Paid feature candidate |
| Label change detection | Should | Start with DailyMed published_date |

## Later

| Feature | Priority | Notes |
|---|---:|---|
| Full drug interaction checker | Later | Regulatory/safety risk; needs authoritative interaction data |
| EHR integration | Later | Not MVP |
| Pharmacy workflow tools | Later | B2B possibility |
| Provider/professional mode | Later | Needs higher accuracy and compliance |
| Flashcards for pharmacy students | Later | Great expansion |
| PDF exports | Later | Paid feature |
| Team accounts | Later | Schools/clinics |
| Drug pricing/coupons | Later | Separate data partnerships |
| AI voice mode | Later | Not needed |
| Community/forum | Later | Moderation burden |
| Biotech investor mode | Later | Avoid investment advice early |

## MVP drug/topic seed list

### GLP-1 / obesity

- Semaglutide
- Tirzepatide
- Retatrutide
- CagriSema
- MariTide
- Liraglutide

### Peptides / research-use compounds

- BPC-157
- TB-500
- CJC-1295
- Ipamorelin
- Tesamorelin
- GHK-Cu

### Supplements

- Creatine
- Berberine
- Magnesium glycinate
- Ashwagandha
- Fish oil
- Vitamin D

### Common medication classes

- SSRIs
- SNRIs
- ACE inhibitors
- ARBs
- Beta blockers
- Calcium channel blockers
- SGLT2 inhibitors
- DPP-4 inhibitors
- NSAIDs
- Corticosteroids

## Scope rules

Build now:

- Cited answers.
- Source pages.
- Watchlist.
- Evidence score.
- Educational framing.

Avoid now:

- Diagnosis.
- Treatment recommendations.
- Complex interaction checker.
- Storing sensitive data beyond optional profile.
- Paid full-text scraping.
- Claims that the app detects safety events in real time.

## MVP launch criteria

- 100 seed entities.
- 10 medication classes.
- 10 comparison pages.
- 3 source integrations.
- 1 digest type.
- Safety guardrails.
- Legal basics.
- Admin review.
- User feedback/reporting.
