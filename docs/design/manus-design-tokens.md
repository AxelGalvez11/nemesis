# Manus design system — complete token spec (extracted from live CSS, 2026-07-04)

Every value here was read from Manus's **running page** (manus.im/app, 1.6 Lite, light theme) via
`getComputedStyle` DOM inspection — exact, not eyeballed. This is the 1:1 clone reference. Reproduce
these and the pixels match. Companions: `manus-ui-capture-log.md` (structure/anatomy),
`manus-vs-pharmaorb-comparison.md` (gap analysis), `manus-parity-spec.md` (build plan).

---

## 1. Color system

Manus is built on a **warm-neutral base** (`#37352F` = rgb 55,53,47 — a warm near-black, Notion-esque)
expressed as solid text colors and alpha tints. Not a single gray in the system is cool/pure.

### Solid colors
| Role | Value | Notes |
|---|---|---|
| Canvas / page bg | `#FFFFFF` | pure white |
| Sidebar bg | `#F0F0F0` | rgb 240,240,240 |
| Raised surface | `#F8F8F7` | rgb 248,248,247 — subtle panels |
| Text — primary | `#34322D` | rgb 52,50,45 — headings, nav, body (**never #000**) |
| Text — secondary | `#5E5E5B` | rgb 94,94,91 — icons, "Share", "View all", inactive |
| Text — muted | `#858481` | rgb 133,132,129 — section labels, counters, disclaimers, "Free plan" |
| Primary button fill | `#1A1A19` | rgb 26,26,25 — warm black |
| Accent / link | `#0081F2` | rgb 0,129,242 — "Start free trial", links, progress bar |

### Alpha tints (all over the warm base `55,53,47` or plain black)
| Token | Value | Used for |
|---|---|---|
| Hairline border | `rgba(0,0,0,0.06)` | sidebar right edge, cards on white, credits chip |
| Composer border | `rgba(0,0,0,0.2)` | the main input outline |
| Search fill | `rgba(55,53,47,0.04)` | search inputs (filled, borderless) |
| Hover/active fill | `rgba(55,53,47,0.08)` | icon-button hover, send-disabled, active nav (≈0.06) |
| Composer shadow | `rgba(0,0,0,0.02) 0 12px 32px` | the only meaningful shadow in the app |

> **Design principle:** low-shadow, contrast-driven. Cards on the gray page are flat white with *no*
> border/shadow (raised by contrast). Cards on white pages get a 6% hairline border, still no shadow.

---

## 2. Typography
| Element | Family | Size | Weight | Color |
|---|---|---|---|---|
| Body / UI base | system sans¹ | 16px | 400 | `#34322D` |
| **Home greeting** | **`LibreBaskerville` serif** | **36px** | 400 | `#34322D` |
| Nav item | system sans | 16px | 400 | `#34322D` |
| Section label (Projects/Tasks) | system sans | 13px | 500 | `#858481`, letter-spacing −0.09px |
| Model pill | system sans | 18px | 500 | `#34322D` |
| Page section header | system sans | 16px | 500 | `#34322D` |
| Account name | system sans | 14px | 500 | `#34322D` |
| Credits chip / secondary btn | system sans | 14px | 500 | `#34322D` |
| Composer input | system sans | 15px | 400 | `#34322D` |
| Suggestion card body | system sans | 13px | 400 | `#34322D` |
| Task-progress label | system sans | 14px | 400 | `#858481` |
| Step row | system sans | 14px | 400 | `#34322D` |
| N/N counter | system sans | 13px | 400 | `#858481` |
| Disclaimer | system sans | 12px | 400 | `#858481` |

¹ `-apple-system, system-ui, "Segoe UI Variable Display", "Segoe UI", Helvetica, Arial, sans-serif`.
The **serif greeting is the single distinctive type choice** — one editorial note in an all-sans UI.

---

## 3. Radius & spacing scale
- **Radius tiers:** `8px` (buttons, chips, search, credits chip) · `10px` (sidebar nav rows) · `12px` (cards) · `22px` (composer box + Task-progress tracker top corners) · `9999px`/`100px` (icon buttons, pills).
- **Sidebar:** width **300px**, nav rows **36px** tall, padding `0 2px 0 8px`, icon→label gap **8px**.
- **Composer:** width **768px**, radius **22px**, inner padding `12px 0`, item gap **12px**.
- **Content column** centers under the 768px composer.
- **Icon buttons:** 32px square, fully round.

---

## 4. Component tokens (exact)

| Component | bg | radius | padding | border | size | notes |
|---|---|---|---|---|---|---|
| **Sidebar** | `#F0F0F0` | — | — | right `1px rgba(0,0,0,.06)` | — | 300px wide |
| **Nav row** | transparent (active ≈ `rgba(55,53,47,.06)`) | 10px | `0 2px 0 8px` | none | 16/400 | 36px tall, 8px icon gap |
| **Section label** | — | — | — | — | 13/500 | `#858481`, −0.09px tracking, uppercase-feel |
| **New-task / composer box** | `#FFFFFF` | 22px | `12px 0` | `1px rgba(0,0,0,.2)` | 15/400 | 768px, shadow `0 12px 32px rgba(0,0,0,.02)` |
| **Composer icon button (+, tools, monitor)** | transparent | 9999px | — | +only: `1px rgba(0,0,0,.06)` | — | 32px round, icon color `#5E5E5B` |
| **Send button (empty)** | `rgba(55,53,47,.08)` | 9999px | — | none | — | 32px round, icon white |
| **Suggestion card (on gray)** | `#FFFFFF` | 12px | 16px | none | 13/400 | ~239px, flat (no shadow/border) |
| **Connector/plugin card (on white)** | transparent | 12px | 12px | `1px rgba(0,0,0,.06)` | 16/400 | 354px, 76px tall, 12px gap |
| **Search input** | `rgba(55,53,47,.04)` | 8px | `0 8px` | none | 16/400 | 36px tall, filled not bordered |
| **Secondary button (Manage/Create/View all)** | transparent | 8px | `0 8px` | none | 14/500 | 32px tall; "View all" text `#5E5E5B` |
| **Primary dark button** | `#1A1A19` | 8px | `0 8px` | none | 13/500 | 28px tall, white text |
| **Credits chip** | transparent | 8px | `0 12px 0 8px` | `1px rgba(0,0,0,.06)` | 14/500 | 32px tall |
| **Model pill (top bar)** | transparent | — | — | — | 18/500 | text `#34322D` |
| **Task-progress tracker** | white panel | **`22px 22px 0 0`** | — | — | label 14/400 | **docked onto composer** (top-rounded only) |
| **— step row** | transparent | — | — | — | 14/400 | green ✓ + `#34322D` text |
| **— N/N counter** | transparent | — | — | — | 13/400 | `#858481` |
| **Accent link** | transparent | — | — | — | 14/400 | `#0081F2` |
| **Disclaimer** | transparent | — | — | — | 12/400 | `#858481`, centered under composer |

### Success state
| Role | Value | Use |
|---|---|---|
| Success green | `#25BA3B` (rgb 37,186,59) | "✓ Task completed", completed step checkmarks |

---

## 1b. Manus's actual semantic tokens — light + dark (read from live CSS vars, 2026-07-04)

These are **Manus's real CSS custom properties** (e.g. `--text-primary`), read via `getComputedStyle`
in both themes. Map our clone's variables 1:1 to these. Dark values confirm the earlier hand-extracted
light values and add the full dark theme.

| Manus token | Light | Dark | Role |
|---|---|---|---|
| `--background-menu-white` | `#ffffff` | `#242424` | canvas / card surface |
| `--background-nav` | `#f0f0f0` | `#1f1f1f` | **sidebar** |
| `--background-gray-main` | `#f8f8f7` | `#1a1a1a` | raised / deep panel |
| `--text-primary` | `#34322d` | `#dadada` | headings, body, nav |
| `--text-secondary` | `#5e5e5b` | `#acacac` | icons, secondary actions |
| `--text-tertiary` | `#858481` | `#7f7f7f` | labels, counters, disclaimers |
| `--text-disable` | `#b9b9b7` | `#5f5f5f` | disabled text |
| `--icon-primary` | `#34322d` | `#dadada` | primary icons |
| `--icon-secondary` | `#5e5e5b` | `#acacac` | secondary icons |
| `--icon-tertiary` | `#858481` | `#7f7f7f` | muted icons |
| `--border-main` | `#0000000f` (blk 6%) | `#ffffff0f` (wht 6%) | card/chip borders |
| `--border-light` | `#0000000a` (blk 4%) | `#ffffff08` (wht 3%) | subtle dividers |
| `--fill-tsp-white-light` | `#37352f0a` (4%) | `#ffffff0a` (4%) | **hover fill** (nav, chips, buttons) |
| `--fill-tsp-white-main` | `#37352f0f` (6%) | `#ffffff0f` (6%) | **active/selected/pressed fill**; input fills |
| `--fill-tsp-gray-light` | `#37352f05` (2%) | `#0000001f` (12%) | faint fill |
| `--fill-tsp-gray-main` | `#37352f0a` (4%) | `#0003` (blk 20%) | stronger fill |
| `--function-success` | `#25ba3b` | `#5eb92d` | success green (theme-aware) |
| `--function-error` | `#f25a5a` | `#eb4d4d` | error red |
| Accent / link (from `Start free trial`) | `#0081f2` | `#1a93fe` | links, trial, progress bar |
| Primary button fill | `#1a1a19` (dark fill) | `#ffffff` @95% | **inverts by theme** (light=dark btn, dark=light btn) |

> **`tsp` = "transparent"** — the alpha-tint interactive fills. The warm base is `#37352f` (light) and
> plain white (dark). Note the base itself flips: light theme tints *warm-black over white*; dark theme
> tints *white over near-black*.

## 1c. Interactive states (from the Tailwind `hover:`/`active:` classes in the DOM)
| Element | Hover | Active/pressed | Notes |
|---|---|---|---|
| Nav row | bg `--fill-tsp-white-light` (4%) | `--fill-tsp-white-main` (6%) | text unchanged |
| Action chip / secondary button | bg `--fill-tsp-white-light` (4%) | `--fill-tsp-white-main` (6%) | |
| **Card (suggestion/connector)** | **`opacity: 0.8`** (dim, NO bg change) | — | distinctive — cards fade, don't tint |
| Icon button | `--fill-tsp-white-main` fill on the round hit-area | — | |
| Toggle switch | on = accent blue fill; off = gray track | — | |

---

## 4b. Agent-run surfaces (extracted from a live run, 2026-07-04)

Captured by running real Manus tasks and inspecting the rendered run view.

**Thread layout:** content column **768px** wide, centered (same width as composer).
| Element | Value |
|---|---|
| Agent avatar row | "🌱 manus" wordmark + **tier badge** ("Lite") + right-aligned timestamp ("3:18 PM", 13px muted) |
| Tier badge | border `1px rgba(0,0,0,.14)`, radius **6px**, padding `2px 6px`, 12px/400, `#858481` |
| User message | plain block, right-aligned, 16px/400 `#34322D` — **no bubble fill** (transparent) |
| Ack / body text | 16px/400, line-height 24px, `#34322D` |
| Inline link (in prose/table) | `#5E5E5B` **secondary gray, NOT the blue accent** (accent reserved for nav/trial) |

**Deliverable table:**
| Element | Value |
|---|---|
| Header cell | bg `rgba(55,53,47,.04)`, weight **700**, radius `8px 0 0 0` (rounds outer top corners), padding `7px 9px` |
| Body cell | padding `7px 9px`, 16px/400 |
| Table width | fits content column (~627px) |

**Task-completed bar:** "✓ Task completed" in `#25BA3B` 14px + copy/share icons · right side "How was this result?" (14px `#5E5E5B`) + ★★★★★ rating.
**Follow-up suggestion chips:** full-width rows, text 14px `#5E5E5B`, chat-bubble icon + `→` launch affordance.

**Plan-progress tracker (running + done):** top-rounded panel `22px 22px 0 0` **docked onto the composer**; label "Task progress" 14px `#858481`; step rows 14px `#34322D` with green ✓; **live timer** ("0:01", 13px muted) + **N/N counter** (13px `#858481`); a small **artifact thumbnail** (browser-page preview) sits at the row's left when the run produced pages.

**Usage popover** (bar-chart icon in top bar):
| Element | Value |
|---|---|
| Popover box | bg white, radius **16px**, border `0.5px rgba(0,0,0,.14)`, shadow `0 8px 32px rgba(0,0,0,.02)`, **360px** wide |
| Title "Usage" | 16px/500, padding `16px 16px 10px` |
| Metric label | 13px/500, `#858481` |
| Layout | top 2 metrics (Credits used, Time worked) as full-width rows; bottom 4 (Pages viewed, Commands run, API called, Files created) as a **2×2 card grid** |
| Footer | "Rate this task" 16px + ★★★★★ |

**"Manus's Computer" panel** (opens on the tier tier — auto-docks on Pro; on Lite, click the artifact thumbnail):
| Element | Value |
|---|---|
| Panel | right-docked, **~368px** wide, full viewport height |
| Header | "Manus's Computer" 14px/500 `#34322D` + status line "Manus is using Browser" 12px/400 `#858481`; top-right: fullscreen / minimize / close ✕ icons |
| Body | renders the captured artifact/web page live |
| Footer | **playback timeline** (prev/next + scrubber) + a "Live" toggle (12px/500 `#858481`) to replay the agent's steps |

> **This is the moat surface.** For PharmaOrb it becomes "watch the evidence assemble": panel header
> "Evidence engine", status "Searching PubMed… verifying claim 3/8…", body = sources streaming into
> the evidence panel, footer = replay of the retrieval steps. Same shape, evidence substance.

---

## 5. Implementation recipe (for the PharmaOrb clone)

To reproduce Manus's *light theme* look, define these as CSS variables and swap our current tokens:

```css
:root[data-theme="manus-light"] {
  --canvas: #FFFFFF;
  --sidebar: #F0F0F0;
  --raised: #F8F8F7;
  --text-1: #34322D;   /* primary */
  --text-2: #5E5E5B;   /* secondary */
  --text-3: #858481;   /* muted */
  --btn-primary: #1A1A19;
  --accent: #0081F2;
  --line: rgba(0,0,0,0.06);
  --fill-hover: rgba(55,53,47,0.08);
  --fill-input: rgba(55,53,47,0.04);
  --shadow-lift: 0 12px 32px rgba(0,0,0,0.02);
  --r-btn: 8px; --r-nav: 10px; --r-card: 12px; --r-composer: 22px;
  --font-serif: "Libre Baskerville", Georgia, ui-serif, serif;  /* greeting only */
}
```
Then: sidebar 300px `#F0F0F0`; nav rows 36px/`--r-nav`/`0 2px 0 8px`; composer 768px/`--r-composer` white with `--line`-ish 20%-black border + `--shadow-lift`; cards `--r-card` white flat on gray or `--line`-bordered on white; the greeting in `--font-serif` 36px; text uses the three-tier hierarchy; the plan tracker as a top-rounded panel docked onto the composer.

---

## 6. Coverage status
**Captured (exact):** full color system incl. success green · typography incl. serif greeting · radius
scale (6/8/10/12/16/22px) · sidebar/nav · composer (home + in-run, identical) · icon+send buttons ·
cards (gray-page flat + white-page bordered) · search · secondary/primary buttons · credits chip ·
model tiers · **agent-run thread** (avatar/badge/timestamp/user-msg/body/table/task-completed/follow-ups)
· **plan-progress tracker** (running timer + N/N + artifact thumbnail) · **Usage popover** (2×2 metric grid)
· **"Manus's Computer" panel** (368px right-dock, header/status/playback/Live).

**Also captured (this pass):**
- **Dark-theme tokens** — full paired light/dark table via Manus's real semantic CSS variables (§1b).
- **Hover/active states** — exact values from the Tailwind `hover:`/`active:` classes (§1c): hover = `--fill-tsp-white-light` 4%, active = `--fill-tsp-white-main` 6%, cards dim to `opacity 0.8`.

**Still open (cosmetic only):**
- **Pro-tier auto-dock** of the computer panel (Lite requires clicking the artifact thumbnail to open the same panel) — behavioral difference, not a style gap.
- **Focus-ring** styles (keyboard focus) — not probed; low priority.

> Extraction method (repeatable): run `getComputedStyle(el)` per component from the browser console on
> manus.im. To render interaction-gated surfaces (computer panel, running tracker), start a real Manus
> task that browses the web, then inspect while the run/panel is open.
