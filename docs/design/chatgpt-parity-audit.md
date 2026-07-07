# ChatGPT design-parity audit — PharmaOrb web app

**Scope:** read-only audit of the *shipped* UI (`origin/main`, commit `674e100`) against the ChatGPT
app conventions supplied in the audit brief. No app code was changed. Files cited are real paths under
`apps/web/`; line numbers match `origin/main`.

**Method note:** I could not re-inspect the live ChatGPT app, so "ChatGPT does X" is anchored to the
conventions in the brief, described **directionally** where an exact pixel isn't given. Our own values
are cited **precisely** from source. Several of our numbers are already tagged "ChatGPT-measured" in
`shell.css` (768px composer, 28px radius, 738px thread column) — those we trust as intentional matches.

---

## 1. Executive read

1. **We are already high-parity on the core chat surfaces.** The shell (tinted rail | flat topbar |
   chat), the composer pill, the centered welcome, and Settings are close, deliberate ports of the
   ChatGPT pattern — `shell.css` is littered with "ChatGPT-measured / ChatGPT-style" comments and the
   measurements back that up (768px composer, 28px radius, 738px thread, calm neutral palette, one
   accent).
2. **The honest headline: most of what's "different" is intentional and moat-serving, not a parity
   failure.** Evidence panel, trust/support pills, safety callouts, the evidence map, drug pages,
   Library-with-exports, Scheduled, and Projects-with-Map have no ChatGPT equivalent. Copying ChatGPT
   there would *delete* the product. Those live in section 3, not the punch-list.
3. **Pixel-parity is NOT worth chasing as a goal.** It's worth chasing *polish parity* — the calm,
   restrained, no-rough-edges feel. The cheap wins below buy that feel; a pixel-for-pixel clone would
   cost us the evidence chrome that is the whole point.
4. **Where we genuinely diverge from a convention and it costs us:** the sidebar has no **Pinned
   section** and no inline **Projects list** or **Apps/connectors** (only a single "Projects" link);
   the composer **"+" menu is not searchable**; Library **gates its search behind >6 items** and
   centers "New report" instead of a persistent top-right action; and **Scheduled uses a raw native
   `<select>`** for cadence, which is the one visibly un-designed control in the app.
5. **Net verdict:** ~80% parity on the surfaces where parity is the right target. The remaining 20% is
   ~5 cheap chrome fixes plus 2 structural sidebar decisions that need an owner call. Lead with "we're
   close," fix the rough edges, and keep the evidence chrome exactly where it diverges on purpose.

---

## 2. Per-surface punch-list

Severity = user-perceived polish/confusion cost. Effort: **S** ≤ half-day, **M** ~1–2 days, **L** multi-day / needs design.

### 2.1 Sidebar — `components/AppShell.tsx`, `shell.css` (`.rail` block ~L61–139)

Overall: close. Brand, New chat, Search, nav, account footer are all present and calmly styled
(`.hist.active` is a plain fill, no accent bar — correct ChatGPT choice, `shell.css:104`). The gaps are
about **sections that don't exist**, not styling of what's there.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| No **Pinned** section | Dedicated "Pinned" group above Recent | Pinned chats just **sort to the top** of Recent with a pin glyph (`AppShell.tsx:172–183, 469`) | Med | S | Split `visibleChats` into `pinned` / `rest`; render a `.r-label`"Pinned" group when `pinned.length>0`, then the "Recent chats" group. Pure client grouping — pin data already exists. |
| No inline **Projects list** | Projects section lists the actual projects, expandable | Single static "Projects" link to `/app/projects` (`AppShell.tsx:428–431`) | Med | M | Fetch top N projects (`fetchProjects` already imported, used by row-menu), render under the "Projects" label as `.hist` rows with the folder icon; keep "Projects" as an "All projects" footer link. |
| No **Apps / connectors** entry | "Apps" section for connectors | Absent | Low | — | Intentional for now — we have no connector surface. Note as a *known non-goal*, not a fix. Don't add an empty section. |
| "New chat" label vs affordance | New chat is a quiet full-width row | Matches — quiet surface, thin border, no accent fill (`shell.css:73–80`) | — | — | **Already parity.** No action. |
| Collapsed rail = icon rail | Collapses to icon rail w/ tooltips | Matches — `rail-collapsed` hides labels, centers icons, persists to localStorage (`AppShell.tsx:90–93`, `shell.css:68–70,133`) | — | — | **Already parity.** No action. |
| Account row at bottom | Avatar + name + menu (Settings/Sign out) | Matches — `.acct-wrap` with initials, plan+usage sub, popover menu (`AppShell.tsx:490–505`) | — | — | **Already parity.** Minor: consider adding "Billing" as a direct menu item (currently only inside Settings). |
| Sidebar search scope | Searches chats | Matches, and honestly scoped to loaded Recent chats (`AppShell.tsx:109–111`) | Low | — | Fine. Placeholder could read "Search chats" (it does). No action. |

### 2.2 Chat landing (welcome) — `app/app/ask/page.tsx` (`!hasThread` branch L581–611)

Overall: **near-exact match** to the stated convention (centered orb + greeting + composer + one row of
at most three ghost chips). The code comment even states the intent verbatim (`ask-page.tsx:592–594`).
Do not invent gaps here.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| Greeting + centered composer | Centered greeting + composer, generous rhythm | Matches — `Orb size=56`, `.welcome-title` 28px/700, composer, then chips (`shell.css:644–655`) | — | — | **Already parity.** |
| One row of quiet ghost chips | At most one row of ghost suggestions | Matches — exactly 3 chips (Verify a claim / Deep research / Is this good for me?) `ask-page.tsx:596–606` | — | — | **Already parity.** |
| Chip visual weight | Very quiet, ghost | `.chip-action` is a bordered pill, slightly heavier than ChatGPT's near-borderless ghost (`shell.css:568`) | Low | S | Optional: drop the chip border to a transparent/hover-only outline on the welcome variant so they read as ghost, not buttons. Taste call — current is fine. |

### 2.3 Composer + "+" menu — `ask-page.tsx` Composer (L735–903), `shell.css` (`.box`/`.tool`/`.mode` L580–642)

Overall: strong. Pill geometry, bottom-anchored controls, ghost in-pill buttons, mic on the right,
inline depth dial, send — all present and ChatGPT-measured. The one real gap is that the "+" menu is a
static list, not a searchable, benefit-lined connectors-and-actions menu.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| "+" menu not **searchable** | Single searchable menu mixing actions + connectors | Static grouped popover (Tools / Skills / Playbooks / Filters), no search field (`ask-page.tsx:757–838`) | Med | M | Add a sticky search input at the top of `.tools-menu`; filter the rendered rows by label substring. The menu already has ~4 sections and grows — search earns its place. |
| Benefit line per action | 3-word benefit line, e.g. "Deep research — Get a detailed report" | We **already do this** — each row has a `<small>` benefit ("cited report + pooled stats", "gaps & hypotheses") `ask-page.tsx:763–836` | — | — | **Already parity.** Good pattern, keep it. |
| Footer "search plugins, files & skills" | Menu footer hint line | No footer hint; menu just ends | Low | S | Add a muted footer row to `.tools-menu` describing scope, or fold into the search placeholder from the fix above. |
| Model/effort picker inline | Effort/model picker in the bar | Matches — the right `.mode` dial is the depth picker (Auto/Fast/Thorough) `ask-page.tsx:854–881` | — | — | **Already parity** (our dial is depth, not model — correct for us). |
| Mic + voice on the right | Mic + voice affordances | Mic present with live recording state (`.tool.rec` pulse) `ask-page.tsx:882–892`; no separate "voice mode" | Low | — | Voice-mode is a ChatGPT-specific feature we don't offer. Mic/dictation is the right subset. No action. |
| "+" glyph vs "Tools" label | "+" opens the menu | Matches — "+" icon, `aria-label="Tools"` (`ask-page.tsx:754`) | — | — | **Already parity.** |
| Disabled "Soon" rows in menu | — | We show honest disabled rows (News only / Communities / Add files) `ask-page.tsx:824–833` | — | — | Honest, keep. Slightly heavier than ChatGPT's cleaner menu, but the honesty is on-brand. |

### 2.4 Library — `app/app/reports/page.tsx`

**Read this section with the content-model split in mind (see §3):** ChatGPT's Library is a file/image
manager (tabs All/Images/Files, thumbnails, sortable Name/Modified/Size columns, grid/list toggle).
**Ours is a reports library** — deep-research reports with citation counts and Word/PPTX export. Reports
have no thumbnail, no "image" type, and no natural Size column. So most of the ChatGPT Library spec does
**not** map and is **not** a gap. What still applies is the surrounding chrome.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| Search **gated behind >6 items** | Persistent search box | Search only renders when `reports.length > 6` (`reports/page.tsx:56,69`) | Low | S | Always render the search box (disabled/empty when list is short), or lower the threshold. Consistency > cleverness. |
| "New" action placement | "New" button **top-right**, persistent | "New report" is **centered** under the intro orb (`reports/page.tsx:64–66`) | Low | S | Move a "New report" action to a top-right header row so it's a stable, discoverable target (matches ChatGPT + our own Projects/Scheduled headers). |
| No persistent header/toolbar | Header with title + tabs + search + New + view toggle | Centered orb + title + sub + centered New (`reports/page.tsx:59–67`) | Low | M | Optional: convert the intro to a left-aligned page header (title left, actions right) for a more "app surface" feel. Taste call; centered-orb reads friendlier and is used consistently across our list pages. |
| Type tabs (All/Images/Files) | Type tabs | We group **by report kind** (Deep research / Discovery / Lab drafts) with headers only when 2+ kinds exist (`reports/page.tsx:84–111`) | — | — | **Intentional, better for us** — see §3. Report-kind grouping is the right analog; do NOT add Images/Files tabs. |
| Grid/list toggle, thumbnails, sortable columns | Yes | No | — | — | **Not applicable** — reports aren't files with thumbnails or a Size dimension. Explicitly a non-gap. |

### 2.5 Settings — `components/SettingsSurface.tsx`, `shell.css` (`.settings-*` L1165–1218)

Overall: **this is the closest surface to ChatGPT** — the brief itself says "left-nav tabbed surface
(which we have)." Left section nav (General/Account/Billing/Usage/About) + content pane, sticky nav,
active-state fill, responsive collapse to a horizontal scroller at ≤680px. It's essentially done.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| Left-nav tabbed surface | Yes | Matches — `.settings-surface` grid, `.settings-nav` sticky, section content pane (`SettingsSurface.tsx:74–150`, `shell.css:1166–1178`) | — | — | **Already parity.** |
| Appearance = theme cards | Theme choices | Matches, arguably nicer — mini-app preview swatches per theme (rail+page+accent dot) `SettingsSurface.tsx:96–115`, `shell.css:1181–1208` | — | — | **Already parity / ahead.** |
| Section set | Account / general / data controls / etc. | General / Account / Billing / Usage / About — sensible mapping | Low | — | No action. Content is ours (billing, usage credits, data sources) and correctly so. |

### 2.6 Projects — `app/app/projects/page.tsx` (list) + `projects/[id]/page.tsx` (workspace)

Overall: structurally close to ChatGPT Projects — a "New chat in this project" composer, tabbed
contents, add-from-unassigned picker, per-project settings modal with **instructions**
(`projects/[id]/page.tsx:123–232`). Plus a **Map tab** that is pure moat divergence (§3). The gaps are
minor styling/consistency, not missing capability.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| Project workspace shape | New-chat composer + grouped contents + settings/instructions | Matches — `.watch-add` composer, tabbed Chats/Reports/Monitoring, `.proj-picker`, settings modal with instructions (`projects/[id]/page.tsx:124–135,143–160,247–331`) | — | — | **Already parity.** Strong surface. |
| Content tabs use **chip** styling | Underlined/section tabs | Tabs are `.chip-action` pills (`projects/[id]/page.tsx:143–160`) — reads slightly more "filter chips" than "tabs" | Low | S | Optional: give the active tab an underline treatment (reuse `.ev-tab.active::after` pattern) for a clearer tab metaphor. Cosmetic. |
| Settings modal reuses **confirm-card** | Dedicated settings dialog | The project settings modal is built on `.confirm-overlay/.confirm-card` (`projects/[id]/page.tsx:300–301`) with inline style overrides | Low | S | Fine as-is; if it grows, promote to the `.app-modal` surface for consistency with Settings. |
| List page "New project" | Persistent create affordance | Inline `.watch-add` name field + Create button (`projects/page.tsx:56–70`) — good, consistent with other list pages | — | — | **Already parity.** |

### 2.7 Scheduled — `app/app/scheduled/page.tsx`

Overall: coherent and consistent with our other list surfaces (intro orb, `.watch-add` composer,
suggestion chips, grouped Missions/Monitors). One genuine rough edge: a **raw native `<select>`** for
cadence, which is the single most visibly un-designed control in the app.

| What differs | ChatGPT does | We do | Sev | Effort | Fix sketch |
|---|---|---|---|---|---|
| Native `<select>` for cadence | Custom styled dropdowns everywhere | `<select className="mode">` — a native OS dropdown inside the composer row (`scheduled/page.tsx:153–157`) | **Med** | M | Replace with a custom dropdown matching the composer `.mode` menu pattern (`.acct-menu` popover with menuitems), like the depth dial in Ask. This is the highest-visibility styling rough edge. |
| Pause/Resume/Delete = text buttons | — | `.proj-remove` bare text buttons in the card row (`scheduled/page.tsx:190–191,217`) | Low | S | Acceptable; if desired, give destructive "Delete" the danger hover (reuse `.proj-remove:hover` which already tints danger). Already handled — no action. |
| Suggestion chips carry emoji | Quiet ghost chips | Emoji-led chips (`scheduled/page.tsx:166–172`) — slightly louder than ChatGPT's text-only ghosts | Low | S | Optional: drop emoji or keep — this is a discovery surface, emoji reads friendly. Taste call. |
| Scheduled as a first-class nav item | ChatGPT has a "Scheduled" entry | Matches — it's in the workspace nav (`AppShell.tsx:47`), and Monitoring folded into it (one automation surface) | — | — | **Already parity / cleaner.** |

---

## 3. What we should NOT copy (correct, moat-serving divergence)

These are **not** parity failures. Copying ChatGPT here would delete the product's reason to exist.

- **Evidence panel** (`shell.css:657–830`, `AppShell.tsx:547–565`) — the right-side cited/reviewed
  sources column with breakdown header, resizable + fullscreen. ChatGPT has no evidence surface. This
  is the product. Keep.
- **Inline citation pills + per-claim evidence meter** (`shell.css:292–312`) — favicon-chip citations
  and the strong/moderate/limited/contested meter. This is the honesty layer. ChatGPT's inline cites
  are thinner and (per our own strategy notes) often fabricated; ours are real and graded. Keep.
- **Trust/support/relation/study-type/DOAJ/retraction pills** (`shell.css:719–760`) — provenance and
  claim-support signals on source cards. Directly opposed to ChatGPT's opaque answer. Keep.
- **Safety callout + point-of-use disclaimer** (`shell.css:243–247`, composer disclaimer `:634`) — a
  conservative medical app *must* keep the safety block prominent and the disclaimer visible.
  ChatGPT-style minimalism here would be a liability. Keep.
- **Evidence map / Research Map** (`shell.css:769–799`, Projects Map tab) — the scatter/graph of the
  evidence base. No ChatGPT analog. A differentiator. Keep.
- **Library-with-exports & report-kind grouping** — reports + Word/PPTX + citation-style toggle
  (`shell.css:879–891`). ChatGPT's file-manager Library is the wrong model for cited research
  deliverables. Keep our kind-grouped reports library; do **not** bolt on Images/Files tabs, thumbnails,
  or a Size column.
- **Scheduled (missions + monitors) & Monitoring alert lanes** (`shell.css:968–1329`) — background
  research → cited reports, LOUD/QUIET/walled-off news lanes. This is agentic evidence surveillance,
  not a chat feature. Keep, including the deliberate visual separation of "news = not citable."
- **Drug pages / molecule thumbnails / compute cards** — domain surfaces with no chat equivalent. Keep.
- **The Orb** (`shell.css:4–47`) — our brand mark and its thinking/bloom motion. This is identity, not
  chrome to neutralize. Keep.

Guiding rule: copy ChatGPT's **calm** (spacing, one accent, soft transitions, restraint); never copy its
**opacity** (no sources, no grades, no safety). The moat is everything in this section.

---

## 4. Prioritized closing plan

Ordered for maximum perceived-polish per unit effort. Grouped for an implementation-plan writer. All are
**presentation-only** unless flagged.

### Group A — Cheap wins (High-value / Small effort) — do first

1. **Sidebar: Pinned section.** Split `visibleChats` into pinned/rest, render a "Pinned" `.r-label`
   group when non-empty, above "Recent chats." (`AppShell.tsx:433–487`). *Pure execution.* — **S**
2. **Scheduled: replace native `<select>` cadence with a custom dropdown** matching the Ask depth dial
   (`.mode` button + `.acct-menu` popover). Removes the one un-designed control. (`scheduled/page.tsx:153`).
   *Pure execution* (reuse existing popover pattern). — **M** (S if a small shared `<Dropdown>` already fits)
3. **Library: always-on search + top-right "New report."** Drop the `>6` gate (`reports/page.tsx:56`);
   move "New report" from centered to a top-right header action (`:64`). *Pure execution.* — **S**
4. **Composer "+" menu: add a search field** at the top of `.tools-menu`, filter rows by label. Closes
   the one real composer gap. (`ask-page.tsx:757–838`). *Pure execution.* — **M**
5. **Composer "+" menu: footer hint line** ("Search actions, skills & filters") for the ChatGPT footer
   feel. Can be the search placeholder from #4. — **S**

### Group B — Medium (structural / consistency)

6. **Sidebar: inline Projects list** — render top N projects under the Projects label as `.hist` rows,
   keep "All projects" as the footer link. (`AppShell.tsx:425–431`). Needs a small fetch + a decision on
   count/ordering. *Mostly execution; minor design.* — **M**
7. **Projects workspace: tab styling** — give active content tabs an underline (reuse
   `.ev-tab.active::after`) instead of chip-fill, for a clearer tab metaphor. (`projects/[id]/page.tsx:143`).
   *Cosmetic.* — **S**
8. **Welcome chips: lighten to true ghosts** (border → hover-only) if we want stricter ChatGPT feel.
   (`shell.css:568,653`). *Cosmetic, taste.* — **S**

### Flagged — needs an owner DESIGN DECISION (not pure execution)

- **D1. Apps / connectors in the sidebar.** ChatGPT has an "Apps" section. We have no connector surface.
  **Decision:** commit to a connectors story (and add the section) or formally declare it a non-goal.
  Do **not** ship an empty section. *This is product scope, not styling.*
- **D2. Library page shell — centered-orb intro vs left-aligned app header.** Every list page (Library,
  Projects, Scheduled) uses the friendly centered orb + title. ChatGPT uses a denser left-aligned header
  with a persistent toolbar. **Decision:** keep the warm centered identity across list pages, or move to
  a denser app-header system-wide. This is a **system-wide visual-language call**, not a one-page fix —
  worth deciding once and applying consistently.

Everything in Groups A and B is safe, presentation-only, and independently shippable. D1/D2 should be
answered before touching Library's header (#3 is compatible with either D2 outcome — it just relocates
the New action).

---

## Appendix — surfaces judged already at parity (no action)

New-chat row, collapsed icon rail, account footer, the centered welcome + 3 ghost chips, composer pill
geometry (768/28/738), in-pill ghost buttons, depth dial, mic/dictation, per-action benefit lines in the
"+" menu, the entire Settings surface, theme preview cards, Projects workspace shape, and Scheduled's nav
placement. Calling these out so the plan writer doesn't "fix" things that are already right.
