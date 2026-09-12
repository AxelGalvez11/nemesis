# The Nemesis design system

Saved 2026-09-11, when the owner asked: "did you save the design styles? ... I need the design to encompass all the
components of your web app, everything."

This folder is the design system for everything Nemesis draws: the app, the sign-in, the marketing site and the brand.
When a screen and these files disagree, the screen is wrong.

## Read in this order

| file | what it decides |
| --- | --- |
| [SURFACES.md](SURFACES.md) | which family a surface belongs to, and the measured anatomy of the marketing site, the sign-in and pricing |
| [DESIGN.md](DESIGN.md) | the principles for the app: content over chrome, two densities, colour nearly absent |
| [BRAND.md](BRAND.md) | the mark, the wordmark, favicons and share images |
| [TOKENS.md](TOKENS.md) | colour, type, spacing, radius, control heights, elevation and motion values |
| [COMPONENTS.md](COMPONENTS.md) | every primitive and pattern, with its variants and states |
| [COVERAGE.md](COVERAGE.md) | every component family in apps/web, the rules that govern it, and where it stands |
| [ICONS.md](ICONS.md), [INTERACTIONS.md](INTERACTIONS.md), [MOTION.md](MOTION.md), [RESPONSIVE.md](RESPONSIVE.md) | the details |
| [ANTI_PATTERNS.md](ANTI_PATTERNS.md) | what is prohibited, and the guard that enforces it |
| [MIGRATION.md](MIGRATION.md) | the order the app moves onto the system |
| [PROVENANCE.md](PROVENANCE.md) | where every value came from: measured, interpolated or invented |

The research behind it is in /research/design-references (Sana, Figma, x.ai and champ, each measured in a live
browser). The app's values now come from the 2026-09-11 Sana and Notion synthesis instead; that comparison sheet is not
in git, so [PROVENANCE.md](PROVENANCE.md) records what was measured, what was judgement, and where the sheet lives.
The marketing site, sign-in and pricing are unaffected and keep their Sana rulings.

## Where it lives in code

- Tokens: `apps/web/app/styles/design-tokens.css`, imported by `globals.css`. Additive: it adds names and re-points none.
- Primitives: `apps/web/components/design`.
- Showcase: `/dev-preview/system` (the whole system on one page) and `/dev-preview/design` (every primitive, size and state).
- Marketing site: `landing/app/home-sana.css`, `landing/components/reference`, `landing/app/pricing/pricing.css`.
- Sign-in: `apps/web/app/styles/auth.css`, `apps/web/components/AuthFrame.tsx`.
- Guards: `apps/web/lib/design/design-system.test.ts`, `apps/web/lib/design/design-coverage.test.ts`,
  `apps/web/lib/auth-sign-in-panel.test.ts`, `apps/web/lib/nemesis-mark.test.ts`, `landing/lib/home.test.ts`,
  `landing/lib/pricing-page.test.ts`, `landing/lib/mark.test.ts`.

## The owner's rulings, newest first

These outrank anything older in this folder.

| date | ruling | applies to |
| --- | --- | --- |
| 2026-09-11 | **A state a person can switch off reopens from every screen it is visible from**, and a control only one screen draws is not that. Triggered by the owner closing the sidebar on the live app and being locked out of it, on every screen and across reloads | the app; INTERACTIONS.md Reversible state |
| 2026-09-11 | **The app's design is the Sana and Notion synthesis** ("our new design"), approved on a mockup of the rebuilt app. **Replaces "Figma leads the app's system"** below | the app; TOKENS.md, DESIGN.md |
| 2026-09-11 | **The app-screens pass starts now**, beginning with the new workspace shell and its sidebar. **Replaces "app screens are finished later"** below | the app; MIGRATION.md |
| 2026-09-11 | The mark is three dots, two up and one down, with no ring, and it must not resemble another famous logo | everywhere; BRAND.md |
| 2026-09-11 | The sign-in matches sana.ai's sign-in one for one | /sign-in, /sign-up, /auth/*; SURFACES.md §2 |
| 2026-09-11 | Pricing follows the new marketing style | both pricing pages; SURFACES.md §3 |
| 2026-09-11 | Every component family is covered by the system | COVERAGE.md, and its test |
| 2026-09-10 | The marketing site uses Sana's anatomy and motion (sand bands, weight 500 heads, word-by-word reveals). This reverses "Figma leads" for the marketing site only | landing; SURFACES.md §1 |
| 2026-09-10 | ~~App screens are finished later ("later on we'll finish the app screens"). Until then the token layer and the primitives change no existing screen~~ **REPLACED 2026-09-11: the pass has started** | the app; MIGRATION.md |
| 2026-09-10 | Real students at top universities may be named; schools appear as names with one generic badge, never a school's crest | landing |
| 2026-09-09 | ~~Figma leads the app's system, and Sana is used where Figma is silent~~ **REPLACED 2026-09-11 by the Sana and Notion synthesis** | the app; DESIGN.md |
| standing | No em dashes. No invented testimonials. Flashcards stay white. Generated images are 4K and show objects, not people. Gradients are rendered art in one colour family, never CSS | all copy and art |
