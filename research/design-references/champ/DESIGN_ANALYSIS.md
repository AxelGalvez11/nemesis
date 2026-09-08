# champ.ai: measured design analysis

Measured 2026-09-08. A marketing site only; no application surface is reachable. The sample is
therefore thinner than the others and is used here for exactly two things it does better than the
rest.

---

## What this product does especially well

**A warm ground instead of white.** The page sits on `#f8f5f1`, a warm off-white, with ink at
`#1a1a1a`. Against the cool near-whites of every other reference it reads as calmer and less
clinical, and long-form reading on it is measurably easier on the eye than on `#ffffff`.

**Exactly one saturated colour in the entire interface.** A burnt orange, `#da7007`, on the primary
call to action and nowhere else. It is the clearest demonstration in the reference set of an accent
earning its place by scarcity.

---

## Design philosophy, inferred

1. **Warmth is a system decision, not a decoration.** The neutrals are warm all the way down: a
   custom `--color-c-gray-*` and `--color-c-warm-*` layer sits on top of stock Tailwind, with a warm
   border at `#4a3e34` rather than a neutral grey.
2. **One accent, one job.** The orange appears on "Request demo" and is absent from every other
   control. Secondary actions are ink on transparent.
3. **Display tightens, like everywhere else**: 32px / 600 / `-0.8px`.

---

## Measured values

```
page ground     #f8f5f1        warm off-white
ink             #1a1a1a
warm border     #4a3e34
accent          #da7007        the single saturated colour
--font-weight-bold  700        (the only reference that keeps 700)

32px / 600 / 35.2px / -0.8px   display
16px / 400 / 19.2px            body
14px / 600 / 16.8px            labels
12px / 400 / 14.4px            metadata

primary button  40px tall, 8px 22px, radius full, bg #1a1a1a
accent button   40px tall, 0 14px,   radius full, bg #da7007
nav link        40px tall, 12px 0,   radius 0
transition      0.15s cubic-bezier(.4,0,.2,1)
```

Font is `metroSans` (proprietary) with Roboto Mono for code.

## What we should not take

champ is the least disciplined reference. It ships the whole stock Tailwind palette (amber, blue,
emerald, red, teal, violet, yellow at multiple steps) alongside its custom warm layer, so the
restraint visible on the page is a matter of authorial care rather than of a system that prevents
mistakes. It also keeps `bold = 700`, against every other reference.

We take the warm ground and the single-accent discipline. We take nothing structural.
