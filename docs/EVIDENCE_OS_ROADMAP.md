# PharmaOrb → "Evidence OS" — Implementation Backlog

_Created 2026-06-19. Actionable to-do list derived from [EVIDENCE_OS_FEATURE_AUDIT.md](./EVIDENCE_OS_FEATURE_AUDIT.md). Sequenced so every output/deliverable renders from one persisted claim object instead of re-deriving extraction per format._

Effort: **S** ≈ days · **M** ≈ 1–2 weeks · **L** ≈ multi-week / schema work.
Status legend: `[ ]` not started · `[~]` partial / scaffolded · `[x]` done.

---

## Phase -1 — Best-MVP engine unlocks

> These are the upgrade paths that make the current app feel much smarter before the larger Evidence
> OS claim graph is complete. They preserve the rule: web/context can clarify the question, but
> biomedical claims still need biomedical sources.

- [x] **Production live-source gate** — verify `LIVE_SOURCES=on` for `ask` and `research`, confirm
  deployed env has Voyage + Supabase + LLM keys, and smoke-test that live PubMed / ClinicalTrials /
  openFDA / MedlinePlus citations resolve. _(S, config + smoke)_
- [x] **Web recon front door** — add a non-evidence context pass for ambiguous brands, slang, typos,
  popular products, and current names. It can infer "Celsius energy drink," but clinical claims still
  come from PubMed/FDA/toxicology/guideline lanes. _(M)_
- [x] **Unified entity resolver** — replace the tiny curated alias list with a reusable resolver for
  drug aliases, brand/generic names, supplements, peptides, research compounds, consumer products,
  abbreviations, and common misspellings. Always surface assumptions. _(M)_
- [x] **Safety-source expansion** — add FDA enforcement/recalls and poison/toxicology providers to the
  live-source registry before broader general-web crawling. These answer "lethal/toxic/recalled"
  questions better than abstracts alone. _(S–M)_
- [x] **Evidence relation labels** — evolve source-support ratings into claim-level
  `supports / partial / mentions / conflicts` labels, then show whether the retrieved evidence agrees
  or conflicts. This is the light Scite-style layer before a full citation graph. _(M–L)_
- [x] **Deep Research as Pro wedge** — productize the existing research engine into saved reports with
  method notes, source tables, PDF/DOCX/PPT exports, and computed meta-analysis only when the extracted
  data support pooling. _(M–L)_
- [x] **Model routing** — keep DeepSeek/OpenAI-compatible provider swapping, but split
  classify/scope/generate/research/verify model env slots and log model usage per trace. Use code, not
  the LLM, for statistics. _(M)_
- [x] **Brutal MVP eval pack** — add regression cases for `celsius`, typos, fabricated drugs, fake
  peptides, overdose/sourcing, personal med-change requests, citation faithfulness, and off-topic
  questions like "make a sandwich." _(S–M)_

---

## Phase 0 — Keystone (build first; everything hangs off this)

> The center of the app. A persisted claim entity + a directional conclusion. Unblocks every renderer below and the real "what changed" for monitoring.

- [ ] **`claims` table** — canonical id, normalized claim text, linked `drug_entities`/`drug_classes`, attached evidence `source_ids`, current grade + grade history, 1:1 link to `evidence_watches.kind='saved_question'`. _(L — foundational schema)_
- [ ] **Conclusion engine** — directional verdict (likely / unlikely / mixed / unknown) + confidence (distinct from strength), partition citations into **for / against**, finally emit the declared-but-unused `conflicting` dimension. Keep deterministic-aggregate / LLM-rationale split. Build alongside `science-state.ts` + `evidence-grade.ts`. _(L)_
- [ ] **Living claim page** — merge `/app/reports/[id]` (static) with `WatchDetail` (feed) into one "as-of" surface that re-summarizes in place when monitoring finds new high-tier evidence. Snapshots + diffs the stored conclusion → closes the topic-memory gap. _(M, depends on the two above)_

---

## Phase 1 — Instant renderers off the claim object (output layer, cheap wins)

> Each is a thin renderer over the Phase-0 JSON. No render farm. Ship fast.

- [ ] **1-page PDF evidence brief** — clinician/handout layout (claim + verdict + grade + top studies + safety flag). _(S)_
- [ ] **Static social card (PNG)** — instant, shareable, brand colors. Ship before video. _(S)_
- [ ] **Slide upgrades** — speaker notes (`addNotes`, currently absent), PICO block, strengths/weaknesses, discussion questions, one-page handout format. Extends existing `lib/export/pptx.ts`. _(M)_
- [ ] **CSV / Google Sheets export** — data table (audit flags missing; small add over `citation-meta.ts:evidenceRows()`). _(S)_
- [ ] **Citation export RIS / BibTeX** — Zotero / EndNote / Mendeley. Researchers expect it. _(S)_
- [ ] **Anki flashcard deck (.apkg)** — students. No code yet. _(S–M)_

_Already built (no work): PowerPoint export (`lib/export/pptx.ts`), Word export (`lib/export/docx.ts`), Vancouver/AMA citation toggle._

---

## Phase 2 — Distribution / growth

- [ ] **Public living claim URL** — shareable page that auto-updates as evidence lands. Output artifact + viral loop. Doubles the Phase-0 living page as a public surface. _(M)_
- [ ] **Turn monitoring runtime ON** — set Vault secrets (`watch_check_url`, `watch_service_role_key`) + Resend creds. **Config, not code** — whole live-watch system is built + schema-deployed. _(S)_
- [ ] **Email digest** — already exists in monitoring (Resend), dormant; lights up with the line above. _(S)_

---

## Phase 3 — HyperFrames motion video (the wow artifact, async)

> Deterministic data-driven reel rendered from the claim JSON. Heaviest infra — FFmpeg, minutes/clip → ship as a background job, not a live button.

- [ ] **Claim → reel template** — Hook (claim) → evidence-strength meter → forest plot animates → top 3 studies → verdict card → safety flag → CTA. 9:16 (IG/TikTok) + 16:9 (site embed). Brand `#BCFF3C` + dark. Deterministic (no `Date.now`/`Math.random`). _(L)_
- [ ] **Async render job** — "generate reel" → background render → notify → MP4 download. Reuse HyperFrames CLI or the proven dc-runtime seek-render harness. _(M)_

---

## Phase 4 — Finish + deploy what's already scaffolded

- [ ] **Wet-lab / protocol draft mode** — `lab_draft` exists in engine, filtered out of UI / not deployed. Finish deliverable (hypothesis/design/controls/materials/methods/endpoints/stats/safety/citations) + "for review by a qualified researcher" framing + expose in UI. _(M)_
- [ ] **Deep Research** — code-complete on WIP branch; confirm + deploy. _(S–M)_
- [ ] **Meta-analysis** — built + Pro-gated (pooled RR + I²/τ² + forest plot); confirm prod-live. _(S)_
- [ ] **Journal-club mode** — add the mode entry point to Ask `MODES`; rides the Phase-1 slide upgrades (notes/PICO/flashcards/handout). _(M)_

---

## Phase 5 — Additive feature surfaces (after claim core proves out)

- [ ] **Per-paper evidence grading** — population match / sample size / endpoint quality / bias / relevance, feeding the existing tier ladder (`evidence-scoring.ts` + `study-type.ts`). _(M)_
- [ ] **FDA recalls / enforcement provider** — one `providers/enforcement.ts` over `api.fda.gov/drug/enforcement`; register in `LIVE_SOURCES`. Cheapest high-value safety add. _(S)_
- [ ] **"What should I read first" surface** — bucketed (most-cited / best-RCT / best-review / best-safety / field-changing) over rerank score + study-type; add citation-count signal (OpenAlex). _(S–M)_
- [ ] **Role / audience modes** — persona selector + `audience` param threaded through `ask`/`research` (enthusiast/student/clinician/researcher/MSL). UI trivial; substance is backend prompt conditioning. _(M)_
- [ ] **Claim reliability checker** — paste assertion → structured verdict (`supported/exaggerated/unsupported/contradicted`). Wrap `/ask` `evidence_for_claim` + paste UI. Rides the Phase-0 conclusion engine. Most viral consumer feature. _(M)_
- [ ] **CT.gov status-change following** — value-diff trigger in `watch-detect.ts` for status / results-posted (columns exist; detector keys only on NCT id today). _(M)_
- [ ] **Data-extraction table** — multi-paper PICO + result + limitations table + computed "which is strongest" verdict over `compare.ts`. _(M)_
- [ ] **PDF / paper ingestion workspace** — upload UI + Storage bucket + PDF parser + extraction reusing `ask/research/pico.ts` + `/app/papers/[id]` + RLS. _(L)_
- [ ] **Personal evidence library** — `library_folders` + polymorphic `library_items` + notes/highlights/tags; fills the inert "Projects" rail slot. _(M)_
- [ ] **Interaction checker** — pairwise DDI dataset/table + stack input + severity/mechanism/evidence per pair (RxNav interaction API or DrugBank). Strong disclaimers + always show source. _(M–L)_
- [ ] **Research maps** — relationship-extraction model + graph viz layer; new `/app/maps` or `/app/drugs/[id]` panel. _(L)_
- [ ] **Team / collaboration workspaces** — org entity + membership/roles + shared ownership + comments + audit trail; reworks single-owner RLS everywhere. Path to lab/clinic plans. _(L)_
- [ ] **Public API + MCP layer** — versioned routes + `api_keys` table + per-key quotas debiting the existing `consume_usage` ledger, then a thin MCP wrapper. _(L API + M MCP)_

---

## Competitive — MediSearch teardown (added 2026-06-29)

> Source: competitive teardown of **medisearch.io** (1M+ users; consumer Pro + B2B API). Core lesson:
> they packaged the **same primitives PharmaOrb already has** into *visible, paid, exportable, shareable*
> product surfaces plus an API, and market freshness + rigor loudly. Most items below are **exposure plays
> over engine we already built**. `→` points at the existing backlog line that already covers it (bump
> priority, don't duplicate); `NEW` = genuinely not yet on the list.
>
> Wedge: their headline marketing is benchmark-led (USMLE 94%, HealthBench > GPT-5), but an independent
> 2026 peer-reviewed study ranked MediSearch **last of 4 (71%)** on real-world correctness / freshness /
> context-awareness — i.e. exactly the faithfulness/safety axis PharmaOrb is built to win.

**Quick wins (engine exists, surface missing):**
- [ ] **Evidence filters** — user-facing chips to filter the answer's evidence by **date**, **source type**
  (article/book/guideline), and **study type** (RCT, meta-analysis, review). Over existing study-type +
  evidence-grade capture. MediSearch's single most-praised Pro feature. _(S–M)_ `NEW`
- [ ] **Per-source "key finding" card** — for each cited paper: 1-line summary + the **exact verbatim
  sentence** that supports the claim + the **key stat**, surfaced from the shipped claim-checker
  support-span + faithfulness gate (turns the safety mechanism into visible UX). _(S–M)_ `NEW`
- [ ] **"Find contradictions" button** — user-triggered conflicts surface. → rides `[x]` Evidence relation
  labels (Phase -1) + Data-extraction table (Phase 5). Dead-on the honesty brand. _(M)_
- [ ] **Citation export (Zotero / RIS / BibTeX)** — → already Phase 1 "Citation export RIS/BibTeX"; **bump
  priority** (this is what hooks MediSearch's medical-writer segment). _(S)_
- [ ] **Public shareable answer/report link** — → already Phase 2 "Public living claim URL"; **bump
  priority** (every shared link is free marketing; MediSearch leans on `/share/`). _(M)_
- [ ] **Freshness badge** — show "newest source: N days old" as a trust signal; data is already pulled
  live daily, just not surfaced. _(S)_ `NEW`

**Bigger bets (strategic):**
- [ ] **Verification / "LLM-as-a-judge" API** — productize the faithfulness + abstention + real-source
  spine as a "verify this medical claim/answer" API. → folds into Phase 5 "Claim reliability checker" +
  "Public API + MCP layer". The honesty-moat money play; MediSearch sells exactly this. _(L)_
- [ ] **Clinical-guideline corpus** — ingest major full-text guidelines (ACC/AHA, WHO, USPSTF). Gap vs
  MediSearch; raises clinician trust. _(L)_ `NEW`
- [ ] **Enterprise compliance prereqs** — HIPAA posture, SOC 2, public trust page. Table stakes **iff** the
  B2B API is pursued; plan for it, don't bolt on later. _(L)_ `NEW`

**Explicitly do NOT copy:**
- Reddit-in-the-answer ("see what others think") — keep **walling off** non-evidence; that discipline is
  the differentiator. Adopt the *idea* (real-world/patient perspective) only if walled + labeled.
- Don't market on USMLE/MedQA multiple-choice scores — benchmark on faithfulness / citation-accuracy /
  safety (where the independent study put MediSearch last and PharmaOrb is built to win).

---

## Cleanup / watch-outs (do alongside)

- [ ] **Consolidate the two watch systems** — `watchlist_items` vs `evidence_watches` (two limit keys `watchlist_limit`/`watch_limit`); UI can read the wrong gate.
- [ ] **Fix `subscriptions.plan='student'`** — no `student` row in `plan_entitlements` → student-plan user fails every gate. Vestigial.
- [ ] **Respect honesty guardrails** — PRISMA / risk-of-bias overclaims are actively blocked by `forbidden-phrases.ts`; FAERS labeled "not proof." Build #9/#6/#11 within them, don't "fix" them.

---

## Recommended first move

Phase 0 (claim entity + conclusion engine), because every artifact in Phases 1–3 renders off it. Building the output layer first means rebuilding extraction N times. Turn on monitoring (Phase 2, config-only) in parallel since it's free.
