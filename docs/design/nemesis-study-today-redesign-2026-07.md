# Nemesis — Today & Study page modernization (Codex GPT-5.6 consult, 2026-07-12)

> Design direction from a Codex GPT-5.6 (xhigh reasoning) review of
> `apps/desktop/src/app/today/index.tsx` and `apps/desktop/src/app/study/index.tsx`.
> Grounds every recommendation in real symbols in those files. Implement in phases;
> highest-leverage changes are ranked in each section.

The strongest direction is to make Today answer “What should I do now?” and Study answer “What is due, and where should I study it?” Both pages already contain the right data; the main issue is hierarchy.

I’d borrow Library’s calm shell: near-white editor surface, 1px dividers, compact toolbars, restrained typography, and explicit local-file status. Avoid turning either page into a grid of equally loud cards.

## Today

File: [apps/desktop/src/app/today/index.tsx](/Users/axelgalvez/.hermes/hermes-agent/apps/desktop/src/app/today/index.tsx)

### 1. Purpose and current shortcomings

Today should let a student understand their day in five seconds:

- What should I do next?
- What is fixed on my schedule?
- What is becoming urgent?
- Did Nemesis find anything new?
- Is my school data current?

Specific problems in the current implementation:

- The large `Good {greeting}` heading consumes prime space without helping the next decision.
- The “Start here” section uses a 2px crimson border, tinted background, glow, large target icon, and two large buttons. It feels promotional rather than calm.
- `startSchoolSync`, portal status, and the `cadence` `<select>` are embedded inside the next-action card. System maintenance competes with the student’s academic action.
- “Changed since yesterday,” “Due soon,” “Today’s plan,” and “Inbox needs you” all use the same `Card` component in an auto-fit grid. That gives schedule, deadlines, messages, and background changes equal weight.
- `overdue` is calculated and shown in the summary, but there is no clearly labeled overdue section. A serious condition can be reduced to a number in the greeting.
- `needsYou` deduplicates objects across `upcoming`, `overdue`, and `inbox`, but the UI then presents those sources separately. The student still has to reconcile them mentally.
- `plan.slice(0, 5)` can silently hide the rest of today’s schedule.
- “Read your accounts this morning · sent nothing…” is valuable trust information, but the full-width bordered button makes it look like another task.
- Crimson is used on the page label, hero border, hero glow, target icon, trusted changes, schedule times, and ledger icon. The accent stops indicating priority.

### 2. Proposed hierarchy and layout

Use a stable two-column desktop layout. The left side is the day; the right side is attention and system status.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Sunday, Jul 12                                      Synced 18m ago  │
│ Good morning, Axel                                  [Sync school ↻] │
│ 3 things need attention · 1 overdue                                 │
├───────────────────────────────────────┬─────────────────────────────┤
│ NEXT                                  │ NEEDS ATTENTION             │
│ Cardiology exam                       │ ! Lab report · 2d overdue   │
│ Exam in 3 days · weakest preparation  │   Quiz 4 · tomorrow         │
│ [Start 25-minute review]              │   Reply to Dr. Chen         │
├───────────────────────────────────────┤                             │
│ TODAY                                 ├─────────────────────────────┤
│  9:00  Pharmacology lecture           │ SINCE YESTERDAY             │
│ 11:00  Renal review                   │ Exam moved to Friday        │
│  2:00  Lab                            │ 2 new lecture files         │
│       ── 1h 45m open ──               │ [View all changes]          │
│  4:00  Study block                    ├─────────────────────────────┤
│                                       │ SCHOOL CONNECTIONS          │
│ [Open calendar]                       │ ● Blackboard  ● Outlook     │
│                                       │ Auto-sync: Daily            │
└───────────────────────────────────────┴─────────────────────────────┘
  Nemesis read 2 accounts today · no messages or submissions sent
```

Above the fold, in order:

1. Compact date/greeting and freshness status.
2. One next action with one primary CTA.
3. Today’s timeline.
4. Unified “Needs attention” list, with overdue first.
5. Recent changes.
6. School connection and trust details.

On narrower widths, stack: next action → plan → needs attention → changes → connections.

### 3. Component-level changes

#### Add

- `TodayHeader`
  - Compact greeting and date.
  - Add a data-freshness label such as “Synced 18m ago,” derived from the latest graph/source timestamp if available.
  - Place `Sync school` here as a small secondary button.

- `NextActionPanel`
  - Extract the `nextAction` UI.
  - Use a normal 1px border and white/near-white surface.
  - Reserve crimson for a 2–3px leading rule, urgency label, and primary CTA.
  - Rename generic “Start” to the intended action, such as “Start review” or “Prepare with Nemesis.”
  - Keep `startNextAction`, but consider a more focused composer prompt that includes the reason and course.

- `TodayTimeline`
  - Replace the generic `Card` rendering of `plan`.
  - Render every item in chronological order, with a vertical time rail.
  - Show meaningful free windows between timed `PlanItem`s.
  - Put “Any time” tasks in a separate “Flexible” subsection rather than mixing them into clock time.
  - Add “Open calendar” using `CALENDAR_ROUTE`.

- `AttentionList`
  - Merge `overdue`, `upcoming`, and actionable `inbox` objects into one ranked list.
  - Deduplicate by object ID as `needsYou` already does.
  - Sort: overdue → today → tomorrow → later → undated messages.
  - Use a quiet crimson overdue label rather than coloring the whole row.

- `SchoolStatus`
  - Move `portals`, `portalStatus`, and `cadence` out of the hero.
  - Use the same compact, utility-like treatment as Library’s sidebar actions.
  - Replace the raw `<select>` with the shared `Select` component if available.

#### Merge or cut

- Retire the generic four-up `Card` grid.
- Merge “Due soon” and “Inbox needs you” into `AttentionList`.
- Move “Changed since yesterday” below decision-oriented content.
- Show only trusted or high-impact changes initially; place lower-confidence changes behind “View all.”
- Restyle the ledger button as a low-emphasis trust footer with a text link to `LEDGER_ROUTE`.
- Keep the semester empty state, but reduce the icon treatment and make “Set up my semester” the single clear primary action.

#### Shared visual treatment

Follow Library’s patterns:

- `bg-(--ui-editor-surface-background)` for the page.
- `bg-(--ui-bg-elevated)` with 1px `--ui-stroke-tertiary` borders.
- Compact uppercase eyebrows only for small section labels.
- Icon-only utility actions wrapped in `Tip`.
- No glow and no heavy card lift.
- Show local behavior explicitly: “Calendar and school data stored locally” can live in the connection details, not as prominent marketing copy.

### 4. Highest-leverage changes

1. **Merge all urgency into `AttentionList`** — High impact / Medium effort  
   File: `today/index.tsx`  
   Build a derived `attentionItems` memo from `overdue`, `upcoming`, and `inbox`; deduplicate and sort it once.

2. **Turn the generic plan card into a timeline** — High impact / Medium effort  
   File: `today/index.tsx`  
   Reuse `PlanItem.sortMinutes`, `durationMinutes`, `DAY_START_MINUTES`, and `DAY_END_MINUTES`. No new data model is required.

3. **Separate sync plumbing from the next academic action** — High impact / Low effort  
   File: `today/index.tsx`  
   Move `startSchoolSync`, portal dots, and cadence into the header/right rail. Simplify the current highlighted section into `NextActionPanel`.

4. **Reduce accent and card chrome** — Medium impact / Low effort  
   File: `today/index.tsx`  
   Remove `border-2`, the crimson-tinted full background, and glow. Use crimson only for urgency and the primary action.

5. **Make changes progressive rather than equal-priority** — Medium impact / Low effort  
   File: `today/index.tsx`  
   Render trusted `recentChanges` first, cap the initial list, and add a route/link for the full history.

### 5. Today’s “wow” moment

Add a quiet “day runway” inside `TodayTimeline`: a thin 8 AM–10 PM horizontal strip showing occupied blocks, open windows, and a single crimson current-time hairline.

It uses data the page already computes, gives immediate spatial understanding, and feels intelligent without looking like a productivity dashboard. Clicking an open window could prefill chat with: “Plan a focused 45-minute study block from 2:15 PM.”

---

## Study

File: [apps/desktop/src/app/study/index.tsx](/Users/axelgalvez/.hermes/hermes-agent/apps/desktop/src/app/study/index.tsx)

Supporting logic: [retention.ts](/Users/axelgalvez/.hermes/hermes-agent/apps/desktop/src/app/study/retention.ts), [model.ts](/Users/axelgalvez/.hermes/hermes-agent/apps/desktop/src/app/study/model.ts), [extras.ts](/Users/axelgalvez/.hermes/hermes-agent/apps/desktop/src/app/study/extras.ts)

### 1. Purpose and current shortcomings

Study should help the student begin the right review session quickly, while still supporting deck management, tests, mind maps, and deeper performance inspection.

Specific problems:

- The header presents view mode, settings, new section, new deck, import, and “Study all” at the same level. The most important action is surrounded by administration.
- The large 12-month `Heatmap` appears before every deck. It celebrates history before helping the student handle today’s queue.
- `DeckBrowser` combines decks, tests, and mind maps under course sections, but the non-card resources appear only after deck grids. Tests and mind maps read like attachments rather than study modes.
- Section summaries are long strings: due count, deck count, card count, mind-map count, and test count. They are hard to scan.
- `DeckCard` has an implicit primary action: clicking anywhere starts review, while visible buttons say “Match” and “Cards.” The primary behavior is not labeled.
- Every deck card contains a crimson glowing retention curve. Repeating the most visually distinctive element across the grid creates noise.
- The retention copy, “Recall 92% → 68% in 21d,” is useful but lacks context: whether that is healthy, declining, or actionable.
- Card and list views expose different information. `DeckRow` does not show retention; `DeckCard` does.
- The card hover treatment combines lift, ring, crimson border, and a large dark shadow. It is more dramatic than Library or the requested restrained language.
- Review mode uses blue, red, and green remaining counts. That breaks the single-accent system and gives category colors more visual weight than the question.
- `CardBrowser` puts move, delete, match, and add-card controls together. Destructive deck management is too prominent.
- The root file is already over 2,000 lines and contains page orchestration, browser, heatmap, deck cards, review, matching, and dialogs. Redesign work will become difficult to maintain if it remains monolithic.

### 2. Proposed hierarchy and layout

The default page should lead with today’s queue, then courses and resources. Historical activity becomes secondary.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Study                                          [＋] [Import] [⚙]    │
│ 24 due across 3 courses · 18 new                                    │
├─────────────────────────────────────────────────────────────────────┤
│ TODAY'S REVIEW                                                       │
│ 24 cards · about 11 min                                              │
│ New 6   Learning 4   Review 14                 [Start review →]      │
├─────────────────────────────────────────────────────────────────────┤
│ [All] [Decks] [Tests] [Mind maps]       Search…       [▤] [▦]       │
├─────────────────────────────────────────────────────────────────────┤
│ Pharmacology                                      17 due · 5 items   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Autonomics                 12 due     84% recall today          │ │
│ │ 126 cards · 8 new                          [Study] [•••]         │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Antibiotics                 5 due     91% recall today          │ │
│ │ 84 cards · Test: 18/20                     [Study] [•••]         │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Antibiotics concept map                         [Open]           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Renal                                               7 due · 3 items │
│ …                                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Review history  8-day streak · 86% retention             [Expand]   │
└─────────────────────────────────────────────────────────────────────┘
```

Priority:

1. Today’s total review workload and primary start action.
2. Course/deck rows ordered by due count.
3. Search and content filters.
4. Tests and mind maps integrated into the same course resource list.
5. Historical activity in a collapsed or compact footer panel.

### 3. Component-level changes

#### Add

- `StudyCommandBar`
  - Replace the current large action cluster.
  - Keep “Study” title and quiet totals on the left.
  - Use one primary `Start review` button.
  - Put “New deck,” “New section,” and “Import cards” behind one `+` menu.
  - Retain `settingsOpen` as an icon button with `Tip`.

- `ReviewBrief`
  - Use `totals`, `remainingCounts`-style categories, and an estimated duration.
  - Even a simple initial estimate such as `due * averageSecondsPerCard` can be locally derived and refined later from review history.
  - Primary action calls `startReview(null)`.
  - If nothing is due, show “You’re caught up” and offer “Practice new cards” only when `totals.fresh > 0`.

- `StudyFilters`
  - Add lightweight state for `query` and content type: `all | decks | tests | mindmaps`.
  - Keep the existing card/list preference, but make list the default for a calmer, denser student experience.
  - Search deck names, test titles, mind-map titles, and course names locally.

- `CourseSection`
  - Extract the group rendering from `DeckBrowser`.
  - Replace the long metadata sentence with two compact values: “17 due” and “5 items.”
  - Order courses by due count, then alphabetically; place “Other” last.
  - Persist collapse behavior using the existing `collapsedSections`.

- `StudyResourceRow`
  - Give deck, test, and mind-map rows a shared structural rhythm:
    - Type icon
    - Title and metadata
    - Relevant outcome
    - One explicit primary action
    - Overflow menu
  - Deck row: “Study.”
  - Test row: “Start” or “Retake.”
  - Mind-map row: “Open.”

- `DeckActionsMenu`
  - Move “Cards,” “Match,” move section, and delete into a `•••` menu.
  - In `CardBrowser`, keep “Add card” visible; move “Delete deck” into the menu with confirmation.

#### Change

- Make `DeckRow` the primary representation.
  - Explicitly render a `Study` button.
  - Clicking the row can open deck details rather than silently starting review.
  - Show “84% recall today” using the first point of `deckRetentionCurve`.
  - Keep a small, non-glowing sparkline only for the selected or hovered row.

- Downgrade `Heatmap`.
  - Rename to `ReviewHistory`.
  - Default to a compact summary row: streak, 30-day retention, reviews this week.
  - Expand the 12-month grid on demand.
  - Move it below course content.

- Refine `RetentionSparkline`.
  - Remove the SVG glow filter and large area fill.
  - Use a 1px neutral line with a crimson endpoint or threshold segment.
  - Label the useful present value first: “84% recall now.”
  - Secondary label: “Projected 68% in 21 days.”
  - Add a tooltip explaining that this is an FSRS estimate based only on reviewed cards.

- Simplify `ReviewSurface`.
  - Keep the question card and grading controls centered.
  - Replace blue/red/green remaining counts with neutral text and one crimson active indicator.
  - Use crimson for “Again” only; keep Hard/Good/Easy neutral.
  - Preserve keyboard shortcuts and `showIntervalHints`.
  - Add subtle progress such as “18 of 32,” if the initial queue length is captured when the session begins.

- Restyle deck surfaces.
  - Replace `rounded-2xl`, lift, ring, glow, and dark shadow with Library-like 1px rows.
  - Use hover background and border change only.
  - Keep `DuePill`, but reduce its fill to a faint tint or crimson text on a neutral pill.

#### Split the file

A practical extraction:

```text
study/
  index.tsx                  page state and mode routing
  study-command-bar.tsx
  review-brief.tsx
  deck-browser.tsx
  course-section.tsx
  study-resource-row.tsx
  retention-sparkline.tsx
  review-history.tsx
  card-browser.tsx
  review-surface.tsx
  dialogs/
```

This is a natural focused-module extraction, not new infrastructure.

### 4. Highest-leverage changes

1. **Add `ReviewBrief` and reduce the header to one primary action** — High impact / Low–Medium effort  
   File: `study/index.tsx`  
   Reuse `totals` and `startReview(null)`; consolidate creation actions into a menu.

2. **Move `Heatmap` below decks and collapse it by default** — High impact / Low effort  
   File: `study/index.tsx`  
   Preserve all existing calculations but present a compact `ReviewHistorySummary` before expansion.

3. **Replace ambiguous clickable deck cards with explicit resource rows** — High impact / Medium effort  
   File: `study/index.tsx`, ideally extracted to `study-resource-row.tsx`  
   Make “Study” visible and move Match/Cards/management into overflow actions.

4. **Unify decks, tests, and mind maps with content filters** — Medium–High impact / Medium effort  
   Files: `study/index.tsx`, `extras.ts`  
   Filter the existing `StudySectionGroup` data; no filesystem format changes are needed.

5. **Calm and clarify retention visuals** — Medium impact / Low effort  
   Files: `study/index.tsx`, `retention.ts`  
   Keep `deckRetentionCurve`; remove the glow, lead with present recall, and expose the curve consistently in list and card views.

### 5. Study’s “wow” moment

Make the per-deck retention curve inspectable.

On hover or keyboard focus, reveal a small crosshair and tooltip over the existing 21-day points:

> Jul 19 · estimated recall 78%

The row can then say:

> Review 12 due cards today

This connects FSRS to an understandable memory forecast without inventing a score, adding gamification, or requiring the cloud. It is especially appropriate for health-science material where “Will I still know this next week?” is more meaningful than a generic progress percentage.

