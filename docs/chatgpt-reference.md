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
