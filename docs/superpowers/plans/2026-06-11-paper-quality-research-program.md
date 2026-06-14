# Paper-Quality Research Program — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Each phase is an independently shippable, green increment. Frozen safety (one `detectViolations` scan) + one citation namespace stay intact. Builds on branch `feat/research-in-ask-reports-surface` (PR #52).

**Goal:** Honest, **paper-quality** deep-research reports — read like a professional review, with **real computed statistics** where the evidence supports it — launched from the Ask composer with a clarifying-question scoping step, shipped to production.

**Honest ground truth:** today the engine does NO statistical pooling (it quotes study-reported numbers; it does not compute pooled estimates), and the report is structured cited prose, not a typeset paper. This plan closes both gaps without ever overclaiming.

---

## Phase 1 — Collapse to one Deep Research mode  *(frontend, quick)*

**Why:** Deep research and Structured review are ~85% identical; two near-duplicate Pro modes is a confusing choice. Make method-documentation the default for the single mode.

**Files:** `apps/web/app/app/ask/page.tsx`

- [ ] Composer `MODES` → `Quick answer` · `Deep research (Pro)` · `Meta-analysis (soon)` — remove the separate `structured_review` entry.
- [ ] `submit`: `mode === "deep"` runs the engine in `structured_review` mode (method documented by default).
- [ ] `ResearchRunCard` label is always "Deep research" (one mode).
- [ ] Typecheck + build green; commit.

**Acceptance:** one Pro research mode in the composer; every deep-research report includes the Methods/limitations section; no `structured_review` user-facing label.

---

## Phase 2 — Clarifying (scoping) questions  *(engine scope step + chat UI)*

**Why:** A research question is usually underspecified; 2–3 targeted questions sharpen the run and avoid wasting a Pro slot.

**Approach:**
- **Backend scope step:** a cheap LLM call (new `scope.ts` in `ask/research/`, exposed via the `research` function with an `action:"scope"` or a sibling `research-scope` endpoint) that takes `{question}` and returns `{ needs_clarification: boolean, questions: [{ text, chips: string[] }] }`. Only flags ambiguous questions.
- **Frontend:** when a Pro mode is submitted, first call scope; if `needs_clarification`, render an inline assistant turn with the questions (quick-pick chips + a free-text box) and a **"Just run it"** button. On answer/skip, fold answers into the question and call `startResearch`.

**Files:** `supabase/functions/ask/research/scope.ts` (new), `supabase/functions/research/index.ts` (action), `apps/web/lib/api.ts` (`scopeResearch`), `apps/web/app/app/ask/page.tsx` (scope turn UI + flow).

- [ ] Scope step returns clarifying questions only when ambiguous (unit-tested: a specific question → `needs_clarification:false`).
- [ ] Inline scope UI: chips + free-text + "Just run it"; answers append to the question for `startResearch`.
- [ ] Skippable always; no scope step for the free Quick-answer mode.

**Acceptance:** ambiguous deep-research questions get 2–3 chip-answerable clarifiers; specific ones run straight through; skip always available.

---

## Phase 3 — Paper-quality reports  *(engine synthesize + report shape + render + export)*

**Why:** Make the report read like a professional review, not a chat answer.

**Approach:**
- Extend `ResearchReport` with academic sections: `abstract`, `background`, `methods` (already have search_method), `results`/findings, `discussion`, `limitations`, `references`.
- Add a **study-characteristics table**: `studies: [{ label, design, n, population, intervention, comparator, key_outcome, citation }]`, extracted from the retrieved sources by the synthesize step (each row cited).
- Update `synthesize.ts` prompt/shape to emit these; render in `ResearchReportView`; carry into docx/pptx.

**Files:** `packages/shared/src/research.ts` (types), `supabase/functions/ask/research/synthesize.ts`, `apps/web/components/ResearchReportView.tsx`, `apps/web/lib/export/{docx,pptx}.ts`.

- [ ] Report shape gains the academic sections + `studies` table (optional, backward-compatible).
- [ ] Synthesize emits them; every study row + claim stays cited under the one namespace.
- [ ] Render + export show the structure and the table; honesty strings preserved.

**Acceptance:** a report renders with Abstract→Background→Methods→Results→Discussion→Limitations→References + a cited study table; exports carry it.

---

## Phase 4 — Real statistics (meta-analysis)  *(biggest piece; gated on poolable evidence)*

**Why:** This is what finally earns the word "meta-analysis" — and it must be honest.

**Approach (HARD RULE — stats computed in real code, NEVER LLM-guessed):**
- Extract structured effect sizes from comparable studies (effect type, point estimate, CI, n) — the LLM extracts *what the source states*; a code module validates and pools.
- New pure `meta-analysis.ts` (in `packages/shared` so it's deno+node testable): fixed- and random-effects pooling, I² heterogeneity, per-study + pooled estimates. Unit-tested against known datasets.
- Render a **forest plot** (pooled estimate + per-study) and a pooled-effect summary; when studies aren't poolable (different outcomes/designs, <2 comparable), output an honest "not poolable — narrative synthesis only."

**Files:** `packages/shared/src/meta-analysis.ts` (+ test), `supabase/functions/ask/research/synthesize.ts` (effect extraction), report shape, `ResearchReportView` (forest plot), exports.

- [ ] `meta-analysis.ts` pure pooling + I², unit-tested (fixed + random effects) against textbook values.
- [ ] Effect extraction is source-quoted; pooling runs only on validated, comparable inputs.
- [ ] Forest plot + pooled estimate render; honest "not poolable" path; the word "meta-analysis" appears ONLY when a real pooled estimate was computed.

**Acceptance:** when comparable RCTs exist, the report shows a code-computed pooled estimate + forest plot + I²; otherwise it honestly declines to pool. No LLM-invented statistic ever ships.

---

## Phase 5 — Ship

- [ ] Full gate green (shared, engine 299, export smoke, web typecheck+build).
- [ ] Push → preview → (owner-gated) allowlist + redeploy research → owner validates on preview (Pro login).
- [ ] Merge combined branch; per-surface prod deploy (web Vercel + `supabase functions deploy research --use-api`); reset WEB_ALLOWED_ORIGINS to empty + redeploy (net-zero CORS).

**Note:** every prod deploy / secret / push needs a fresh explicit owner ask — the auto-mode classifier blocks blanket authorization.
