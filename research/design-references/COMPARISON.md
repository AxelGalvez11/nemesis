# Reference comparison

Five surfaces measured 2026-09-08: **Sana** (signed-in app), **Figma** (signed-in app *and*
marketing), **x.ai** and **x.ai/bot** (marketing), **champ.ai** (marketing).

Two of the five gave up a real application. Those two carry the most weight for our chrome, because
we are building an application. The marketing sites are useful mainly for type and colour restraint.

---

## The matrix

| Dimension | Sana | Figma | x.ai | champ | **Best reference** |
| --- | --- | --- | --- | --- | --- |
| **Chrome density** | 36 / 28px controls, 14px text | **32 / 24px controls, 11px text** | 38px, 13px | 40px, 16px | **Figma** |
| **Content typography** | **18 to 20px at 1.6 line height** | 13px, content is canvas | 14px at 1.43 | 16px at 1.2 | **Sana** |
| **Colour architecture** | **alpha ramp over one ink, 25 steps** | alpha over black, role-first names | named atmospheric | warm hex + stock Tailwind | **Sana** for construction, **Figma** for naming |
| **Token naming** | `foreground-60` (numeric) | **`--color-text-tertiary`, `--fig-space-8`** | `--color-evenfall` | `--color-c-warm-850` | **Figma** |
| **Display typography** | 34px / lh 1.15 | 88px / 400 / -1.25px | **60px / 400 / -1.5px** | 32px / 600 / -0.8px | **x.ai** |
| **Weight discipline** | **`bold` redefined to 500** | 320 to 550 variable half steps | 400 at display | keeps 700 | **Sana** for the guardrail, **Figma** for the ladder |
| **Letter spacing** | none declared | **crosses zero near 12px, scales with size** | scales with size | scales with size | **Figma** |
| **Radius** | pill or 8px, stock scale unused | **4 to 5px in app, 12 to 24px in marketing** | 6 / 12 / 24 / pill | pill | **Figma** |
| **Elevation** | almost none | **two levels, 10% opacity, wide blur** | one soft shadow | none notable | **Figma** |
| **Motion** | **0.02s hover, 0.1s colour, 0.2s shape** | 0.15s ease-out, no row transition | 0.15s everything | 0.15s everything | **Sana** |
| **Focus** | **inset ring, 2px, no layout shift** | inset | outline | outline | **Sana** |
| **Accent usage** | lime, decorative only; primary button is ink | blue, functional and narrow | **none at all** | one orange, one job | **Sana** |
| **Ground colour** | `#fff` and `#fafafa` paper | `#fff` | `#fff` / `#f9f8f6` | **`#f8f5f1` warm** | **champ** |
| **Icons** | 14 to 24px, 50 to 55% of button | 1.25 stroke | **1.75 stroke** | not measurable | **x.ai** |
| **Spacing scale** | stock Tailwind, unmodified | **4/6/8/12/16/24/32/40/56/64/80/120, named by value** | stock | stock | **Figma** |
| **Editor / content blocks** | **BlockNote, block-based** | canvas | none | none | **Sana** |
| **Mobile** | not measured | not measured | responsive marketing | responsive marketing | none, decide ourselves |

---

## The three findings that matter most

### 1. Applications and marketing sites are different systems

Figma proves it inside one brand. Same company, same typeface, two systems:

| | Figma marketing | Figma app |
| --- | --- | --- |
| UI text | 16px | **11px** |
| control height | 36 to 39px | **32 / 24px** |
| radius | 12 / 16 / 24 / 28 | **4 / 5px** |
| tracking at UI size | normal | **+0.055px** |

Our application currently borrows landing-page proportions: 16px radii, 16px body text, generous
padding. **That single mismatch is most of why our canvas reads as generic**, and it is fixable
without touching a single component's behaviour.

### 2. Three of five independently built neutrals as alpha over one ink

Sana (`#0a1217` at 25 alpha steps), Figma (`#000000` at 10%, 30%), x.ai (`rgba(10,10,10,0.04)`).
None of them ship a grey palette. Neutrals that are transparent compose correctly over any surface,
harmonise by construction, and make dark mode a single variable swap.

**We already do this** (`--ui-text-primary: color-mix(in srgb, var(--ui-base) 100%, transparent)`).
Our problem is not the architecture. It is that components bypass it.

### 3. Nobody uses bold for hierarchy

| reference | display weight |
| --- | --- |
| x.ai | **400** at 60px |
| Figma | **400** at 88px |
| Sana | 500 max, `bold` redefined to 500 |
| champ | 600 |

Not one reference sets a heading at 700. Hierarchy is size, colour, spacing and tracking. Weight is
a fine adjustment. The generic-SaaS signature is `text-4xl font-bold`, and avoiding it is close to a
free win.

---

## What no reference gave us

- **Mobile application behaviour.** Only marketing pages were responsive-testable. Our
  `/design/RESPONSIVE.md` is therefore reasoned from our own layout constraints, not copied.
- **Educational components.** Sana Learn's course, lesson, poll and quiz surfaces were not reachable
  from the account available. Sana's agent surface, its block editor architecture (BlockNote) and its
  content type scale are documented; the learning components in `/design/COMPONENTS.md` are designed
  from our own product requirements, marked as such, and are the part of this system with no
  measured precedent behind it.
