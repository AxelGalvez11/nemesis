# ChatGPT reference — MEASURED off the live signed-in app, 2026-08-26, viewport 1456px

> 🔴 WHY THIS FILE IS IN THE REPO. The owner's acceptance condition for the Projects and Library
> pages was *"match ChatGPT's pixel, sizing and spacing and coloring 1 to 1"*, followed by
> *"Don't just measure with vision. Make sure that you actually grab the numbers too."* A number
> nobody can re-derive is a number that rots the first time somebody nudges a padding. Every value
> below is a real `getComputedStyle` / `getBoundingClientRect` call made on chatgpt.com while signed
> in — none of it was read off a screenshot or estimated by eye.
>
> To check our side against it, start the web app and run the harness from the repo root:
>
>     node measure.mjs "http://localhost:<port>/projects" projects
>
> It probes the identical properties on our page, prints an expected-vs-got table and exits non-zero
> on any mismatch. The second argument picks the expectation set: `projects` / `library` use the
> list numbers, `plugins` uses the grid ones.
>
> 🔴 IT NEEDS REAL CHROME (headless), which is why it launches Playwright rather than using the
> in-app browser pane: that pane keeps its tab `document.hidden`, so `requestAnimationFrame` never
> fires and anything the character draws is a frozen, faceless disc.
>
> 🔴 ROWS CANNOT BE MEASURED ON A SIGNED-OUT PAGE. A local dev server has no Supabase credentials,
> so every request is `ERR_CONNECTION_REFUSED` and the shelves render empty. Point the harness at
> the ungated preview instead — `/dev-preview/projects` mounts the real component with fixture rows,
> which is what makes the row geometry checkable at all.
>
> 🔴 ONE VALUE IS DELIBERATELY NOT COPIED: the dark page ground. The reference uses `#181818`; every
> page in this product is black in dark mode, and matching the reference here would make these two
> pages the only ones that differ from the rest of the app. What IS copied is the reference's dark
> RELATIONSHIPS — the 5% divider, the 10% row hover, the `#414141` selected pill.
>
> Re-measure rather than trust this file if the reference has visibly changed; note the date above.

## 1. COLOUR TOKENS

### Light (`html.light`)
| token | value |
|---|---|
| `--bg-primary` | `#ffffff` |
| `--bg-secondary` | `#e8e8e8` |
| `--bg-secondary-surface` | `#f9f9f9` |
| `--bg-tertiary` | `#f3f3f3` |
| `--bg-elevated-primary` | `#ffffff` |
| `--bg-elevated-secondary` | `#f3f3f3` |
| `--component-sidebar-bg` | `#fcfcfc` — **also the page background** |
| `--text-primary` | `#0d0d0d` |
| `--text-secondary` | `#5d5d5d` |
| `--text-tertiary` | `#8f8f8f` |
| `--icon-primary` | `#0d0d0d` |
| `--icon-secondary` | `#5d5d5d` |
| `--border-default` | `rgba(0,0,0,0.10)` |
| `--border-light` | `rgba(0,0,0,0.05)` |
| `--border-heavy` | `rgba(0,0,0,0.15)` |
| `--interactive-bg-primary-default` | `#0d0d0d` (the black New button) |
| `--interactive-bg-primary-hover` | `rgba(0,0,0,0.80)` |
| `--interactive-bg-secondary-hover` | `rgba(0,0,0,0.05)` (row + sidebar hover) |
| `--interactive-bg-control-default` | `#e3e3e3` |

### Dark (`html.dark`)
| token | value |
|---|---|
| `--bg-primary` | `#212121` |
| `--bg-secondary` | `#303030` |
| `--bg-tertiary` | `#414141` |
| `--bg-elevated-primary` | `#303030` |
| `--component-sidebar-bg` | `#181818` |
| `--text-primary` | `#ffffff` |
| `--text-secondary` | `#cdcdcd` |
| `--text-tertiary` | `#afafaf` |
| `--icon-primary` | `#ffffff` |
| `--icon-secondary` | `#cdcdcd` |
| `--border-default` | `rgba(255,255,255,0.15)` |
| `--border-light` | `rgba(255,255,255,0.05)` |
| `--border-heavy` | `rgba(255,255,255,0.20)` |
| `--interactive-bg-primary-default` | `#ffffff` |
| `--interactive-bg-secondary-hover` | `rgba(255,255,255,0.10)` |

Accents: blue `#3a83f7`, green `#53b559`, orange `#ee7c37`, yellow `#f6c543`,
pink `#f077af`, neutral `#8f8f8f`.

## 2. THE SHARED PAGE FRAME (identical on Projects, Library and Plugins)

- Sidebar width **260px**; page background is `--component-sidebar-bg`, NOT white.
- Content column is **768px wide**, horizontally centred in the remaining space
  (at 1456px viewport it starts at x=481 on Projects/Plugins, x=513 on Library —
  Library's own container is inset differently; treat **768px max-width, centred** as the rule).
- Page title: **28px / weight 500 / line-height 34px / `--text-primary`**, top at y=116.
- Optional subtitle directly under it: **16px / weight 400 / `--text-secondary`**.
- Search input, right-aligned on the title row: **height 36px**, font **14px**, rounded full,
  240px wide (Library) to 240-280px (Plugins). Leading magnifier icon.
- Primary button ("New"): black pill, `--interactive-bg-primary-default`, height 36px.

### Filter pills row (Library "All / Images / Documents", Projects "All / Created by you / Shared with you")
- **height 36px, padding `0 16px`, border-radius full**
- font **14px / weight 500 / line-height 20px**
- selected: background `--bg-tertiary` (`#f3f3f3`), colour `--text-primary`
- unselected: background transparent, colour `--text-secondary`
- pills sit at y=204 (i.e. 88px below the title's top)

## 3. THE LIST (Projects page, and Library's list view)

- Row **width 768px, height 60px**
- Row padding: `10px 8px 10px 0`
- **Bottom border `1px solid --border-light`** on every row (this is the only divider)
- Row hover: background `--interactive-bg-secondary-hover`
- Leading icon **20x20**, colour `--icon-secondary`, then a gap to the name
- Name text: **14px / weight 400 / `--text-primary`**, truncates with ellipsis
- Column headers above the list: **14px / weight 400 / `--text-secondary`**, 20px tall
- Library column widths at 1456px: **Name 368 / Modified 160 / Size 88** (Size has `padding-left:16px`)
- Projects columns: **Name / Modified** only
- Meta cells (dates, sizes): 14px, `--text-secondary`

### What these numbers do NOT settle (added 2026-08-26 — NOT a measurement)

Everything above this heading was read off the live app. The two notes below were not: they are
what the Library and Projects pages agreed to do where the measurements are silent. Do not cite
them as ChatGPT's behaviour.

1. **Does `Name 368` include the leading icon?** The measurements cannot say — the icon's 20x20
   and "a gap to the name" are recorded separately, and both readings satisfy every published
   width. It is not a detail: the two pages picked different answers and ended up 32px apart, and
   the tell was that the `Name` column heading sat above a column of ICONS rather than above the
   names it labels. **Both pages now put the icon OUTSIDE the Name column**, behind a 32px lead
   (20px icon + 12px gap), so the heading and the names share one left edge and a title truncates
   at the same character on either page.

2. **The cells pack from the left and stop; they are not right-aligned.** Both pages were
   measured by reading each row's own children off the live page, and both rows account for every
   pixel of the 768px column:

       Library   32 lead + 616 cells (368 + 160 + 88) + 112 empty tail + 8 right padding = 768
       Projects  32 lead + 528 cells (368 + 160)      + 200 empty tail + 8 right padding = 768

   Same 32px lead, same cell positions; the tail simply absorbs the column Projects does not have.
   **Over a hundred pixels of every row is deliberately empty at the right**, which right-aligning
   cannot produce. So a list with fewer columns keeps the remaining cells where they are and grows
   the empty tail; it does not slide the last column to the right margin.

   The cells total **616, not 632**: Size's `padding-left:16px` is already inside its 88 — both
   pages measure it as one 88px box with the inset within it — so adding the 16 again
   double-counts. That mistake shipped into a doc, a code comment and a test comment before anyone
   caught it, because `+16` was the only term in the sum nobody had measured: every other number
   came off a page, that one came off a reading of a parenthetical, and it survived because it
   still made the total look plausible.

   So: **measure every term, then state them as a sum that closes to the container width, never as
   a remainder.** Both halves carry weight, and the closed form is the weaker one. It catches a
   spare term. It does **not** catch a wrong model — the 32px lead in note 1 is the proof, because
   icon-outside and icon-inside both close to 768 just as neatly:

       icon outside   32 + 368 + 160 + 88 + 112 tail + 8 = 768
       icon inside         368 + 160 + 88 + 144 tail + 8 = 768

   Only measuring the rows separated those two. And keep the proportion in mind: of the three
   defects this section exists to prevent, the arithmetic one was the cheapest. The two that
   actually cost time — a column heading sitting over the wrong cells, and a name column 32px too
   narrow — were both found by putting the two pages side by side in one browser, and neither was
   reachable from this document at all.

## 4. THE PLUGINS PAGE

- A segmented toggle centred at the very top ("Plugins | Skills"): font **14px / weight 500**,
  padding `8px 24px`, rounded full, selected pill on a `--bg-tertiary` track.
- Title block: "Plugins" 28px/500, subtitle "Work with ChatGPT across your favorite tools."
  16px/400 `--text-secondary`.
- "Installed >" strip: a single row of app icons, each **~40px, rounded**.
- Section headers ("Featured", "Productivity"): **14px / weight 500 / `--text-primary`**.
- App grid: **2 columns of 384px, row-gap 16px, column-gap 8px** (776px overall).
- App row height **~76px**:
  - icon **40x40**, rounded ~10px
  - title **14px / weight 400 / `--text-primary`**
  - description **13px / weight 400 / `--text-tertiary`**, one line, truncated
  - trailing control on the right: a `+` (not installed) or `…` (installed)

## 5. THE SIDEBAR

- Item: **248x36**, padding `6px 10px`, **border-radius 10px**, icon-to-label gap 6px,
  font **14px / weight 400**
- Selected item background: `--interactive-bg-secondary-selected` (`rgba(0,0,0,0.05)`)
- Group header ("Pinned", "Projects", "Chats"): **14px / weight 500 / `--text-tertiary`**,
  20px tall, x-inset 16px
- Order observed: New chat, Library, Scheduled, Plugins, More -> then the groups.

## 6. NOTES THAT MATTER FOR US

- ChatGPT's page background is `#fcfcfc`, a hair off white. Copying `#fff` reads wrong.
- Dividers are `rgba(0,0,0,0.05)` — much lighter than a default Tailwind border.
- Rows have NO horizontal padding on the right edge and NO card/box; the divider does all the work.
- Nothing on these three pages uses a shadow.

---

## The conversation surface — answer prose and composer

Measured 2026-08-26, signed in, **1470px viewport, light theme**. Method: clone the reference's own
`.markdown` container (`element.cloneNode(false)`, so every class and every inherited rule comes
with it), inject an identical HTML fragment into that clone and into ours, and read back
`getBoundingClientRect()` gaps and `getComputedStyle`. Same fragment, same viewport, both sides.

Owner's ask, that day: *"compare the font, spacing and coloring of the output, also the chat
composer, because it just feels a bit too wide right now. compare with ChatGPT."*

### Body text — already identical, and worth recording as such

| | reference | Nemesis |
|---|---|---|
| font size | 16px | 16px |
| line height | 26px | 26px |
| weight | 400 | 400 |
| colour | `rgb(13, 13, 13)` | `#0d0d0d` |
| column | 768px | 768px |

### Block spacing — where the whole difference lived

Rendered gap between adjacent blocks, in px:

| pair | reference | Nemesis (before) |
|---|---|---|
| paragraph → paragraph | **16** | 20 |
| paragraph → heading | **16** | 20 |
| heading → paragraph | **8** | 24 |
| paragraph → list | **4** | 20 |
| list → paragraph | **8** | 20 |
| bullet → bullet | **0** | 8 |

Lists indent identically on both: `padding-left: 26px` on the list, `6px` on the item.

### Heading scale

| | size / weight / line-height | margin |
|---|---|---|
| h1 | 24 / 600 / 32 | `0 0 8px` (first child) |
| h2 | 20 / 600 / 28 | `16px 0 4px` |
| h3 | 18 / 600 / 28 | `16px 0 4px` |
| h4 | 16 / 600 / 24 | `16px 0 0` |

Ours ran a step large and a weight heavy: h2 at **24 / 700 / 32**.

### The rest of the prose

- `strong` **600**, same colour as body (not a colour change)
- link `rgb(41, 100, 170)`, **no underline**, weight 400
- inline code **14px**, fill `rgb(236, 236, 236)`, radius **4px**, padding **2.4px 4.8px**, mono stack
- `pre` transparent, radius 6px, 14px, margins `8px / 4px`
- blockquote `padding-left: 24px`, **no visible left border**, margins `0 / 8px`
- `hr` `1px solid rgba(0, 0, 0, 0.15)`, margins **28px / 28px**
- `th` 14 / 600, padding `8px 0`, bottom border `1px solid rgba(0, 0, 0, 0.15)`
- `td` 14, padding `10px 0 24px`
- user's own message: right aligned, `max-width: 70%`, padding `10px 16px`, radius **22px**,
  16px / 24px. Its fill is **accent-tinted** (measured `rgb(222, 243, 229)` on a green account),
  which is the same idea as our `--ui-learner`.
- gap between a user turn and the answer under it: **80px**

### Composer

| | reference | Nemesis (before) |
|---|---|---|
| width | **768px** | 768px |
| height | **52px** (`min-height: 52px`) | 52px |
| radius | **28px** | 28px |
| fill | `#ffffff` (dark `#212121`) | `#fdfdfd` |
| control inset | **8px** each side | 8px |
| controls | **36 x 36**, circular | 36 x 36 |
| distance to viewport bottom | **24px** | — |
| editor | 16 / 26, margin `16px 0 0`, padding `0 0 16px` | — |

🔴 **The width already matched exactly.** Both composers measure 768px at the same viewport, so
"feels a bit too wide" is not a width fault. The difference is the EDGE:

```
reference light   0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04), 0 4px 80px 8px rgba(0,0,0,.024)
reference dark    inset 0 0 1px 0 rgba(255,255,255,.2)      ← no drop shadow at all
Nemesis (before)  0 1px 2px rgba(0,0,0,.03), 0 8px 24px rgba(0,0,0,.05)
                  PLUS ring-1 ring-(--ui-stroke-tertiary) = rgba(13,13,13,.08)
```

Our hairline was **twice** the reference's, and drawn by a second mechanism (`ring-1`) that painted
over the shadow's own first layer, so the composite edge was darker than either number implied. A
hairline at double weight reads as a drawn box rather than a floating pill, and a drawn box
announces its full width. Now one token, `--composer-edge`, carries all three layers.

Measured after the change, same method, both themes:

| | light | dark |
|---|---|---|
| width / height / radius | 768 / 52 / 28px | 768 / 52 / 28px |
| fill | `rgb(255, 255, 255)` | `rgb(33, 33, 33)` |
| shadow | `0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04), 0 4px 80px 8px rgba(0,0,0,.024)` | `inset 0 0 1px rgba(255,255,255,.2)` |

Every value equals the reference. Two tokens carry it: `--composer-edge` and `--composer-fill`.

---

## The project page (`/g/g-p-<id>/project`)

Measured 2026-08-26, signed in, 1470px viewport, light theme. A project in the reference is its own
page, not a row that expands.

| | value |
|---|---|
| content column | 768px, page background `#fcfcfc` |
| title | folder glyph + `h1` **28 / 500 / line-height 34 / `#0d0d0d`**, top at **y=116** |
| trailing controls | `Share` and an overflow `…` on the title's row |
| composer | directly under the title, top **y=176** (24px below the title row), **768 x 52, radius 28**, same fill and edge as every other composer; placeholder `New chat in <project>` |
| tabs | `Chats` / `Sources`, top **y=260** (32px below the composer). Pill **38px tall, padding `9px 16px`**, fully rounded, **14 / 500**. Selected `rgba(0,0,0,.05)` on `#0d0d0d`; unselected `rgb(143,143,143)` |
| rows | start **y=326** (28px below the tabs). Each **40px tall**, no divider, no fill, no radius |
| row line 1 | canvas title, **14 / 500 / line-height 20 / `#0d0d0d`** |
| row line 2 | snippet, **14 / 400 / line-height 20 / `rgb(93,93,93)`** |
| row gap | 🔴 **25px between rows** — title-to-title pitch **65px** |

🔴 **THE ROW GAP WAS MEASURED SECOND, AND THE FIRST PASS SHIPPED WITHOUT IT.** The project used for
the first measurement held exactly ONE chat, so there was no second row to measure a gap against.
The spec handed over a row height and, silently, no rhythm — and the page came back with its rows
almost touching, so two 40px two-line rows read as one four-line block. Re-measured on a project
with two chats: rows at 326/366 and 391/431, gap 25, pitch 65, confirmed independently by
title-to-title distance. **A single-instance list cannot tell you its own rhythm; find a second row
before writing the spec.**

Ours now measures 326/366 and 391/431, gap 25, pitch 65, title top 116 at 28/500/34 — identical.

## The deep research report's table-of-contents rail

Measured 2026-08-31, signed in, 1470px viewport, on a real Deep Research run ("Research completed
in 9m · 90 citations"). Owner: *"the document from deep research also doesnt have the leftside
rail popup for table of contents… i need you to measure the chatgpt one in chrome."*

🔴 **IT BELONGS TO THE EXPANDED REPORT, NOT THE CHAT.** In the conversation the report sits in a
card with a title bar, a download button and an expand button; there is no rail. Pressing expand
opens the report full screen, and the rail is only there. Worth knowing before copying it onto a
surface that has no expanded state.

🔴 **THE RAIL IS NOT MEASURABLE BY SCRIPT.** The expanded report renders inside a cross-origin
sandboxed iframe (`connector-openai-deep-research.web-sandbox.oaiusercontent.com`), so
`contentDocument` is null and `elementFromPoint` from the parent returns the iframe itself. Every
number below is off 2x zoomed screenshots, halved back to CSS px. Treat them as ±1.

### Collapsed: a stack of tick marks

| thing | measured |
| --- | --- |
| marks | **one per TOC entry**, 8 here = the title + 7 sections |
| left edge | x=**61**, about 9px inside the report frame's own left edge |
| each mark | **3px tall**, fully rounded |
| inactive | **19px** wide, light grey (~#e5e5e5) |
| active | **25px** wide, black — longer AND darker, so it reads at a glance |
| pitch | **15px** top to top |

🔴 **IT IS A SCROLL-SPY, AND THAT IS THE POINT.** Scrolling from the title into "Executive
summary" moved the black mark from the first tick to the second, with nothing clicked. A rail that
only responded to clicks would be a menu; this one is a position indicator that happens to be
clickable, which is why it earns permanent screen space at 19px wide.

### Hover: the panel

Hovering anywhere on the rail opens a white card over it.

| thing | measured |
| --- | --- |
| panel | **287 x 569**, at x=**57**, y=**115** |
| corner | **12px**, hairline border, soft shadow |
| padding | **20px** left (text starts at x=77) |
| label | `TABLE OF CONTENTS`, uppercase, ~11px, letter-spaced, grey |
| entries | **16px on 24px**, wrapping to two lines where needed |
| entry pitch | **36px** for a single-line entry (24px line + 12px gap) |
| first entry | the document's own title, **bold and near-black** — it is the active one |
| the rest | grey (~rgb(120,120,120)) until active |

The entries are the report's headings in order: the title, then Executive summary, Market
architecture and evaluation framework, Vendor landscape and detailed profiles, Comparative
capabilities and compliance, Evidence base and market dynamics, Gaps and opportunities, Strategic
options and recommendation.

## The Library's "New folder" dialog (measured 2026-09-03, viewport 1470px)

Owner: *"for the library in the folder button, I need you to actually compare that to ChatGPT.
Because ChatGPT is the baseline… Making a new folder in the library should work exactly like it
does in ChatGPT."*

Reached at **chatgpt.com/library → the "New ⌄" pill at top right → "Folder"**. That menu holds
Image · Note · Document · Spreadsheet · Presentation · Folder · — · Start from template · — ·
Upload; Nemesis offers only the folder, by the owner's earlier ruling that the Library's one verb is
organising what is already there.

🔴 **IT IS A DIALOG, AND OURS WAS A ROW.** The Library named a folder inline in the table, which
committed on Enter *and* on blur — so clicking anywhere else made a folder. Nothing about the
reference's shape is decorative: one field, one Cancel, one Create, and no other way out.

| thing | measured |
| --- | --- |
| dialog | **448 x 190**, radius **16px**, no close ✕ |
| insets | **16px** sides, **12px** top, **16px** bottom (190 = 12+28+16+20+8+38+16+36+16) |
| title | `New folder`, **18px on a 28px line**, regular weight |
| label | `Folder name`, **14px on a 20px line**, **16px** under the title |
| field | **416 x 38**, **fully rounded**, 16px side padding, 14px text, **autofocused**, **no placeholder**, 8px under the label |
| footer | **16px** under the field, right-aligned |
| Cancel | **71 x 36**, pill, transparent, 1px `rgba(255,255,255,0.15)` border, 14px/500 |
| gap | **12px** |
| Create | **70 x 36**, pill, solid, 14px/500, **disabled until the field has something in it** |

🔴 **THE PROJECT DIALOG IS A DIFFERENT SIZE AND THAT IS DELIBERATE ON THEIR SIDE TOO** — 512 x 264,
a 480 x 36 field at radius **8** with an emoji inset and an example placeholder, plus a tip strip
saying what a project is. A folder needs no teaching, so it gets the smaller, plainer box. Do not
collapse the two into one component.

🔴 **WHAT WE DELIBERATELY DO NOT COPY.** Their Create button is near-white; ours is `--ui-action`,
because the accent is the learner's and set in Settings (the same call the Library's own "New
folder" button already records). And **Escape does not close their dialog** — verified twice, with
text typed and with the box emptied. Ours closes, which is the standard every other Nemesis dialog
already keeps.

🔴 **THE 1px THAT MOVES EVERYTHING.** Every dialog in this app carries a `--stroke-nous` border the
reference's does not, and the box is border-box: padding of 16 lands the content 17px from the
visible edge and makes the panel 192 tall. `folder-create-dialog.tsx` pays for the border out of
each inset (15/11/15), which puts the title, the label, the 416px field and the footer exactly where
the table above says.

## The pinned prompt — measured 2026-09-03, signed in, viewport 1470x779

Owner: *"why don't you use ChatGPT for reference?"* — after the number had been moved twice in one
afternoon on reasoning rather than measurement. It changed the answer.

| what | ChatGPT |
|---|---|
| header | **52px**, sticky at the top |
| pinned user message | **64px from the top of the window** |
| gap below the header | **12px** |
| bubble height | 44px |
| drift while the answer streamed | **none** — 14 samples over 9.1s, all 64 |
| runway reserved below | **none** — overflow below the fold measured 48px, not a screenful |

🔴 **THE TRANSFERABLE NUMBER IS THE 12px GAP, NOT THE 64.** Their header is 52 and ours is not:
our floating controls sit at `top-[12px]` and are 36px tall, so their bottom edge is 48. The
like-for-like figure is **48 + 12 = 60**, which is what `PIN_INSET_PX` and both scrollers' top
padding now carry. Copying 64 straight across would have left 16px of gap against their 12.

🔴 **THEY DO NOT RESERVE A SCREENFUL.** Nemesis adds a runway below the current turn so the prompt
can physically reach the top; ChatGPT does not, and the prompt still never moves. Worth knowing
before anyone "fixes" the runway: it is ours, not theirs, and it exists because our turn can be
shorter than the viewport where theirs is anchored differently.

🔴 **MEASURING AN ANIMATION HERE IS NOT POSSIBLE THROUGH THIS TOOL.** The tab reports
`visibilityState: "hidden"` even while it renders and screenshots fine, and rAF delivers **0 frames
in 300ms** — so the glide's easing and duration cannot be sampled. Resting positions,
`getBoundingClientRect` and `setTimeout` polling all work. Front-loading a screenshot does not
change it.

🔴 **RE-FIND THE SCROLLER AFTER THE ANSWER ARRIVES.** A container cached before the reply exists is
not the one that ends up scrolling — measured `scrollHeight === clientHeight` for nine straight
seconds off a stale handle, which reads as "nothing scrolls" and is simply the wrong box. The same
mistake cost a wrong reading on our own canvas an hour earlier.
