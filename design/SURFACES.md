# Surfaces

Nemesis draws two families of surface, and they follow different references on purpose.

| family | surfaces | reference | density |
| --- | --- | --- | --- |
| Marketing and entry | www.enternemesis.com (home and pricing), the app's sign-in, sign-up, /auth/* and /pricing | sanalabs.com for the home page and sana.ai for the sign-in and pricing, measured live | 15 to 16px body, 34 to 67px heads, large radii |
| The app | the canvas, chat, library, study, calendar, reader, settings and every other workspace surface | DESIGN.md: Figma leads, Sana where Figma is silent | 12px chrome, 16 to 18px content, radius 6 chrome |

Both families share Inter with its optical-size axis, one ink at alpha steps for every neutral, the three-dot mark
(BRAND.md), and the copy rules in README.md.

🔴 Copying a reference is a measurement job. Read the reference's computed styles AND its stylesheet's rules in a real
browser, rebuild from the rules, then measure both pages side by side at several window sizes. The sign-in took four
passes because the first three copied boxes measured at one window size. Never copy a reference's logo, photographs,
illustrations or words.

## 1. The marketing site

Source: `landing/app/home-sana.css` (every number carries its provenance), `landing/components/reference` (SanaChrome,
Motion, Marquee, StudyTools, device, mockups).

- **Page**: a white ground with sand bands at rgb(246,245,244); a 52px header on a 1496px well with 32px gutters.
- **Type**: h1 66.87/400/63.53 at -0.67px; h2 48/500/48 at -0.96px; lead 15/21 at 54% ink; eyebrow and kicker 13/500.
- **Buttons**: 32px pills at 14px, solid ink or a ghost with a 10% ink ring.
- **Frames**: radius 24 for the hero film, 16 for photo cards (443x515), 28 for gradient grounds; faint rings and wide
  soft shadows.
- **Motion** (`motion.css`): cubic-bezier(0.16, 1, 0.3, 1); headlines reveal word by word; blocks rise, tilt, pop, drop
  and draw. Nothing hides before JavaScript arms it, and reduced motion shows everything at rest. Sana's rem is 10px, so
  convert every value read off their sheets.
- **Theme**: light only. `home-sana.css` pins the old site's tokens on `.sn` so a dark-mode computer cannot recolour it.
- **Art**: gradients are rendered images in one colour family, never CSS. Photographs are 4K and show objects, never
  people. The product is shown with real components or rendered films.
- **Words**: no testimonials. The school row names schools with one generic badge.
- **Deliverables** (`StudyTools.tsx`, owner 2026-09-11): Quizlet's "How do you want to study?" row, measured on its
  landing page at 1470 wide: cards 310x390, radius 24, 32 apart, title 24/32 centred 19px from the top, art from 70px
  down. Ours put a rendered gradient under a wordless skeleton mock of each tool (flashcards, tests, slides, mind map):
  four in a row, two by two under 1100px, a swipeable row on phones. A flashcard is graded with ✗ or ✓ and nothing else.
- **Films**: rendered by HyperFrames at 60fps from `~/Desktop/nemesis-reel/showcase-*.html` in the kit's app window,
  each a loop whose last second returns to its first frame, each under 1.5 MB (`lib/home.test.ts`). The note taker film
  follows the launch film's camera: the composer grows into a recorder, the camera closes in on the words as they are
  written, and after Stop the marked phrases fly into a full page of notes.

## 2. Sign-in, sign-up and /auth/*

Source: `apps/web/app/styles/auth.css`, `apps/web/components/AuthFrame.tsx`. Copied from the live stylesheet of
sana.ai/sign-in-to-sana and checked at 25 window sizes: every element within 1px at every common size.

- **Page**: padding 14/20/20 with gap 18; from 451px, 22/32/32 with gap 28; from 1400px wide and 850px tall, 22/62/62
  with gap 52, and the page shifts right by 8.33333%.
- **Top bar**: the mark in a 44px circle, and a pill nav at 4% ink with 13/500 links at 60% ink in Sana's link boxes.
- **Row**: under 821px, a column with the panel on top; above it, the form column at 31.8182% and the panel at 59.0909%,
  9.09091% apart.
- **Column rows**: h1 34/500/47.6 with its second line at 60% ink; 24; a two-line lead 16/24 at 60%; 32; the provider row
  at 40px; 12; "or" 14/500 at 25%; 12; a 48px field at radius 24 with a 15% hairline; 8; a 44px submit, quiet at 4% ink
  until the field is filled; 22; the legal line 13/19.5 at 40%, at least 78px tall.
- **Flow**: email first, password second. The security check floats under the form and covers the legal line only while
  it needs a click.
- **Panel**: radius 18 on rgb(23,24,26), holding the rendered laptop film. Phones get the still frame.
- **Dark**: the same construction on #212121 with a light ink.

## 3. Pricing, on both pages

Source: `landing/app/pricing/pricing.css` and `apps/web/app/pricing/page.tsx`. Measured on sana.ai's pricing panel.

- **Panel**: white, radius 40, a 1px rgb(239,239,239) edge, padding 42/48, shadows 0 0 4px at 4% and 0 12px 32px at 8%,
  rows 24px apart.
- **Switch**: a 48px pill at 5% ink, padding 10/24, gap 9; the switch is 26x16 and green, rgb(52,199,89), when on.
- **Cards**: 383px, radius 28 on 5% ink, padding 24/28. Name 16/500/22.4; 12; price 24/500/33.6, with the old price struck
  through at 60%; a 14/19.6 line at 60%; 24; a 44px pill; 16; list rows at 10/11 with 5% rules, a 16px check and 14/19.6
  text, the carried-over first row at 50%; 48 under the list.
- **Rules**: no price is typed into a page (every figure comes from the pricing module that is tested against checkout),
  and the yearly per-month figure never appears without the real yearly charge.

## 4. The app

DESIGN.md, TOKENS.md and COMPONENTS.md govern it. The chat, the canvas board, the reader and the calendar were matched to
named products and carry their own guards; COVERAGE.md lists every family and what governs it.
