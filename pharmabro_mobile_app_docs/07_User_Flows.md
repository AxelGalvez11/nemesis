# User Flows — PharmaBro

## Flow 1 — Ask a question

```mermaid
flowchart TD
A[Open App] --> B[Ask Tab]
B --> C[Enter medication question]
C --> D[Classify intent]
D --> E[Retrieve sources]
E --> F[Generate answer]
F --> G[Show evidence grade + citations]
G --> H{User action}
H --> I[Open source]
H --> J[Ask follow-up]
H --> K[Add drug/topic to watchlist]
H --> L[Save answer]
```

## Flow 2 — Search drug and follow it

```mermaid
flowchart TD
A[Explore] --> B[Search drug/compound]
B --> C[Search results]
C --> D[Drug page]
D --> E[Review overview]
E --> F[Review sources]
F --> G[Tap Add to Watchlist]
G --> H[Choose alert types]
H --> I[Watchlist saved]
```

## Flow 3 — Watchlist update

```mermaid
flowchart TD
A[Scheduled ingestion job] --> B[Detect source change]
B --> C[Match to user watchlists]
C --> D[Generate update summary]
D --> E[Queue digest/notification]
E --> F[User opens update]
F --> G[Update detail + source viewer]
```

## Flow 4 — Clinical trial tracker

```mermaid
flowchart TD
A[User searches retatrutide] --> B[Drug page]
B --> C[Clinical Trials tab]
C --> D[List ClinicalTrials.gov studies]
D --> E[Open NCT record]
E --> F[View phase/status/endpoints/completion date]
F --> G[Follow trial]
```

## Flow 5 — Medication class learning

```mermaid
flowchart TD
A[Classes] --> B[Select class]
B --> C[Class page]
C --> D[Mechanism + common drugs]
D --> E[Warnings/interactions/monitoring]
E --> F[Open drug page]
F --> G[Compare drugs]
```

## Flow 6 — Optional My Health Context

```mermaid
flowchart TD
A[Profile] --> B[My Health Context]
B --> C[Consent + explanation]
C --> D[Add meds/allergies/conditions]
D --> E[Save encrypted profile]
E --> F[Ask question]
F --> G[Answer uses context conservatively]
G --> H[Show clinician/pharmacist questions]
```

## Flow 7 — Upgrade to paid

```mermaid
flowchart TD
A[Free user reaches limit] --> B[Paywall]
B --> C[Show value: unlimited watchlist + digest + saved reports]
C --> D[Start trial]
D --> E[Payment]
E --> F[Premium active]
```

## Flow 8 — Report unsafe/incorrect answer

```mermaid
flowchart TD
A[User sees answer] --> B[Tap Report]
B --> C[Choose issue]
C --> D[Submit feedback]
D --> E[Flag answer in admin]
E --> F[Content review]
F --> G[Improve rule/prompt/source mapping]
```
