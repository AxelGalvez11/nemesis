# Tokens

The canonical token set. Once this file exists it outranks the references: components read these
names and nothing else.

**The values are the Sana and Notion synthesis** (owner, 2026-09-11: "our new design", approved on a
mockup of the rebuilt app). They come from a comparison sheet built from measured Sana and Notion
components; the sheet is not in git, so `/design/PROVENANCE.md` records what was measured, what was a
judgement, and where the sheet lives. This replaces the 2026-09-09 ruling that Figma led the app's
system. The marketing site, sign-in and pricing keep their own Sana rulings, in
[SURFACES.md](SURFACES.md).

**The rule that makes this worth having: a component may not contain a raw value.** No
`text-[13px]`, no `rounded-[9px]`, no `p-[14px]`. If a value is needed and no token fits, the
missing token is the bug.

---

## 1. Colour

### 1.1 Construction: alpha over one ink

There is no grey palette. There is **one ink**, and every neutral is that ink at an alpha. Both
measured references build their neutrals this way, so the construction came through the new ruling
untouched.

```css
--ink: rgb(16, 16, 18);     /* light mode */
--ink: rgb(237, 237, 238);  /* dark mode: the same relationship inverted */
```

**Why alpha and not hex:** a wash composes correctly over any surface, the whole set harmonises by
construction because it is one hue, and a theme swap is one variable.

In code the ink is `--ui-base`, the app's own theme foreground. It resolves to `#0d0d0d` in light and
`#ffffff` in dark today, close to the values above but not identical. Moving it is a theme change,
made in `desktop-ui.css` during the shell pass, because re-pointing it restyles every screen at once.

### 1.2 Every neutral is a job, not a shade

The step is the raw material. **A component uses the job name.** A step with no job does not exist,
which is what stops the set growing back into a palette someone picks from by eye.

| job | token | light | dark, where different |
| --- | --- | --- | --- |
| t0: titles, emphasis | `--text-primary` | 100% | |
| t1: body, answers | `--text-body` | 90% | |
| t2: secondary | `--text-secondary` | 60% | |
| t3: muted, placeholders | `--text-muted` | 45% | 44% |
| disabled | `--text-disabled` | 30% | 28% |
| i1 | `--icon-primary` | 80% | |
| i2 | `--icon-secondary` | 50% | 52% |
| i3 | `--icon-muted` | 35% | 36% |
| fill, soft | `--bg-soft` | 4% | 5% |
| fill, hover | `--bg-hover` | 5% | 6% |
| fill, selected | `--bg-selected-neutral` | 7% | 9% |
| fill, pressed | `--bg-pressed` | 10% | 12% |
| line, l1 | `--border-subtle` | 6% | 7% |
| line, l2 | `--border-default` | 8% | 10% |
| line, l3 | `--border-strong` | 14% | 16% |

Dark carries its fills and lines a step stronger because the same percentage of near-white over a
dark ground reads lighter than near-black over a pale one. This repo has already shipped that
mistake once, in the text ramp.

**Icons have their own namespace** because a glyph is a solid mass and text is not: an icon at its
label's alpha reads heavier than the label.

### 1.3 Grounds

| | page | sunken (the sidebar) | surface |
| --- | --- | --- | --- |
| light | `#fff` | `#f9f9f9` | `#fff` |
| dark | `#141415` | `#18181a` | `#1e1e20` |

Sunken is the ink at 2%, which lands on `#f9f9f9` over white and `#18181a` over `#141415`, so one
token covers both themes.

Tooltip is the one surface that inverts, so it reads as an annotation on the interface rather than a
part of it: `#262628` with text at `rgba(255,255,255,.95)` in light, `#ededee` with `#141415` text in
dark.

### 1.4 Accent

**The accent appears in exactly two places: the send button and the learner's own message bubble.**
Nothing else. Primary buttons, switches, checkboxes, selected chips and focus are all **ink**.

That is narrower than the old rule, which let the accent mark anything the learner was doing now. It
is the single biggest reason both references read as calm, and the accent belongs to the character,
so the interface does not compete with it.

Status colours (danger, warning, success) are unchanged and appear only when something has happened.

```css
--danger  #e5484d;  --warning #ffa82f;  --success #30a46c
```

### 1.5 Dark mode

Every neutral resolves through the ink, so a theme swap moves the ink and the grounds. Only the
fifteen job alphas that differ, the tooltip, the elevation recipes and the focus ring are restated
for dark.

---

## 2. Typography

### 2.1 Family

**Inter, with the `opsz` optical-size axis enabled.** It is the only open face with a real optical
size axis, which is the mechanism behind the type quality in both references.

```css
--font-sans: "Inter Variable", -apple-system, system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

Mono stays as it is. The app still ships system fonts, so the switch is part of the shell pass.

### 2.2 The scale

**Chrome text is 14px/20px: sidebars, menus, buttons, tabs.** This reverses the rule this file used
to carry, "there is no 14px chrome", and the reversal is explicit: 12px chrome was an interpolation
between Figma's 11px and Sana's 14px, and **both references measured for the synthesis set chrome at
14px**, so the measurement beats the interpolation.

Reading text is 16px/26px. Small text is 12px/16px.

| utility | size / line height | weight | letter-spacing | use |
| --- | --- | --- | --- | --- |
| `type-meta` | 11 / 16 | 500 | 0 | counts, timestamps. Sparingly |
| `type-caption` | 12 / 16 | 400 | 0 | helper text, metadata |
| `type-ui` | 14 / 20 | 400 | -0.1px | **chrome default** |
| `type-label` | 14 / 20 | 500 | -0.1px | sidebar rows, menu headings, button labels |
| `type-ui-lg` | 13 / 18 | 500 | 0 | table headers, dense content controls |
| `type-body` | 16 / 26 | 400 | -0.1px | **content default**: chat, notes, answers |
| `type-body-lg` | 18 / 28 | 400 | -0.15px | long-form reading, lesson prose |
| `type-title-sm` | 20 / 28 | 500 | -0.2px | section titles |
| `type-title` | 24 / 31 | 500 | -0.35px | page titles |
| `type-display` | 30 / 36 | 500 | -0.6px | the one big thing on a screen |

**Two densities, never mixed in one region.** A sidebar is `type-ui` or `type-label`. A lesson body
is `type-body` or `type-body-lg`. There is still no 12px prose.

### 2.3 Weight ladder, and the guardrail

```css
--fw-normal: 400;   /* body */
--fw-medium: 500;   /* headings, labels, titles */
--fw-bold:   600;   /* emphasis inside an answer. THE CEILING */
```

Headings and labels are 500. Bold inside an answer is 600, and **600 stays the ceiling**, so a
careless `font-bold` cannot shout. Hierarchy is size, colour, spacing and tracking; weight is a fine
adjustment.

### 2.4 Letter spacing

Zero at and below 13px, negative from 14px, growing with size.

| size | tracking |
| --- | --- |
| 11, 12, 13px | 0 |
| 14px | -0.1px |
| 16px | -0.1px |
| 18px | -0.15px |
| 20px | -0.2px |
| 24px | -0.35px |
| 30px | -0.6px |

The old positive tracking below 12px came from Figma's 11px chrome, which this ruling replaced.
Tracking is baked into the type utilities; no component sets `letter-spacing` by hand.

---

## 3. Spacing

Named by value, Figma's convention. `space-8` cannot drift from 8px and nobody has to remember
whether `md` is 6 or 8. The synthesis does not restate spacing, so this scale stands.

```
2  4  6  8  12  16  20  24  32  40  48  64
```

Base unit 4px, with **2 and 6 as half steps** for dense chrome, where they are genuinely needed.

| range | use |
| --- | --- |
| 2 to 6 | inside a control: icon-to-label gap, chip padding |
| 8 to 12 | between related controls, control inner padding |
| 16 to 24 | between groups, card padding, panel gutters |
| 32 to 48 | between page sections |
| 64 | above a page title, major separations |

**Nothing outside this scale.** Our codebase currently has 210 distinct arbitrary spacing values
across 1,142 uses; that is the single largest source of visual noise in the product.

---

## 4. Radius

**Exactly six: 4, 6, 10, 16, 24 and the pill.**

```css
--radius-4:    4px;   /* dense chrome, table cells, tags */
--radius-6:    6px;   /* rows: menu items, sidebar items, inputs */
--radius-10:  10px;   /* menus, popovers, cards */
--radius-16:  16px;   /* message bubbles, the send button, panels */
--radius-24:  24px;   /* the composer and dialogs */
--radius-full: 9999px /* pills: learner-facing actions, chips, avatars */
```

**The nesting rule is arithmetic, not taste: inner radius plus inset equals outer radius.** A row at
6 inside a menu of 10 works because 6 plus 4 of padding is 10. The send button at 16 inside the
composer's 24 works because 16 plus 8 of inset is 24. Get it wrong and the gap between the two
curves visibly thickens at the corner.

2, 8 and 12 are **retired**. They stay defined so nothing reading them breaks, and new work uses the
six above.

---

## 5. Density and control heights

```css
--control-compact:      24px   /* icon buttons in dense rails, inline chips */
--control-standard:     28px   /* menu rows */
--control-row:          30px   /* sidebar rows */
--control-comfortable:  32px   /* the conversation's pill controls, the send button */
--control-large:        36px   /* the larger conversation controls */
--control-touch:        44px   /* mobile minimum. Never smaller on a touch target */
```

A given surface uses **two**. Chrome runs on 28px menu rows and 30px sidebar rows. The conversation
runs on 32 to 36px pill controls, with the composer and dialogs at radius 24 and the send button a
32px circle.

---

## 6. Elevation

**A 1px ring sits inside soft shadows, and the ring is what does the work.**

| level | light | dark |
| --- | --- | --- |
| `--elev-ring` | `0 0 0 1px` ink 8% | ink 10% |
| `--elev-floating` (menus, popovers, focused composer) | ring, `0 2px 6px` ink 3%, `0 10px 24px` ink 6% | ring, `0 2px 6px rgba(0,0,0,.3)`, `0 12px 28px -6px rgba(0,0,0,.5)` |
| `--elev-overlay` (dialogs) | ring, `0 4px 10px` ink 4%, `0 24px 48px` ink 10% | ring, `0 4px 10px rgba(0,0,0,.35)`, `0 24px 48px -8px rgba(0,0,0,.6)` |

`--elev-raised` is the ring on its own, and `--elev-flat` is `none`.

**A lone tight dark shadow is still banned.** It is the clearest signature of a generated interface.
The small shadow only ever appears inside the ring, where it reads as contact rather than as a drop
shadow. There is no `0 1px 2px` in this system. In dark the shadows go to real black, because a
near-white ink at 6% over a dark ground is a glow, not a shadow.

---

## 7. Motion

| duration | curve | what moves |
| --- | --- | --- |
| `--dur-instant` 20ms | | hover backgrounds |
| `--dur-fast` 100ms | `cubic-bezier(0,0,.2,1)` | quick changes: colour, opacity, icon state |
| `--dur-menu` 150ms | `cubic-bezier(0,0,.2,1)` | menus, which open from scale .98 and opacity 0 |
| `--dur-standard` 200ms | `cubic-bezier(0,0,.2,1)` | fades and rotations |
| `--dur-slow` 320ms | `--ease-travel: cubic-bezier(.32,.72,0,1)` | panels travelling |

**The rule: the closer a change is to the pointer, the faster it resolves.** A hover that takes as
long as a panel slide feels laggy; a panel that moves as fast as a hover feels broken.

**Reduced motion collapses all of them.** Full guidance in [MOTION.md](MOTION.md).

---

## 8. Layout

```css
--reading-column:  672px   /* long-form prose */
--content-max:    1120px   /* a wide working surface */
--w-sidebar:       240px
--w-sidebar-narrow:200px
--w-panel:         320px   /* inspector, sources, right-hand panels */
--w-panel-wide:    400px
--h-topbar:         48px
```

The synthesis does not restate these widths, so the measured reading column stands. Prose wider than
that costs comprehension.

---

## 9. Focus

```css
--focus-ring: 0 0 0 2px var(--bg-page), 0 0 0 4px <ink 70%>;   /* 75% in dark */
```

**A 2px ink ring with a 2px gap in the ground.** The gap is what keeps the ring legible on a filled
control: without it, the ring touches the fill and reads as a border. It is a box-shadow, so it
shifts no layout and cannot move a row by a pixel when it appears.

It is ink, not the accent. Every interactive element must have a visible focus state. This is not
optional and is not a preference.
