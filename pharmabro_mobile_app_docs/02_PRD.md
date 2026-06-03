# Product Requirements Document — PharmaBro

## 1. Overview

PharmaBro is a mobile app that provides evidence-backed drug answers, medication education, clinical trial tracking, and drug watchlists using public sources such as ClinicalTrials.gov, PubMed/NCBI E-utilities, DailyMed, FDA labels, and openFDA.

The app is positioned as an educational and drug intelligence platform, not an AI doctor.

## 2. Product vision

Make medication evidence understandable, trackable, and transparent for everyday users.

## 3. Goals

### User goals

- Understand medications, peptides, supplements, and investigational drugs in plain English.
- See what evidence supports or does not support a claim.
- Track drugs, clinical trials, FDA label changes, and new research.
- Compare drugs and medication classes.
- Save trusted summaries for later.
- Ask better questions to doctors, pharmacists, and healthcare professionals.

### Business goals

- Launch a defensible app with recurring usage.
- Convert power users to paid plans through watchlists, alerts, saved reports, and deeper comparisons.
- Create an expandable content platform around drug pages, class pages, comparisons, and clinical trial monitoring.
- Build trust through source transparency and conservative medical positioning.

## 4. Non-goals

- Diagnosis.
- Treatment recommendations.
- Emergency medical triage.
- Prescription changes.
- Personalized risk prediction unless reviewed for regulatory implications.
- Trading/investment advice for biotech companies.
- Scraping copyrighted paid resources.

## 5. Primary features

### 5.1 Ask Tab

Users ask pharmacology, medication, supplement, peptide, or clinical trial questions.

Answer requirements:

- Plain-English summary.
- Evidence grade.
- Key source-backed points.
- “What we know.”
- “What we do not know.”
- FDA/DailyMed section when available.
- PubMed citations when relevant.
- ClinicalTrials.gov trials when relevant.
- “Questions to ask your doctor/pharmacist.”
- Safety-sensitive response guardrails.

Example questions:

- “Can I take ibuprofen with lisinopril?”
- “What is retatrutide?”
- “Compare semaglutide vs tirzepatide.”
- “What does the evidence say about BPC-157?”
- “What are the major warnings for sertraline?”

### 5.2 Explore Tab

Browse:

- Popular drugs.
- Popular peptides.
- Popular supplements.
- Trending clinical trial drugs.
- Medication classes.
- Drug comparisons.

### 5.3 Drug/Compound Page

Each page includes:

- Name.
- Brand/generic names.
- Approved status.
- Drug class.
- Mechanism.
- FDA label summary, if approved.
- Evidence score.
- Human evidence summary.
- Trial status.
- Known risks.
- Unknowns.
- PubMed papers.
- ClinicalTrials.gov studies.
- Related drugs/classes.
- Compare button.
- Ask AI about this.
- Add to watchlist.

### 5.4 Watchlist

Users can follow:

- Drugs.
- Supplements.
- Peptides.
- Drug classes.
- Conditions.
- ClinicalTrials.gov NCT IDs.
- Companies.
- PubMed keyword searches.
- FDA label update topics.

Alert types:

- New PubMed paper.
- New clinical trial.
- Clinical trial status update.
- Trial result posting.
- FDA label update.
- FDA safety communication.
- New comparison page.
- Weekly digest.

### 5.5 Medication Classes

Class pages include:

- How the class works.
- Common drugs.
- Brand/generic names.
- Common side effects.
- Serious warnings.
- Interactions.
- Monitoring.
- Who should use caution.
- Comparison chart.
- Follow this class.
- Ask about this class.

### 5.6 Compare Tab

Users compare:

- Drug vs drug.
- Drug class vs drug class.
- Approved drug vs investigational drug.
- Peptide vs peptide.
- Supplement vs supplement.

Comparison sections:

- Mechanism.
- Approved uses.
- Evidence strength.
- Effect size.
- Trial status.
- Common adverse effects.
- Serious risks.
- Access/cost category.
- Bottom line.
- Sources.

### 5.7 Evidence Score

Evidence categories:

- Very Strong: multiple high-quality RCTs, meta-analyses, guidelines, and/or FDA-approved labeling.
- Strong: good human trials with consistent findings.
- Moderate: some human evidence, limited size/duration or mixed results.
- Weak: small human studies, observational data, indirect evidence.
- Very Weak: animal/preclinical only or mechanistic speculation.
- Unknown: insufficient reliable evidence.

### 5.8 Source Viewer

When users tap a citation, show:

- Source name.
- Source type.
- Date.
- Source section.
- Relevant excerpt or structured summary.
- Link to original source.
- Why this source was used.
- Limitations.

### 5.9 Optional Health Context

Optional profile fields:

- Age range.
- Sex.
- Pregnancy/breastfeeding status, if relevant.
- Allergies.
- Current medications.
- Supplements.
- Conditions.
- Kidney/liver disease flag.
- Goals.
- Recent labs, optional.

Constraints:

- User can skip.
- User can delete profile.
- Do not sell health data.
- Do not train models on health data by default.
- Make clear that answers are educational.

## 6. User stories

### Ask

- As a user, I want to ask a medication question and receive a cited answer.
- As a user, I want to understand whether a compound is FDA-approved, investigational, or unsupported.
- As a user, I want to see the strength of evidence behind a claim.

### Explore

- As a user, I want to browse trending drugs and supplements.
- As a pharmacy student, I want to learn medication classes quickly.
- As a patient, I want plain-English FDA label summaries.

### Watchlist

- As a user, I want to follow a drug so I know when evidence changes.
- As a peptide-curious user, I want alerts when new human evidence appears.
- As a student, I want a weekly digest for classes I follow.

### Compare

- As a user, I want to compare Ozempic, Mounjaro, Zepbound, and retatrutide.
- As a learner, I want to compare ACE inhibitors and ARBs.

## 7. Functional requirements

### Account

- Email/password login.
- Google/Apple login.
- Guest mode for limited exploration.
- Account deletion.
- Data export.

### Search

- Search drugs, brand names, generic names, classes, supplements, companies, trials, and PubMed topics.
- Autocomplete common drugs.
- Synonym support.

### Ask

- Question input.
- Source retrieval.
- Answer generation.
- Citation display.
- Follow-up suggestions.
- Safety escalation for urgent topics.

### Drug pages

- Create canonical drug entity.
- Link labels, trials, PubMed papers, and related classes.
- Generate safe plain-English summaries.
- Show evidence score and source freshness.

### Watchlist

- Add/remove items.
- Configure alert frequency.
- Weekly digest.
- Push/email notifications.
- Change log.

### Admin

- Review generated summaries.
- Flag unsafe content.
- Manage drug entities.
- Force refresh source data.
- Manually pin high-priority updates.
- View ingestion errors.

## 8. Non-functional requirements

- Fast search response under 500 ms for cached entities.
- Chat answers under 10 seconds for normal questions.
- Source retrieval timeout fallback.
- High citation reliability.
- Audit log for generated medical content.
- Encryption in transit and at rest.
- Source freshness display.
- Observability for failed source fetches.
- Scalable ingestion jobs.

## 9. Safety requirements

- No diagnosis.
- No instruction to start/stop/change medication.
- Emergency topics should route to urgent care language.
- For contraindication-like questions, show “ask your clinician/pharmacist” language.
- For peptides/research chemicals, clearly separate approved, investigational, and research-use/insufficient evidence.
- For pregnancy, pediatrics, kidney disease, liver disease, anticoagulants, psychiatric meds, and immunosuppressants, use heightened caution.

## 10. MVP acceptance criteria

The MVP is ready when:

- A user can search a drug.
- A user can ask a medication question.
- The answer includes at least one source when a source exists.
- Approved drugs show FDA/DailyMed label sections.
- Trial drugs show ClinicalTrials.gov studies.
- PubMed results can be searched and summarized.
- Users can follow at least 3 items.
- Weekly digest can be generated.
- Evidence score appears on drug/compound pages.
- App includes privacy policy, terms, educational-use disclaimer, and account deletion.

## 11. Metrics

Activation:

- Signup completion.
- First question asked.
- First source opened.
- First watchlist item added.

Engagement:

- Questions per user.
- Drug page views.
- Watchlist opens.
- Digest opens.
- Source taps.
- Return rate.

Monetization:

- Free-to-paid conversion.
- Watchlist limit upgrade conversion.
- Trial-to-paid conversion.
- Churn.
- ARPU.

Safety/quality:

- Citation coverage.
- Unsupported answer rate.
- User report rate.
- Medical safety flag rate.
- Source freshness lag.


---

## Official source references
- **ClinicalTrials.gov Data API v2:** https://clinicaltrials.gov/data-api/api
- **ClinicalTrials.gov Terms and Conditions:** https://clinicaltrials.gov/about-site/terms-conditions
- **NCBI APIs / E-utilities:** https://www.ncbi.nlm.nih.gov/home/develop/api/
- **Entrez E-utilities Help:** https://www.ncbi.nlm.nih.gov/books/NBK25501/
- **NCBI E-utilities rate limits / API keys:** https://www.ncbi.nlm.nih.gov/books/NBK25497/
- **DailyMed Web Services:** https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm
- **DailyMed SPL API v2:** https://dailymed.nlm.nih.gov/dailymed/webservices-help/v2/spls_api.cfm
- **openFDA Drug Label API:** https://open.fda.gov/apis/drug/label/
- **openFDA API Authentication and Limits:** https://open.fda.gov/apis/authentication/
- **openFDA Drug API Endpoints:** https://open.fda.gov/apis/drug/
- **FDA Device Software / Mobile Medical Applications Guidance:** https://www.fda.gov/regulatory-information/search-fda-guidance-documents/policy-device-software-functions-and-mobile-medical-applications
- **FDA Clinical Decision Support Software Guidance:** https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software
- **FTC Health Breach Notification Rule:** https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule
- **HHS Health App Developer Resources:** https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html
- **Apple App Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
