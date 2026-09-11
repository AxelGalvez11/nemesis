# Tokens

The canonical token set. Once this file exists it outranks the references: components read these
names and nothing else.

Derived from `/research/design-references/`. Every decision traces to
`REFERENCE_CONFLICTS.md`; nothing here is a taste call made in isolation.

**The rule that makes this worth having: a component may not contain a raw value.** No
`text-[13px]`, no `rounded-[9px]`, no `p-[14px]`. If a value is needed and no token fits, the
missing token is the bug.

---

## 1. Colour

### 1.1 Construction: alpha over one ink

There is no grey palette. There is **one ink**, and every neutral is that ink at an alpha.

```css
--ink: #0b1117;   /* light mode: near-black, very slightly cool */
--ink: #f4f6f8;   /* dark mode: the same relationship inverted */
```

Neutrals are generated, never hand-picked:

```css
--n-2:  color-mix(in srgb, var(--ink) 2%,  transparent);
--n-4:  color-mix(in srgb, var(--ink) 4%,  transparent);
--n-6:  color-mix(in srgb, var(--ink) 6%,  transparent);
--n-10: color-mix(in srgb, var(--ink) 10%, transparent);
--n-14: color-mix(in srgb, var(--ink) 14%, transparent);
--n-20: color-mix(in srgb, var(--ink) 20%, transparent);
--n-30: color-mix(in srgb, var(--ink) 30%, transparent);
--n-45: color-mix(in srgb, var(--ink) 45%, transparent);
--n-60: color-mix(in srgb, var(--ink) 60%, transparent);
--n-80: color-mix(in srgb, var(--ink) 80%, transparent);
--n-100: var(--ink);
```

Eleven steps, fine at the bottom where hairlines and washes live, coarse at the top where text
lives. Sana ships 25; we do not need them and unused steps invite arbitrary choices.

**Why alpha and not hex:** a wash composes correctly over any surface, the whole set harmonises by
construction because it is one hue, and dark mode is one variable.

### 1.2 Semantic tokens: the only names a component may use

Role first, then prominence, then context, then state. Figma's grammar.

```css
/* Surfaces */
--bg-page          #fcfcfd    /* the ground. NOT pure white */
--bg-surface       #ffffff    /* cards, panels: elevation moves TOWARD white */
--bg-raised        #ffffff
--bg-overlay       #ffffff    /* menus, dialogs */
--bg-sunken        var(--n-2)  /* wells, inputs, code */
--bg-hover         var(--n-4)
--bg-active        var(--n-6)
--bg-selected      color-mix(in srgb, var(--accent) 12%, transparent)

/* Text */
--text-primary     var(--n-100)
--text-secondary   var(--n-60)
--text-muted       var(--n-45)
--text-disabled    var(--n-30)
--text-on-accent   #0b1117
--text-on-inverse  #ffffff

/* Icon: a separate namespace from text, deliberately */
--icon-primary     var(--n-80)
--icon-secondary   var(--n-45)
--icon-muted       var(--n-30)
--icon-on-accent   #0b1117

/* Border */
--border-subtle    var(--n-6)
--border-default   var(--n-10)
--border-strong    var(--n-20)
--border-focus     var(--accent)

/* Status */
--danger  #e5484d;  --danger-bg  color-mix(in srgb, #e5484d 10%, transparent)
--warning #ffa82f;  --warning-bg color-mix(in srgb, #ffa82f 12%, transparent)
--success #30a46c;  --success-bg color-mix(in srgb, #30a46c 10%, transparent)
```

**Icons get their own namespace** because an icon at the same alpha as its label reads heavier than
the label. `--icon-primary` is 80%, `--text-primary` is 100%, and that difference is why our icons
currently look slightly too loud next to their text.

### 1.3 Accent

```css
--accent        /* the mascot's colour, single source */
--accent-hover
--accent-subtle color-mix(in srgb, var(--accent) 12%, transparent)
```

**The accent has exactly one job: marking what the learner is doing now.** Current lesson, selected
answer, active tool, progress fill, selection, focus ring.

**The primary button is ink, not accent.** This is Sana's rule and the single biggest reason their
product reads as calm. Our accent belongs to the character; the interface does not compete with it.

Forbidden: accent on a heading, accent as a background wash for a whole panel, accent on more than
one element in a viewport at rest.

### 1.4 Dark mode

Every token above resolves through `--ink`, so dark mode swaps `--ink` and the ground, and the
eleven neutrals follow. Only `--bg-*` and the status colours need explicit dark values.

---

## 2. Typography

### 2.1 Family

We currently ship **system fonts** (`-apple-system, system-ui, ...`), which is why the app looks
different on macOS, Windows and Linux. All five references license a webfont precisely to stop that.

**Decision: Inter Variable**, self-hosted, with the `opsz` optical-size axis enabled.

Why: it is the only open face with a real optical-size axis, which is the mechanism behind Sana's
type quality (their scale carries a per-step `--text-*--optical-size`). Inter is common, but
genericness comes from *usage*, not from the face: a 700-weight 40px heading is generic in any
typeface. Used at the weights and tracking below, it will not read as a Tailwind template.

```css
--font-sans: "Inter Variable", -apple-system, system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

Mono stays as it is. It is already consistent and correct.

### 2.2 The scale

Nine steps. Everything above `body-lg` is content; everything at `ui` and below is chrome.

| token | size | weight | line height | tracking | use |
| --- | --- | --- | --- | --- | --- |
| `meta` | 11px | 500 | 16px | **+0.06px** | counts, timestamps. Sparingly |
| `caption` | 12px | 400 | 16px | +0.02px | helper text, metadata |
| `ui` | 12px | 500 | 16px | +0.02px | **chrome default**: buttons, sidebar, toolbar, tabs, menus |
| `ui-lg` | 13px | 500 | 18px | 0 | denser content controls, table headers |
| `body` | 16px | 400 | 25.6px (1.6) | -0.1px | **content default**: chat, notes, answers |
| `body-lg` | 18px | 400 | 28.8px (1.6) | -0.15px | long-form reading, lesson prose |
| `title-sm` | 20px | 500 | 28px (1.4) | -0.2px | section titles |
| `title` | 24px | 500 | 31px (1.3) | -0.35px | page titles |
| `display` | 32px | **450** | 37px (1.15) | -0.7px | the one big thing on a screen |

**Two densities, never mixed in one region.** A toolbar is `ui`. A lesson body is `body` or
`body-lg`. There is no 14px chrome and no 12px prose.

### 2.3 Weight ladder, and the guardrail

```css
--fw-normal: 400;   /* body */
--fw-medium: 500;   /* labels, UI, titles */
--fw-bold:   600;   /* emphasis. THE CEILING */
```

**`--fw-bold` is 600, not 700, deliberately**, so a careless `font-bold` cannot shout. Sana redefines
it to 500 for the same reason. Not one reference sets a heading at 700; three set display type at
**400**.

Hierarchy is size, colour, spacing and tracking. Weight is a fine adjustment.

### 2.4 Letter spacing crosses zero at 12px

Measured across all five references: sans tracking is **positive below 12px** and **increasingly
negative above**, plateauing near `-0.025em`.

| size | tracking | em |
| --- | --- | --- |
| 11px | +0.06px | +0.005em |
| 12px | +0.02px | +0.002em |
| 13px | 0 | 0 |
| 16px | -0.1px | -0.006em |
| 18px | -0.15px | -0.008em |
| 24px | -0.35px | -0.015em |
| 32px | -0.7px | -0.022em |
| 40px+ | -1.0px | -0.025em |

**Monospace inverts this** and takes positive tracking at every size (+0.03em), because mono
letterforms already sit in wide boxes and need separation to read as labels.

This is baked into the type tokens. No component sets `letter-spacing` by hand.

---

## 3. Spacing

Named by value, Figma's convention. `space-8` cannot drift from 8px and nobody has to remember
whether `md` is 6 or 8.

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

```css
--radius-2:    2px;   /* inline marks, tags */
--radius-4:    4px;   /* dense chrome, table cells */
--radius-6:    6px;   /* CHROME DEFAULT: toolbar buttons, sidebar rows, inputs, menu items */
--radius-8:    8px;   /* cards, small panels */
--radius-12:  12px;   /* large panels, dialogs, sheets */
--radius-full: 9999px /* pills: learner-facing actions, chips, avatars, the composer */
```

**Six values. Nothing else, ever.** Our codebase currently ships 26 distinct radii including 7px,
9px and 11px.

The rule, from `REFERENCE_CONFLICTS.md` §1: **the closer a control is to the learner's content, the
rounder it gets.** Chrome is square (6), containers are soft (8 to 12), the things a learner
presses to answer or choose are pills. Nothing above 12 except pills and the composer.

---

## 5. Control heights

```css
--control-compact:      24px   /* icon buttons in dense rails, inline chips */
--control-standard:     28px   /* CHROME DEFAULT: toolbar, sidebar rows, menu items */
--control-comfortable:  32px   /* inputs, selects, prominent chrome */
--control-large:        36px   /* primary actions, learner-facing controls */
--control-touch:        44px   /* mobile minimum. Never smaller on a touch target */
```

Five, but a given surface uses **two**. Chrome uses compact and standard. Content uses comfortable
and large. Every reference application uses exactly two (Figma 32/24, Sana 36/28).

---

## 6. Elevation

```css
--elev-flat:     none
--elev-raised:   inset 0 0 0 1px var(--border-default)     /* a border, not a shadow */
--elev-floating: 0 4px 24px color-mix(in srgb, var(--ink) 8%, transparent)
--elev-overlay:  0 16px 48px color-mix(in srgb, var(--ink) 12%, transparent)
```

Four levels; in practice the interface uses two. **Hierarchy comes from background steps and
hairlines, not from shadow.** Figma ships exactly two elevations for its entire product, both at 10%
opacity with a very wide blur and almost no offset. Sana's application chrome has effectively none.

**There is no `0 1px 2px` tight shadow.** A tight dark shadow is the signature of a generated
interface. If something needs to look raised, give it a border first; reach for a shadow only when
it genuinely floats above the document (menus, dialogs, drag previews).

---

## 7. Motion

```css
--dur-instant:  40ms    /* hover feedback: background, border */
--dur-fast:    120ms    /* colour, opacity, icon state */
--dur-standard:200ms    /* shape, size, position */
--dur-slow:    320ms    /* overlays, panels, drawers */

--ease-standard: cubic-bezier(0.2, 0, 0.2, 1)
--ease-out:      cubic-bezier(0, 0, 0.2, 1)
--ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1)
```

**The rule: the closer a change is to the pointer, the faster it resolves.** Sana's tiered model.
A hover that takes as long as a panel slide feels laggy; a panel that moves as fast as a hover feels
broken. One 0.15s for everything, which three of the four other references use, is simpler and wrong.

Full guidance in `/design/MOTION.md`.

---

## 8. Layout

```css
--reading-column:  672px   /* long-form prose. Recurs across three references */
--content-max:    1120px   /* a wide working surface */
--sidebar:         240px
--sidebar-narrow:  200px
--panel:           320px   /* inspector, sources, right-hand panels */
--panel-wide:      400px
--topbar:           48px
```

`672px` is the measured reading column at x.ai and Figma. Prose wider than that costs comprehension.

---

## 9. Focus

```css
--focus-ring: inset 0 0 0 2px var(--accent);
```

**Focus is an inset ring, not an outline.** Held at transparent when unfocused so it costs no layout
and cannot shift a row by a pixel when it appears. Sana's approach, and the reason their rows never
jump on keyboard navigation.

Every interactive element must have a visible focus state. This is not optional and is not a
preference.
