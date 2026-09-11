# Sana: measured design analysis

Measured 2026-09-08 against the live product (signed in) and its shipped stylesheet
`index-DqwpnF74.css`, 337 KB. Everything below is a **read value**, not an impression. Where a
number is inferred rather than measured it says so.

Companion references measured the same way: `x.ai`, `champ.ai`. See the end of this file.

---

## 0. The methodological trap, and why most of the bundle is not Sana

Sana's stylesheet is Tailwind v4.1.7 plus **Mantine**, plus the **BlockNote** editor, plus KaTeX:

| system | evidence in the bundle |
| --- | --- |
| Tailwind v4.1.7 | 1,133 `--tw-*` references, banner comment |
| Mantine | 1,073 references, the whole default component theme |
| BlockNote | 194 `--bn-*` variables (the block editor) |
| KaTeX | 106 references, full math font set |

The file declares 715 non-Tailwind custom properties. **Roughly 600 of them are Mantine's stock
theme shipped whether or not Sana uses the component.** `--button-height-sm: 36px`,
`--avatar-size-md: 38px`, `--badge-height-md: 20px` and the rest of that family are Mantine
defaults. Reading them as Sana's design decisions would be documenting Mantine and calling it Sana.

**What Sana actually authored is a short list**, established by diffing against stock defaults:

- the colour system (entirely custom)
- the type scale, including an optical-size axis (Tailwind's defaults are rem based; Sana's are px
  with a custom `--text-*--optical-size` per step)
- the font weight ladder (Tailwind's `bold` is 700; Sana's is 500)

**Radius and spacing are stock Tailwind, untouched.** That is itself the finding: Sana overrode
colour and type, and accepted the library everywhere else. The restraint is the system.

Everything in section 2 below is therefore measured from **rendered** elements, not declarations.

---

## 1. Colour

### 1.1 The one idea worth stealing: greys are alpha over a single ink

Sana does not ship a grey palette. It ships **one ink** and an alpha ramp over it.

```
--color-foreground-primary : #0a1217          /* the ink: a very dark desaturated blue */
--color-foreground-5       : #0a12170d        /* same ink, 5% */
--color-foreground-10      : #0a12171a
--color-foreground-60      : #0a121799
--color-foreground-95      : #0a1217f2
```

25 steps: `0,1,2,3,4,5,6,7,8,9,10` then every 5 to `95`. Fine granularity at the bottom, where
hairlines and washes live, coarse at the top, where text lives.

Why this matters more than it looks:

- **Every neutral is guaranteed to harmonise**, because every neutral is the same hue.
- **Surfaces compose.** A 5% wash over white and the same 5% wash over a card both read correctly,
  because the wash is transparent rather than a baked hex.
- **Dark mode is one variable.** Swap the ink and the entire ramp follows.

Sana keeps exactly three solid escape hatches, for the cases where transparency is wrong (text over
an image, a border that must not let colour through):

```
--color-foreground-secondary-solid : #686d70
--color-foreground-muted-solid     : #5d5d5d
```

Named aliases sit on top of the ramp so components never reference a number:

```
--color-foreground-primary   = #0a1217        (100%)
--color-foreground-secondary = #0a121799      (60%)
--color-foreground-muted     = #0a121766      (40%)
```

**Three text weights of ink. Not five, not eight.**

### 1.2 Backgrounds

```
--color-background-primary : #fff
--color-paper              : #fafafa
--color-background-muted   : #1313141a
--color-background-secondary : #131314f5     /* near-opaque dark */
--color-background-tertiary  : #131314d9
```

Note the second ink. Dark surfaces (tooltips, menus, overlays) use `#131314`, a **neutral** near
black, while text uses `#0a1217`, a **blue** near black. The dark chrome is deliberately cooler
than the text. Both are alpha driven, so a menu over content lets a hint of the page through.

### 1.3 Accent, and how little of it there is

```
--color-background-accent  : #cdfe00      /* acid lime */
--color-brand-lime         : #0d0
--color-foreground-accent  : #0a1217      /* the accent foreground IS the ink */
--color-foreground-accent-alt : #fd2d55   /* hot pink, rare */
```

The critical measurement: **the primary button is not lime.** Measured on the rendered Upgrade
button:

```
background: rgb(10, 18, 23)   /* the ink */
color:      rgb(255, 255, 255)
```

The lime is a *background* accent, reserved for brand moments and highlight fills. The workhorse
"primary" affordance is simply the darkest neutral. This is the single biggest reason the product
reads as calm rather than as a startup landing page: **the accent is never load bearing in the UI.**

### 1.4 Semantic colour

```
--color-alert   : #ff3b30    (iOS system red)
--color-warning : #ffa82f
```

Both are Apple system colours, and both appear with a matching low alpha background
(`#ff3b300f`, `#ffa82f1a`). There is **no semantic green**. Success is communicated structurally,
not chromatically.

---

## 2. Typography

### 2.1 The scale, as declared

| token | size | line height | computed | optical size |
| --- | --- | --- | --- | --- |
| `xs` | 12px | 1.3 | 15.6px | 14 |
| `sm` | 14px | 1.4 | 19.6px | 15.1 |
| `base` | 16px | 1.5 | 24px | 16.2 |
| `lg` | 18px | 1.6 | 28.8px | 17.3 |
| `xl` | 20px | 1.6 | 32px | 18.4 |
| `2xl` | 24px | 1.4 | 33.6px | 20.5 |
| `3xl` | 34px | 1.15 | 39.1px | 26 |

**Seven steps. That is the whole scale.**

Two things here are not obvious and are worth copying:

**a. The line height curve is a hump, not a slope.** It rises 1.3 → 1.6 through the reading sizes,
then collapses to 1.15 at display. Small UI text is set tight because it sits in rows and chips
where vertical rhythm matters more than readability. Long-form body text at 18 to 20px is set
loosest, because that is what people actually read. Display is set nearly solid, because a 34px
heading with 1.6 line height looks like a marketing site.

**b. Optical size is a real axis on a variable font.** The values 14, 15.1, 16.2, 17.3, 18.4 are an
arithmetic run of +1.1 across the reading sizes, then jump for display. The font gets *optically*
larger more slowly than it gets *metrically* larger, which keeps small text from looking spindly and
large text from looking bloated. Most products cannot do this because most products do not license
a variable font with an `opsz` axis. **We can approximate the intent without the axis** (see
`/design/TOKENS.md`).

### 2.2 Weight: "bold" is 500

```
--font-weight-light    : 300
--font-weight-normal   : 400
--font-weight-book     : 450
--font-weight-medium   : 500
--font-weight-bold     : 500      <-- not 700
--font-weight-semibold : 600
```

`bold` and `medium` are **the same value**. Sana redefined bold downward so that a careless
`font-bold` in a component cannot shout. 600 exists but is rare in the render. The measured UI uses
400 for content and 500 for labels, with 600 appearing once (a "View all" link).

There is also a `book` weight at 450, a half step used for body copy that wants a fraction more
presence than 400 without becoming a label.

### 2.3 What is actually rendered

Sampling every leaf text node on the agent surface:

```
16px / 400 / 24px      body and composer
14px / 400 / 19.6px    secondary content
14px / 500 / 19.6px    control labels, nav rows
13px / 500 / 18.2px    dense controls
12px / 400 / 15.6px    metadata
```

**Five combinations carry the entire interface.** Of a seven step scale, the app surface uses
12, 13, 14 and 16. Everything above 16 is reserved for content, not chrome.

### 2.4 Families

```
--font-sans  : "Sana Sans", ... system fallbacks
--font-serif : "Sana Serif"
--font-mono  : "IBM Plex Mono", monospace
```

Sana Sans and Sana Serif are proprietary and **must not be copied**. IBM Plex Mono is open (SIL
OFL) and is a legitimate direct adoption if we want it.

---

## 3. Geometry

### 3.1 Radius is stock Tailwind and mostly unused

Declared: `2, 4, 6, 8, 12, 16, 24, 32`px. In the render, three values do all the work:

| radius | used for |
| --- | --- |
| **fully round** (`9999px`) | every text button, every nav row, chips, the avatar |
| **8px** | small square icon buttons (28px) |
| **32px** | the composer |

There is no 4px, 6px, 12px or 16px in the measured chrome. The rule is closer to a decision than a
scale: **rounded rectangles are for containers of icons; everything a finger or cursor presses is
either a pill or the composer.**

### 3.2 Control sizes: there are two

Every interactive control measured on the surface is **36px** or **28px** tall. Nothing else.

| control | height | padding | radius | type |
| --- | --- | --- | --- | --- |
| primary button | 36 | 6px 16px | pill | 14 / 500 |
| secondary button | 36 | 6px 16px | pill | 14 / 500 |
| nav row | 36 | 0 14px | pill | 14 / 500 |
| icon button (large) | 36 x 36 | 0 | pill | icon 16 to 20 |
| icon button (small) | 28 x 28 | 0 | 8px | icon 14 to 16 |
| dense control | 28 | 0 | 8px | 13 / 500 |

The composer is the one exception, at 56px tall with 32px radius and `16px 56px` padding, on a
`foreground-5` wash with **no border**.

### 3.3 Borders

Measured on the secondary button: `1px solid rgba(10, 18, 23, 0.1)`, which is exactly
`--color-foreground-10`. Borders are the alpha ramp, never a separate border colour. The primary
button carries `1px solid transparent` so that primary and secondary are the same box, which keeps
them on the same optical baseline.

### 3.4 Icons

Rendered SVG box sizes on one surface: **14, 15, 16, 18, 20, 24**. No 12, no 32. Icon buttons pair
a 28px box with a 14 to 16px glyph, and a 36px box with a 16 to 20px glyph, so the glyph occupies
roughly **50 to 55% of its button**. That ratio is the actual rule, not the pixel value.

---

## 4. Motion

Measured `transition` on rendered elements:

| what | duration | easing |
| --- | --- | --- |
| nav row background and ring | **0.02s** | `ease-in-out` |
| text and icon colour | 0.1s | `cubic-bezier(.25,.5,.25,1)` |
| system default | 0.15s | `cubic-bezier(.4,0,.2,1)` |
| buttons, surfaces | 0.2s | `cubic-bezier(.4,0,.2,1)` |
| composer padding | 0.15s | `cubic-bezier(.4,0,.2,1)` |

**0.02 seconds is 1.2 frames.** That is not a transition, it is a deliberate refusal of one: the
sidebar responds to the pointer with no perceptible delay, while still avoiding the hard flicker of
`transition: none` on a repaint. Colour moves at 0.1s. Anything that changes *shape* or *position*
moves at 0.2s.

The rule: **the closer a change is to the pointer, the faster it resolves.** Hover feedback is
instant, state changes are quick, layout is merely fast.

`cubic-bezier(.25,.5,.25,1)` is Sana authored (it is not a Tailwind or Material curve). It is
gentler out of the gate than Tailwind's standard curve and settles sooner.

Only two keyframe animations exist in the entire bundle: `growBorder` (0.5s) and `pulse` (2s). There
is no entrance animation library, no stagger, no scroll reveal in the product surface.

### Focus

Focus is an **inset box shadow**, not an outline:

```
box-shadow: inset 0 0 0 2px <colour>
```

Held at transparent when unfocused so the ring costs no layout and animates in place. This is why
focus never shifts a row by a pixel.

---

## 5. The design principles this implies

Stated as rules, since that is what we need:

1. **Content outranks chrome, and the colour system enforces it.** Chrome is built from the alpha
   ramp, which is by construction low contrast. Content is ink at full strength. You cannot
   accidentally make a toolbar louder than a paragraph.
2. **The accent is decorative, never functional.** Primary actions are the darkest neutral. The
   lime appears in brand moments. A user never has to find the lime thing to proceed.
3. **Two control heights.** A design with two heights cannot drift. Every new control is 36 or 28.
4. **Separate with space and a hairline, not with a card.** Borders are 1px at 10% ink. The measured
   surface has almost no elevation: shadows are absent from the chrome entirely.
5. **Bold is 500.** The system makes shouting impossible at the token level rather than by review.
6. **Hover is instant, motion is short, and nothing animates on entry.**
7. **The scale is small and the used subset is smaller.** Seven type steps, five in use. Eight radii,
   three in use. The discipline is in what is declined.

---

## 6. The companion references

### x.ai (measured 2026-09-08)

A different route to the same restraint.

- **Named atmospheric palette** rather than a numeric ramp: `ash, breeze, charcoal, dawn, dove,
  dusk, evenfall, fog, ink, ivory, jet, midnight, nimbus, pewter, steel, sunset, twilight, umbra`.
  Stored as bare HSL triplets (`--color-ink: 213 11% 16%`).
- **UI text is 13px/400 with 1.625 line height**, smaller than Sana's 14. Labels drop to 11px in
  `GeistMono` with `-0.11px` tracking.
- **Display is 60px / 500 / line height exactly 1.0 / `-1.5px` tracking.** Tight, low weight, large.
  The opposite of a 700 weight marketing headline.
- Negative tracking is applied systematically and scaled with size: `-0.11px` at 11px, `-0.12px` at
  12px, `-0.8px` at 32px (champ), `-1.5px` at 60px.
- Everything pressable is a pill. Surface radius is `0.5rem`.
- Transitions are uniformly `0.15s cubic-bezier(.4,0,.2,1)`.

**Takeaway we should adopt:** optical tracking that tightens as type grows, and a display style
defined by size and tightness rather than weight.

**Takeaway we should decline:** poetic colour names. `--color-evenfall` requires a decoder ring.
Sana's `foreground-60` tells you what it does.

### champ.ai (measured 2026-09-08)

- **The ground is warm, not white:** `#f8f5f1`. Ink is `#1a1a1a`.
- A custom warm neutral layer (`--color-c-gray-*`, `--color-c-warm-*`) sits on top of stock Tailwind
  v4 colours, with a warm border at `#4a3e34`.
- **Exactly one saturated colour in the whole interface:** the `#da7007` burnt orange CTA.
- `--font-weight-bold: 700`, and display is 32px / 600 / `-0.8px`.
- Buttons are 40px pills.

**Takeaway we should adopt:** the off-white ground. Pure `#ffffff` under long-form reading is
harsher than a warm or cool tinted paper, and both Sana (`--color-paper: #fafafa`) and champ do this.

---

## 7. Convergence

Where three independently designed products agree, we are looking at a rule rather than a taste:

| all three do this | evidence |
| --- | --- |
| near monochrome, one accent, used sparingly | lime / none / orange |
| off-white or white ground, dark near-neutral ink | `#fafafa` / `#fff` / `#f8f5f1` |
| pill for pressable, small radius for containers | all three |
| small UI type, 13 to 14px, weight 500 for labels | all three |
| display type gets tighter, not heavier | `-1.5px`, `-0.8px`, lh 1.15 |
| fast transitions, 0.15s class, one standard curve | all three |
| a proprietary sans | all three, which is what we must solve for ourselves |

Where they disagree, Sana is the better model for us, because it is an application and the others
are marketing sites: the alpha ramp, the two control heights, the instant hover, and the refusal to
make the accent functional.
