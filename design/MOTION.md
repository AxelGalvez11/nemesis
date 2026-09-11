# Motion

Motion is feedback. If an animation does not tell the user something, delete it.

## The rule

**The closer a change is to the pointer, the faster it resolves.**

Both references measured for the 2026-09-11 synthesis tier their durations rather than using one
figure for everything: a hover that takes as long as a panel slide feels laggy, and a panel that moves
as fast as a hover feels broken.

## Durations

| token | value | what moves | measured precedent |
| --- | --- | --- | --- |
| `--dur-instant` | **20ms** | hover background, hover border | Notion's hover fill is **0.02s**, about 1.2 frames |
| `--dur-fast` | **100ms** | colour, opacity, icon state | Sana 0.1s |
| `--dur-menu` | **150ms** | menus and popovers, which open from scale .98 and opacity 0 | Notion opens in 0.2s from scale .96 |
| `--dur-standard` | **200ms** | fades, rotations, shape and size | Sana 0.2s |
| `--dur-slow` | **320ms** | panels travelling, drawers, sheets | |

20ms is not really a transition. It is a refusal of one that still avoids the hard flicker of
`transition: none` on repaint. A sidebar row should feel connected to the cursor.

## Easing

```css
--ease-standard: cubic-bezier(0, 0, 0.2, 1)     /* default: everything up to 200ms */
--ease-out:      cubic-bezier(0, 0, 0.2, 1)     /* the same curve, named for things entering */
--ease-travel:   cubic-bezier(0.32, 0.72, 0, 1) /* a panel that travels, at 320ms */
--ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1)   /* things that leave and return */
```

One out-curve covers everything short, so a hover, a colour change and a menu all settle the same
way. `--ease-travel` is the exception and it is the reason a panel reads as arriving under its own
weight: it leaves quickly and decelerates for most of its run.

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

Every transition above must be disabled under `prefers-reduced-motion: reduce`. The synthesis
collapses all five durations to zero, menus included, with no exception carved out. This is not
optional.
