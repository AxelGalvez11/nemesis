# Figma: measured design analysis

Measured 2026-09-08 against **both** surfaces, which turned out to matter more than anything else
in this research:

- `figma.com` (marketing)
- `figma.com/files/recents` (the real signed-in application)

They are governed by two different systems, and the difference between them is the most useful
finding in this whole exercise.

---

## 1. What Figma does especially well

**Density without noise.** The file browser runs its entire interface at **11px** with 32px rows and
4px radii, and it does not feel cramped, because the density is uniform. Nothing is 11px next to
something 15px. The discipline is absolute.

**Semantic colour naming that survives a large team.** Figma's tokens are the most rigorous of the
five references, and the naming scheme is directly worth adopting (section 4).

**Chrome that yields to canvas.** Every pixel of Figma's chrome is designed to be ignorable. This is
the exact problem our canvas has.

---

## 2. The finding: application chrome and marketing use different systems

| | marketing site | the application |
| --- | --- | --- |
| dominant UI text | 16px / 400 / 23.2px | **11px / 450 / 16px** |
| largest text | 88px / 400 | **18px / 550** |
| control height | 36 to 39px | **32px and 24px** |
| radius | 12, 16, 24, 28, full | **4px and 5px** |
| letter spacing at UI size | normal | **+0.055px (positive)** |
| elevation | 2 large soft shadows | borders, almost no shadow |

The same company, the same brand, two deliberately different systems. The marketing site is
generous, round and large. The product is tight, square and small.

**This resolves a question our own app keeps getting wrong.** A productivity surface is not a small
landing page. Radius, type size and spacing should all step *down* when the user is working, not
merely reflow. Our canvas currently borrows landing page proportions (16px radii, 16px body) and
that is a large part of why it reads as generic.

---

## 3. Typography

### 3.1 The app scale, as rendered

```
11px / 450 / 16px   / +0.055px    the dominant UI text (25 of 78 leaf nodes)
11px / 550 / 16px   / +0.055px    emphasis at UI size (16 nodes)
13px / 400 / 22px   / -0.032px    secondary content
13px / 500 / 24px   / -0.003px
13px / 550 / 22px   / -0.032px
18px / 550 / 25px   / -0.075px    the largest element on the page
```

Three sizes carry the entire file browser: **11, 13, 18**.

### 3.2 Weights are variable-font half steps

`400, 450, 500, 550`. Figma uses a variable axis to get **450 and 550**, which sit between the
conventional steps. 450 is "body, but with a little more presence than regular"; 550 is "emphasised,
but not bold". Nothing on the surface is 700.

The marketing site goes the other way and uses **320 and 330** for nav and body, which are *below*
regular.

Combined with Sana (`bold = 500`) and x.ai (36px at 400, 60px at 500), the conclusion across all
references is unambiguous:

> **Hierarchy is carried by size, colour and spacing. Weight is a fine adjustment, and 700 is never
> used.**

### 3.3 Letter spacing crosses zero, and where it crosses is a rule

Every reference tracks type optically. Collected across all five:

| size | tracking | source |
| --- | --- | --- |
| 11px | **+0.055px** | Figma app |
| 11px | +0.5 to +0.6px | Figma mono labels |
| 11px | -0.11px | x.ai mono |
| 12px | +0.6px | Figma mono |
| 13px | -0.003 to -0.032px | Figma app |
| 16px | -0.12px | Figma marketing |
| 18px | -0.075px | Figma app |
| 30 to 32px | -0.66 to -0.8px | Figma, champ |
| 36px | -0.72px | x.ai |
| 44px | -0.66px | Figma |
| 56 to 60px | -1.25 to -1.5px | Figma, x.ai |
| 88px | -1.25px | Figma |

**Sans tracking crosses zero at roughly 12px.** Below that, letters are given air; above, they are
progressively tightened. **Monospace inverts it** and takes *positive* tracking at every size
(+0.48 to +0.6px), because mono letterforms already sit in wide boxes and need separation to read as
labels rather than data.

This is encodable as a rule rather than a table, and it is one of the highest-leverage details for
making type look considered rather than defaulted.

---

## 4. Colour: the naming scheme is the lesson

Figma's app ships a very large semantic palette. The values matter less than the **grammar**:

```
--color-{role}-{context}-{prominence}-{state}

roles:      bg | text | icon | border
prominence: (default) | secondary | tertiary
context:    onbrand | onselected | ondisabled | onsuccess | toolbar | menu | tooltip | ...
state:      hover | pressed | selected | disabled
```

Real examples:

```
--color-text-tertiary                     #0000004d      black at 30%
--color-bgtransparent-secondary-hover     #0000001a      black at 10%
--color-icon-danger-secondary             #dc3412
--color-border-onbrand                    #007be5
--color-icon-toolbar-selected-secondary   #80caff
--color-texthighlight                     #0d99ff66
```

Three things to take:

1. **Role comes first.** `text`, `icon`, `bg` and `border` are separate namespaces. A component asks
   for `icon-secondary`, never for "grey 500". This is why Figma's icons and labels can be tuned
   independently, which ours currently cannot.
2. **"On" contexts are first class.** `text-onbrand`, `icon-ondisabled`, `icon-onselected` mean a
   component placed on a coloured surface has a defined foreground rather than an improvised one.
   Our app has no equivalent and it shows wherever we place content on the accent.
3. **Neutrals are alpha over black**, exactly as Sana does it (`#0000004d` is 30%). Two of the five
   references independently arrived at alpha over ink.

Brand blue is `#007be5`, selection is the same blue at 40% (`#0d99ff66`).

---

## 5. Geometry

### 5.1 Radius: the app is nearly square

| context | radius |
| --- | --- |
| sidebar rows, chips (app) | **4px** |
| icon buttons (app) | **5px** |
| cards (marketing) | 12px |
| feature panels (marketing) | 24px |
| avatars, primary CTA | full |

The marketing tokens are named by value, which is the most legible convention of any reference:

```
--fig-radius-2  --fig-radius-4  --fig-radius-8
--fig-radius-12 --fig-radius-16 --fig-radius-24 --fig-radius-28 --fig-radius-full
```

`--fig-radius-8` cannot drift from 8px, and nobody has to remember whether `md` is 6 or 8. Compare
our own codebase, which carries 26 distinct hard-coded radii including 7px, 9px and 11px.

### 5.2 Spacing scale

```
none, 4, 6, 8, 12, 16, 24, 32, 40, 56, 64, 80, 120
```

Named by value again. Note what is missing: **no 20, no 48, no 96.** It is a 1.5x ladder with 6 as
the single half step near the bottom, where dense chrome needs it.

### 5.3 Control heights

The application uses **32px** (sidebar rows, buttons, the account chip) and **24px** (small icon
buttons). The marketing site uses 36 to 39px.

Across every reference measured:

| reference | control heights |
| --- | --- |
| Figma app | 32, 24 |
| Sana app | 36, 28 |
| x.ai | 38, 36, 32 |
| champ | 40 |

Applications cluster at 24 to 36. Marketing sites cluster at 36 to 40. Two heights per system, never
five.

---

## 6. Elevation

Figma ships **exactly two** elevations, and both are wide and faint:

```
--fig-elevation-1: 0 0.25rem 2rem    color-mix(in oklch, #000, transparent 90%)
--fig-elevation-2: 0 1.5rem 4.375rem color-mix(in oklch, #000, transparent 90%)
```

That is `0 4px 32px rgba(0,0,0,0.1)` and `0 24px 70px rgba(0,0,0,0.1)`. Large blur radius, tiny
offset relative to blur, **10% opacity in both cases**.

There is no `0 1px 2px` tight shadow anywhere. In the application, hierarchy comes from borders and
background steps, not shadow. Shadow is reserved for things that genuinely float above the document.

---

## 7. Motion

Marketing buttons: `background-color 0.15s ease-out`. The application surface declares almost no
transitions on its rows at all, which matches Sana's 0.02s finding: **chrome responds to the pointer
without a perceptible ramp.**

---

## 8. Icons

Stroke widths observed: **1.25** (marketing icons), and scaled decorative marks below that. Sizes
16, 18, 20, 24, 32, 36.

The app's icons are 24px and 32px boxes with the glyph inset, matching the roughly 50 to 60% glyph
to box ratio seen in Sana.

A 1.25 to 1.75 stroke across the references is consistently **lighter than Lucide's default of 2**.
If we adopt Lucide, the stroke must be set down explicitly or every icon will read heavier than the
reference set.
