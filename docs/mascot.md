# The Nemesis mascot

Engine: `apps/web/lib/mascot`. Renderer: `apps/web/components/mascot`.
Lab: `/mascot-lab` (canonical `/dev-preview/mascot-lab`).

## What it is

One flat blob, drawn procedurally from a radial profile `r(theta)`. The silhouette is a
superellipse — round-cornered with real sides, so neither a ball nor an oval — and the
eyes are that same shape at a much smaller scale, stood upright and cut out of the form.
One ink, one eye colour, no gradient, no gloss, no shadow: the character sits beside
dense reading material, and a rendered-looking object next to a paragraph competes with
the paragraph.

Four axes, kept apart on purpose:

| axis | what it says | where |
|---|---|---|
| **state** (27) | what the system is *doing* | `states.ts` |
| **expression** (9) | how the character feels about it | `expressions.ts` |
| **shape** (8) | which silhouette it is wearing | `shapes.ts` |
| **presence** (0–1) | whether it is here at all | `engine.ts` |

Keeping them apart is what stops the catalogue squaring. 27 × 9 is 243 faces out of 36
things to author, and `evaluating` can be keen or concerned without a second state.

`sample(t)` is a pure function of time. Pausing, scrubbing, freezing 27 states at 27
timestamps on one page, screenshotting a transition at 40%, and testing the geometry
with no browser are all the same mechanism.

## Read against jeremy-prt/bloub

Bloub is the Grok/xAI mascot rebuilt in the open. It was read as an **engineering**
reference and nothing else: none of its silhouette, face, eye proportions, expressions,
states, timings or personality are here.

### Taken, because they are good engineering

- **A clockless engine.** `sample(t)` pure; no `Date.now`, no `Math.random`, nothing
  accumulated per frame. Everything downstream depends on it.
- **Shared angular sampling.** Every silhouette sampled at the same angles, so any two
  morph by plain interpolation and no path-morphing library is needed.
- **Frozen composite pose.** A state change landing inside a running fade blends from
  the frame actually on screen, and *only* then — freezing on every change would stop
  the outgoing state's own animation dead.
- **A drawn, not accumulated, blink schedule.** Indexed and hashed, so any `t` can be
  answered on its own.
- **Blink across a hard change** (`blinkIn`). The eye shutting over a big change of
  silhouette makes the new shape read as a decision.
- **Absolute gaze, mixed by the engine, drift added after the mix.** Both halves are
  load-bearing; the reasons are in `gaze.ts`.
- **Refusing a non-finite look target.** One NaN takes up residence and the character
  never looks at anything again.
- **A frozen state board and per-state still frames.**

### Deliberately not taken

- **The ball, the capsule eyes, the three thinking dots, the "!" and the orbiting
  rings.** These *are* the Grok mascot. `thinking` here gathers at the waist and runs a
  wave round its outline instead.
- **Depth-sorted 3D rings and eyes painted on a sphere.** Nemesis is flat by decision,
  so there is no back half to occlude and no sphere to travel round.
- **Colour.** Bloub's rings run a full hue wheel. This has one ink.
- **`eyefit`'s pose-space deformation table.** It solves eyes overflowing a
  user-chosen body shape. Here the shapes are a fixed catalogue and the gaze fit is one
  closed-form quadratic (`fitGaze`), which is enough.
- **A particle burst.** The brief rules out confetti; `correct` is a clean snap and a
  halo.

### Not taken *yet* — the honest gaps

- **A montage editor.** Bloub can author a sequence of (state, duration) blocks, store
  them, and scrub a timeline. The lab has fixed transition chains with a scrubber, which
  covers inspection but not authoring.
- **GIF / video / PNG export.** Bloub can record the canvas out. Here there are SVG
  contact sheets instead (`pnpm --filter @nemesis/web mascot:board`), which diff and
  compare between iterations but are not a video.

Neither blocks the character. Both are worth having if the mascot becomes something
other people need to review.

## Where it stands

`NemesisMascotDock` parks the character lower-left, above the composer, measuring the
composer's top edge so it holds its place while that grows. `contain` keeps it inside a
surface rather than the window — a workspace has a rail, and a mascot pinned to the
window's corner lands in it.

**The station comes from the state.** `thinking`, `searching` and `ingesting` carry
`station: "centre"`: the character walks to the middle of the surface and grows, because
in those states it *is* the thing happening and there is nothing else to look at yet.
Everything else stays in the corner. The travel is a composited `transform` — animating
the offsets would lay the page out again on every frame of a 680ms journey.

## Rules that are not negotiable

- **The viewBox is a module constant.** A per-frame box would resize the element sixty
  times a second, which is a layout shift. `geometry.test.ts` sweeps every state across
  time at five extreme gazes and asserts nothing ever leaves it.
- **Nothing below `lib/mascot` may import React or touch the DOM.**
- **`sample()` must not mutate.** Purging a "stale" previous state looks free and makes
  re-reading an earlier timestamp return a different frame.
- **Reduced motion holds, it does not freeze.** Each state holds its characteristic
  frame (`STILL`), because `correct` at t=0 has not expanded yet and would be invisible.

## Tests

`pnpm test` from `apps/web` — never a per-file glob, which breaks `import.meta.dirname`
across the suite. 36 mascot tests. The five that are calibrated against a real break:

| guard | what breaking it looks like |
|---|---|
| nothing leaves the viewBox | a state overruns by a named distance |
| a mid-fade change stays continuous | remove the frozen pose → 10-unit jump |
| a silhouette change is interpolated | swap at halfway → 8-unit jump |
| a forced blink stays inside its change | ask the current state → the lid snaps |
| presence shrinks the body | drop the factor → "barely shrinks on the way out" |
