# Shell / UX Parity — Design Blueprint (WS-9 composer + WS-10 app-shell)

_Created 2026-07-03. Build-ready design spec for the **Shell/UX track** of the competitive-parity
plan. Source of truth for gaps: [`docs/research/competitor-ui-feature-synthesis.md`](../../research/competitor-ui-feature-synthesis.md).
Track definition: [`docs/superpowers/plans/2026-07-03-competitive-parity-implementation.md`](../plans/2026-07-03-competitive-parity-implementation.md) §WS-9, §WS-10.
This doc is design-only — it edits **no** `.tsx`/`.css`. Every class name and file path below is real
and was read from the live tree._

## North star (owner, 2026-07-03)

> PharmaOrb = the **ChatGPT + Manus shell** (feel), with the **composer tools of Consensus / Elicit /
> Scite / NotebookLM / ResearchRabbit**, sitting on our own graded-evidence engine + safety.

The engine race is largely ours; this track finishes the **workspace** so the surface reads as a
research super-app rather than a chat box with extra pages.

## The single most important boundary in this doc (read first)

WS-9 controls "drive retrieval params." Our constraint is "pure frontend, **no engine/ranking
changes**." Those only coexist if we split the work at the wire:

- **This track (frontend) owns:** collecting a control's value, **showing** the applied state to the
  user, and **sending** it as an additive field on the `/ask` request. Nothing here re-weights,
  re-ranks, or silently narrows anything.
- **The backend consumption of those params is a *separate, owner-gated slice*** — it is the absorbed
  **WS-3** (filters applied pre-rerank in `supabase/functions/ask/retrieve.ts` + `rerank.ts`). Until
  that ships, a filter sent from the composer is **displayed as pending/preview and does not change
  results** (or the control is disabled with an honest "Soon"). We never show a filter as *active*
  when the engine isn't yet honoring it — that would be a silent lie, which the honesty doctrine
  forbids.

For every WS-9 control below, the "Wire" line states whether `/ask` **already accepts** the param or
it **needs the WS-3 backend slice** first. Do not let a frontend slice imply it shipped engine work.

---

## 1. Design-system delta — what we have vs. what the ChatGPT+Manus feel needs

**Verdict: the token system already *is* the ChatGPT feel. No wholesale restyle. No parallel system.**

`apps/web/app/globals.css` `:root` is explicitly authored as "ChatGPT-style: calm neutral grayscale +
PharmaOrb accent reserved for primary actions/links." It gives us, across all three themes
(`light` / `grey` / `dark`):

- Surfaces/lines: `--bg`, `--bg-2`, `--surface`, `--surface-2`, `--raised`, `--line`, `--line-2`.
- Text ramp: `--text`, `--text-2`, `--text-3`.
- Accent (reserved): `--acid`, `--acid-dim`, `--acid-deep`, `--on-acid`, `--acid-rgb`.
- Semantic: `--warn`, `--danger`, `--info`.
- Layout/type: `--radius` (14), `--radius-sm` (10), `--rail` (264), `--rail-collapsed` (64),
  `--evidence` (344), `--font` (Inter), `--mono` (JetBrains Mono), `--shadow`.

And `apps/web/app/styles/shell.css` already ships the ChatGPT-idiom **component vocabulary** every new
surface should reuse verbatim:

| Need | Reuse this existing class (shell.css) | Notes |
|---|---|---|
| Left-rail nav item | `.hist` + `.hist-ic` (+ `.active`) | calm subtle-fill active, no accent bar |
| Rail section header | `.r-label` | 11px caps, `--text-2` |
| List of workspace items | `.watch-card-list` → `.watch-card` (`.watch-card-title`, `.watch-card-meta`, `.watch-card-pill`, `.watch-card-dot`, `.watch-card-chev`) | the universal card row; used by Monitor **and** Projects today |
| Sectioned workspace page | `.proj-section`, `.proj-section-head` (`h3` + `small`), `.proj-add-btn`, `.proj-picker`, `.proj-item` | Projects page idiom — reuse for Scheduled/Apps/Library sections |
| Grouped list (by kind/date) | `.report-group`, `.report-group-h` | Reports library idiom |
| Page header + back link | `.research-head`, `.proj-back` | |
| Popover menu | `.acct-menu` (+ `.tools-menu`), `role="menu"`, `.sep` | composer "+" and account menu both use it |
| Action chip / pill | `.chip-action` (`.active`), `.pill` | |
| In-pill composer controls | `.box`, `.tool`, `.mode`, `.send`, `.ta-wrap` | |
| Empty/welcome state | `.welcome-wrap`, `.welcome`, `.welcome-title`, `.welcome-sub`, `.welcome-chips` | |
| Modal | `AppModal` component + portal | |
| Loading | `Skeleton` / `.skel-list` / `.skel-row` | |
| Fast tooltip | `[data-tip="…"]` attribute | pairs with `aria-label` |
| Live/pipeline telemetry | `.engine-preview`, `.engine-step*`, `.activity-trail` | reuse for the Manus checklist |

### The genuine delta (only three new patterns needed)

1. **Manus "plan / checklist" component** for Scheduled (Missions) and the mission-detail run trail.
   Manus's signature is a decomposed task with ticked steps + progress ("2/2"). We **already have the
   visual atoms**: `.engine-step-list` / `.engine-step` (`.pending`/`.active`/`.done` with the spin +
   check states) and `.activity-trail`. The delta is a small **presentational** wrapper that renders a
   mission as *plan → cadence → last run → next run → deliverable*, reusing those atoms. No new tokens.

2. **Composer filter drawer + corpus segmented control.** New in-composer surfaces (see §3). The drawer
   is an `.acct-menu`-style popover; the corpus switch is a new 3-segment control. Both are built from
   existing tokens (`--surface`, `--line`, `--acid`); the only *new* CSS is a segmented-control class
   (`.corpus-seg`) and a filter-row layout (`.filter-row`) — additive, scoped, ~40 lines.

3. **Nav-group additions** (Scheduled / Apps / Library) slotted into the existing `.r-label`+`.hist`
   idiom. This is a data-list change in `AppShell.tsx`, not styling. **Constraint:** the rail is a
   *shared surface* on every page — adding an item that links to an unbuilt route is a regression
   (dead link). So each new nav item is **route-gated**: it appears only when its route exists, and
   ships in the **same slice** as its page (never ahead of it).

Everything else — spacing, radii, hover, focus, dark-mode — is inherited for free. Do **not** invent
new spacing scales, new radii, or a second card style.

---

## 2. Left rail / nav spec

Today (`AppShell.tsx` `workspace` array + inline Projects link):

```
Brand (Orb + wordmark)
[ New chat ]         → /app/ask
[ search box ]       (chats & drugs; not yet wired)
Workspace
  Ask                → /app/ask        (message icon)
  Reports            → /app/reports     (doc)
  Monitoring         → /app/monitor     (bell)
Projects
  Projects           → /app/projects    (folder)
Recent chats
  …saved chats…      (rename/pin/delete row menu)
account footer (avatar · plan · used/limit)
```

**Target (ChatGPT-clean groups; Manus adds Scheduled/Apps/Library):**

```
Brand
[ New chat ]
[ search ]
Workspace
  Ask            /app/ask        exists
  Reports        /app/reports    exists
  Monitoring     /app/monitor    exists
  Scheduled      /app/scheduled  NEW (surfaces Missions — data live, page new)   ← first slice
Library
  Projects       /app/projects   exists (move under a "Library" group header)
  Library        /app/library    NEW (saved papers/uploads/collections — DATALESS today, deferred)
  Apps           /app/apps       NEW (connectors/export targets — mostly static, deferred)
Recent chats
  …
account footer
```

Layout rules (all already true in `AppShell.tsx`, keep them):
- Groups are `.r-label` headers followed by `.hist` rows; active = `isActive(path, href)` → `.active`.
- Collapsed rail (`.rail-collapsed`) hides labels; icons stay centered — new items must supply an
  `Icon` name from `components/icons.tsx` (e.g. `bell` exists for Scheduled-clock use `clock` if
  present, else reuse `bell`; `folder` for Library; `grid`/`plug` for Apps — verify the name exists
  before shipping, fall back to an existing glyph).
- **Gating:** the `workspace`/nav arrays get a `flag?` or `enabled` predicate; an item renders only
  when its route is live. This keeps the rail honest on every page and lets each page ship independently.
- `FULL_BLEED` + `titleForPath()` in `AppShell.tsx` must gain the new paths (`/app/scheduled`,
  `/app/library`, `/app/apps`) so the topbar title + scroll behavior are correct.

Item-by-item:

| Item | Route | State | Action |
|---|---|---|---|
| New | `/app/ask` | exists | keep |
| Ask | `/app/ask` | exists | keep |
| Reports | `/app/reports` | exists | keep |
| Monitoring | `/app/monitor` | exists | keep |
| **Scheduled** | `/app/scheduled` | **new page, live data** | build (slice 1) |
| Projects | `/app/projects` | exists | keep; regroup under "Library" header |
| **Library** | `/app/library` | **new, no backend** | defer until a saved-papers/uploads store exists |
| **Apps** | `/app/apps` | **new, mostly static** | defer; ship after Scheduled |
| account | overlay | exists | keep |

---

## 3. WS-9 composer spec

### 3.0 What exists today (this is a **reorg**, not greenfield)

`apps/web/app/app/ask/page.tsx` composer already has **two** popovers on the `.box` pill:

- Leading **"+" tools launcher** (`.tool` → `.tools-menu`): *Verify a claim*, *Deep research*,
  *Meta-analysis*, and *Add photos & files* (disabled, "Soon").
- Trailing **mode chevron** (`.mode` → `.acct-menu`): the `MODES` list — Fast, Thorough, Deep research,
  Meta-analysis, Lab draft (lab_draft filtered out for now).
- Plus `mic` (disabled, "Soon") and `send`.

So **already present**: Verify-a-claim, Deep research, Meta-analysis, and the Fast/Thorough/Deep/Meta
**modes**. The WS-9 job is to **merge these two popovers into one clean launcher** and **add** the
net-new controls. Nothing below rebuilds the answer/thread — only the composer header row.

### 3.1 Target composer layout

```
┌─ .box (768px pill) ───────────────────────────────────────────────┐
│ [+]  [Corpus ▾]   textarea…                     [Mode ▾] [mic] [▶] │
└───────────────────────────────────────────────────────────────────┘
        │              (grows upward, controls bottom-anchored — unchanged)
        │
   [+] opens ONE consolidated launcher (.tools-menu), sectioned:
     ── Modes ──         Fast · Thorough · Deep · Meta            (existing MODES)
     ── Tools ──         Verify a claim · Monitor this · Compare · Find gaps
     ── Papers (Elicit) ─ Find papers · Chat with papers · Extract data   (Soon)
     ── Attach ──        Add PDF · Import DOI/PMID · Use a Project as context · Zotero (Soon)
     ── Filters ──       [ Quality filters ▾ ]  (opens the drawer)
```

Keep the trailing `Mode ▾` chevron as the quick mode switch (muscle memory) **and** mirror modes
inside the launcher — same `setMode` calls, no divergence.

### 3.2 Corpus switcher — NEW

- **UI:** a compact segmented control left of the textarea (new `.corpus-seg`, tokens only): **All ·
  Medical · My Library**. Default **All**. Shows the active segment; on click, sets composer state.
- **Meaning:** *All* = current behavior. *Medical* = restrict to top-tier journals + guidelines (via
  WS-1 `journal_tier` + study-type). *My Library* = ground in the user's saved papers/uploads.
- **Wire:** **needs the WS-3 backend slice** (a `corpus` param consumed pre-retrieval). *Medical*
  additionally **depends on WS-1** tier data. **My Library depends on a Library store that does not
  exist yet** → ship *All*/*Medical* segments first, render *My Library* as disabled "Soon" until the
  Library backend lands. Until WS-3 ships, *Medical* is shown as a **preview toggle** that is visibly
  inert or disabled — never as silently-active.

### 3.3 Quality-filter drawer — NEW (frontend of the absorbed WS-3)

- **UI:** `[ Quality filters ▾ ]` inside the launcher opens an `.acct-menu`-style drawer with rows
  (`.filter-row`): **Journal rank** (Q1–Q4 checkboxes), **Min citations** (stepper/select), **Exclude
  preprints** (toggle), **Study-type floor** (RCT / systematic review / any), **Date range**, **Open
  access only** (toggle). Simpler than Consensus at first (one "Highest-quality sources" master toggle
  + the drawer for power users).
- **Applied-state visibility (honesty):** when any filter is set, a small removable chip row shows the
  active constraints above/below the pill (e.g. `Q1–Q2 · ≥10 cites · no preprints ✕`). **Filters are
  always shown, never silent.** Removing a chip clears that constraint.

| Control | Retrieval param it drives | Depends on | Wire status |
|---|---|---|---|
| Journal rank Q1–Q4 | `journal_tier_floor` | **WS-1** (`journal_tier`) | needs WS-3 backend + WS-1 data; gate/disable when tier absent |
| Min citations | `min_citations` | WS-1 (`cited_by_count`) | needs WS-3 backend |
| Exclude preprints | `exclude_preprints` | source metadata (present) | needs WS-3 backend |
| Study-type floor | `study_type_floor` | `study-type.ts` (present) | needs WS-3 backend |
| Date range | `date_from` / `date_to` | source `published_at` (present) | needs WS-3 backend |
| Open access only | `oa_only` | `is_oa` / DOAJ (present) | needs WS-3 backend |

**WS-1 gating rule:** the Journal-rank row must **detect absent tier data and disable itself** with an
inline "journal ranking not available yet" note, so this slice is not hard-blocked on WS-1 deploy —
the rest of the drawer works without it.

### 3.4 Attachments / import — NEW, tiered by buildability

Frontend-only constraint means we **cannot** ship PDF ingestion or a Zotero sync in this track. Tier:

| Import | Build cost | Ship |
|---|---|---|
| **Use a Project as context** | **Cheap** — Projects is live (`fetchProjectContents`); pass project id as grounding scope | **first** (fast-follow to slice 1; the one real net-new import we can honor) |
| Import by **DOI / PMID** | Medium — a lookup → resolve to a source; no storage | second, if a resolve endpoint exists; else "Soon" |
| **Add PDF** upload | Heavy — needs upload + parse + store backend (audit item #3) | **design the control, mark backend-gated / "Soon"** |
| **BibTeX / Zotero** | Heavy — needs ingestion + a Library store | **"Soon"** |

Do not let the launcher imply the shell track ships PDF ingestion. Attach controls that lack a backend
render as disabled "Soon" rows (same honest treatment as today's "Add photos & files").

### 3.5 Consolidated tool/mode launcher — mostly reorg

| Launcher entry | Net-new vs. present | Wire |
|---|---|---|
| Fast / Thorough / Deep / Meta (modes) | **present** (`MODES`) | keeps calling `setMode` |
| Verify a claim | **present** (tools-menu) | keeps prefilling `"Is it true that "` |
| Deep research / Meta-analysis | **present** | keeps `setMode("deep"/"meta")` |
| Monitor this topic | **NEW entry** (backend live) | routes to `createWatch` flow / `/app/monitor` prefill |
| Compare two treatments | **NEW entry** (prompt template) | prefills a compare prompt (no engine change) |
| Find the research gaps | **NEW entry** (prompt template) | prefills a gaps prompt |
| Find papers / Chat with papers / Extract data (Elicit modes) | **NEW, "Soon"** | needs engine modes → out of this track; show honestly disabled |
| Corpus switch + Quality filters | **NEW** (§3.2, §3.3) | needs WS-3 backend |
| Attach (Project/DOI/PDF/Zotero) | **NEW** (§3.4) | tiered |

**Constraint recap:** the composer changes *what is requested and displayed*, never the safety scan
(`ask/safety.ts`) or the deterministic grade. Default (no corpus/filter set) = **byte-identical**
current `/ask` request and answer. Ships behind a flag (`NEXT_PUBLIC_WS9_COMPOSER`).

---

## 4. WS-10 page templates

All pages: `.research-wrap` container, existing card/section idioms, RLS-scoped reads, session-cache
for instant paint. Each is **route-gated** so nothing regresses.

### 4.1 Scheduled — `/app/scheduled` — **NEW route, data already live**

- **Purpose:** surface **Missions** (scheduled background research → cited deliverables) as a
  first-class Manus-style "scheduled agents" page. Missions ship live in the backend but are **surfaced
  nowhere in the UI today** — this is pure upside with zero regression risk.
- **Data (all live in `lib/api.ts`):** `fetchMissions()`, `createMission()`, `setMissionStatus()`,
  `deleteMission()`. `MissionSummary` = `{ id, question, report_mode, cadence, deliver, status,
  next_run_at, last_run_at, last_run_status, last_saved_report_id }`. Helpers `cadenceLabel`,
  `nextRunAt` in `packages/shared/src/missions.ts`. **Pre-migration safety:** `fetchMissions` returns
  `[]` on a missing relation, and `createMission` returns `{ ok:false, reason:"not_enabled" }` — so the
  page renders an honest empty/"not enabled yet" state and never crashes.
- **Layout:**
  - Header (`.research-head`) "Scheduled research" + a "New mission" affordance (`.watch-add` idiom:
    question input + cadence select + deliver select + create button; mirror `MonitorPage`'s add-row).
  - List via `.watch-card-list` → `.watch-card`: title = `question`; meta (`.watch-card-meta`) =
    `cadenceLabel(cadence)` · next run · last-run status; a `.watch-card-pill.daily` for cadence; a
    `.watch-card-dot` (`.active`/`.paused`) for status; `.watch-card-chev` to the last report
    (`/app/reports/[last_saved_report_id]`).
  - **Manus plan/checklist framing (the delta):** each mission card (or its expanded detail) shows a
    small plan strip — *Question → Searches on `cadence` → Cited report → Deliver `in_app|email`* —
    rendered with the existing `.engine-step-list`/`.engine-step` atoms (done/next states) so it reads
    as an agent plan, not a cron row. Reuse `.activity-trail` for last-run history.
  - Row actions (reuse `.row-menu` pattern): Pause/Resume (`setMissionStatus`), Delete (`deleteMission`
    + styled confirm like the chat-delete `.confirm-card`), Open last report.
- **Reuses:** `.watch-card*`, `.watch-add`, `.research-head`, `.engine-step*`, `.activity-trail`,
  `AppModal`/confirm, `Skeleton`. **Net-new:** the mission create-row wiring + the plan strip wrapper.
- **Gate:** route + `NEXT_PUBLIC_WS10_SCHEDULED`. Nav item appears with the route.

### 4.2 Projects — `/app/projects` (+ `/app/projects/[id]`) — restyle, exists

- **Purpose:** workspace grouping chats + reports + watches. Already live.
- **Data:** `fetchProjects`, `createProject`, `deleteProject`, `fetchProjectContents`,
  `fetchUnassignedItems`, `setItemProject`.
- **Delta (polish only):** it already uses `.proj-section*`, `.watch-card*`, `.proj-picker`. Bring it to
  ChatGPT-Projects grade: a project **overview header** (name, counts, description), consistent empty
  states (`.welcome`-style), and — once WS-9 lands — a "Use as chat context" affordance that hands the
  project to the composer's corpus/attach. **No data changes.**
- **Reuses:** everything it already does. **Net-new:** header polish + the context hand-off (WS-9 dep).
- **Gate:** already routed; restyle can ship unflagged as pure visual polish, or behind
  `NEXT_PUBLIC_WS10_PROJECTS_V2` if we want a safe toggle.

### 4.3 Apps / Connectors — `/app/apps` — **NEW route, mostly static**

- **Purpose:** integrations & export targets (ChatGPT connectors + Manus Plugins): **Zotero, Google
  Drive, export to Word/PPT/PDF/Notion, and our MCP surface** (audit item #18).
- **Reality check:** almost none of these have a live backend. So this page is a **catalog** of
  connectors with honest states: **Available** (only what we can honor today — e.g. the existing
  Word/PPT/PDF **export** which already works via `downloadReportExport`, surfaced here as an "export
  targets" section) vs. **Soon** (Zotero, Drive, Notion, MCP).
- **Layout:** `.proj-section` groups ("Import sources", "Export targets", "Developer / MCP"), each a
  `.watch-card-list` of connector rows with a status pill (`.watch-card-pill`) and a connect/learn
  button. Most rows disabled "Soon".
- **Reuses:** `.proj-section*`, `.watch-card*`, `.chip-action`. **Net-new:** static connector catalog
  data + row component.
- **Gate:** route + `NEXT_PUBLIC_WS10_APPS`. Ship **after** Scheduled (lower value; largely static).

### 4.4 Library — `/app/library` — **NEW route, DATALESS today → deferred**

- **Purpose:** the personal evidence library (Elicit/ResearchRabbit/Consensus "My Library"): saved
  papers, uploads, collections, highlights (audit item #13).
- **Blocker:** **there is no backend** — `lib/api.ts` has no saved-papers / uploads / collections /
  highlights functions. A shell with no data is low value and risks reading as vaporware.
- **Decision:** **defer.** Do not ship an empty Library page in this track. It unlocks only after a
  saved-papers/uploads store exists (which also unlocks the composer's *My Library* corpus + PDF/Zotero
  import). When that backend lands, Library reuses `.proj-section*` + `.watch-card*` + `.report-group`
  exactly like the other list pages. Keep the nav item **off** until then.

### Route summary

| Page | Route | New route? | Data | This-track action |
|---|---|---|---|---|
| Scheduled | `/app/scheduled` | **yes** | **live** | **build first** |
| Projects | `/app/projects` | no | live | restyle |
| Apps | `/app/apps` | **yes** | static/partial | build after Scheduled |
| Library | `/app/library` | **yes** | **none** | **defer** |

---

## 5. Slice order (each slice = one flag or one route; smallest-valuable-first)

Discriminator for "best first slice": **a new route** (can't regress existing pages) **+ backed by
data that's already live + visible parity value + graceful pre-migration empty state.**

| # | Slice | Flag / route | Why here | Depends on |
|---|---|---|---|---|
| **1** | **Scheduled page (Missions surfaced)** | `/app/scheduled` + `NEXT_PUBLIC_WS10_SCHEDULED` + nav item | new route (zero regression), Mission data + CRUD already live, big Manus-parity win, safe empty state | none |
| 2 | Nav regroup + gating scaffold | `AppShell.tsx` nav arrays become route-gated groups | makes adding future items safe on the shared rail | slice 1 pattern |
| 3 | Composer launcher **merge** (two popovers → one) + Monitor/Compare/Find-gaps/Verify entries | `NEXT_PUBLIC_WS9_COMPOSER` | pure reorg of existing controls; no engine change; default byte-identical | none |
| 4 | Corpus segmented control (**All/Medical**; My-Library disabled) + filter drawer **UI** with applied-chips | same WS-9 flag | the composer parity centerpiece; sends params, shows state | **WS-3 backend** to make params live; WS-1 for Medical/Q-rank (drawer self-disables absent rows) |
| 5 | "Use a Project as context" attach | WS-9 flag | the one real import we can honor (Projects live) | slice 3 + WS-9 corpus plumbing |
| 6 | Projects page restyle | optional `NEXT_PUBLIC_WS10_PROJECTS_V2` | visual polish, no data change | none |
| 7 | Apps/Connectors catalog | `/app/apps` + `NEXT_PUBLIC_WS10_APPS` | mostly static; surfaces existing export | none |
| — | Library page | `/app/library` | **deferred** until a saved-papers backend exists | new backend (out of track) |

**Recommended first slice: #1 — the Scheduled page surfacing Missions.** It is a brand-new route (so
it can't regress Ask/Reports/Monitor/Projects), its data and full CRUD are already live in
`lib/api.ts`, it renders a clean honest empty state pre-migration, and it lands the clearest
Manus-parity story ("your scheduled research agents") for the least work — while the composer reorg,
being the primary chat flow, carries the highest regression bar and is better done behind a flag after
the shell pattern is proven.

---

## 6. Constraints honored (checklist for every slice)

- [ ] **Pure frontend + read/write existing data.** No new tables in this track (Missions/Projects
      migrations already exist). Library/PDF/Zotero backends are explicitly out of scope.
- [ ] **No engine / safety / ranking changes.** `ask/safety.ts`, retrieval, and grading are untouched.
      WS-9 controls only *collect + show + send* params; the engine consuming them is the separate,
      owner-gated WS-3 slice.
- [ ] **Filters affect retrieval params only, are shown to the user, never silent.** Applied filters
      render as removable chips; a control whose backend isn't live is disabled/"Soon", never
      shown as active.
- [ ] **Reuse existing components.** `EvidencePanel`, `ResearchReportView`, `WatchDetail`,
      `AppModal`, `Skeleton`, and the shell.css class vocabulary (§1) — no parallel design system.
- [ ] **Each surface flag- or route-gated.** New nav items ship in the same slice as their page; no
      dead links on the shared rail. Default (flags off) = current app byte-for-byte.
- [ ] **Honesty doctrine.** Nothing here writes claims or grades; all new surfaces read existing
      computed data.

## Open questions for the owner

1. **Flag naming** — confirm the `NEXT_PUBLIC_WS10_SCHEDULED` / `NEXT_PUBLIC_WS9_COMPOSER` convention
   (matches the existing `NEXT_PUBLIC_WS1_PER_PAPER` pattern).
2. **Scheduled vs. Monitor placement** — the teardown describes a "Scheduled Research" subsection
   inside Monitor, but that was aspirational: a grep of all of `apps/web` for "mission" hits **only
   `lib/api.ts`** — `MonitorPage` never calls `fetchMissions`, so Missions are genuinely unsurfaced
   today (this is what makes slice 1 zero-regression). This doc gives them a top-level `/app/scheduled`.
   Confirm the promotion (recommended: yes, for Manus parity).
3. **WS-3 sequencing** — the composer's filter *values* are inert until the WS-3 backend slice ships.
   Ship the composer UI (slices 3–4) with filters visibly "preview/Soon", or hold slice 4 until WS-3
   is ready so filters are live on first appearance? (Recommend: ship UI early with honest preview.)
