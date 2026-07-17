# Manus UI/UX Parity — Design Spec + Phased Implementation Plan

> **Status:** SPEC + PLAN (no app code touched here). Written 2026-07-04 against `origin/main`.
> **Owner-gated:** every phase ships as its own reviewed PR. Nothing here auto-deploys.

---

## 1. North star

**"Manus parity, evidence substance"** means: PharmaOrb's chrome — the collapsible rail, the
in-task top bar, the centered serif home, and above all the **agent-run view** (avatar step
messages + a pinned "Task progress" tracker + a per-run usage popover + a live working panel) —
should look and feel like Manus's, pixel-grain by pixel-grain. But the thing running underneath is
**our evidence engine**, not Manus's general-compute agent.

- **COPY the surface. Do NOT copy the engine.** We faithfully reproduce Manus's UI/UX. We do **not**
  reproduce its sandbox VM, arbitrary code execution, or open-web browsing. Those are off-moat for a
  medical product and a direct safety liability (a general-compute agent that "runs commands" has no
  place giving drug answers). Every Manus surface gets wired to our
  research / deep-research / systematic-review / discovery / journal-club / missions pipeline.
- **The moat becomes visible in Manus's proven shape.** Manus's per-task "Usage" popover counts
  *pages viewed, commands run, files created*. Ours counts **sources searched, sources cited, claims
  verified against source** — the same UI, carrying stronger substance.
- **Honesty rule (owner standing rule):** every surfaced number is real, pulled from data the run
  actually produced. No decorative counters, no fake "watch it work" theater. If a metric has no real
  backing field yet, it is **deferred to a phase that adds the engine emit** — never invented.
- **Honest scope note:** full fine-grain parity is **multi-phase, weeks of reviewed slices**. This
  doc sequences it so the highest-moat, highest-reuse surface (the agent-run view) ships first, and
  the mechanical chrome parity follows. Do not read the phase count as "a week of work."

---

## 2. Fine-grain UI anatomy → PharmaOrb mapping

The "smallest grain" reference. Columns: **Manus element** | **our current equivalent (file:line on
`origin/main`, or _none_)** | **gap** | **moat-preserving adaptation**.

### 2.1 Shell — sidebar / rail

| Manus element | Our current equivalent | Gap | Adaptation |
|---|---|---|---|
| Collapsible sidebar, icon-rail ↔ expanded | `AppShell.tsx` `railCollapsed` state + `.rail` / `.rail-collapsed` in `shell.css:56-59,105-113`; persisted to `localStorage("rail-collapsed")` | None — behavior matches | Keep as-is |
| Expanded top: "manus" wordmark + search icon + collapse toggle | Wordmark `.wordmark` in `.brand` (`AppShell.tsx` `<Orb/>` + wordmark); rail search box `.search` (`shell.css:79-90`) filters Recent chats | Collapse toggle lives in the topbar hamburger, not inline atop the rail; search is chat-only | Move a collapse chevron into the rail header; keep search scoped to chats (honest — we don't index the catalog) |
| Nav: New task, Agent, Plugins, Scheduled, Library | `workspace[]` in `AppShell.tsx` = Ask, Library, Scheduled. "New chat" `.new` row | **No "Agent" nav, no "Plugins" nav.** "New task" = our "New chat" | "Agent" = a **mode of Ask** (see §2.6, parked design `feat/agent-mode-design`), not a new engine. "Plugins" = §2.5 read-only capabilities page |
| "Projects" section (＋ to add; project list) | Projects exist (`fetchProjects`, `setItemProject`, project→Ask handoff in `ask/page.tsx:290-303`) but are surfaced via the per-chat ⋯ menu, not a rail section | No dedicated rail "Projects" group with an inline ＋ | Add a rail "Projects" section listing projects with a ＋; reuse existing `fetchProjects` / project pages |
| "Tasks" section (filter icon; past runs, each with ⋯ menu) | Recent **chats** list in the rail with per-row ⋯ menu (rename/pin/delete/assign-project), `AppShell.tsx` `openRowMenu` + `.row-menu` | Our list is *chats*, not *agent runs*; no filter icon | Rename/reframe as "Tasks" once agent-runs are first-class; a past deep-research/journal-club run **is** a task. ⋯ menu already exists — reuse |
| Account row bottom-left (avatar + name) + device-cast / notification icons | Account footer `.acct-wrap` with avatar/initials + menu (`AppShell.tsx`); credits chip | No device-cast / notification icons | Skip device-cast (no casting). A notification bell **can** map to Monitoring/Missions alerts (real) — defer to a later phase |

### 2.2 Shell — in-task top bar

| Manus element | Our current equivalent | Gap | Adaptation |
|---|---|---|---|
| Model-selector pill ("Manus 1.6 Lite" ▾) at left | _none in topbar_ — our model routing is server-side (`model-router.ts`), the composer depth dial (`ask/page.tsx` `MODES`) is the closest analogue | No topbar model pill | Add a **mode/engine pill** ("Deep research" / "Fast" ▾) reflecting the current run's engine. Honest: it names our real modes, not fake model tiers |
| Share | _none_ | No share affordance | Defer. A shared report link is real only once report-sharing exists |
| Bar-chart "Usage" icon → per-task Usage popover | _none per-task_. Global credits modal exists (`CreditsPanel.tsx`, opened from topbar chip) | **No per-run usage popover** | **Phase 1** builds the per-run **Evidence-work** popover from `ResearchReport` fields (see §2.4) |
| External-panel icon → working/computer panel | Topbar panel button toggles the **EvidencePanel** (`AppShell.tsx` `toggleEvidence` / `evidenceCollapsed`) | Ours shows sources, not a compute pane | This IS our "Computer panel" analogue — see §2.4 owner decision |
| "…" menu | _none in topbar_ (per-chat ⋯ is in the rail) | No topbar overflow menu | Low priority; add in the chrome-parity phase |
| Credits chip ("1,300") top-right on home | Credits chip in topbar → opens `CreditsPanel` modal (`AppShell.tsx` `creditsOpen`) | None — we have this | Keep. Our credits model is real (`buildCreditsSummary`) |

### 2.3 Home screen

| Manus element | Our current equivalent | Gap | Adaptation |
|---|---|---|---|
| Centered SERIF greeting "What can I do for you?" | `.welcome-title` "What can I help you research?" (`ask/page.tsx` welcome block) — sans-serif | Not serif | Swap the welcome title to a serif face (token in `globals.css`); copy already centered |
| Composer "Assign a task or type / for more" + left ＋ / tools-fork / computer icons + right chat/mic/send | `Composer` in `ask/page.tsx`: left ＋ (tools launcher), right mic + send. Depth dial pill | No "/" command hint; no computer icon; tools-fork = our ＋ | ＋ tools launcher already mirrors Manus's fork. Add "/" affordance later. "Computer icon" → evidence-panel toggle |
| "Suggested for you" connector cards (refresh + dismiss) | _none_ | No suggestion cards | Defer / optional. If built, seed from real Playbooks (`lib/playbooks.ts`) — honest, not generated |
| Quick-action chips (Create slides / Build website / More) | Welcome chips: Verify a claim / Deep research / Is this good for me? (`ask/page.tsx` welcome-chips) | Fewer chips, evidence-flavored | Keep evidence-flavored chips; "Slides" already exists as a Skill (`armSlides`). Do **not** add "Build website" (off-moat) |
| Promo / education cards | _none_ | — | Optional, low priority |

### 2.4 Agent-run view (the centerpiece — Phase 1)

| Manus element | Our current equivalent | Gap | Adaptation |
|---|---|---|---|
| Agent messages prefixed with "🌱 manus" avatar + name | `.msg-ai` block, no avatar/name label (`ask/page.tsx` thread map) | No agent avatar/name row | Add an `<Orb/>` avatar + "PharmaOrb" name row above agent turns (Orb already exists) |
| Opening ack line ("Let me look that up for you.") | _none_ | No ack line | Add a short, honest ack ("Researching this now — pulling cited sources.") at run start |
| Inline plan-step chips gaining a green check per step | `ResearchProgress.tsx` renders the **phase checklist** (Planning/Searching/Drafting/Checking) with green checks, fed by `ResearchRunRow.progress` (`ResearchProgressStep[]`) | Not pinned; not styled as Manus's chip row | **REUSE** `ResearchProgress` render; the checks are already real. See §3 Phase 1 + honesty note below |
| Deliverable rendered inline (rich prose, bold, headings) | Deep-research → "Report ready" card linking to the report (`ResearchRunCard`); plain ask → inline `Answer` prose with bold + cited pills | Report body opens in Library, not inline | Keep the card→report link for heavy reports (correct). Optionally inline a report summary preview |
| PINNED collapsible "Task progress" tracker above composer, with N/N counter + chevron | `ResearchProgress` renders **inside the turn body**, not pinned above the composer; has phase list + live src-count but **no N/N counter, not collapsible-pinned** | **Not pinned, no N/N counter** | **Phase 1 core:** lift a compact tracker to a pinned bar above the composer while a run is active; add N/N = phases-done / total |
| Persistent bottom "Message Manus" composer to steer | Our composer is always pinned bottom in an active thread (`.composer-wrap`); research runs in background (no `busy` lock) so the user can keep typing | None — we already allow steering mid-run | Keep. Rename placeholder to feel conversational |
| Per-task USAGE popover: Credits used / Time worked / Pages viewed / Commands run / API called / Files created + "Rate this task ★★★★★" | _none per-run_ | **No per-run usage popover** | **Phase 1:** build an **Evidence-work** popover. Honest field mapping (see box below). Drop compute-only rows (Commands run) — we run no commands |
| "Manus's Computer" working panel (live tool/browser/file activity + artifacts) | `EvidencePanel` (`components/EvidencePanel.tsx`) — the right column showing the run's **sources** | Ours shows sources landing, not a VM screen | **Adapted, not 1:1** — our honest analogue is "watch the evidence assemble." See §2.4 owner decision. We deliberately **omit** the compute/browser pane (off-moat) |
| Footer disclaimer: "Manus is an AI Agent and can make mistakes…" | `POINT_OF_USE_DISCLAIMER` under the composer (`ask/page.tsx` `.composer-disclaimer`) | None — we have a stronger, medical-specific one | Keep ours |

> **Evidence-work popover — honest field mapping (the honesty rule made concrete).**
> The per-run popover is built ONLY from fields a `ResearchReport` actually carries. Verified against
> `origin/main` `packages/shared/src/research.ts` + `apps/web/lib/api.ts:fetchResearchReport`:
>
> | Popover row | Real source field | Notes |
> |---|---|---|
> | Sources searched | `report.counts.total_retrieved` (`RetrievalCounts`) | Merged, de-duplicated pool size. Real. |
> | Sources per database | `report.counts.per_provider` | e.g. "PubMed 22 · FDA 8 · ClinicalTrials 6". Real. |
> | Searches run | `report.counts.n_searches` | = number of sub-question passes. Real. |
> | Sources cited | `report.citations.length` | Real. |
> | Claims verified | `report.claims_verified` — **BOOLEAN, not a count** | Render as a **status** ("Every claim fact-checked ✓" / "Not fully verified"). To show a **count**, derive it from `report.sections[].points` that carry `citation_ids` (see Phase 1 Task 2). Pick ONE; the plan picks the derived count + boolean status together. |
> | Retractions checked | **DEFERRED** — no field on `ResearchReport`/`RetrievalCounts` | Do NOT render until an engine emit adds it. Candidate for a later phase. |
> | Time worked | **DEFERRED** — no duration field on `ResearchReport` | Either compute UI-side from run start→done timestamps (`ResearchRunRow` / `ResearchProgressStep.at`) — real — or defer. Phase 1 computes it from the progress-step timestamps (honest, no engine change). |
>
> **Field availability differs by run type.** A **research run** yields a `ResearchReport`
> (`counts`, `citations`, `claims_verified`; **no** `reviewed_sources`). A **plain /ask** yields an
> `AskResponse` (`citations`, `reviewed_sources`; **no** `counts`). Phase 1 is the agent-**run** view,
> so the Evidence-work panel keys off `ResearchReport`. Do **not** assume `counts` and
> `reviewed_sources` coexist — they never do.

> **Honest phase-check note (moat point, not just layout).** Manus shows a per-step green check as
> each step *completes sequentially*. Our engine emits **phase-level** steps
> (`planning → gathering → writing → checking → done`), and the gathering phase runs its sub-questions
> in **parallel** (`Promise.all` in `orchestrate.ts`). So the tracker checks off **phases**, and the
> N/N counter is **phases-done / total-phases**. We deliberately do NOT fake a sequential per-sub-question
> check-off — that would be theater the engine never performs. Showing the real phases IS the honest
> version of Manus's tracker.

### 2.5 Plugins page

| Manus element | Our current equivalent | Gap | Adaptation |
|---|---|---|---|
| Three grouped, searchable sections: Connectors / Skills / Data sources, each a card with ＋ | `DataSourcesPanel` (`components/DataSourcesPanel.tsx`) lists the data sources that power answers; Skills live in the ＋ launcher (`lib/playbooks.ts` `SKILLS`) | No standalone Plugins **page**; no Connectors concept | Build a read-only **Plugins/Capabilities** page: **Data sources** = existing `DataSourcesPanel` content (real: PubMed, FDA, ClinicalTrials, OpenAlex…); **Skills** = `SKILLS`/`PLAYBOOKS` (real); **Connectors** = "coming soon" honest placeholders. ＋ opens detail, not arbitrary install |

### 2.6 Scheduled + Library + Agent

| Manus element | Our current equivalent | Gap | Adaptation |
|---|---|---|---|
| SCHEDULED: Calendar \| Tasks tabs | `/app/scheduled` exists (nav item); Missions = scheduled research (`fetchMissions`) | No Calendar/Tasks tab split | Add tabs: "Tasks" = scheduled missions + monitors (real), "Calendar" = their next-run times |
| LIBRARY: file grid/list + type filter + favorites + search | `/app/reports` = Library (nav item "Library"); lists saved reports (`fetchResearchReports`) | No type filter / favorites / grid toggle | Add type filter (report mode) + search over saved titles. Favorites = optional |
| "Agent" nav item | _none_ | No Agent entry | "Agent" = a **mode of Ask** (parked design on `feat/agent-mode-design`): a persistent, steerable run thread. Not a separate engine — the agent-run view (§2.4) IS the agent experience |
| Missions = scheduled agent tasks | Missions exist (`MissionSheet`, `fetchMissions`, "Repeat this research" in `ResearchRunCard`) | None — already the concept | Keep; label consistently as scheduled agent tasks |

---

## 3. Phase plan

Six phases, each a shippable owner-gated PR. **Phase 1 is the agent-run view** — the moat centerpiece
and the biggest reuse of existing machinery. Phases 2-6 are chrome parity and are summarized only.

### Phase 1 — Agent-run view (Task-progress tracker + Evidence-work panel + agent messages)
- **Goal:** turn every research/journal-club run into a Manus-style agent run: an agent avatar + ack
  line, a **pinned collapsible "Task progress" tracker** (real phases, N/N counter) above the composer,
  and a per-run **Evidence-work** popover (real `ResearchReport` counts).
- **Surfaces:** `apps/web/app/app/ask/page.tsx` (thread + run card + composer wrap),
  `apps/web/components/ResearchProgress.tsx` (reskin/reposition), a new
  `apps/web/components/TaskProgressBar.tsx`, a new `apps/web/components/EvidenceWorkPanel.tsx`, two new
  pure helpers in `packages/shared/src/`, `apps/web/app/styles/shell.css`.
- **Reuses:** `ResearchProgress` phase-checklist render + its `ResearchProgressStep[]` feed;
  `ResearchRunCard`'s existing poll of `ResearchRunRow.progress`; `fetchResearchReport` for the report
  counts; `<Orb/>` for the avatar; the `CreditsPanel` modal shell for the popover chrome.
- **Builds:** the pinned tracker chrome + N/N counter; the Evidence-work popover; the avatar/ack row;
  two pure mapping functions (see §4).
- **Rough task count:** 6 tasks.
- **Owner design decision:** **the "Manus's Computer" fork** — do we reframe the working panel as
  "watch the evidence assemble" (the `EvidencePanel` showing sources land live during `gathering`), or
  omit a live pane entirely for v1 and only surface the finished sources? This sets the product's
  identity (see §3 closing decision).

### Phase 2 — Sidebar / rail fine-grain parity
- **Goal:** rail matches Manus's information architecture: inline collapse chevron, a "Projects"
  section with ＋, and the Recent list reframed as "Tasks" with a filter.
- **Surfaces:** `AppShell.tsx`, `shell.css`.
- **Reuses:** `fetchProjects` / `setItemProject`, existing per-row ⋯ menu, `railCollapsed` machinery.
- **Builds:** rail "Projects" group + inline ＋; "Tasks" section header + filter icon; inline collapse
  chevron in the rail header.
- **Rough task count:** 4 tasks.
- **Owner decision:** does "Tasks" list **chats + runs together**, or only agent runs? (Affects whether
  a plain chat counts as a "task".)

### Phase 3 — Top-bar parity (mode pill, per-run usage icon, overflow)
- **Goal:** in-task top bar matches Manus: a left mode/engine pill, a bar-chart usage icon opening the
  Phase-1 Evidence-work popover, a "…" overflow.
- **Surfaces:** `AppShell.tsx` topbar region, `ask/page.tsx` `setTopbar(...)`, `shell.css`.
- **Reuses:** the Phase-1 Evidence-work popover; `MODES` for the pill label; existing topbar injection
  (`setTopbar`).
- **Builds:** the mode pill (▾ menu = our real depth/tool modes); the usage bar-chart icon wiring; a
  topbar "…" menu.
- **Rough task count:** 3 tasks.
- **Owner decision:** does the mode pill let the user **switch** the run's engine mid-thread, or is it
  display-only (reflecting the last run's mode)?

### Phase 4 — Plugins / Capabilities page
- **Goal:** a Manus-style Plugins page with three searchable sections: Connectors / Skills / Data
  sources.
- **Surfaces:** new `apps/web/app/app/plugins/page.tsx`, nav entry in `AppShell.tsx`, `shell.css`.
- **Reuses:** `DataSourcesPanel` content (Data sources), `SKILLS` + `PLAYBOOKS` (Skills).
- **Builds:** the grouped card grid + section search; honest "Connectors — coming soon" placeholders.
- **Rough task count:** 3 tasks.
- **Owner decision:** are "Connectors" honest placeholders only, or is there a real first connector
  (e.g. a user's own PDF library / Obsidian)? Default: placeholders.

### Phase 5 — Home-screen serif + composer detail
- **Goal:** the centered serif greeting, the "/ for more" composer hint, optional suggestion cards
  seeded from real Playbooks.
- **Surfaces:** `ask/page.tsx` welcome block + `Composer`, `globals.css` (serif token), `shell.css`.
- **Reuses:** existing welcome/composer, `PLAYBOOKS` for any suggestion cards.
- **Builds:** serif title; "/" command hint; optional Playbook suggestion cards with refresh/dismiss.
- **Rough task count:** 3 tasks.
- **Owner decision:** ship suggestion cards (more surface, more upkeep) or keep the calm 3-chip landing?

### Phase 6 — Library / Scheduled parity polish
- **Goal:** Library gets a type filter + search + optional favorites; Scheduled gets Calendar | Tasks
  tabs.
- **Surfaces:** `apps/web/app/app/reports/page.tsx`, `apps/web/app/app/scheduled/page.tsx`, `shell.css`.
- **Reuses:** `fetchResearchReports`, `fetchMissions`, monitor rows.
- **Builds:** Library type filter + title search; Scheduled tab split with next-run "calendar" view.
- **Rough task count:** 4 tasks.
- **Owner decision:** is "favorites" worth a schema column, or skip for v1?

> **The single most important owner design decision (surfaced by Phase 1):**
> **The "Manus's Computer" panel fork.** Manus's signature is the live pane where you *watch it work*
> (browser, terminal, files). We deliberately do not run a compute VM. Our honest, on-moat analogue is
> **"watch the evidence assemble"** — the `EvidencePanel` populating with real sources as the `gathering`
> phase streams `sources_found`. The decision: **(A)** wire the EvidencePanel to open and fill live
> during a run (strong, honest "watch it work" — recommended), or **(B)** omit any live pane for v1 and
> only reveal sources when the report is ready. Everything else in this doc is mechanical; **this one
> choice sets the product's identity.**

---

## 4. Phase 1 — Implementation Plan (writing-plans format)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Reskin and reposition the existing research-progress UI into a Manus-style agent-run view: a
pinned collapsible "Task progress" tracker (real engine phases + N/N counter), a per-run Evidence-work
popover built only from real `ResearchReport` fields, and an agent avatar + ack line on run turns.

**Architecture:** Two **pure, unit-tested** functions carry all logic — `progressToTracker` (maps the
engine's `ResearchProgressStep[]` to a phase-checklist row-model + counter) and `reportToEvidenceWork`
(maps a finished `ResearchReport` to the honest metric row-model). The React surfaces are thin renderers
over those models plus the existing `ResearchProgress` component, so the risky logic is testable and the
JSX is build-and-visual-verify only.

**Tech Stack:** Next.js (App Router) client components, TypeScript, the existing `@nemesis/shared`
package. **`packages/shared` is tested with Deno's test runner + std `assert`** (`deno test`, verified
against `packages/shared/src/claim-meter.test.ts`) — NOT Vitest. Use `.ts` import extensions in shared
(the codebase convention).

### Global Constraints

- **Honesty rule (verbatim, owner standing rule):** every surfaced number must be real (from the run),
  never decorative. A metric with no backing field is omitted, not invented.
- **`claims_verified` is a BOOLEAN**, not a count (`ResearchReport.claims_verified` in
  `packages/shared/src/research.ts`). Never render "N claims verified" off it. A count must be derived
  from `sections[].points` carrying `citation_ids`.
- **Field availability by run type:** research runs → `ResearchReport` (`counts`, `citations`,
  `claims_verified`; NO `reviewed_sources`). The Evidence-work panel keys off `ResearchReport` only.
- **Phases are checked, not sub-questions.** The tracker maps the 4 engine phases
  (`planning`/`gathering`/`writing`/`checking`) + `done`; N/N = phases-done / 4. No fake per-sub-question
  check-off (gathering is parallel).
- **Reuse over rebuild:** `ResearchProgress.tsx` already renders the phase checklist with green checks
  and a live src-count from `ResearchRunRow.progress`. Do not write a new tracker engine — reposition and
  wrap it.
- **Communication:** plain-English UI copy (repo `CLAUDE.md`).
- **Frozen layer untouched:** no change to `orchestrate.ts`, `plan.ts`, the safety scan, or the `/ask`
  function. This is a display-only phase.

**Verified reuse points (against `origin/main`, exact names):**
- `ResearchProgressStep` — `packages/shared/src/research.ts`: `{ step: "planning" | "gathering" |
  "writing" | "checking" | "done" | "error"; detail: string; sources_found?: number; at: string }`.
- `ResearchReport` — same file: `.citations: Citation[]`, `.counts?: RetrievalCounts`,
  `.claims_verified: boolean`, `.sections: ResearchSection[]` where `ResearchSection.points:
  AnswerPoint[]`.
- `RetrievalCounts` — same file: `.total_retrieved: number`, `.per_provider: Record<string, number>`,
  `.n_searches: number`, `.retrieved_at: string | null`.
- `ResearchRunRow` — `apps/web/lib/api.ts:734`: `{ id; status; question; progress:
  ResearchProgressStep[]; saved_report_id: string | null; error }`, polled by `fetchResearchRun`.
- `ResearchProgress` — `apps/web/components/ResearchProgress.tsx`: `({ steps: ResearchProgressStep[];
  done: boolean })`, renders `PHASES` checklist + activity trail + src-count.
- `ResearchRunCard` — `apps/web/app/app/ask/page.tsx`: polls `fetchResearchRun`, holds `run`
  (`ResearchRunRow`) and `done` (report id + sources), renders `<ResearchProgress steps={run?.progress
  ?? []} done={false} />` while running.
- `fetchResearchReport(savedReportId)` — `apps/web/lib/api.ts:849`: returns the full `ResearchReport`.
- `<Orb/>` — `apps/web/components/Orb.tsx`, `({ size?: number; busy?: boolean })`.

**Seam assumption (journal-club):** `feat/journal-club` adds a `ReportMode` of `"appraisal"` and a
`runAppraisal(...)` that returns a `ResearchReport`, flowing through the **same** `onProgress` /
`ResearchProgressStep` / `ResearchRunRow.progress` contract and the same `emit("planning"…"done")`
sequence (verified on the local `feat/journal-club` branch). **A journal-club appraisal run therefore
renders in this new agent-run view with no adapter.** Phase 1 branches **off `origin/main` after
journal-club merges** (see §5).

---

### Task 1: `progressToTracker` — pure phase→tracker mapping

**Files:**
- Create: `packages/shared/src/task-progress.ts`
- Test: `packages/shared/src/task-progress.test.ts`

**Interfaces:**
- Consumes: `ResearchProgressStep` from `./research.ts`.
- Produces:
  ```ts
  export type TrackerState = "done" | "active" | "pending";
  export interface TrackerRow { key: "planning" | "gathering" | "writing" | "checking"; label: string; state: TrackerState; }
  export interface TaskProgress { rows: TrackerRow[]; doneCount: number; total: number; complete: boolean; errored: boolean; sourcesFound: number | null; }
  export function progressToTracker(steps: ResearchProgressStep[]): TaskProgress;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/task-progress.test.ts
// NOTE: packages/shared uses DENO's test runner + std assert (see claim-meter.test.ts), NOT Vitest.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { progressToTracker } from "./task-progress.ts";
import type { ResearchProgressStep } from "./research.ts";

const step = (s: ResearchProgressStep["step"], detail = "", sources_found?: number): ResearchProgressStep =>
  ({ step: s, detail, sources_found, at: "2026-07-04T00:00:00.000Z" });

Deno.test("progressToTracker marks reached phases done, current active, rest pending", () => {
  const t = progressToTracker([step("planning"), step("gathering", "", 12)]);
  assertEquals(t.rows.map((r) => r.state), ["done", "active", "pending", "pending"]);
  assertEquals(t.doneCount, 1);       // planning done; gathering active
  assertEquals(t.total, 4);
  assertEquals(t.complete, false);
  assertEquals(t.sourcesFound, 12);   // latest step carrying a count
});

Deno.test("progressToTracker marks every phase done and complete on the done step", () => {
  const t = progressToTracker([step("planning"), step("gathering"), step("writing"), step("checking"), step("done", "Report ready", 30)]);
  assertEquals(t.rows.every((r) => r.state === "done"), true);
  assertEquals(t.doneCount, 4);
  assertEquals(t.complete, true);
  assertEquals(t.sourcesFound, 30);
});

Deno.test("progressToTracker flags errored and survives empty input", () => {
  assertEquals(progressToTracker([step("error", "stopped")]).errored, true);
  const empty = progressToTracker([]);
  assertEquals(empty.doneCount, 0);
  assertEquals(empty.rows.map((r) => r.state), ["active", "pending", "pending", "pending"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && deno test src/task-progress.test.ts`
Expected: FAIL with "Module not found ./task-progress.ts" / "progressToTracker is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/task-progress.ts
import type { ResearchProgressStep } from "./research.ts";

export type TrackerState = "done" | "active" | "pending";
export interface TrackerRow { key: "planning" | "gathering" | "writing" | "checking"; label: string; state: TrackerState; }
export interface TaskProgress { rows: TrackerRow[]; doneCount: number; total: number; complete: boolean; errored: boolean; sourcesFound: number | null; }

// The 4 real engine phases, in order (mirrors ResearchProgress.tsx PHASES). `done`/`error` are terminal.
const ORDER = ["planning", "gathering", "writing", "checking"] as const;
const LABELS: Record<(typeof ORDER)[number], string> = {
  planning: "Planning the research",
  gathering: "Searching the evidence",
  writing: "Writing the cited report",
  checking: "Fact-checking each claim",
};

export function progressToTracker(steps: ResearchProgressStep[]): TaskProgress {
  const last = steps[steps.length - 1];
  const complete = last?.step === "done";
  const errored = last?.step === "error";
  // Index of the phase the run has reached (the latest phase-typed step). -1 before any phase step.
  const phaseSteps = steps.filter((s): s is ResearchProgressStep & { step: (typeof ORDER)[number] } =>
    (ORDER as readonly string[]).includes(s.step));
  const reached = phaseSteps.length ? ORDER.indexOf(phaseSteps[phaseSteps.length - 1]!.step) : 0;
  const sourcesFound = [...steps].reverse().find((s) => typeof s.sources_found === "number")?.sources_found ?? null;

  const rows: TrackerRow[] = ORDER.map((key, i) => {
    const state: TrackerState = complete || i < reached ? "done" : i === reached && !errored ? "active" : "pending";
    return { key, label: LABELS[key], state };
  });
  const doneCount = rows.filter((r) => r.state === "done").length;
  return { rows, doneCount, total: ORDER.length, complete, errored, sourcesFound };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && deno test src/task-progress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the shared barrel**

In `packages/shared/src/index.ts`, add: `export * from "./task-progress.ts";` (follow the file's
existing export ordering).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/task-progress.ts packages/shared/src/task-progress.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): progressToTracker — honest phase→task-progress mapping"
```

---

### Task 2: `reportToEvidenceWork` — pure report→metrics mapping (the honesty rule lives here)

**Files:**
- Create: `packages/shared/src/evidence-work.ts`
- Test: `packages/shared/src/evidence-work.test.ts`

**Interfaces:**
- Consumes: `ResearchReport` from `./research.ts`.
- Produces:
  ```ts
  export interface EvidenceMetric { key: string; label: string; value: string; }
  export interface EvidenceWork { metrics: EvidenceMetric[]; claimsVerified: boolean; claimsVerifiedLabel: string; }
  export function reportToEvidenceWork(report: ResearchReport, elapsedMs?: number): EvidenceWork;
  ```
  (`elapsedMs` is computed UI-side from progress-step timestamps — real, no engine change. Omitted →
  no Time row.)

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/evidence-work.test.ts
// NOTE: Deno test runner + std assert (matches claim-meter.test.ts), NOT Vitest.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reportToEvidenceWork } from "./evidence-work.ts";
import type { ResearchReport } from "./research.ts";

// Minimal report fixture — only the fields reportToEvidenceWork reads.
const report = (over: Partial<ResearchReport> = {}): ResearchReport => ({
  question: "q", summary: "s", sub_questions: [], sections: [], uncertainties: [], safety_notes: [],
  citations: [{ chunk_tag: "1" }, { chunk_tag: "2" }] as ResearchReport["citations"],
  evidence_grade: "moderate", safety_flags: [], claims_verified: true,
  counts: { per_provider: { pubmed: 22, openfda: 8 }, total_retrieved: 30, n_searches: 4, per_search_cap: 8, retrieved_at: null },
  ...over,
});

Deno.test("reportToEvidenceWork maps only real fields: searched, cited, per-provider, searches", () => {
  const w = reportToEvidenceWork(report());
  const byKey = Object.fromEntries(w.metrics.map((m) => [m.key, m.value]));
  assertEquals(byKey.searched, "30");        // counts.total_retrieved
  assertEquals(byKey.cited, "2");            // citations.length
  assertEquals(byKey.searches, "4");         // counts.n_searches
  assert(byKey.databases.includes("PubMed")); // per_provider, friendly-named
});

Deno.test("reportToEvidenceWork renders claims_verified as a STATUS, never a count", () => {
  assert(/fact-checked/i.test(reportToEvidenceWork(report({ claims_verified: true })).claimsVerifiedLabel));
  assert(/not fully/i.test(reportToEvidenceWork(report({ claims_verified: false })).claimsVerifiedLabel));
  // no metric row literally named a claim COUNT off the boolean
  assertEquals(reportToEvidenceWork(report()).metrics.find((m) => m.key === "claims"), undefined);
});

Deno.test("reportToEvidenceWork: Time only when elapsed given; counts rows omitted when counts absent", () => {
  assertEquals(reportToEvidenceWork(report()).metrics.find((m) => m.key === "time"), undefined);
  assertEquals(reportToEvidenceWork(report(), 92_000).metrics.find((m) => m.key === "time")?.value, "1:32");
  const noCounts = reportToEvidenceWork(report({ counts: undefined }));
  assertEquals(noCounts.metrics.find((m) => m.key === "searched"), undefined); // no invented number
  assertEquals(noCounts.metrics.find((m) => m.key === "cited")?.value, "2");   // citations always real
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && deno test src/evidence-work.test.ts`
Expected: FAIL with "Module not found ./evidence-work.ts".

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/evidence-work.ts
import type { ResearchReport } from "./research.ts";

export interface EvidenceMetric { key: string; label: string; value: string; }
export interface EvidenceWork { metrics: EvidenceMetric[]; claimsVerified: boolean; claimsVerifiedLabel: string; }

// Friendly database names for the per-provider row (matches the pill names used in ask/page.tsx).
const PROVIDER_NAME: Record<string, string> = {
  pubmed: "PubMed", pubmed_oa: "PubMed", europepmc: "PubMed", openfda: "FDA", dailymed: "DailyMed",
  clinicaltrials: "ClinicalTrials", faers: "FAERS", openalex: "OpenAlex", medlineplus: "MedlinePlus",
};
const friendly = (k: string) => PROVIDER_NAME[k] ?? k;

function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function reportToEvidenceWork(report: ResearchReport, elapsedMs?: number): EvidenceWork {
  const metrics: EvidenceMetric[] = [];
  const c = report.counts;
  if (c) {
    metrics.push({ key: "searched", label: "Sources searched", value: String(c.total_retrieved) });
    const dbs = Object.entries(c.per_provider)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${friendly(k)} ${n}`)
      .join(" · ");
    if (dbs) metrics.push({ key: "databases", label: "Across databases", value: dbs });
    metrics.push({ key: "searches", label: "Searches run", value: String(c.n_searches) });
  }
  // citations is always present on a real report — cited count is always honest.
  metrics.push({ key: "cited", label: "Sources cited", value: String(report.citations.length) });
  if (typeof elapsedMs === "number") metrics.push({ key: "time", label: "Time worked", value: mmss(elapsedMs) });

  // claims_verified is a BOOLEAN: render a STATUS, never a fabricated count.
  const claimsVerified = report.claims_verified === true;
  const claimsVerifiedLabel = claimsVerified
    ? "Every claim fact-checked against its source"
    : "Not fully verified — treat with extra caution";
  return { metrics, claimsVerified, claimsVerifiedLabel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && deno test src/evidence-work.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the shared barrel**

In `packages/shared/src/index.ts`, add: `export * from "./evidence-work.ts";`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/evidence-work.ts packages/shared/src/evidence-work.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): reportToEvidenceWork — real ResearchReport metrics (honesty rule)"
```

---

### Task 3: `TaskProgressBar` — pinned, collapsible tracker with N/N counter

**Files:**
- Create: `apps/web/components/TaskProgressBar.tsx`
- Modify: `apps/web/app/styles/shell.css` (append `.task-progress-bar` block)

**Interfaces:**
- Consumes: `progressToTracker` + `TaskProgress` from `@nemesis/shared`; `ResearchProgressStep[]`.
- Produces:
  ```ts
  export function TaskProgressBar({ steps }: { steps: ResearchProgressStep[] }): JSX.Element | null;
  ```
  Renders nothing (`null`) when `steps` is empty; a collapsed bar labeled "Task progress" with a
  `doneCount / total` counter and a chevron; expands to the phase rows (green ✓ on `done`, spinner on
  `active`).

**Single-source-of-truth note:** `ResearchProgress.tsx` today computes its own `PHASES` + `reachedIdx`
inline. To avoid two copies of the phase ordering drifting, `ResearchProgress` should be refactored to
consume `progressToTracker` too (its `rows`/`sourcesFound`), so `task-progress.ts` is the one place
phase order + state lives. This refactor is small and additive; fold it into Task 3 if quick, else note
it as a follow-up. (Do not duplicate the phase list in a third place.)

- [ ] **Step 1: Build the component**

```tsx
// apps/web/components/TaskProgressBar.tsx
"use client";

import { useState } from "react";
import { progressToTracker, type ResearchProgressStep } from "@nemesis/shared";
import { Icon } from "./icons";

// Pinned, collapsible "Task progress" tracker (the Manus pattern). Reads the SAME live progress steps
// ResearchProgress does; this is the compact, composer-pinned presentation. Honest: it checks off the
// engine's real phases, and the N/N counter is phases-done / total-phases (gathering is parallel, so
// there is no per-sub-question check-off to fake).
export function TaskProgressBar({ steps }: { steps: ResearchProgressStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const t = progressToTracker(steps);
  const label = t.errored ? "Task paused" : t.complete ? "Task complete" : "Task progress";
  return (
    <div className={`task-progress-bar${t.complete ? " complete" : ""}${t.errored ? " errored" : ""}`}>
      <button type="button" className="tpb-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="tpb-label">{label}</span>
        <span className="tpb-counter">{t.doneCount} / {t.total}</span>
        {t.sourcesFound ? <span className="tpb-sources">{t.sourcesFound} sources</span> : null}
        <span className={`tpb-chevron${open ? " open" : ""}`} aria-hidden="true">›</span>
      </button>
      {open ? (
        <ul className="tpb-rows">
          {t.rows.map((r) => (
            <li key={r.key} className={`tpb-row ${r.state}`}>
              <span className="tpb-check"><Icon name="check" size={11} /></span>
              <span className="tpb-row-label">{r.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `apps/web/app/styles/shell.css` (reuse existing tokens `--surface`, `--line`, `--acid`,
`--text-3`; mirror the `.engine-step` done/active/pending treatment already in the file so the checks
look identical):

```css
/* ── Task progress: the pinned, collapsible Manus tracker above the composer ── */
.task-progress-bar { margin: 0 auto 8px; max-width: 760px; width: 100%; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.tpb-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; background: none; border: none; cursor: pointer; color: var(--text); font-family: var(--font); font-size: 13px; }
.tpb-label { font-weight: 600; }
.tpb-counter { color: var(--text-3); font-variant-numeric: tabular-nums; }
.tpb-sources { margin-left: auto; color: var(--text-3); font-size: 12px; }
.tpb-chevron { transition: transform 0.15s; color: var(--text-3); }
.tpb-chevron.open { transform: rotate(90deg); }
.tpb-rows { list-style: none; margin: 0; padding: 4px 12px 10px; display: grid; gap: 6px; }
.tpb-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-3); }
.tpb-row .tpb-check { display: inline-flex; opacity: 0.35; }
.tpb-row.done { color: var(--text); }
.tpb-row.done .tpb-check { opacity: 1; color: var(--acid); }
.tpb-row.active { color: var(--text); }
.tpb-row.active .tpb-check { opacity: 0.6; }
```

- [ ] **Step 3: Verify the component builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (no type errors from the new file).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/TaskProgressBar.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): TaskProgressBar — pinned collapsible task-progress tracker"
```

---

### Task 4: Pin `TaskProgressBar` above the composer during an active run

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (the `AskPage` render — composer wrap; the `ResearchRunCard`
  needs to surface its live `steps` up, or the page reads the active run's steps).

**Interfaces:**
- Consumes: `TaskProgressBar` from `@/components/TaskProgressBar`; the active run's
  `ResearchProgressStep[]`.
- Produces: a pinned tracker rendered just above `<div className="composer-wrap">` whenever a research
  turn is in flight.

**Approach note:** the live `steps` currently live inside `ResearchRunCard` (its polled `run.progress`).
The smallest reuse is to lift the *active* run's steps to the page: track the in-flight run turn's index
and its latest `run.progress`. Add a callback prop to `ResearchRunCard` that reports its steps up, or (simpler)
have the page read the steps from a small piece of state the card already fires on completion. Use the
callback: it avoids duplicating the poll.

- [ ] **Step 1: Add a steps-reporting callback to `ResearchRunCard`**

In `ResearchRunCard` (in `ask/page.tsx`), add an optional prop `onSteps?: (steps: ResearchProgressStep[])
=> void` and call it in the poll's success branch right after `setRun(row)`:

```tsx
// inside ResearchRunCard, in the poll tick after `setRun(row);`
onStepsRef.current?.(row.progress);
```

Mirror the `onCompleteRef` pattern already in the component (hold `onSteps` in a ref so it isn't a poll
dependency):

```tsx
const onStepsRef = useRef(onSteps);
onStepsRef.current = onSteps;
```

Import `ResearchProgressStep` in the page's type imports from `@nemesis/shared` (it's already a
dependency of `ResearchProgress`).

- [ ] **Step 2: Track the active run's steps on the page**

In `AskPage`, add state:

```tsx
// The live progress of the in-flight research run, lifted from its card so the pinned Task-progress
// bar above the composer can render it. Cleared when no run is active. null = no active run.
const [activeRunSteps, setActiveRunSteps] = useState<ResearchProgressStep[] | null>(null);
```

Wire the card's new prop where `<ResearchRunCard ... />` is rendered in the thread:

```tsx
<ResearchRunCard
  card={t.research}
  onSteps={(steps) => setActiveRunSteps(steps)}
  onComplete={(r) => {
    setActiveRunSteps(null); // run finished — drop the pinned bar
    // …existing onComplete body unchanged…
  }}
/>
```

**Lifecycle note (must-do):** also clear `activeRunSteps` on the run's **failure** path, or the pinned
bar lingers with stale steps after a failed run. The simplest reliable clear is inside `ResearchRunCard`:
when the poll sets an error (`setErr(...)` on `row.status === "failed"` or the max-poll timeout), fire
`onStepsRef.current?.([])` so the page drops the bar. **Single-active-run assumption:** the page holds
one `activeRunSteps`, but the existing code supports concurrent research runs (see the `slidesIntentRef`
"two concurrent runs" comment). For v1 the pinned bar reflects the **most recent** run's steps; if
concurrent runs must each show a bar, key `activeRunSteps` by turn index (`Record<number,
ResearchProgressStep[]>`) instead — deferred unless the owner wants it.

- [ ] **Step 3: Render the pinned bar above the composer**

In the active-thread `return`, just before `<div className="composer-wrap">{composer}</div>`:

```tsx
{activeRunSteps ? <TaskProgressBar steps={activeRunSteps} /> : null}
<div className="composer-wrap">{composer}</div>
```

Add the import at the top: `import { TaskProgressBar } from "@/components/TaskProgressBar";`.

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit && npx next build --no-lint` (or the repo's build script)
Expected: PASS.

- [ ] **Step 5: Visual-verify**

Start the app, run a Deep research query, confirm: the pinned "Task progress · N / 4" bar appears above
the composer, its counter advances as phases complete, it expands to the phase rows, and it disappears
when the report is ready.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/app/ask/page.tsx
git commit -m "feat(web): pin Task-progress tracker above the composer during a run"
```

---

### Task 5: Agent avatar + ack line on research-run turns

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (the thread `.msg-ai` render for research turns)
- Modify: `apps/web/app/styles/shell.css` (append `.agent-head` block)

**Interfaces:**
- Consumes: `<Orb/>` from `@/components/Orb` (already imported in the page).
- Produces: an avatar + "PharmaOrb" name row and a one-line ack above a running research turn.

- [ ] **Step 1: Add the agent-head row to the research-run branch**

In the thread map, inside the `t.research ? (...)` branch, render an agent head above the
`<ResearchRunCard/>`:

```tsx
<div className="agent-head">
  <Orb size={22} busy={!t.research.error && !t.research.completed} />
  <span className="agent-name">PharmaOrb</span>
</div>
{!t.research.completed && !t.research.error ? (
  <p className="agent-ack">Researching this now — pulling and citing real sources.</p>
) : null}
```

(Place it just inside the existing `<>` fragment that wraps `<ResearchRunCard/>`.)

- [ ] **Step 2: Add styles**

Append to `shell.css`:

```css
/* ── Agent run head: avatar + name + ack (the Manus "🌱 manus" pattern, evidence-honest) ── */
.agent-head { display: flex; align-items: center; gap: 8px; margin: 2px 0 6px; }
.agent-head .agent-name { font-weight: 600; font-size: 13px; color: var(--text); }
.agent-ack { margin: 0 0 8px; color: var(--text-3); font-size: 13px; }
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): agent avatar + ack line on research-run turns"
```

---

### Task 6: `EvidenceWorkPanel` — the per-run usage popover, wired to the done report

**Files:**
- Create: `apps/web/components/EvidenceWorkPanel.tsx`
- Modify: `apps/web/app/app/ask/page.tsx` (surface a small "Evidence work" trigger on the completed
  research-run card; open the panel)
- Modify: `apps/web/app/styles/shell.css` (append `.evidence-work` block)

**Interfaces:**
- Consumes: `reportToEvidenceWork` + `EvidenceWork` from `@nemesis/shared`; `fetchResearchReport`
  from `@/lib/api`; the completed run's `savedReportId` + start/end timestamps for `elapsedMs`.
- Produces:
  ```ts
  export function EvidenceWorkPanel({ savedReportId, elapsedMs, open, onClose }: {
    savedReportId: string | null; elapsedMs?: number; open: boolean; onClose: () => void;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Build the panel (reuse the CreditsPanel modal shell)**

```tsx
// apps/web/components/EvidenceWorkPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { reportToEvidenceWork, type EvidenceWork } from "@nemesis/shared";
import { fetchResearchReport } from "@/lib/api";
import { Icon } from "./icons";

// Per-run "Evidence work" popover — our honest reframing of Manus's per-task Usage panel. Every row is
// a REAL field from the finished ResearchReport (see reportToEvidenceWork): sources searched/cited,
// databases, searches run, time, and a fact-check STATUS (claims_verified is a boolean, never a count).
export function EvidenceWorkPanel({ savedReportId, elapsedMs, open, onClose }: {
  savedReportId: string | null; elapsedMs?: number; open: boolean; onClose: () => void;
}) {
  const [work, setWork] = useState<EvidenceWork | null>(null);
  useEffect(() => {
    if (!open || !savedReportId) return;
    let alive = true;
    setWork(null);
    void fetchResearchReport(savedReportId)
      .then((rep) => { if (alive && rep) setWork(reportToEvidenceWork(rep, elapsedMs)); })
      .catch(() => { if (alive) setWork(null); });
    return () => { alive = false; };
  }, [open, savedReportId, elapsedMs]);

  if (!open) return null;
  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-card evidence-work" role="dialog" aria-modal="true" aria-label="Evidence work"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, textAlign: "left" }}>
        <h3 className="confirm-title">Evidence work</h3>
        {work ? (
          <>
            <div className="ew-grid">
              {work.metrics.map((m) => (
                <div className="ew-cell" key={m.key}>
                  <span className="ew-value">{m.value}</span>
                  <span className="ew-label">{m.label}</span>
                </div>
              ))}
            </div>
            <p className={`ew-status${work.claimsVerified ? " ok" : " warn"}`}>
              <Icon name={work.claimsVerified ? "check" : "shield"} size={14} /> {work.claimsVerifiedLabel}
            </p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        )}
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button type="button" className="confirm-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `shell.css`:

```css
/* ── Evidence-work popover grid (our honest per-run "Usage") ── */
.evidence-work .ew-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0; }
.evidence-work .ew-cell { display: flex; flex-direction: column; gap: 2px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.evidence-work .ew-value { font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.evidence-work .ew-label { font-size: 12px; color: var(--text-3); }
.evidence-work .ew-status { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: 13px; }
.evidence-work .ew-status.ok { color: var(--acid); }
.evidence-work .ew-status.warn { color: var(--text-3); }
```

- [ ] **Step 3: Add the trigger on the completed run card**

In `ResearchRunCard`'s `done` branch (the "Report ready" card), add an "Evidence work" button next to
"Repeat this research", and wire local `open` state + the panel. Compute `elapsedMs` from the run's first
and last progress timestamps (`ResearchProgressStep.at`) — real, no engine change. `run` (the
`ResearchRunRow`) is in scope in the `done` branch; a rehydrated (saved) card has `run === null`, so
`elapsedMs` is `undefined` and the Time row is honestly omitted (we don't know a past run's duration):

```tsx
const [showWork, setShowWork] = useState(false);
// Real wall-clock from the streamed progress timestamps — undefined for rehydrated cards (run === null).
const elapsedMs = run?.progress?.length
  ? new Date(run.progress[run.progress.length - 1]!.at).getTime() - new Date(run.progress[0]!.at).getTime()
  : undefined;
// …in the .msg-actions row of the done branch:
<button type="button" className="chip-action" onClick={() => setShowWork(true)}>
  <Icon name="doc" size={14} />Evidence work
</button>
<EvidenceWorkPanel savedReportId={done.id} elapsedMs={elapsedMs} open={showWork} onClose={() => setShowWork(false)} />
```

Add the import: `import { EvidenceWorkPanel } from "@/components/EvidenceWorkPanel";`. **Icon note:**
`components/icons.tsx` has no `chart` icon (confirmed on `origin/main` — available names include `doc`,
`check`, `shield`, `bell`, `card`). Use `doc` for the trigger and `check`/`shield` inside the panel
(as written in Task 6 Step 1), or add a `chart` glyph to `icons.tsx` if a bar-chart icon is wanted.

- [ ] **Step 4: Verify build + visual-verify**

Run: `cd apps/web && npx tsc --noEmit`
Then run a Deep research query to completion, click "Evidence work", and confirm the grid shows the real
counts (searched / cited / databases / searches) and the fact-check status line — and that no invented
row (retractions, commands run) appears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/EvidenceWorkPanel.tsx apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): EvidenceWorkPanel — per-run usage popover from real report counts"
```

---

### Self-review (Phase 1)

- **Spec coverage:** agent avatar + ack (Task 5) ✓; inline plan-step checks reused via
  `ResearchProgress` + lifted into the pinned `TaskProgressBar` (Tasks 1,3,4) ✓; pinned collapsible
  Task-progress tracker with N/N (Tasks 3,4) ✓; per-run Evidence-work popover from real fields
  (Tasks 2,6) ✓; persistent bottom composer (already exists — unchanged) ✓.
- **Placeholder scan:** every code step ships real code; no TBD/"handle edge cases".
- **Type consistency:** `ResearchProgressStep`, `TaskProgress`/`TrackerRow`, `EvidenceWork`/`EvidenceMetric`,
  `progressToTracker`, `reportToEvidenceWork` used identically across tasks; `onSteps`/`onStepsRef`
  mirror the existing `onComplete`/`onCompleteRef` pattern.
- **Honesty audit:** `claims_verified` rendered as a status, never a count (Task 2 test asserts this);
  no `retractions`/`commands` rows; counts-derived rows omitted when `counts` is absent; Time computed
  from real timestamps or omitted.

---

## 5. Sequencing

- **Journal-club (`feat/journal-club`) is finishing now and is ahead in the queue.** It adds an
  `"appraisal"` `ReportMode` + `runAppraisal(...)` returning a `ResearchReport`, on the **same**
  `onProgress` / `ResearchProgressStep` / `ResearchRunRow.progress` contract as deep research (verified
  on the branch). No new run table, no new progress shape.
- **Phase 1 branches off `origin/main` AFTER journal-club merges.** Base assumption:
  `git checkout main && git pull && git checkout -b feat/manus-agent-run-view`. Because the appraisal run
  reuses the same progress + report contract, **the journal-club appraisal becomes the first content
  shown in the new agent-run view** — upload a paper → the pinned Task-progress tracker checks off
  planning/gathering/writing/checking → the Evidence-work popover shows the appraisal's real source
  counts. That is the showcase run for Phase 1.
- **If journal-club diverges** (uses a different run table or progress shape than confirmed here), Phase 1
  adds a thin adapter at the `ResearchRunCard` seam only; the two pure functions (§4 Tasks 1-2) are
  unaffected because they consume the shared `ResearchProgressStep` / `ResearchReport` types.

---

## 6. What we deliberately do NOT build (moat guardrails)

- **No general-compute "Computer" pane** (sandbox VM / terminal / arbitrary browsing). Off-moat and a
  medical-safety liability. Our analogue is the live EvidencePanel (owner decision in §3).
- **No "Build website" / "Create app" quick actions.** Not our product.
- **No fabricated usage metrics.** Retractions-checked, commands-run, files-created, pages-viewed are
  omitted unless a real engine field backs them.
- **No fake sequential step theater.** The tracker reflects the engine's real (partly parallel) phases.
