---
name: nemesis-design
description: The Nemesis design system. Use before building or changing ANY visual surface in apps/web or landing (a screen, component, page, dialog, icon, colour, font size, spacing, radius, motion, the logo, a favicon or share image) and whenever asked to make something look like a reference site. Tells you which family the surface belongs to, which measured numbers govern it, and which guards will fail.
---

# Nemesis design system

The system lives in `/design`. Read `/design/README.md` first: it holds the owner's rulings, newest first, and they
outrank everything older.

## Before drawing anything

1. Find the surface's family in `/design/SURFACES.md`. The marketing site, sign-in and pricing follow Sana, measured one
   for one; the app follows `/design/DESIGN.md`.
2. Find its row in `/design/COVERAGE.md`. A new component family needs a row, or `design-coverage.test.ts` fails.
3. For app work use the tokens (`apps/web/app/styles/design-tokens.css`) and the primitives (`apps/web/components/design`).
   A raw pixel value in a component is a bug, and `design-system.test.ts` caps them with ceilings that only go down.
4. Copying a reference is a measurement job: read computed styles and the stylesheet's rules in a real browser, rebuild
   from the rules, then measure both pages side by side at several window sizes. Never eyeball a screenshot, and never
   copy a reference's logo, photographs, illustrations or words.

## Rules that are easy to break

- No em dashes in anything a person reads. No invented testimonials.
- The mark's geometry and dot size are fixed (`/design/BRAND.md`); change every copy or none.
- The marketing site is light only; the app supports dark mode with one ink at alpha steps.
- Gradients are rendered art in one colour family, never CSS. Generated images are 4K and show objects, not people.
  Flashcards stay white.
- The app's screens move onto the system in their own pass. Until then keep the token layer additive: never rename or
  re-point an existing token or utility.
