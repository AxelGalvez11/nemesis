# Brand

## The mark

Three dots, two up and one down. Owner, 2026-09-11, choosing from nine directions: three dots, "take out the ... dotted
ring", "invert vertically ... so two dots up and one dot down", and "make sure it doesn't resemble any other famous logo".

Geometry, in a 100-unit box: circles of radius 10.8 at (24.02, 35), (75.98, 35) and (50, 80), which puts their centres on
a circle of radius 30 at 210°, 330° and 90°. Flat fill, one colour, no ring, no gradient, no outline.

🔴 **The dot size is the rule that cannot move.** Every candidate was checked against the 3,459 brand logos in Simple
Icons: each pair scaled to one size, turned or flipped to its best match, and scored on how much of the shape overlaps.
For scale, Asana against Julia, two marks people genuinely confuse, overlap 87%. A typical unrelated logo overlaps about
19%.

| version | Asana | Julia | closest of all 3,459 |
| --- | --- | --- | --- |
| equal dots at the first sketch's size (radius 0.43 of the spacing circle) | 55% | 48% | Replit, 57% |
| dots that nearly touch | 94% | | Asana |
| **the mark, radius 0.36** | **42%** | **37%** | **HTC Vive, 46%** |

Turning the mark over changes none of these numbers; only the dot size does. No library holds every company, so a
trademark search is still the step before registering the mark.

## Where the mark lives

| file | notes |
| --- | --- |
| `apps/web/components/nemesis-mark.tsx` | the app's component, in the square `9.6 13.6 80.8 80.8`, centred optically |
| `apps/web/app/icon.svg`, `landing/app/icon.svg` | favicons: black, inverted to white where the browser reports dark mode |
| `apps/web/app/apple-icon.tsx`, `landing/app/apple-icon.tsx` | home-screen icons: black on an opaque white plate, 132px in 180 |
| `landing/components/NemesisMark.tsx` | the site's component; its viewBox hugs the ink, and its bead classes carry the state motion in `mark.css` |
| `apps/web/scripts/brand-raster.mts` | the only source of PNGs (`logo.png`, `logo-white.png`, `stripe-branding-512.png`): run `pnpm brand:raster`, never an image editor |
| `landing/public/nemesis/og.jpg` | the share image: the mark and the homepage headline in Inter |

Guards: `apps/web/lib/nemesis-mark.test.ts` and `landing/lib/mark.test.ts` hold every copy to one geometry and cap the dot
size.

Not yet carrying the mark: the phone app's icon (it changes with the next app build) and the image uploaded in Stripe's
branding settings.

## The wordmark

"Nemesis" with a capital N (owner, 2026-08-25), set in Inter 500 at 18px with -0.3px tracking, 8px after the mark in the
site header. The new surfaces use no letter-spaced capitals.

🔴 The mark is drawn small beside the word (owner, 2026-09-11: "make logo smaller"): 14px in the site header and the
app's pricing header, 16px in the site footer, 18px in the sign-in's 44px circle.

## Colour

Every neutral is one ink at an alpha step: rgb(10,18,23) on the sign-in and pricing (Sana's ink) and rgb(10,10,10) on the
marketing site. Saturated colour is reserved for the character's accent, rendered gradient art, the pricing switch's
green and state colours.
