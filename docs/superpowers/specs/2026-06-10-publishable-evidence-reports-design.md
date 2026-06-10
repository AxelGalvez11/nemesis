# Publishable Evidence Reports — Design Spec

**Date:** 2026-06-10
**Status:** Design approved (owner decisions locked); ready for implementation plan
**Builds on:** the **live, in-production** Deep Research engine (PR #49 merged → `main` `6b9000c`; `research` edge function deployed; `0127` Pro-gate fix applied to prod). This is an **additive extension of a feature that already serves real Pro users at 3 runs/day** — not the launch of an unmerged feature.

---

## 1. Goal & audience

Turn a Deep Research report into a **sellable, defensible evidence document** for researchers, clinicians, and biotech/pharma teams who will rely on it. Four additions on top of the existing engine:

1. **Word + PowerPoint export** — a report leaves the app as a `.docx` (manuscript-style) and `.pptx` (briefing deck).
2. **Honest literature-gap section + a "what we searched" summary** — grounded, denominator-scoped gaps.
3. **Real medical citation formatting** — Vancouver **and** AMA (user-toggle) with a numbered reference list.
4. **A "structured / PRISMA-informed evidence review" mode** — a stricter report that documents its own method honestly.

The differentiator is **honesty of method**, not formatting polish. The report tells a skeptical reader exactly what was searched, when, how much was kept, and what was *not* done — which most tools cannot show at all.

## 2. The honesty cornerstone (non-negotiable)

PharmaOrb performs **bounded, relevance-capped retrieval** (≈6–10 results/source, top-24 merged) with **one** automated faithfulness pass. It has **no** registered protocol, **no** exhaustive search, **no** dual independent screening, and **no** per-study risk-of-bias / GRADE appraisal. Therefore:

- **Branding:** "**structured / PRISMA-informed evidence review**." **Never** "systematic review," "scoping review," "PRISMA-compliant," or "PRISMA flow diagram." (Owner-approved.)
- **Counts** read "**candidates retrieved (top-ranked by relevance, capped at N per source — not an exhaustive census)**," **never** PRISMA "records identified."
- **The faithfulness check** is surfaced as "each claim was checked against its cited source" — **never** labeled "Eligibility" or "Quality" (it is neither screening nor appraisal).
- A fixed, plain-English **Methods & Limitations** note states what was and was **not** done.
- **Code-level enforcement:** a `forbidden-phrase guard` module bans the phrases above from all rigorous-mode copy strings, with a unit test — mirroring the existing `detectViolations` discipline.

Borrow PRISMA's *spirit* (log what/when/how); borrow **none** of its labels.

## 3. Architecture — Approach 1: additive hybrid (chosen)

Extend the existing engine **in place** via a payload-level `mode` discriminator plus **new OPTIONAL fields** on `ResearchReport`, **keeping `saved_reports.kind = 'deep_research'`**, combined with a **server-side formatting/export layer**.

**Why this and not the alternatives:**
- *New `saved_reports.kind`* (rejected): costs a migration **and** requires editing the two frozen read queries (`apps/web/lib/api.ts` `fetchResearchReports`/`fetchResearchReport`, both hard-filter `.eq('kind','deep_research')`). Miss either and rigorous reports silently vanish from history/open-by-id. The DB-level analytics benefit isn't needed yet. Being **live in prod** makes this blast radius unattractive.
- *Pure post-processing layer* (rejected): can deliver export only. Citations would be permanently degraded (author/journal/year were never saved on old reports), gaps would be render-only relabeling, and the rigorous mode is **impossible** this way because the documented method is synthesis-time model prose that must pass the safety scan.

**Why the hybrid is *strengthened* by being live:** keeping `kind='deep_research'` + optional payload fields means **no migration** and **no break to the live read-path** — exactly what you want when you cannot afford to break production.

### Frozen guarantees preserved
- **One safety scan:** every new model-authored free-text field (gaps narrative, method/inclusion prose) **MUST** be added to the single `detectViolations` join (`orchestrate.ts` ~lines 260-266). This is the easiest-to-miss requirement; each phase that adds prose ships with a unit test proving a banned string inside the new field is caught.
- **One citation namespace:** the existing `mergeEvidence` round-robin + 1..N retag is untouched; reference formatting is a pure presentation transform over the resulting `Citation[]`.
- **Deterministic-over-LLM:** gaps are computed deterministically first (reusing the §9 evidence-scoring counts); the LLM only supplies non-computable nuance, kept only if grounded.

## 4. Data model changes (`packages/shared/src/research.ts`, additive & optional)

```
ResearchReport (existing) +=
  mode?: 'standard' | 'structured_review'          // discriminator; default 'standard'
  gaps?: GapStatement[]                             // deterministic-first, denominator-scoped
  search_method?: SearchMethod                      // documented, honest method (rigorous mode)
  counts?: RetrievalCounts                          // candidates retrieved/kept (+cap disclosure)
  citation_style?: 'vancouver' | 'ama'             // chosen style, persisted so exports match screen

Citation (packages/shared/src/answer.ts) +=
  authors?: string[]; journal?: string; year?: string; volume?: string; issue?: string; pages?: string
```

`GapStatement = { dimension: PICOS, type, scope: 'indexed_literature' | 'this_run', text, denominator: { providers_searched, n_sources, retrieved_at }, corroborating_trials: NCT[] }`.

`kind` stays `'deep_research'`. No migration required for the report shape (it lives in `saved_reports.payload` JSON).

## 5. The four features & their extension points

### 5.1 Word + PowerPoint export (web-only)
- New Next.js App Router route handlers: `apps/web/app/api/reports/[id]/export/docx/route.ts` and `.../pptx/route.ts`, each `export const runtime = 'nodejs'` + `export const maxDuration = 60`.
- Read `saved_reports.payload` under the **user's own access token** (RLS-scoped, **never** service-role).
- Pure formatters (`reportToDocx` via `docx` v9.x, `reportToPptx` via `pptxgenjs` v4.x — both MIT) map `summary`/`sections`/`safety_notes`/`uncertainties`/`gaps`/`citations` into the document.
- **Honesty carry-through:** the export MUST include `evidence_grade`, the "Not fully fact-checked" state when `claims_verified=false`, and `safety_notes` — a polished file must never read as more authoritative than the in-app view.
- Return bytes as a binary `Response` with `Content-Disposition: attachment`. **Regenerate on download; do not store.**
- **Caveat (advisor #3):** "regenerate on demand" cannot recover metadata a report never saved. Reports created **before** the §5.3 plumbing fix have no author/journal/year, so their exported references stay degraded; **new** reports are correct. Pre-empt the "why does my old report look different" surprise in release notes.
- **Style wiring (advisor #2):** the in-app reference list formats **client-side**, but export runs **server-side** — so the chosen `citation_style` MUST be passed to the export route (query param) or read from the persisted `report.citation_style`, or downloads won't match the screen.

### 5.2 Literature gaps + honest counts (engine-side, deterministic-first)
- New `deriveGaps` **pure** module reusing `packages/shared/src/evidence-scoring.ts` §9 counts: emit `no_rct` / `no_human_trial` / `no_synthesis`; emit `conflicting` **only** with ≥2 human studies and an actual inconsistency signal (never on a lone study or mere sparsity).
- Every gap string names its denominator — "**in the sources we searched**" / "**in the literature we index**" — never "no evidence exists" (Altman-Bland).
- **Tiering:** Tier-1 (indexed-literature) claims gated on projection maturity (memory: ~122/392 scores are `unknown` false-negatives from a sparse projection); when coverage is unverified, fall back to Tier-2 run-scoped phrasing.
- **ClinicalTrials.gov = strengthening-only:** attach ongoing/recruiting trials (`results_first_posted=null`) as "an answer may be coming (NCT…)"; trial presence/absence may **never** delete a gap. Requires the small additive fix of carrying `status`/`study_type`/`phases` through `liveToChunk` (currently dropped at `live-sources.ts` ~line 38).
- Reframe the today-uncited `uncertainties` field into **cited** gaps where deterministic; keep ungrounded LLM gaps only if they pass a faithfulness-style "grounded in a chunk that states the limitation" check.
- `counts` shown **only** with the inline cap disclosure; no "flow diagram" claim.
- **Safety:** add the gaps narrative to the `detectViolations` join + test.

### 5.3 Vancouver + AMA reference list (moderate plumbing; toggle)
- **Owner chose both styles + a per-report toggle.** Hand-rolled remains correct (advisor #2): Vancouver and AMA are two **numbered** styles differing only in punctuation — this is **not** the "arbitrary CSL / BibTeX / hundreds of styles" case that would justify pulling in `citation-js`/CSL (541 kB). We explicitly decline CSL for two punctuation-variant styles over a fixed 5-source set.
- **Step 3a (sequence first):** extend the PubMed EFetch XML parser (`core-source-sync/providers/pubmed.ts`) to capture author initials, volume, issue, pages, `ISOAbbreviation` — **all already downloaded, just unparsed**. Without this, Vancouver/AMA article entries are non-conformant.
- **Step 3b:** add optional `authors/journal/year/volume/issue/pages` to `RetrievedChunk` (`citation.ts` ~line 16) and `Citation` (`answer.ts`); carry `NormalizedSource.metadata` through `liveToChunk` and the library `retrieve` RPC projection; surface in both `buildCitations`. Extend Europe PMC provider to keep `authorString` + `journalInfo` (one line, no new fetch).
- **Step 3c:** pure, dependency-free `formatReference(citation, style)` + `buildReferenceList(citations, style)` switching on `source_type` with graceful per-field fallbacks. Run **client-side at render** (retroactively formats saved chats; no migration). Render openFDA as `[package insert]`, ClinicalTrials as `ClinicalTrials.gov NCT…`, FAERS as an FDA adverse-event **database-query note** (not a journal cite). Use full journal titles (no abbreviation table).
- **Fix the existing display bug:** `ResearchReportView` `abbr()` renders `source_type 'europepmc'` as `REF` (matches no key); correct the Europe PMC label.

### 5.4 Structured / PRISMA-informed mode (highest care, last)
- Mode-specific `plan.ts` variant + `synthesize.ts` schema fields for `search_method` (databases named, sub-questions as queries, `retrieved_at` as search date) and honest inclusion/exclusion **notes** (not "eligibility screening").
- Fixed plain-English **Methods & Limitations** note (see §2).
- **Safety:** add the method/inclusion prose to the `detectViolations` join **and** run it through the §6 forbidden-phrase guard — both with tests.
- Surface `claims_verified=false` prominently (carry the existing `UNVERIFIED_NOTE` path into the new UI).
- Consumes a normal **Pro `deep_research_daily` slot** (owner-chosen; no new metering; gated by the existing, now-fixed `consume_usage`).

## 6. Build phases (each its own gated deploy across a *different* surface)

> **Deploy posture (advisor #1):** the engine is **already live**. There is no single branch-merge that ships everything. Each phase deploys independently and is verified on its own surface; nothing ships to prod without the owner's explicit greenlight (existing posture).

- **Phase 0 — Guardrail scaffolding (no user-facing change).** Forbidden-phrase guard module + test. Define the additive optional contract (`mode`, `gaps`, `search_method`, `counts`, `citation_style`, citation metadata) on `ResearchReport`. Surface: shared package; no deploy.
- **Phase 1 — Word + PowerPoint export.** Surface: **web only** (Next route handlers + `ResearchReportView` buttons). No engine/migration change. Cheapest, safest, immediate value. Verify: download a real saved report, confirm honesty signals + correct file open.
- **Phase 2 — Gaps + honest counts.** Surface: **Deno edge function** (`deriveGaps`, `liveToChunk` metadata pass-through, reframed `uncertainties`, `detectViolations` join + test). Deterministic; deploy the `research` function.
- **Phase 3 — Vancouver/AMA reference list + toggle.** Surface: **spans both** — `core-source-sync` PubMed parser (3a) + Deno edge metadata plumbing (3b) + web formatter & toggle & export-style wiring (3c). Sequence 3a → 3b → 3c. Backfill of old reports' metadata is out of scope (degraded references on pre-Phase-3 reports, per §5.1 caveat).
- **Phase 4 — Structured / PRISMA-informed mode.** Surface: **Deno edge function** (mode-specific `plan.ts`/`synthesize.ts`, Methods & Limitations note, both safety guards + tests). Highest care.
- **Phase 5 — Integration & verification.** End-to-end on a fixture **and** a live run: confirm the one safety scan covers all new prose, the frozen `api.ts` read-path still returns rigorous reports (`kind` unchanged), exports carry honesty signals, and the Pro slot meters correctly. Each prior phase is independently deployable; this phase confirms they compose.

## 7. Testing
- Pure formatters (`reportToDocx`, `reportToPptx`, `formatReference`/`buildReferenceList`) and `deriveGaps` are the load-bearing deterministic logic — unit-test against a fixture `ResearchReport` (repo 80% coverage rule).
- A test per prose-adding phase proving a banned/violating string inside the **new** field is caught by `detectViolations`.
- A test proving the forbidden-phrase guard rejects "systematic review" / "PRISMA-compliant" / "records identified" in rigorous-mode copy.
- Frozen `/ask` safety suite must stay green (286 tests) — the safety layer is not modified.

## 8. Out of scope (deferred)
- True systematic review / journal-submission-grade rigor (registered protocol, exhaustive search, dual screening, risk-of-bias/GRADE).
- **Quantitative meta-analysis** (real-stats pooling — separate later track; stats in real code, never LLM-guessed).
- **Wet-lab / hypothesis design** (separate generative product).
- **Non-open-access full text** (licensing / user-PDF-upload — on demand only; abstracts/metadata of non-OA papers already flow via PubMed).
- Supabase Storage for exports / shareable links (only if stable links are later needed).
- New `saved_reports.kind`; DB-level per-type analytics/quotas.

## 9. Key risks
- **Overclaim by a single word** — enforced in code (§6 guard), not just intent.
- **Safety-scan bypass** — any new prose field not added to the `detectViolations` join ships unscanned. Mitigated by per-phase tests.
- **Thin-projection false gaps** — Tier-1 gated on coverage maturity; prefer Tier-2 run-scoped phrasing when unverified.
- **Old-report degraded references** — pre-Phase-3 reports lack saved metadata; documented limitation, not a bug.
- **Export authority** — exported files must visibly carry `claims_verified`/`evidence_grade`/`safety_notes`.
