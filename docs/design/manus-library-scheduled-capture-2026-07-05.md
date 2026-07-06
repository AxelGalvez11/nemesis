# Manus Library + Scheduled — live capture 2026-07-05 (logged-in DOM inspection)

Captured in the owner's Chrome via extension (screenshots + accessibility-tree reads), manus.im
desktop web, dark theme. Complements docs/design/manus-parity-spec.md and manus-design-tokens.md.

## Library (`/app/library`)

**Topbar**: page title "Library" only (left-aligned, plain).

**Toolbar row** (below title):
- Left: filter chip `[filter icon] All ⌄` + chip `[star icon] My favorites` (outline chips, radius ~999px).
- Right: `Search files` input (search icon, subtle surface, ~260px) + icon-only view toggle pair
  (grid / list), active state = filled surface.

**Filter dropdown** (opens under the All chip): checkable menu, active row shows trailing ✓.
Items (each with leading icon): All · Slides · Websites · Documents · Images & Videos · Audio ·
Spreadsheets · Others.

**Content — grid view**: sections grouped by SOURCE TASK, not by file type.
- Section header: task name (semibold, ~15px) left; relative timestamp right ("Yesterday, 4:38 PM",
  text-3 color).
- Cards (~300px wide): header row = file-type icon + truncated filename + `…` overflow menu;
  body = live preview thumbnail (rendered first slide for decks, rendered markdown for .md files)
  on a light surface even in dark mode (the artifact renders in its own light context).
- Clicking a card opens the artifact; section header links to the source task (`/app/<taskId>`).

**Content — list view**: same task-grouped sections; rows = file-type icon + full filename + `…`
menu on hover, no preview thumbnails.

**Sidebar context** (unchanged from parity spec): New task / Agent / Plugins / Scheduled / Library,
Projects (+), Tasks list with per-type icons, bottom notification-permission card
("Turn on browser notifications when tasks complete." — [Not now] [Turn on]), user footer.

## Scheduled (`/app/scheduled`)

**Tabs** under the "Scheduled" title: `Calendar` | `Tasks` (underline on active tab; URL
`?tab=calendar` / `?tab=tasks`).

**Empty state** (shared by both tabs):
- Centered illustration (calendar grid graphic with a floating `+` badge).
- H2: "Manus works independently, without you asking".
- Three full-width suggestion rows (icon left, text, arrow-right on the far right; outline cards):
  1. (bell/monitor icon) "Set up automated monitoring for any topic, competitor, or keyword."
  2. (list icon) "Get a daily summary on what's in your inbox and schedule before starting your day"
  3. (pipeline icon) "Turn manual processes into scheduled automated pipelines."
  Clicking a row pre-fills the create dialog.
- Primary button: `+ Create your scheduled task` (filled, centered).

**Create dialog** (`#scheduled-tasks/new`, modal ~660px):
- Title: "New scheduled task", `×` close top-right.
- `Title` text input — placeholder "Summary of unread mail".
- `Schedule` row: cadence select (Daily ⌄) + time select (08:00 ⌄) side by side.
  Cadence options: **Daily · Weekly · Monthly · No Repeat** (checkmark on active).
- `Set expiration date` checkbox → when checked reveals a `Select expiration date` date input
  (calendar icon).
- `Prompt` textarea — placeholder "Summarize unread emails and highlight important messages".
- `Skip confirmations` card: label + sub "No approval needed before sending, publishing, or
  posting." + right-aligned toggle (default OFF).
- `Advanced settings` expander: sub "Manage run options, agent type, connectors, and project or
  cloud computer usage." Expanded shows `Run options` ("Choose whether each run starts in the same
  task or a separate task.") with select `Same task ⌄`, plus further rows below (agent type,
  connectors, project/cloud-computer per the sub-label).
- Footer right: `Cancel` (ghost) · `Save` (filled).

## PharmaOrb mapping notes

- Our Scheduled page (apps/web/app/app/scheduled/page.tsx, shipped in the reskin merge) should be
  checked against: tab pair + empty-state anatomy (illustration/H2/3 suggestion rows/create button),
  and the create dialog field-for-field (our equivalent = mission create: title, cadence
  Daily/Weekly/Monthly/No Repeat + time, prompt, expiration, advanced expander). "Skip
  confirmations" has no PharmaOrb equivalent yet (missions don't publish externally) — omit, don't
  fake it.
- Our Library (apps/web/app/app/reports) should group by SOURCE (chat/mission/report run) with
  relative-time headers, offer grid/list toggle + type filter chip menu (our types: Reports ·
  Posters · Slides · Documents · Others), favorites chip, and live preview thumbnails for
  deliverables (report first page / poster render).
