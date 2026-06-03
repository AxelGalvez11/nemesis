# Source Strategy

**Effective:** 2026-05-01
**Owner:** AxelGalvez11
**Replaces:** prior implicit source policy in CLAUDE.md
**See also:** `docs/research/2026-05-01-source-pricing-legal-research.md` (full research backing)

Single source of truth for what content Ascend ingests, where it stores it, how it cites it, and what is forbidden. All curriculum, ingest, and AI-generation work must comply.

---

## 3-Layer Source Model

| Layer                       | What it is                                            | Storage                                                          | Use                                                    |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| **1. Ascend Core**          | Public/licensed/original authoritative content        | `core_sources` + `core_source_chunks` w/ pgvector                | Ground truth for clinical content + base curriculum    |
| **2. Private User Library** | User uploads (slides, transcripts, notes, recordings) | `sources` + existing pgvector                                    | Course-specific personalization, RLS-isolated per user |
| **3. Verified Marketplace** | Original creator decks + Ascend exam_packs + OER      | `decks` / `notes` / `exam_packs` w/ `creator_rights_attestation` | Shareable, rights-attested, paid SKUs                  |

**Layer 1 ≠ Layer 2.** Never mix into the same retrieval bucket. Citation provenance must always identify which layer a chunk came from.

---

## Layer 1 source whitelist

Free + commercial-friendly licenses only. License gate at ingest rejects everything else.

| Source                                           | Provider | License                                               | API / Access                       | Notes                                                                                                              |
| ------------------------------------------------ | -------- | ----------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **OpenFDA Drug Labels**                          | FDA      | Public domain (CC0)                                   | REST `api.fda.gov/drug/label.json` | 240/min, 120k/day with API key. Use for indications, contraindications, boxed warnings, dosing, adverse reactions. |
| **DailyMed SPL**                                 | NLM      | Public domain                                         | Bulk download + REST               | Daily/weekly/monthly delta zips. Authoritative drug labels.                                                        |
| **RxNorm / RxNav**                               | NLM      | Free, no license                                      | REST + UMLS                        | Drug name normalization, ingredient mapping, interactions. **Annual usage report due each January.**               |
| **CDC**                                          | CDC      | Public domain                                         | Various APIs                       | Vaccine schedules, immunization, infectious disease basics.                                                        |
| **NIH MedlinePlus**                              | NIH      | Public domain                                         | Connect Web Service                | Patient-friendly disease + drug info.                                                                              |
| **PubMed E-utilities (open access only)**        | NLM      | Per-article (open access subset)                      | REST                               | Citations for clinical literature. Verify CC license per article.                                                  |
| **ClinicalTrials.gov**                           | NIH      | Public domain                                         | REST                               | Trial outcomes, study design references.                                                                           |
| **DrugBank Open Data**                           | DrugBank | CC0                                                   | Bulk download                      | Structured drug data, commercial-friendly. **Not the academic CC BY-NC dataset — only Open Data.**                 |
| **Selected OER** (OpenStax, OER Commons, MERLOT) | Various  | CC BY only (CC BY-SA case-by-case, CC BY-NC rejected) | Per-resource                       | Pharmacology, anatomy, biostatistics, foundational. License-check at ingest.                                       |

### Phase A expansion (Cycle 1, added 2026-05-12)

Sources added to close the DiPiro-equivalent coverage gap — every chapter
DiPiro publishes can be grounded in Layer-1-eligible primary sources
without touching the textbook itself. Each substitutes for a copyright-
restricted professional society guideline.

| Source                                          | Provider                 | License       | Substitutes for                                                                                     | Status (2026-05-12)                                                                                                                                                             |
| ----------------------------------------------- | ------------------------ | ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drugs@FDA approval packages**                 | `drugs_fda`              | fda_public    | Original sponsor PK/PD studies + FDA reviewer analyses (distinct from OpenFDA labels + Orange Book) | PDF crawler shipped (`providers/drugs-fda.ts` + `scripts/drugs-fda-ingest.mjs`); starter NDA index covers 12 high-yield P1 agents (expand per PR via `drugs-fda.manifest.json`) |
| **NCI PDQ Health Professional summaries**       | `nci_pdq`                | public_domain | NCCN, ASCO copyright-restricted oncology guidelines                                                 | 5 seed pages wired; expand via cancer.gov HTML/JSON feed                                                                                                                        |
| **DHHS clinicalinfo.hiv.gov living guidelines** | `dhhs_hiv`               | public_domain | IDSA copyright-restricted HIV/HCV/HBV guidelines                                                    | 4 living guidelines wired (Adult ARV, Pediatric ARV, Perinatal, OI)                                                                                                             |
| **Orphanet rare disease database**              | `orphanet`               | cc_by         | NORD (CC BY-NC-ND, ineligible)                                                                      | 5 seed diseases wired; expand via orphadata.com bulk                                                                                                                            |
| **VA/DoD Clinical Practice Guidelines**         | `va_dod`                 | public_domain | APA practice guidelines (MH), ADA Standards (DM), HFSA (HF)                                         | Provider live; whitelist expansion pending                                                                                                                                      |
| **AHRQ EPC reports**                            | `ahrq`                   | public_domain | Cochrane (paywalled), private payer comparative-effectiveness                                       | Provider live; whitelist expansion pending                                                                                                                                      |
| **USPSTF recommendations**                      | `uspstf`                 | public_domain | (gold standard already)                                                                             | Provider live                                                                                                                                                                   |
| **NIH NHLBI guidelines**                        | `nih_nhlbi`              | public_domain | AHA/ACC, NLA, GINA, GOLD (CC BY-NC)                                                                 | Provider live                                                                                                                                                                   |
| **Open RN Nursing Pharmacology**                | `ncbi_bookshelf` / `oer` | cc_by         | Free pharm textbook (only Layer-1-eligible one that exists)                                         | Add to NCBI_BOOKSHELF_PAGES whitelist in follow-up                                                                                                                              |

**Coverage after Phase A:** ~70-80% of DiPiro chapter primary-source
citations are Layer-1 eligible. Remaining ~20-30% are professional
society guidelines (AHA/ACC, ADA, IDSA, NCCN, ASCO, ACG, APA, AGS Beers,
CHEST, ACOG, AAP) — cite-by-reference only, with public-domain gov
equivalents substituting where one exists.

**Forbidden in Layer 1**:

- DrugBank academic CC BY-NC dataset (non-commercial only)
- Lexicomp / Micromedex / First Databank / Medi-Span (commercial license required, deferred Year 1)
- Any clinical guideline full-text (ADA, ACC/AHA, IDSA, GOLD, GINA, KDIGO, CHEST). Cite + summarize own clinical rules; never store full guideline text.

### License metadata (mandatory on every Layer 1 chunk)

```typescript
interface SourceLicense {
  type:
    | "public_domain"
    | "cc0"
    | "cc_by"
    | "cc_by_sa"
    | "fda_public"
    | "nlm_public"
    | "oer_open";
  attribution_required: boolean; // surface in card UI when true
  commercial_use_allowed: boolean; // must be true; reject ingest if false
  share_alike_required: boolean; // affects derivative works
  source_url: string;
  retrieved_at: string; // ISO 8601 timestamp
}
```

---

## Red zone — never ingest, never generate from

These cannot enter Ascend Core under any circumstance, even if a user uploads them:

1. **Leaked or recalled licensure exam content** — NAPLEX / MPJE / BCPS / PTCB / USMLE / MCAT / BAR / CPA actual or memorized questions
2. **Commercial test-prep content** — RxPrep, UWorld, Kaplan, BoardVitals, TrueLearn, Pass NAPLEX Now, Sketchy, Picmonic question banks, explanations, mnemonics, proprietary tables
3. **Pirated textbooks** — LibGen, Z-Library, scanned copyrighted books, PDF dumps
4. **Professor slide decks for global use** — student may use own professor's slides for private study (Layer 2), but Ascend cannot promote them to Ascend Core or marketplace
5. **Paywalled journal full text** — abstracts + open-access subset only
6. **NABP NAPLEX Content Outline verbatim wording** — copyrighted, "no reproduction without written permission." Use Ascend-original taxonomy + COEPA reference label only.

If a user uploads red-zone content to Layer 2: stays private, never shared, never trains models, never enters Layer 1. App displays a warning at upload if file metadata suggests competitor source (filename heuristics + content fingerprint).

---

## Hybrid RAG retrieval policy

```typescript
type RetrievalPolicy = "core_only" | "user_only" | "hybrid";

function selectPolicy(args: {
  content_type:
    | "lesson"
    | "card"
    | "case"
    | "quiz"
    | "exam_question"
    | "summary";
  card_tier?: "mechanism" | "monitoring" | "contraindication" | "decision";
  layer: 1 | 2 | "marketplace";
}): RetrievalPolicy {
  // Pharmacy clinical content: forced hybrid or core_only
  if (args.card_tier === "contraindication" || args.card_tier === "decision") {
    return args.layer === 2 ? "hybrid" : "core_only";
  }
  if (args.card_tier === "monitoring" || args.card_tier === "mechanism") {
    return "hybrid";
  }

  // Big-exam curriculum (Ascend Core)
  if (args.layer === 1) return "core_only";

  // Course concept (lesson summary, course-specific framing)
  if (args.content_type === "summary") return "user_only";

  // Default: hybrid
  return "hybrid";
}
```

**Hard rules**:

- Pharmacy clinical content (tier=contraindication or tier=decision) **never** uses `user_only`. User uploads alone are insufficient grounding for clinical claims.
- Every generated card must produce `citations[]` array referencing the chunk IDs that grounded it.
- Cards on tier=contraindication or tier=decision **without** citations are rejected at generation time, retried once, then surfaced as error.
- Hybrid retrieval runs Layer 1 + Layer 2 in parallel (target p50 < 800ms total).
- For tier=decision and tier=contraindication cards, run a 2nd pass evidence-refinement check (MEGA-RAG pattern) before publish.

---

## Citation requirements

Every Layer 1-grounded card carries:

```typescript
interface Citation {
  source_type:
    | "openfda"
    | "dailymed"
    | "rxnorm"
    | "cdc"
    | "nih"
    | "pubmed_oa"
    | "drugbank_open"
    | "oer";
  source_id: string; // core_sources.id
  chunk_id: string; // core_source_chunks.id
  span: { start: number; end: number };
  license: SourceLicense;
  attribution_text?: string; // surfaces in UI when license requires
  retrieved_at: string; // ISO 8601, used for staleness check
}
```

UI surfaces:

- `<CitationChip>` mono pill next to card body: e.g. `FDA · 2026-04-15`
- Tap to expand → license + source URL + full attribution
- Freshness rule: chunks older than 90 days display `Verify · stale` flag, prompt re-fetch

---

## Ops compliance

| Cadence                   | Task                                                                   | Owner                      |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| **Annual (each January)** | NLM/RxNorm UMLS usage report submission                                | Ops                        |
| **Daily**                 | OpenFDA delta sync (cron)                                              | Edge fn `core-source-sync` |
| **Weekly**                | DailyMed SPL refresh, RxNorm full update                               | Edge fn                    |
| **Monthly**               | CDC vaccine schedule check, OER catalog audit                          | Edge fn                    |
| **Quarterly**             | License audit (verify all Layer 1 sources still permissively licensed) | Ops                        |
| **On-publish**            | Marketplace rights attestation review (admin queue)                    | Admin UI                   |

---

## Marketing language (compliance + safety)

**Approved**:

- "Ascend generates original practice content aligned to NAPLEX competencies and your course concepts."
- "Built from authoritative public sources (FDA, DailyMed, RxNorm, CDC) and your own course materials."
- "Aligned with COEPA pharmacy curriculum standards."
- "Every clinical card cites its sources."
- "Source-grounded, not source-derivative."

**Banned**:

- "Predicts your school's exam" / "Reverse-engineers the NAPLEX"
- "Reconstructs board questions"
- "Trained on pharmacy textbooks" (we don't train, we retrieve)
- "PharmD-reviewed" (unless an actual licensed PharmD has signed off — `verified_by = 'faculty_reviewed'` only with sign-off)
- "Hallucination-free" (industry-wide overstated claim; production legal RAG hallucinates 17-33% per Stanford 2025)
- "Replaces clinical reference" / "Use for clinical decisions" (TERMS §3.4 disclaims)

---

## Decision log

- **2026-05-01** — 3-layer model formalized after legal research (Bartz/Anthropic $1.5B settlement, FDA Jan 2026 CDS guidance, NABP outline copyright restriction)
- **2026-05-01** — NABP licensing inquiry deferred until ARR > $100k. COEPA used as public framework reference only.
- **2026-05-01** — DrugBank commercial license deferred Year 1; using Open Data (CC0) only.
- **2026-05-01** — "PharmD-reviewed" badge banned until actual licensed PharmD sign-off available.
- **2026-05-12** — Phase A source expansion: 4 new providers registered (`drugs_fda`, `nci_pdq`, `dhhs_hiv`, `orphanet`) to close DiPiro-equivalent coverage gap. License-audit script added as contamination tripwire (`scripts/license-audit.ts`). DiPiro itself remains paywalled (AccessPharmacy via school library is the read path); Ascend writes original content from same upstream primary sources DiPiro cites. Coverage target: ≥80% of DiPiro chapter primary-source citations Layer-1 eligible.
- **2026-05-13** — Drugs@FDA real PDF crawler shipped (`providers/drugs-fda.ts` + `scripts/drugs-fda-ingest.mjs`). Stub `DRUGS_FDA_PAGES` retired. Manifest at `supabase/functions/core-source-sync/providers/drugs-fda.manifest.json` is the single source of truth — both Deno provider (edge fn) and Node ingest script read from it. Starter index: 12 NDAs covering statins, DOACs, antiplatelets, SGLT2/DPP-4/GLP-1, duloxetine. PDF parsing runs in Node via `pdfjs-dist`; pre-parsed batches POST back to `core-source-sync` with `opts.pre_parsed_docs`. Expand the manifest in follow-up PRs as P1 curriculum demands more agents.
- **2026-05-13** — Phase B citation strategy shipped: `restricted-guidelines.json` registry (16 entries: AHA/ACC, ADA, IDSA, KDIGO, GOLD, GINA, APA, NCCN, ASCO, HFSA, NLA, DiPiro, etc) + `<TrustChip state="referenced">` variant + `[~KEY]` token in mastery-guide prompt. Mastery-guide model can now flag references to copyright-restricted guidelines that appear in Layer 1 sources without ingesting the guideline itself. `referenced_guidelines[]` slot in DraftedSection carries the keys through to `MultipassResult.sections`. Renderer maps `[~KEY]` body markers to a non-clickable chip with substitute Layer 1 providers shown in the citation drawer. Drift between prompt-side `ALLOWED_GUIDELINE_KEYS` and `restricted-guidelines.json` fails soft both ways.
- **2026-05-13** — License-audit script wired to CI (`.github/workflows/license-audit.yml`). Runs on every PR that touches `supabase/migrations/**`, `supabase/functions/core-source-sync/**`, `scripts/license-audit.ts`, or `apps/web/lib/sources/provenance.ts`. Soft-skips on fork PRs (no secrets). `pnpm license-audit` available as root script via `tsx` runtime. Tripwire is now first-class — Layer 1 contamination should never reach main.

---

## References

- `CLAUDE.md` — hard rules referencing this doc
- `TERMS.md` §4.5 — user-facing competitor-content ban
- `docs/research/2026-05-01-source-pricing-legal-research.md` — full research backing
- `apps/web/lib/sources/provenance.ts` — typed provenance enums
- `apps/web/lib/sources/citations.ts` — citation builder + license helpers
- `supabase/migrations/0101_core_sources.sql` — Layer 1 schema
- `supabase/migrations/0102_source_provenance.sql` — provenance enum
- `supabase/migrations/0103_card_citations.sql` — citations jsonb on cards
- `supabase/migrations/0104_marketplace_attestation.sql` — rights attestation
