# The Nemesis character

One body, morphing through fifteen animations. Eyes cut as holes through it. Gaze on a
sphere. Shape and colour chosen by the learner.

## What it is, plainly

The engine is [jeremy-prt/bloub](https://github.com/jeremy-prt/bloub), MIT licensed,
**vendored whole** into `apps/web/lib/bloub/`. It is not edited and should not be: every
Nemesis opinion lives outside it, in `apps/web/lib/character/`.

Two things follow that are worth stating outright.

**bloub is a reconstruction of the xAI/Grok avatar.** Its own `package.json` says so in
one line: *"SVG recreation of the x.ai bot avatar. One shape morphing through 14 states,
measured off the reference video frame by frame."* The code is MIT and using it is fine;
the character design is xAI's. Shape is a user-facing setting, so the default silhouette
is a one-line decision rather than a rewrite.

**It was vendored rather than translated, and that was the decision that made this work.**
bloub places its eyes on a *sphere*, through a tangent frame, with a 455-line eye-fitter;
every state's gaze is written as a measured yaw/pitch/roll (`{yaw: -5.37, pitch: 4.55,
roll: 6.7}`) and every eye as a capsule in body-radius units. Those numbers are
meaningless in a flat 2D pose model. Porting the state table into one produces something
that is not the same character — and the failure would only show up after all the work
was done.

## Layout

```
apps/web/lib/bloub/          vendored, untouched, MIT (LICENSE included)
apps/web/lib/character/      Nemesis's opinions
  stations.ts                  activity → animation, and corner vs centre
  pool.ts                      how many decor nodes the renderer preallocates
  character.test.ts            the guards
apps/web/components/bloub/
  bloub-bot.tsx                the renderer
  bloub-dock.tsx               placement, and the walk to the middle
  bloub.css                    two colour tokens, and the travel transition
```

Tests live under `lib/` because the suite's glob is `lib/*/*.test.ts`. Under
`components/bloub/` they passed locally and were silently never collected — worth knowing
before adding the next one.

## Where it appears

| Surface | Placement | Why |
|---|---|---|
| Canvas landing | greeter, centred above the question | its composer is in normal flow near the top; a lower-left dock would park the character in an empty corner |
| Canvas session | dock, lower-left, above `#canvas-composer` | beside the thing the learner returns to, clear of a composer that grows as they type |
| Canvas loading | holding the middle | there is no composer yet to stand above |
| Settings → Appearance | frozen preview beside the pickers | the real engine at `t=1`, not a picture of it |

## Coming forward

`thinking`, `orbit` and `comet` are the *busy* animations, and only they take the middle
of the surface. The rule is not "anything eye-catching": coming forward says the learner
handed something over and is waiting on real work, and it is worth nothing if a wink does
it too.

Both of the Canvas's waits are wired, not just the loud one. `policy.thinking` (the policy
runtime working a turn) and `presence === "preparing"` (the session coming up) are
different events with different captions, but to a learner they are one experience. Wiring
only the first leaves the character in the corner through the second and then jumps it to
the middle — and a jump with no cause a learner could name reads as a fault.

The journey is a composited `transform`. The dock's own offsets never move. Animating
those instead would lay the page out again on every frame of a 680ms trip.

Under `prefers-reduced-motion` the travel shortens to 220ms but does **not** stop. *Where*
the character is standing is the message; removing the travel removes the information, not
just the motion.

## The catalogue

Fifteen animations. `idle`, `thinking` (three dots), `wink`, `wide`, `alert` (a travelling
"!"), `notify` (a pastille with a notch cut out of the body), `exclaim`, `sleep`, `egg`,
`hexagon`, `play` (a triangle under a swoosh), `orbit` (six rings, the body relaxing from
triangle to ball), `burst` (collapse and particles that pass *behind* the core), `comet`
(collapse and ribbons), `swirl` (three rings, the settings entry).

Eight shapes: circle, pebble, squircle, capsule, triangle, hexagon, cloud, droplet.
Twelve colours. Sixteen expressions.

Inspect all of it at `/dev-preview/bloub-lab`, or generate contact sheets with
`pnpm mascot:board`'s sibling, `npx tsx scripts/bloub-board.mts`.

## Things that will bite

**`--bloub-paper` is load-bearing.** The eyes are holes and the rings pass behind the
body, so the body is backed by an opaque shape in exactly the page's colour. If that token
does not match what is actually behind the character, a ring shows through its eyes.

**SVG has no z-index.** Paint order is document order, and the burst's particles go behind
the core while every other dot goes in front. There are two dot pools, and one is shown.

**The decor pool is measured, not chosen.** A cross-fade emits *both* states' decor at
once, so the worst case lives between two animations rather than inside any one of them —
5 dots and 10 arcs across all 225 ordered pairs. Overflow does not error; it just quietly
drops particles.

**The entrance turn has no face.** The gaze can open with a full turn around the sphere,
and during it the eyes really are behind the body. It is off by default. On the landing it
is on, deliberately — that one is an arrival.

**The preview pane cannot verify motion.** Measured: 6 frames and 77ms of scene clock
across roughly 40 seconds of real time, because `requestAnimationFrame` stalls whenever the
pane is hidden. Frozen boards are real verification there; anything time-based has to be
measured in Node or watched in a real browser.

## Still open

- **The montage editor.** `lib/bloub/cycles.ts` is vendored and complete — blocks, minimum
  durations, a default cycle measured off the reference — but nothing in Nemesis authors or
  stores a cycle yet. The lab plays the default one.
- **Export.** Upstream can write GIF and video. Here there are SVG contact sheets, which
  diff between iterations but are not a recording.
- **The previous character.** `lib/mascot/` and `components/mascot/` are still present and
  still have their own lab. `lib/mascot/attention.ts` is live — the dock uses it for
  "look at this" targets — but the engine beside it is now unused. Removing it is a
  separate decision, not a side effect of this one.
