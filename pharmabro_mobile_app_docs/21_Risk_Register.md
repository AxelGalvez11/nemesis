# Risk Register — PharmaBro

## Product risks

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| App seen as AI doctor | High | Medium | Educational positioning, disclaimers, source viewer, no diagnosis |
| Answers too generic | Medium | High | Better retrieval, drug pages, evidence score |
| Users do not return | High | Medium | Watchlist, digest, alerts |
| Search quality poor | Medium | Medium | Aliases, synonyms, seed database |
| Drug pages incomplete | Medium | High | Start with curated seed list |
| Brand name backlash | Medium | Medium | Treat PharmaBro as working title |

## Medical/safety risks

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| Unsupported medical claim | High | Medium | Citation enforcement, source trace, review |
| User follows AI as treatment advice | High | Medium | No start/stop/change instructions |
| Peptide misuse | High | Medium | No dosing/sourcing, evidence limitations |
| Emergency question mishandled | High | Low/Medium | Emergency classifier and template |
| Pregnancy/pediatric risk | High | Medium | High-risk templates, professional routing |
| Drug interaction overconfidence | High | Medium | Cautious language, label sources |

## Legal/privacy risks

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| FDA regulatory risk | High | Medium | Avoid diagnosis/treatment claims |
| FTC health privacy risk | High | Medium | Honest privacy policy, no health data ads |
| App Store rejection | Medium | Medium | Compliant descriptions and privacy |
| Health data breach | High | Low/Medium | Encryption, minimization, breach plan |
| HIPAA misunderstanding | Medium | Medium | Attorney review before B2B/covered entity work |
| Subscription complaints | Medium | Medium | Clear pricing/cancellation |

## Technical risks

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| Public API rate limits | Medium | Medium | Cache, batch jobs, API keys |
| Source format changes | Medium | Medium | Monitoring and tests |
| Label parsing errors | High | Medium | Section mapping QA |
| PubMed relevance poor | Medium | High | Query tuning, filters, human review |
| High AI cost | Medium | Medium | Precompute, cheaper classifiers, limits |
| Slow answers | Medium | Medium | Cache and prefetch |

## Business risks

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| Users won't pay | High | Medium | Watchlist/digest paid value |
| Competitor copies | Medium | Medium | Brand, content, source quality, retention |
| Trust not established | High | Medium | Source viewer, conservative tone |
| Niche too broad | Medium | High | Start GLP-1/peptides/classes |
| Content moderation burden | Medium | Medium | User reports, admin review |
| Wrong wedge | Medium | Medium | Test multiple audiences |

## Top five mitigations before launch

1. Build source trace and citation enforcement.
2. Keep educational positioning everywhere.
3. Make watchlist useful before charging.
4. Add admin review for high-risk content.
5. Minimize and protect health context data.
