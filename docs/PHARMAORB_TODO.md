# PharmaOrb Product TODO

## Next Evidence Engine Upgrades

- [ ] **Claim Check mode**
  - User enters a claim, not just a question.
  - Engine rewrites the claim into a clear, testable version.
  - Engine searches for supporting, contradicting, partial, and merely mentioning evidence.
  - Output a verdict: `supported`, `weakly_supported`, `mixed`, `unsupported`, `insufficient_evidence`.

- [ ] **Steelman / falsification workflow**
  - Build the strongest version of a claim before checking it.
  - Search for evidence that would support the strongest version.
  - Search for evidence that would weaken or falsify it.
  - Explain what evidence would change the conclusion.

- [ ] **Limited-data handling**
  - Label evidence as human, animal, in vitro, mechanistic, abstract-only, metadata-only, or expert opinion.
  - Explicitly say when there are no adequate human studies.
  - Separate “biologically plausible” from “shown in humans.”
  - Do not upgrade evidence strength from mechanism alone.

- [ ] **Plain-English default**
  - Default answers should be conversational and research-focused.
  - Technical mode can add PICO, effect sizes, confidence intervals, risk-of-bias notes, and protocol details.
  - Avoid “Dr. GPT” framing; say “the evidence suggests/does not show” rather than giving personal medical instructions.

- [ ] **Data extraction and visuals**
  - Extract sample size, population, intervention, comparator, duration, outcomes, effect direction, adverse events, and limitations.
  - Render evidence tables, claim-support matrices, timeline charts, study-type breakdowns, and evidence maps.
  - Generate visuals only when the extracted data is structured enough; otherwise explain what is missing.

- [ ] **Literature gap discovery**
  - Detect small samples, short duration, indirect populations, missing comparators, missing dose-response, lack of long-term safety, surrogate outcomes, unpublished trials, and contradictory evidence.
  - Convert each gap into a testable research question.
  - Rank gaps by importance, feasibility, uncertainty, and potential impact.

- [ ] **Wet Lab Draft Mode**
  - Draft study/protocol concepts that help test identified gaps.
  - Include hypothesis, model/system, controls, endpoints, sample-size assumptions, randomization/blinding notes, materials, measurements, analysis plan, reproducibility checklist, and safety/ethics gates.
  - Never present wet-lab output as approved instructions; mark it as a planning draft requiring institutional review and domain expert validation.

- [ ] **Research workspace before journal**
  - Support uploads of papers, protocols, notes, datasets, figures, drafts, citations, reviewer comments, and grant aims.
  - Turn messy research artifacts into evidence graphs, manuscript outlines, systematic review drafts, reviewer-risk reports, and publishable evidence reports.

- [ ] **Living evidence loop**
  - Watch a claim/project for new PubMed, Europe PMC, ClinicalTrials.gov, FDA label, guideline, and citation updates.
  - Detect when new evidence changes a claim rating.
  - Version claims and suggested study designs over time.
