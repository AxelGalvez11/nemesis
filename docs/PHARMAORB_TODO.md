# PharmaOrb Product TODO

## Product Ecosystem

- Implementation plan: `docs/superpowers/plans/2026-06-29-pharmaorb-product-ecosystem.md`

- [ ] **Position PharmaOrb as one evidence OS across three surfaces**
  - Brand promise: PharmaOrb is the AI evidence engine for health and science, available as a web workspace, mobile companion, and supervised research agent.
  - Keep one account, one evidence backend, one project/library model, one billing relationship.
  - Do not market three separate products; market one ecosystem with specialized surfaces.

- [ ] **PharmaOrb Web App: core research workspace**
  - Prioritize evidence chat, evidence broker search, projects, saved chats, paper library, literature reviews, evidence tables, systematic review workflows, watchlists, reports, and team collaboration.
  - Web is where users do serious work: review papers, compare evidence, build reports, generate deliverables, and manage research projects.
  - Near-term build order: Ask + citations -> Projects -> Paper Library -> Evidence Tables -> Reports -> Team collaboration.

- [ ] **PharmaOrb Mobile: capture, alerts, and quick answers**
  - Use mobile for quick evidence questions, supplement/med/food label scanning, article/screenshot capture, voice-note research ideas, watchlist alerts, and short evidence summaries.
  - Mobile should not try to be the full systematic review workspace.
  - Mobile should create or update web projects: scanned label -> entity/topic -> evidence question -> watchlist/project.
  - Add OCR/barcode capabilities when the mobile app is ready; use label scans as an input to the evidence engine, not as standalone medical advice.

- [ ] **PharmaOrb Agent/Desktop: supervised research operator**
  - Premium product for browser automation, portal imports, Google Drive organization, PDF downloading/summarization, Zotero organization, evidence table extraction, report drafting, and systematic review grunt work.
  - Pitch as “does the boring research work while you supervise,” not “controls your computer.”
  - Start with browser-agent workflows before full desktop control.
  - Require user approval before consequential actions, file deletion, sending emails, submitting forms, purchases, or accessing sensitive portals.

- [ ] **Product ladder**
  - Free: limited evidence search and chat.
  - Web Pro: projects, saved reports, watchlists, higher limits.
  - Researcher: PDFs, literature matrices, systematic review tools, advanced reports.
  - Agent: supervised browser/desktop research workflows and monthly agent hours.
  - Teams/Labs: shared libraries, audit logs, team projects, admin controls.
  - Enterprise: custom evidence infrastructure, compliance, SSO, private deployment, API/MCP scale.

- [ ] **Ecosystem build order**
  - Phase 1: Web app MVP with evidence chat, projects, citations, reports.
  - Phase 2: Research workflows with paper library, watchlists, evidence tables, claim check, gap reports.
  - Phase 3: Mobile companion with quick questions, scan labels, capture, alerts.
  - Phase 4: Browser agent for web research, portal imports, and evidence extraction.
  - Phase 5: Desktop agent for local PDFs, Zotero, spreadsheets, supervised computer-use.

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
