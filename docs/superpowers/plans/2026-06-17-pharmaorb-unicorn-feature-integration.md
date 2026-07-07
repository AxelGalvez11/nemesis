# PharmaOrb — Unicorn feature integration plan

**Status:** PLAN — awaiting owner approval. No code until a phase + buyer is confirmed.
**Date:** 2026-06-17
**Thesis (from strategy discussion 2026-06-15):** PharmaOrb should become *the living, auditable evidence engine for the people whose job is producing and defending medical evidence* — Medical Affairs, HEOR / market access, med-comms agencies, payers — NOT a free clinician chatbot (OpenEvidence owns that). The moat is "computed, not guessed" + claim-to-source provenance + reproducibility. Money shape: land with **deliverables**, expand into a **surveillance subscription** (recurring, sticky).

## The reframe (verified against the codebase 2026-06-17)

The product is already deployed and rich. The gaps that stand between it and a unicorn-shaped business are **not more answer breadth** — they are (1) the recurring-revenue engine, (2) the team/enterprise wrapper that lets an organization buy it, (3) a thin layer of methodological rigor for sophisticated buyers, and (4) actually picking a buyer and turning on billing. Half the "missing features" turned out to be shipped.

### 10 candidate features → real status → phase

| # | Feature | Verified status | Where it lands |
|---|---------|-----------------|----------------|
| 1 | Living surveillance / "watch & alert" | **NET / TODO** — `watchlist_items` table exists (migration 0109); NO scheduler, diff, or alert UI. This is workstream **WS-D**. | **Phase 1** (the flagship) |
| 2 | Polished export (docx/pptx) + reproducibility appendix | **SHIPPED** — `apps/web/app/api/reports/[id]/export/{docx,pptx}/route.ts`, Vancouver/AMA styles. Appendix = small add. | **Phase 0** (appendix only) |
| 3 | Deeper meta-analysis (OR/HR/continuous, sensitivity, subgroup, PRISMA) | **PARTIAL** — `packages/shared/src/meta-analysis.ts` is **risk-ratio only**; forest plot + abstract + IMRaD shipped. | **Phase 3** |
| 4 | Bring-your-own-evidence (upload PDFs) | **NET-NEW** — no upload/ingest path. | **Phase 4** |
| 5 | Audit trail + report versioning | **PARTIAL** — timestamps + model/prompt-version tracked; no version chain. | **Phase 2** |
| 6 | Team workspaces / multi-seat / org | **NET-NEW** — schema is strictly single-user (RLS pinned to `auth.uid()`). | **Phase 2** |
| 7 | Compliance (zero-retention, BAA, SSO) | **NET-NEW** — no app-level config; provider review doc only. | **Phase 2** |
| 8 | Competitive / pipeline intelligence | **NET / TODO** — same machinery as #1 (watch a competitor drug). | **Phase 1** (rides WS-D) |
| 9 | Job-shaped templates (payer dossier, journal club…) | **PARTIAL** — 4 `ReportMode`s exist; architecture supports adding more. | **Phase 4** |
| 10 | Trust signals (retraction, COI, GRADE) | **PARTIAL** — study-type + DOAJ-vetted + science-state badges + evidence tiers SHIPPED; retraction + COI missing. | **Phase 3** |

### Already done, do not rebuild
Retrieval breadth (WS-A), claim→highlight provenance (WS-C), OpenAlex + OA links (WS-B), forest plots / structured abstract / IMRaD meta layout, study-type & DOAJ & science-state badges, docx/pptx export, lab-draft mode (WS-E, branch-only). Multi-query fan-out (WS-F) was **disproven** by a live probe — do not build it.

## Cross-cutting guardrails (carry forward, non-negotiable)
- **Never-LLM-guess.** Every number and supporting highlight is a real verbatim substring found deterministically.
- **One safety scan, one citation namespace.** New client-facing text flows through the single `detectViolations` scan; never add an LLM path that bypasses the frozen `/ask` safety layer.
- **Owner-gated:** prod deploy, DB migrations, new secrets/API keys, PR merges, push, and **flipping Stripe to live** each need a fresh explicit OK.
- **Verifiable without app login:** pure logic gets unit tests with fixtures; visual changes verified via the static-mock screenshot method.
- **Green gate before every commit:** `deno test --allow-env supabase/functions/ask/` + `deno test packages/shared/` + `pnpm --filter @pharmaorb/web typecheck && build && smoke:export`.

---

## Phase 0 — Decide & monetize (low/no code; unblocks everything)
The product already works in production. The highest-leverage moves need almost no engineering.

1. **Confirm the design-partner buyer.** *Default (recommended for a solo, non-technical founder with no stated pharma access): **med-comms agency*** — shortest sales cycle, deliverable-led, and it needs the **least** new infrastructure (Phase 0 appendix + a Phase 4 template or two on rails that already exist). Override only if you have a warm line into Medical Affairs or an HEOR/payer group — those unlock bigger deals but pull in the expensive surveillance/team/compliance builds. See buyer fork below.
2. **De-risk the flagship (≈1 hour, before betting on surveillance).** Use the search tools to confirm no incumbent already owns "living evidence surveillance / literature monitoring / competitive intelligence" for this buyer — there are established players in pharmacovigilance and lit-monitoring. If one owns this exact wedge, the flagship changes. Cheap insurance against months of misdirected build.
3. **Bring prod current** — deploy the ~8 held commits + redeploy the research function + web, so a prospect sees the real thing (incl. lab-draft if wanted). *Owner-gated.*
4. **Set up a way to bill a design partner** — for the B2B lane this means invoice/contract or a team/seat price, NOT consumer self-serve checkout. Flipping the existing $20/mo Stripe test→live only matters if you *also* pursue prosumer self-serve, which the thesis de-prioritized — treat it as optional, not the headline move. *Owner-gated.*
5. **Reproducibility appendix** — append to the existing export a "how this was produced" section: every source, the exact search terms, retrieval date, model + prompt version (all already stored). Small, high-leverage for the deliverable sale.
   - Files: `apps/web/lib/export/docx.ts` (+ pptx), report payload already carries `source_ids`, `created_at`, `model_name`, `prompt_version`. Add an appendix builder + a unit test on the assembled section.
   - **Complexity: LOW.**

## Phase 1 — The recurring-revenue engine: living surveillance (WS-D)
The recurring hook that turns a tool into a company — but it is the **Medical-Affairs bet, not a universal next step**, and it is **not buyer-agnostic**. Build it only when a Medical-Affairs / competitive-intel buyer actually pulls for it. **Sequencing gate:** if a team/org buyer is in scope, make the multi-tenancy schema decision (Phase 2.1) *first* — otherwise you build watches on the single-user schema and rebuild them org-scoped later (double work). Subsumes competitive intelligence (#8).

1. **Scheduler primitive** — Supabase `pg_cron` → new edge function `watch-runner` (or scheduled invoke). *Migration + cron owner-gated.*
2. **Tables (RLS-scoped):** `evidence_watches` (user_id, query or saved_report_id, mode, cadence, last snapshot) + `watch_alerts` (watch_id, fired_at, what_changed, new_citation_ids). *Migration owner-gated.*
3. **Diff logic (pure, tested):** re-run `research/orchestrate.ts`, compare to stored snapshot — fire only on material change (new citations; for meta, the pooled estimate crossing significance or the deterministic evidence-tier shifting). Unit-test on fixed corpus snapshots (fires on a planted new trial, silent otherwise).
4. **In-app alerts:** "Watch this topic / report" affordance + a Watches page listing alerts (reuse the saved-report object pattern). Email later (needs SMTP, separate).
5. **Competitive variant:** a watch whose subject is a competitor drug → alerts on its new trials / label changes. Same machinery, different framing.
- **Complexity: HIGH** (the scheduler is the one genuinely new infra primitive).

## Phase 2 — The team & enterprise wrapper (unlocks B2B revenue + seat expansion)
A $20/mo single seat can't reach a unicorn. These let an organization buy it.

1. **Team workspaces / org accounts** — org + membership tables, role/permissions, shared library + shared watches. Rework RLS from per-user to per-org-membership. NET-NEW, schema-heavy. *Migrations owner-gated.* **Complexity: HIGH.**
2. **Compliance posture** — confirm zero-data-retention with the LLM provider; build real data-deletion/scrub endpoints (today saved_reports are soft-deleted, not scrubbed); add SSO login. Needed before pharma procurement will engage. **Complexity: MEDIUM–HIGH.**
3. **Audit trail + versioning** — complete the audit record and add report version chains + a compare view (extend `saved_reports` / `research_report_runs`). **Complexity: MEDIUM.**

## Phase 3 — Defensible rigor for sophisticated buyers (HEOR / payer / methodologist)
1. **Meta-analysis depth** — extend `packages/shared/src/meta-analysis.ts` (RR-only today) with odds ratio, hazard ratio, and continuous outcomes (mean difference / standardized mean difference); add sensitivity analysis, subgroup analysis, and a PRISMA-style flow diagram. Deterministic, fixture-tested. **Until shipped, keep under-claiming — do not say "systematic review."** **Complexity: MEDIUM–HIGH.**
2. **Trust signals** — add retraction flags (RetractionWatch / Crossref) and funding / conflict-of-interest capture to the existing badge system (`study-type.ts`, `science-state.ts`, `doaj-registry.ts`). **Complexity: MEDIUM.**

## Phase 4 — Job-shaped workflows + bring-your-own-evidence (deepen the wedge)
1. **Buyer-specific templates** — add new `ReportMode`s / presets on the existing architecture: payer value dossier, journal-club appraisal, medical-information response, competitive landscape. Each = a synthesis prompt + a render layout, riding the existing safety scan. **Complexity: MEDIUM** (per template, LOW).
2. **Bring-your-own-evidence** — upload PDFs → parse → ingest into the retrieval pipeline with the same provenance. Storage + parser + `liveToChunk`-shaped ingest. NET-NEW. **Complexity: HIGH.**

---

## Buyer fork (which phases to prioritize after Phase 0)
| Buyer | Lead with | Why |
|-------|-----------|-----|
| **Med-comms agency** | Phase 0 appendix + Phase 4 templates + light Phase 2 (sharing) | They sell *deliverables*; export polish + job templates are the product. Shortest sales cycle. |
| **Medical Affairs (pharma)** | Phase 1 surveillance + #8 competitive intel + Phase 2 (team + compliance) | Continuous literature/competitor monitoring is their recurring pain; needs enterprise wrapper. Biggest ACV, longest sale. |
| **HEOR / payer** | Phase 3 meta rigor + Phase 0 reproducibility appendix | Their evidence must survive a payer/HTA reviewer; computed rigor + reproducibility is the requirement. |

## Recommended sequence (solo-founder reality, med-comms default)
The thesis is proven or killed by **Phase 0 + landing one design partner + only the slice they pull** — not by building everything speculatively, and not by leading with expensive new infrastructure. Concretely:
1. **Phase 0** (days; mostly your decisions + the reproducibility appendix on already-shipped export).
2. Land **one med-comms design partner** on what's already live + the appendix.
3. **A Phase 4 template or two** (payer dossier / journal-club appraisal) on the existing `ReportMode` rails — cheap, deliverable-led, no new infra.
4. **Only then** the expensive bets — surveillance (Phase 1), team/compliance (Phase 2) — and only if a Medical-Affairs or payer buyer appears and pulls for them. If they do, make the multi-tenancy schema decision (Phase 2.1) *before* surveillance to avoid building watches twice.

## Owner gates (STOP and ask)
Deploy held commits · any migration (watches, org, versioning) · new secrets/keys · PR merge · push · **Stripe live**. Each is a fresh explicit OK.

## Awaiting confirmation
Default plan unless you say otherwise: **buyer = med-comms agency**, **start = Phase 0 now** (mostly your decisions + the appendix), then a Phase 4 template — deferring surveillance / team / compliance until a pharma buyer pulls. Override the buyer if you have warm access elsewhere. On approval I'll produce the bite-sized TDD steps for the first build and begin.
