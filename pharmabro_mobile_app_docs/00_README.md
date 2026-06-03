# PharmaBro Mobile App Planning Pack

Generated: 2026-06-02

## Working product definition

**PharmaBro** is a working-title mobile app for evidence-backed medication, supplement, peptide, and clinical trial intelligence. The app is inspired by the simplicity of an evidence-answering tool, but it should avoid positioning itself as an AI doctor. The recommended lane is:

> Evidence-backed drug answers, FDA/DailyMed label summaries, PubMed research summaries, ClinicalTrials.gov tracking, and medication education for the public.

## The core product loop

1. **Ask** a medication, supplement, peptide, or clinical trial question.
2. **Read** a plain-English answer with evidence grade and citations.
3. **Explore** related drug pages, medication classes, clinical trials, and comparison pages.
4. **Watch** medications, classes, trials, keywords, or companies.
5. **Return** when new evidence, label updates, trial changes, or FDA updates appear.

## Recommended MVP

The MVP should be **Ask + Explore + Watchlist**:

- Ask Tab: source-grounded AI medication Q&A.
- Drug/compound pages: label summary, evidence summary, trials, PubMed papers, related classes.
- Watchlist: follow drugs, classes, PubMed keywords, ClinicalTrials.gov trials, and FDA/DailyMed label changes.
- Evidence Score: plain-language grading of the strength of evidence.
- Source Viewer: tap a citation and see the original source, section, date, and summary.

## Files in this pack

1. One-page product brief
2. PRD
3. User personas
4. User journey map
5. MVP scope and backlog
6. Information architecture and screen list
7. User flows
8. Low-fidelity wireframes
9. Tech stack and architecture
10. Data model
11. API/backend requirements
12. Source ingestion and evidence system
13. Design system
14. Analytics plan
15. QA/testing checklist
16. Monetization and pricing
17. Launch/GTM plan
18. Privacy/legal/compliance notes
19. Roadmap
20. AI answer spec
21. Risk register

## Branding note

“PharmaBro” is memorable, but it may carry baggage because “Pharma Bro” is already associated with controversy in the pharmaceutical world. Treat it as a **working title** until brand testing is done. Safer alternatives: **DrugLens, MedLens, TrialLens, LabelLens, PharmaWatch, EvidenceRx, RxLens, MedSignal**.



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
