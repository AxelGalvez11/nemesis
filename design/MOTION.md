# Motion

Motion is feedback. If an animation does not tell the user something, delete it.

## The rule

**The closer a change is to the pointer, the faster it resolves.**

Taken from Sana, the only reference that tiers its durations. The other three use one 0.15s for
everything, which is simpler and wrong: a hover that takes as long as a panel slide feels laggy, and
a panel that moves as fast as a hover feels broken.

## Durations

| token | value | what moves | measured precedent |
| --- | --- | --- | --- |
| `--dur-instant` | **40ms** | hover background, hover border | Sana uses **0.02s**, about 1.2 frames |
| `--dur-fast` | **120ms** | colour, opacity, icon state | Sana 0.1s |
| `--dur-standard` | **200ms** | shape, size, position, transforms | Sana 0.2s |
| `--dur-slow` | **320ms** | overlays, drawers, sheets, panels | |

40ms is not really a transition. It is a refusal of one that still avoids the hard flicker of
`transition: none` on repaint. A sidebar row should feel connected to the cursor.

## Easing

```css
--ease-standard: cubic-bezier(0.2, 0, 0.2, 1)   /* default: most things */
--ease-out:      cubic-bezier(0, 0, 0.2, 1)     /* things entering, or following a gesture */
--ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1)   /* things that leave and return */
```

Sana authors its own curve (`cubic-bezier(.25,.5,.25,1)`), gentler out of the gate than Tailwind's
standard and settling sooner. Ours is close in character.

## What never animates

- **Entrances.** No fade-in, no slide-up, no stagger, no scroll reveal. A list of lessons appears.
- **Layout on load.** If it moves after paint, it is a bug (and it costs us CLS).
- **Chrome with springs.** Springs belong to the character, which has its own vocabulary
  (`.claude/skills/motion-vocabulary`).
- **Anything longer than 320ms** inside the application.

## Transition properties, never `all`

`transition: all` animates properties you did not intend, including layout, and is a common source
of jank. Name the properties.

```css
/* good */ transition: background-color var(--dur-instant) var(--ease-standard);
/* bad  */ transition: all 0.2s;
```

## A frozen transition reports a false computed value

Recorded because it has cost two wrong diagnoses in this codebase. In a hidden browser context there
are no rendering opportunities, so a CSS transition sits at `currentTime: 0` forever, and **CSS
transitions outrank `!important` in the cascade**. `getComputedStyle` then returns the *from* value
and looks exactly like a layout bug.

**Never measure geometry or any property carrying a `transition-*` class in a hidden pane.** Use a
real headless browser. See `docs/` and the memory note on this.

## Reduced motion

Every transition above must be disabled under `prefers-reduced-motion: reduce`, except opacity
changes under 120ms. This is not optional.
