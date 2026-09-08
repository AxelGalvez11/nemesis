# Anti-patterns

Rules that exist to stop the interface drifting back toward generated-looking defaults.

Each violation below is **measured in our codebase on `main` at `3e40f59a`**, not asserted. The
counts are the honest starting position and the yardstick for whether the migration worked.

---

## Our current state, measured

| what | count | verdict |
| --- | --- | --- |
| distinct hard-coded font sizes (`text-[Npx]`) | **24** across 401 uses | worst offender |
| distinct hard-coded radii (`rounded-[Npx]`) | **26** across 246 uses | worst offender |
| distinct arbitrary spacing values | **210** across 1,142 uses | worst offender |
| files with a raw `<button>` | **150** (a shared `ui/button.tsx` exists) | consolidate |
| icon libraries in use | **2** (lucide 28 files, tabler 22 files) | pick one |
| gradient declarations | 186 | audit |
| `backdrop-blur` uses | 168 | audit |
| shadow uses | 555 | audit |
| `font-bold` / weight 700+ | 160 | cap at 600 |
| sparkle icons | 14 | remove from AI affordances |
| arbitrary hex in components | 16 | tokenise |
| **emoji used as UI icons** | **0** | **already compliant** |

Sizes like `text-[12.5px]` and `text-[13.5px]`, and radii of 7px, 9px, 11px, 14px and 26px, are the
clearest evidence that values are being chosen per-component by eye. Sana ships seven type steps and
renders five. Figma's application uses three type sizes and two radii.

---

## Prohibited

### Typography
- **No arbitrary font sizes.** Nine tokens exist. `text-[13.5px]` is a bug.
- **No weight above 600.** `--fw-bold` is 600 by definition. Nothing is 700, 800 or 900.
- **No `text-4xl font-bold` headings.** Display type is 32px at weight 450 with tight negative
  tracking. Not one reference sets a heading above 600, and the largest display type measured
  anywhere (Figma, 88px) is weight 400.
- **No oversized marketing typography inside the application.** A 48px hero belongs on the landing
  page, never on a working surface.
- **No hand-set `letter-spacing`.** It is baked into the type tokens.
- **No unnecessary subtitle under every heading.** If the heading needs a sentence to explain it,
  fix the heading.

### Colour
- **No arbitrary hex in a component.** Semantic tokens only.
- **No generic purple/blue "AI" aesthetic.** No purple gradient, anywhere, for any reason.
- **No gradient used to make something look premium.** Gradients are permitted only where they carry
  meaning (a fade that signals scrollable content, a mask). 186 declarations currently need review.
- **No accent as the primary button.** The primary button is ink.
- **No more than one accent element visible at rest.**
- **No decorative colour.** Status colour appears only when something has happened.

### Surfaces
- **No cards inside cards.** If you have nested a card, one should have been a section.
- **No card as the default container.** Whitespace, then type, then a hairline, then a background
  step, and only then a container.
- **No tight shadows** (`0 1px 2px`). Two elevations exist, both wide and faint. A tight dark shadow
  is the clearest signature of a generated interface. 555 current shadow uses need auditing.
- **No gratuitous glassmorphism.** `backdrop-blur` is for genuine overlays above moving content.
  168 current uses need auditing; most are probably decorative.
- **No radius above 12px** except pills and the composer. No 16px, 20px, 26px or 28px containers.
- **No pill-shaped everything.** Chrome is radius 6. Pills are for learner-facing actions.

### Layout
- **No giant "Welcome back" dashboard greeting.**
- **No row of four arbitrary metric cards** at the top of a page. If a number is not actionable, it
  is decoration.
- **No huge empty gaps.** Spacing above 48px is for major page sections only.
- **No page-specific styling** where a shared component or token should exist.

### Icons
- **One icon library.** Lucide, at stroke width 1.5. Tabler is being removed.
- **No arbitrary inline SVGs** for things the icon set covers.
- **No emoji as interface icons.** (Currently compliant; keep it that way.)
- **No sparkle icons on AI affordances.** Nemesis is embedded in the workflow, not announced with a
  glyph.
- **No mixed stroke weights.**

### Motion
- **No entrance animations** on ordinary UI. No scroll reveals, no staggers.
- **No animation that does not tell the user something.**
- **No spring physics on chrome.** Springs belong to the character.
- **No transition longer than 320ms** in the application.

### Interaction
- **No hover-only controls** without a keyboard and touch path.
- **No invisible-but-clickable elements.** `opacity: 0` must be paired with `pointer-events: none`.
- **No generic chatbot interface** where conversation is not actually the right interaction.
- **No floating AI bubble** in the corner of every screen.

---

## Additional anti-patterns found in our codebase

These are ours specifically, discovered during the audit and in earlier work.

- **Three names for one concept.** `--ui-bg`, `--ui-bg-base` and `--ui-bg-primary` all exist, as do
  `--ui-border` and `--ui-stroke-primary`, and `--ui-surface-background` and `--ui-bg-card`. One
  concept, one token.
- **Eight named hues** (`--ui-blue`, `--ui-cyan`, `--ui-green`, `--ui-orange`, `--ui-purple`,
  `--ui-red`, `--ui-yellow`, `--ui-warm`) plus eight `--ui-kind-*` colours. A restrained system does
  not need sixteen hues.
- **A good token layer that components bypass.** We already build neutrals correctly as alpha over
  ink, which is the best idea in the entire reference set. Then 1,142 arbitrary spacing values and
  401 arbitrary font sizes go around it. **The architecture is not the problem; the discipline is.**
- **Two libraries for one job.** lucide-react and @tabler/icons-react, split roughly evenly.
- **Duplicated primitives.** `components/ui/button.tsx` exists and 150 files use a raw `<button>`.
- **Landing-page proportions inside the application.** 16px radii and 16px body text on the canvas,
  where Figma's application uses 4 to 5px radii and 11px text. This is the largest single reason the
  working surfaces read as generic.

---

## How this file is enforced

Guard tests, not review. A test that reads the source and fails on a raw `text-[Npx]`, a second
icon library, or a radius outside the scale is the only mechanism that survives contact with a
deadline. Listed in `/design/MIGRATION.md`.
