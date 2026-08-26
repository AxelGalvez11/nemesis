# The Nemesis character

One engine. A solid turned in space, with a face painted on its skin and pushed through a
lens. Forty-nine things it can do, and it morphs between any two of them.

## Where it came from

Two projects, and the difference between them matters — legally and practically.

**[jeremy-prt/bloub](https://github.com/jeremy-prt/bloub) — MIT.** A recreation of the
xAI/Grok avatar: one shape morphing through fourteen states, measured off the reference
video frame by frame. Nemesis ran this engine, vendored whole, from August 2026. What
survives of it is the part that took the work: the **measurements**. Silhouettes traced at
the pixel, animation timings, sixteen expressions, and every gaze written as yaw/pitch/roll.
Those live in `apps/web/lib/avatar/vendor/`, copied unchanged, with the MIT notice beside
them — which is what MIT asks for and all it asks for.

**[smontlouis/bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)
— AGPL-3.0.** A far more capable engine: real perspective, ten solid bodies, an eye that is
laid on the skin point by point rather than transformed onto it. Nemesis's engine was
written from a *reading* of that one, not from its code — see the note at the top of
`lib/avatar/types.ts` for what that reading found and where the first attempt went wrong.

> 🔴 **One thing here wants a lawyer's eye before this is public.** The twenty-three
> `gaze-*` animations, the twenty-seven faces they play, and the ten bodies were IMPORTED
> from a document that project's app produces (`scripts/avatar-import.mts` reads a path; the
> document itself is not in this repo, but its numbers are, in the generated files). Whether
> a user-made avatar document counts as part of an AGPL work is a real question and not one
> to answer by assertion. Nothing else is affected: the sixteen expressions and the ten
> routines are bloub's, under MIT, and the engine is ours.

## Why there is only one engine now

Owner, 2026-08-25: *"yes i need one shared layer and engine."*

Nothing technical forced bloub out. It is TypeScript, like everything here; it worked; its
licence is the permissive one. It was deleted because keeping it meant **two of everything**
— two clocks, two ideas of where an eye is, two sets of bugs — and a character that drifted
between the marketing page and the product. That is what the instruction was about.

It is one command away if it is ever wanted back:

```bash
git checkout 2192eef0 -- apps/web/lib/bloub
```

## Layout

```
apps/web/lib/avatar/
  space.ts             the solid, the lens, the maths. No time, no DOM.
  render.ts            one pose → path strings, and `eyeFrames` for what rides on top
  play.ts              the clock: morphs, blinks, handovers, sparks
  expressions.ts       sixteen feelings, each one looking like its name
  routines.ts          the ten that DO something — the body changes in six of them
  animations.ts        twenty-three gaze patterns, generated (avatar-import.mts)
  faces.ts             the faces those play, generated
  avatars.ts           ten bodies, generated
  catalogue.ts         the one door: everything, with a collision check at load
  features.ts          OUR layer — spectacles, a brow, a smirk. Not the engine's.
  vendor/              bloub's traced silhouettes + LICENSE.bloub (MIT)

apps/web/components/avatar/nemesis-avatar.tsx   the ONLY thing that draws a character
apps/web/components/character/
  character-dock.tsx   placement, and the walk to the middle
  use-poke.ts          what a click gets: hop, waggle, spin, sigma, wink
  character.css        two colour tokens, and the travel transition
apps/web/lib/character/stations.ts              activity → animation, corner vs centre
```

The marketing site holds a **copy**, because it is a separate deployment with its own
workspace and cannot import from the app. The copy is made by a script, never by hand:

```bash
pnpm --filter @pharmaorb/web character:sync
```

## The catalogue

**Sixteen feelings** — neutral, attentive, surprised, excited, happy, laughing, angry, sad,
scared, suspicious, confused, curious, proud, shy, unimpressed, sleepy. Drawn from the
feeling backwards, which is why each one reads as its name.

**Ten routines** — idle, thinking (three dots, and the body becomes the middle one), wink,
wide, notify (a badge with a bite taken out of the body), exclaim (the body becomes a "!"),
sleep, egg, hexagon, burst (it scatters and gathers).

**Twenty-three gaze patterns**, prefixed `gaze-`. They are named for where the eyes go, not
for what the face means — the reference labelled them after the fact, so its `angry` has the
tops of its eyes diverging, which by its own geometry is the shape of sadness. The plain
words belong to the sixteen that keep their promise.

## Where to look at it

**Running, all forty-nine, on any of the ten bodies:**

```bash
open http://localhost:3242/dev-preview/avatar
```

**As files you can read and diff:**

```bash
pnpm --filter @pharmaorb/web character:faces /tmp    # spectacles and sigma, four head turns
npx tsx apps/web/scripts/avatar-sheet.mts /tmp       # every animation as a filmstrip
```

**The numbers themselves:** `lib/avatar/vendor/silhouettes.ts` for the traced shapes,
`lib/avatar/routines.ts` for the timings and gaze, `lib/avatar/expressions.ts` for the
sixteen.

## Things that will bite

**`--character-paper` is load-bearing.** The eyes are holes, so the body is backed by an
opaque shape in exactly the page's colour. It is defined in `character.css`, which the dock
imports. When that import went missing the character rendered as a blank white disc with no
face and nothing failed.

**The silhouette is applied in the PICTURE, not the body's frame.** The reference draws its
shapes flat with the face on a ball behind them. Apply the shape to the solid instead and
seventeen degrees of roll tips the egg over like a skittle — which is what the first attempt
did, and the only way to hide it was to halve the reference's own gaze numbers.

**An eye RIDES a silhouette; it is not reshaped by it.** The shape is a radial push. Push
every point of an eye by its own angle and a hexagon comes out with six-sided eyes.

**SVG has no z-index.** Paint order is document order. A scatter's sparks pass *behind* the
body, so they are a separate path drawn before it.

**The clock never restarts.** Changing what is playing is a morph, not a cut — the fix for
*"the animations seem to cut abruptly"*. `animation`, `face` and `waggle` are deliberately
not effect dependencies; the loop reads them from a ref. Listing any of them restarts the
loop, which restarts the entrance turn, which is a second of no face.

**The entrance turn has no face.** The eyes really do pass behind the body. Off by default;
on for the landing greeter, deliberately, because that one is an arrival.

**The preview pane cannot verify motion.** Measured: 6 frames and 77ms of scene clock across
roughly 40 seconds of real time, because `requestAnimationFrame` stalls whenever the pane is
hidden. Contact sheets rendered in Node are real verification there.

## Still open

- **Nothing in the app plays the ten routines.** Every activity resolves to `idle`, because
  the owner cut the animated states by name in August (*"remove the three dots animation"*,
  *"remove the big eyes"*, *"I don't want any rainbow swirls"*). Which of the ten the product
  should use, and when, is an open decision.
- **The AGPL question above.**
- **The previous character.** `lib/mascot/` is still present. `lib/mascot/attention.ts` is
  live — the dock uses it for "look at this" targets — but the engine beside it is unused.
