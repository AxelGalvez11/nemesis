# Responsive behaviour

No reference gave us usable mobile application behaviour: only marketing pages were
responsive-testable. This file is therefore **reasoned from our own layout constraints**, not
copied, and should be treated as the least evidence-backed part of the system.

## Breakpoints

```
sm   640px    phone
md   768px    large phone, small tablet portrait
lg  1024px    tablet landscape, small laptop
xl  1280px    laptop
2xl 1536px    large desktop
```

## The principle

**A narrower screen gets a different arrangement, not a smaller one.** Scaling a desktop layout down
is the failure mode. Density stays roughly constant; what changes is *which* surfaces are present
and how they are reached.

## What each surface does

| surface | desktop (xl+) | laptop (lg) | tablet (md) | phone (sm) |
| --- | --- | --- | --- | --- |
| **sidebar** | 240px, pinned | 200px, pinned | collapses to icon rail | **drawer** over content |
| **canvas** | full remaining width | full remaining | full width | full width, pan and zoom only |
| **right panel** (sources, inspector) | 320px, docked beside content | 320px, docked, content narrows | **overlay sheet** | **full-screen sheet** |
| **reading pane** | docked, content narrows | docked | full-width tab | full screen |
| **chat / thread** | 672px column, centred | 672px centred | full width, 24px gutters | full width, 16px gutters |
| **toolbar** | all controls inline | all inline | overflow into a menu | primary action plus overflow menu |
| **tabs** | inline | inline | scrollable row | scrollable row, or a select |
| **split view** | side by side | side by side | **stacked** | stacked |
| **dialog** | centred, max 560px | centred | centred, 90vw | **bottom sheet, full width** |
| **context menu** | popover at pointer | popover | popover | **action sheet from the bottom** |
| **tooltip** | on hover | on hover | **suppressed** | **suppressed** |

## Density changes

Only one thing changes with viewport, and it changes for input reasons rather than space reasons:

**Touch targets grow to 44px minimum below `lg`.** A 24px icon button is fine with a cursor and
unusable with a thumb. Type sizes, radii and spacing do **not** change: 12px chrome text is 12px on
a phone.

## Content width

The reading column stays at **672px** at every size above it, and takes the full width minus
gutters below. Prose does not get wider on a big monitor; it gets more margin.

## What disappears

Below `md`:
- hover-revealed controls become always-visible (there is no hover on touch)
- tooltips are suppressed entirely; the label must exist elsewhere
- the minimap and secondary canvas chrome are hidden
- multi-select via drag is replaced by long-press

## What we must not do

- shrink the desktop layout and call it responsive
- hide a primary action behind a hover on touch
- ship a control smaller than 44px on a touch device
- allow horizontal page scroll at any width (a wide table scrolls inside its own container)
- change the type scale per breakpoint
