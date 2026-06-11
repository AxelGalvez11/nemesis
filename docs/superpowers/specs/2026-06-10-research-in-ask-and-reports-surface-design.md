# Deep Research in the Ask composer + a Reports surface — Design

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans to build this. Pure frontend IA + thin chat-card glue — engine and safety layer untouched, no DB schema change.

**Date:** 2026-06-10
**Goal:** Make the Ask composer the single entry point for all depths (Quick answer / Deep research / Structured review), run deep-research **inline in the chat thread**, and give reports a dedicated **Reports** home — without changing the engine, the safety layer, or the database schema.

**Builds on:** branch `feat/publishable-evidence-reports` (PR #51) — reuses its `ResearchReportView`, export routes, citation formatter, modes, and `saved_reports` objects wholesale.

---

## 1. Current state (verified)
- `apps/web/app/app/ask/page.tsx` already has a `MODES` menu with an `evidence` (default) and a `deep` mode — but selecting `deep` **redirects** to the standalone page: `router.push('/app/research?q=…')`.
- `apps/web/app/app/research/page.tsx` is the standalone Deep Research page: its own composer with `standard | structured_review` buttons, `startResearch()` → `run_id`, polls `research_report_runs`, renders `ResearchReportView`, keeps an in-page history.
- Reports persist to `saved_reports` (`kind='deep_research'`, `payload=ResearchReport`). **No dedicated Reports surface** exists in the nav — reports are only visible inside the research page's history.
- Nav (`AppShell.tsx`): Ask · Deep research · Explore · Watchlist.

## 2. Target design

### 2.1 Ask composer = single entry, three flat modes
The composer mode menu offers: **Quick answer** (free, default — today's `evidence`) · **Deep research** (Pro) · **Structured review** (Pro). The `standard | structured_review` split currently on the research page moves **up** into the composer. Pro modes show a "Pro" affordance.

### 2.2 Deep research runs INLINE in the chat thread
On submit with a Pro mode, instead of redirecting:
1. `startResearch(text, mode)` → `run_id` (unchanged API).
2. A **research-run card** is appended to the conversation thread (a new message variant): shows live progress by polling `research_report_runs` (reusing `ResearchProgress`).
3. On completion it becomes a **"Report ready" card**: title · source count · mode badge · `[ Open report ]` · `[ ⬇ Word ]`.
4. The card persists in the thread (re-renders on reopen, like every other message).
5. `[ Open report ]` → `/app/reports/[saved_report_id]`.

### 2.3 A dedicated Reports surface
- New route `apps/web/app/app/reports/page.tsx` — RLS-scoped list of the user's `saved_reports` (title, date, mode badge, source count). The frozen read-path filter `.eq('kind','deep_research')` is preserved.
- New route `apps/web/app/app/reports/[id]/page.tsx` — renders `ResearchReportView` for one saved report (with the existing export bar + Vancouver/AMA toggle).

### 2.4 Nav + route changes
- Remove **Deep research** from the nav; add **Reports**. Nav → Ask · Reports · Explore · Watchlist.
- The standalone `/app/research` route is **repurposed/retired**: the run now happens inline in Ask, and report viewing lives at `/app/reports/[id]`. `/app/research` redirects to `/app/ask` (back-compat for any saved `?q=` deep links → opens Ask in deep mode).

## 3. Data model — no schema change
- `conversation_messages.payload` is JSON → add a **research-run card** variant: `{ type:'research_run', run_id, mode, question, status, saved_report_id }`. Reopening a chat re-renders the card identically (same saved-revisitable-object pattern as chat persistence).
- Reports already live in `saved_reports`. The Reports list is a query; the detail reads `payload`.
- `research_report_runs` (already deployed) continues to back live progress.

## 4. What is reused (no throwaway)
`ResearchReportView`, `ResearchProgress`, `startResearch` / `fetchResearchReport` / `downloadReportExport`, the docx/pptx export routes, `citation-format`, and the whole engine + safety layer. The restructure **moves the entry point** and **adds a Reports home** — it does not re-implement the report or the engine.

## 5. Out of scope
Engine/orchestrate changes, schema migrations, billing/Stripe, the structured-review *content* (already built). This is frontend IA + a thin chat-card + a Reports list/detail.

## 6. Frozen guarantees preserved
One `detectViolations` scan, one citation namespace, deterministic gaps/counts, `saved_reports.kind='deep_research'` read-path — all untouched (no engine edits).

---

## 7. Task breakdown (bite-sized, TDD where it has logic)
1. **Composer modes** — `ask/page.tsx` `MODES` → quick/deep/structured_review; mode menu renders all three with Pro affordance; `mode` state typed to the three ids.
2. **Inline run — start** — on submit with deep/structured: call `startResearch`, append a `research_run` card message to the conversation (persisted), stop redirecting.
3. **Inline run — progress + ready card** — a `ResearchRunCard` component: polls `research_report_runs` (reuse poll logic from research/page.tsx), renders `ResearchProgress` while running, then the "Report ready" card (title, sources, mode, Open report, Word export).
4. **Reopen fidelity** — reopening a conversation re-renders `research_run` cards (running → resume poll; completed → ready card). Test: a persisted completed card re-renders with the Open-report link.
5. **Reports list** — `reports/page.tsx`: RLS-scoped `saved_reports` list (`.eq('kind','deep_research')`), row → `/app/reports/[id]`.
6. **Reports detail** — `reports/[id]/page.tsx`: fetch report, render `ResearchReportView` (export + toggle).
7. **Nav + redirect** — `AppShell.tsx`: drop Deep research, add Reports; `/app/research` → redirect to `/app/ask`.
8. **Cleanup** — remove the now-unused `ResearchComposer` from research/page.tsx; ensure no dead imports; typecheck + build green.
9. **Tests** — composer mode→startResearch wiring; run-card lifecycle; reopen fidelity; reports-list read-path filter regression.

## 8. Sequencing note
Build on `feat/research-in-ask-reports-surface` (off the PR #51 branch). When done, this combined branch is what we validate (preview) and merge — so the publishable-reports work and the IA restructure ship together.
