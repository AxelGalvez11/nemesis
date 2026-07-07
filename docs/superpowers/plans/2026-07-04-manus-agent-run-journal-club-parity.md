# Manus Agent-Run + Journal-Club Parity — Implementation Plan

**Build target:** `feat/manus-skin` worktree (`.claude/worktrees/workspace-parity`, HEAD `4b9411b`), which already carries the Manus visual skin (globals.css `--acid #0081f2`, retuned tokens).

**Goal:** Clone Manus's agent-run view (task-progress tracker + pinned dock + right-side work/computer panel + inline artifact cards + final-delivery block) and its one-click journal-club deliverable, pixel-close where feasible, by REUSING the existing engine progress events, report contract, and PDF/DOCX/PPTX exports — building new only the surfaces that have no data source today.

---

## Hard constraints (inherited by every phase below)

- **FROZEN — never edit:** `supabase/functions/ask/**` (538-test guardrail). All new progress *emission* happens in `supabase/functions/research/**` (editable — see its existing mode branches at `supabase/functions/research/index.ts:62-90`). The shared contract in `packages/shared/src/research.ts` is extended **additively/optionally** so `ask/**` compiles unchanged and emits nothing new.
- **Honest-reduction default (resolves the "pixel-exact live" tension).** The engine map is explicit: *no streaming, no Realtime, no intermediate report state until final synthesis.* The journal-club plan is explicit: *no fake UI states.* Therefore the live surfaces are **step-granular, not token-granular**:
  - The work panel's "Live" indicator = *run in progress*. Its scrubber replays the **real persisted progress steps** (from `research_report_runs.progress`), not a token stream. Each step's artifact appears when that step **completes**.
  - The "N/M slide counter" earns its honesty only because a **real** server-side per-slide *content* loop emits it (new code in `research/**`). The one-shot deck *file* assembly (`apps/web/lib/export/pptx.ts`) is untouched — we emit on content generation, not file writing.
  - Token-level streaming of the report body is a **costed upgrade** (SSE/Realtime + partial persistence), flagged as an open decision, not assumed.
  - **No presentational shell is fed by fixtures as if it were live.** Inline artifact cards render only from real emitted events; when a run doesn't emit them, the cards no-op.
- **Reuse the applied Manus tokens.** Use `var(--acid)`, `var(--surface)`, `var(--line)`, `var(--text{,-2,-3})`, `var(--radius{,-sm})`, `var(--mono)` from `apps/web/app/globals.css`. Invent **no** new hex. Manus dark-only surfaces (work panel) map to existing `--surface-2`/`--raised`/`--line-2`.
- **Each phase ends independently shippable.** Ordered by leverage: the agent-run tracker + work panel first (the ~30%-parity centerpiece), which ships against **today's** 4-phase deep-research run before any journal-club run exists.

---

## Reuse boundary (grounded in code, not aspiration)

| Layer | Verdict | Evidence |
|---|---|---|
| Progress data model (`step/detail/sources_found/at`) | **REUSE** | `packages/shared/src/research.ts:95` |
| Live poll loop (1500ms, `fetchResearchRun`) | **REUSE** | `apps/web/app/app/ask/page.tsx:741`; `apps/web/lib/api.ts` |
| Phase-state UI model (pending/active/done) | **REUSE + generalize** | `apps/web/components/ResearchProgress.tsx:66-80`; `apps/web/app/styles/shell.css:440-486` |
| Report contract (`ResearchReport`) | **REUSE verbatim** | `packages/shared/src/research.ts:39` |
| Exports (`reportToPdf/Pptx/Docx`) + routes | **REUSE verbatim** | `.../lib/export/{pdf,pptx,docx}.ts`; `.../api/reports/[id]/export/{pdf,pptx,docx}/route.ts` |
| Library grouping by `mode` | **REUSE** | `apps/web/app/app/reports/page.tsx` |
| Appraisal pipeline + shaper + upload sheet + extract route + `mode:"appraisal"` | **REUSE — but lives on `feat/journal-club`, NOT the build target** | `git show feat/journal-club:...appraise.ts / appraisal-report.ts / PaperUploadSheet.tsx / lib/pdf/extract.ts`; `research/index.ts:57-116` |
| **Per-step timers** | **DERIVE, no new field** | deltas between consecutive `ResearchProgressStep.at` |
| Named ordered steps (6-step tracker) | **BRIDGE** — optional additive fields on the step | `label?`/`index?`/`total?` emitted only by `research/**` |
| Topic *discovery/selection* (Manus step 1) | **BRIDGE** — maps to discovery/deep-research, **NOT** upload | groundwork is upload-only (`PaperUploadSheet` drag/drop PDF) |
| Slide **outline list**, on-screen **title-slide preview**, **N/M** counter, file-edit indicator | **BUILD NEW** — verified absent | `git show feat/journal-club:.../appraise.ts` and `research/index.ts` → **0** matches for `slide/outline/emit/onProgress` in the appraisal path |

**Consequence:** "reuse journal-club groundwork" is true for the *middle* (appraise → report → export), false for the *front* (topic discovery ≠ upload) and the *slide-generation surfaces* (built new, emitting from editable `research/**`).

---

## Phase 0 — Land the journal-club groundwork onto the build target (prerequisite, mechanical)

The appraisal groundwork is on `feat/journal-club`; the build target is `feat/manus-skin`. Nothing downstream can cite `appraisal-report.ts`/`appraise.ts` as reuse until it physically arrives on the branch.

- Rebase/merge `feat/journal-club` into `feat/manus-skin` (or land journal-club to `main` first, then rebase `feat/manus-skin`). See open decision #1.
- Resolve conflicts in the two shared touchpoints: `packages/shared/src/research.ts` (`ReportMode` union + optional fields) and `apps/web/app/app/ask/page.tsx` (composer entry + `ResearchRunCard`).
- Verify: `deno test packages/shared/`, `npm run build` (turbo), and the journal-club plan's own tests (`appraisal-report.test.ts`, `appraise.test.ts`, `extract.test.ts`) all pass on the merged branch.
- **Deliverable:** a build-green `feat/manus-skin` that contains both the Manus skin and the working upload→appraise→report→export path. Shippable as-is (this is journal-club v1 without the Manus run-view chrome).

---

## Phase 1 — Agent-run task tracker + pinned dock + work panel (the centerpiece, ~30% parity)

Ships against **today's** 4-phase deep-research run — proves the substrate before the 6 named steps exist. Explicitly: Phase 1 alone will NOT match the Manus screenshot's six labels; those appear once Phase 3's emitting run lands. It will show *ordered steps with per-step timers, a pinned collapsible dock, and a right-side panel that replays the real steps.*

**1a. Generalize the tracker (new component, additive).**
- New `apps/web/components/AgentRunTracker.tsx` — a superset of `ResearchProgress.tsx`. Renders an **ordered** step list (not the 4-column grid) with Manus state icons: checkmark (done) / filled-dot (active) / hollow (pending), reusing the `.engine-step {pending|active|done}` state model at `shell.css:453-478`.
- **Per-step elapsed time** = `next.at − step.at` (or `now − step.at` for the active step). No new field.
- Active step is **expandable** to show its narration paragraph (`step.detail`) — reuse the `<details>` disclosure pattern from `ResearchProgress.tsx:44`.
- Keep `ResearchProgress.tsx` intact for the existing inline card; `AgentRunTracker` is a parallel, richer renderer chosen when a run is in agent mode.

**1b. Pinned collapsible dock above the composer.**
- New docked strip in `apps/web/app/app/ask/page.tsx` (near the composer, sibling to the thread) showing: thumbnail + current-step label + elapsed + "N/M" + chevron. Collapsed by default; chevron expands to the full `AgentRunTracker`.
- Data source: the same `run.progress` already polled at `ask/page.tsx:741`. `N/M` from `index?`/`total?` when present (Phase 3), else derived from the 4 known phases.

**1c. Right-side "PharmaOrb Computer" work panel.**
- New `apps/web/components/WorkPanel.tsx` — a right dock (reuse the `--evidence` 344px rail width token; it already exists in the shell layout). Header: "PharmaOrb is working — {current step}". Body: the artifact for the *selected* step (for today's runs: the step detail + growing source list; for Phase 3: the streaming-in report markdown / slide render, still step-granular). Bottom: a **playback scrubber** with skip-back/forward across the persisted steps + a **"Live"** pill when the run is in progress.
- The scrubber is honest replay of `run.progress[]`, not a synthetic timeline.

**1d. CSS.** Append a new block to `apps/web/app/styles/shell.css` after the engine region (ends ~line 537): `.agent-tracker`, `.agent-tracker-step {done|active|pending}`, `.agent-dock`, `.work-panel`, `.work-panel-scrubber`, `.work-live`. Manus's tracker geometry (top-rounded-only `22px 22px 0 0` on the dock) uses `var(--radius)`; all colors from tokens.

**Deliverable:** any in-flight deep-research run renders as an ordered tracker + pinned dock + replayable work panel. Independently testable: start a Deep research run, watch the tracker advance with live timers, expand the dock, scrub the panel. No journal-club dependency.

---

## Phase 2 — Contract extension for named ordered steps (keeps `ask/**` frozen)

Enables the six *named* Manus steps without touching the frozen layer.

- `packages/shared/src/research.ts`: add optional `label?: string; index?: number; total?: number` to `ResearchProgressStep` (additive — `ask/**` keeps emitting the 4 bare steps and still type-checks).
- `AgentRunTracker` prefers `label`/`index`/`total` when present, falls back to the phase map otherwise.
- Tests: `deno test packages/shared/` for the new optional fields; a `node:assert` test that the tracker renders both shapes.

**Deliverable:** the tracker can render arbitrary named ordered steps; the deep-research run still renders its 4 phases. Shippable; no visible change until Phase 3 emits labels.

---

## Phase 3 — Journal-club emitting run: topic→notes→report→slide-outline→slides→deliver

This is where the six Manus steps, the slide-outline list, and the N/M counter get **real** data. All emission is in editable `research/**`; the frozen `ask/**` safety layer is imported verbatim (as the journal-club plan already does).

**3a. Topic discovery bridge (Manus step 1 — NOT upload).**
- The Manus prompt discovers a paper; the groundwork only uploads one. Add a `mode:"journal_club"` (or reuse `appraisal` with a `discover:true` flag) branch in `supabase/functions/research/index.ts` that, when no `paper_text` is provided, first runs the existing discovery/deep-research retrieval to **select** a high-impact recent paper, then feeds its text into the existing `runAppraisal` (`research/index.ts:23`). Upload remains the alternate entry (PaperUploadSheet) for "I already have the paper."

**3b. Emit the six ordered, named steps** from the new branch using the Phase-2 fields: (1) Research & select paper (2) Extract & synthesize notes (3) Write full report (4) Prepare slide outline (5) Generate slides (6) Deliver. Each `emit()` sets `label`/`index`/`total:6` + a narration `detail` ("AlphaFold 3's breakthrough… Next I'll…").

**3c. Slide-outline as real data.** Add a code step that produces a numbered slide list (title + one-line description × ~10) BEFORE deck assembly, persisted into the run (or the report payload as `slide_outline?: {title; note}[]`, additive to `ResearchReport`). The inline **slide-outline card** and the on-screen **title-slide preview** render from this — real, not fixture.

**3d. Per-slide N/M counter (honest).** The slide-content generation loop emits a progress step per slide (`index/total`), which the inline **slide-generation card** shows as "8/10" + shimmer. The existing `reportToPptx` one-shot file build (`apps/web/lib/export/pptx.ts`) stays as-is — we emit on content generation, not file writing.

**3e. Deliver** reuses the existing export machinery verbatim: report saved to `saved_reports` (`kind='deep_research'`, `mode='appraisal'`/`journal_club`), PPTX/DOCX/PDF via the existing routes.

**Deploy order (binding, PR #90 pattern):** the `research` edge function deploys (owner-gated) BEFORE the web client merges, with the existing boundary guard so an old fn 400s rather than silently degrading.

**Deliverable:** the exact Manus run — six named steps with timers, slide-outline list, N/M slide card — driven by real events. Testable end-to-end on a preview deploy.

---

## Phase 4 — Inline artifact cards + final-delivery block

Presentational, fed only by Phase 3's real events (no-op when absent).

- **Inline artifact cards** in the thread: file-edit indicator ("Editing files … +13"), slide-generation card (title + "8/10" + shimmer skeleton + caption), rendered slide-outline list. New `apps/web/components/ArtifactCards.tsx`; CSS shimmer via existing `@keyframes fade`/a new reduced-motion-guarded `shimmer`.
- **Final-delivery block** (new `apps/web/components/DeliveryBlock.tsx`): on-screen title-slide preview (large title + subtitle + left accent bar in `var(--acid)`), report **file card** ("…report — Markdown — {KB}"), "View all files in this task" (links to Library/report), "Task completed" banner, copy/share actions (reuse existing report share), a 5-star "How was this result?" rating (new; persist to a lightweight table or the run row), and 3 follow-up suggestion chips (reuse the composer's suggestion mechanism).
- Rating persistence = the only possible new table; keep it additive and owner-gated (open decision #3).

**Deliverable:** the full Manus finish — title-slide preview, file card, completed banner, rating, follow-up chips.

---

## Phase 5 — One-click "Journal Club" tool/skill in the composer

- Activate the composer entry (the journal-club groundwork already adds a "Journal club" item; if PR #98's Skills section is present, relocate there — same handler). One click runs the Phase-3 `journal_club` flow end-to-end (discover → notes → report → outline → slides → deliver) with the Phase-1 run-view chrome.
- Quota: consumes one `deep_research_daily` unit (Pro-gated) via the existing `consume_usage` path — no new counter.

**Deliverable:** one click on "Journal Club" reproduces the observed Manus flow inside PharmaOrb.

---

## Testing per phase
- Shared/pure: `deno test packages/shared/`.
- Research edge pure modules: `deno test --allow-env supabase/functions/...` (per the journal-club plan's runner note).
- Web: `npm run build` (turbo) + Playwright E2E for the run-view (tracker advances, dock expands, scrubber replays) and the journal-club one-click.
- **Frozen-layer proof in every PR:** `ask/**` untouched ⇒ `scripts/guardrail-suite.ts` neither re-run for correctness nor able to regress; state this explicitly.
