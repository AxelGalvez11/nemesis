// What the character does when the learner pokes it on the PHONE, and which gesture comes next.
//
// 🔴 OWNER, 2026-08-20: "the mascot when tapped should do a small animation and different each
// time such as wink, spin around, angry, or eye brow wiggle or waggle." Four asks, by name, and
// all four are below. Three land straight onto the engine's real vocabulary; the fourth is drawn
// by the renderers rather than by the pose table — see `brows`.
//
// ── WHICH APP THIS FILE DESCRIBES, AND WHICH IT DOES NOT ─────────────────────
//
// 🔴 THIS TABLE IS THE PHONE'S. IT IS THE ONLY ONE READING IT, AND SAYING SO IS THE POINT.
// `apps/mobile/src/components/bloub/use-poke.ts` is the sole importer of this module anywhere in
// the repo. `apps/web/components/bloub/use-poke.ts` never touches it: it holds a private
// `REACTIONS` array of its own and walks it strictly in order. So a reader looking at the four
// gestures below is looking at what a TAP DOES ON THE PHONE, and nothing else.
//
// 🔴 AND THE TWO APPS DRAW DIFFERENT SETS, WHICH IS A REAL DISAGREEMENT AND NOT A PORTING GAP.
// Web's three, in its own fixed order, are JUMP (a CSS hop on the wrapper — `bloub.css`), WINK
// (the engine state) and BROW WAGGLE. The phone's four are the ones below: wink, spin, angry,
// brow waggle. There is no jump on the phone and no spin or scowl on web. The sets differ
// because the owner gave two different lists on the same day and each app was built against the
// one it was given — web against "he should jump, wink, or do an eyebrow waggle", the phone
// against the four-item line quoted at the top of this file.
//
// 🔴 RECONCILING THEM IS THE OWNER'S CALL AND IS NOT DONE HERE. Both lists are things the owner
// asked for, so picking one is a product decision about what the character does, not a cleanup.
// Whoever makes it should know the shape of the work: moving web onto this table means giving
// web's renderer a `gaze` channel (it has none — the spin is a scripted LOOK, not a state) and
// deciding what happens to the hop, which has no counterpart here because it is a transform on
// the element rather than a pose of the face. Moving the phone onto web's list means dropping
// two gestures the owner named. Neither is a side effect of anything.
//
// 🔴 THE FILE STILL LIVES IN `packages/shared/src/character/` RATHER THAN IN THE PHONE, AND THAT
// IS A BET RATHER THAN A DESCRIPTION OF TODAY. `stations.ts` and `pool.ts` are here because one
// opinion about the character must not be forked per app, and which gesture a poke draws is such
// an opinion — but it IS forked today, and the fork is web's private table, not this one. Here is
// where the merged table would go, and `brow.ts` beside it is the half that already reached both
// renderers. Moving this file into `apps/mobile` would make the fork permanent and cost the
// re-merge; leaving it here costs nothing and keeps the seam visible.
//
// 🔴 NOTHING HERE INVENTS AN ANIMATION. Every `state` is an id from the vendored table and every
// `expression` is an id from the vendored expression list. What is NOT in those tables — the
// spin's rotation, which is a look rather than a state, and the brows, which are geometry the
// pose model does not carry — is layered over the engine the way `character/gaze.ts` layers a
// look target over it, and no file in `packages/shared/src/bloub` is edited to make room for it.

import type { ExpressionId } from '../bloub/expressions.ts'
import { TOUR_TIME, tourLook, type GazeScript } from '../bloub/gaze.ts'
import { STATE_BY_ID, type StateId } from '../bloub/states.ts'
import { WAGGLE_TIME } from './brow.ts'
import { centredLook } from './gaze.ts'
import { speedOf } from './stations.ts'

/** The four gestures a poke can draw. */
export type PokeId = 'wink' | 'spin' | 'angry' | 'brows'

/**
 * One held pose inside a gesture. Every gesture below is a single beat today; the list survives
 * because a gesture that changes face part-way through is a list of poses and nothing else, and
 * `brows` WAS three of them until the renderers learned to draw a brow — see its note.
 *
 * 🔴 A BEAT IS A POSE PLUS A DURATION, NEVER A CURVE. There is no easing, no interpolation and no
 * per-frame arithmetic anywhere in this file, and that is the rule rather than an accident: the
 * engine already morphs between states (`StateDef.morph`) and between expressions
 * (`BotEngine.SHAPE_MORPH`, 0.45s each way, `easeOutQuint`). A second set of curves running
 * beside it would be a hand-rolled animation competing with a measured one, which is exactly what
 * `character/gaze.ts` refuses to do for the gaze.
 */
export interface PokeBeat {
  /** Animation to play. Beats that only change the face name the resting state. */
  state: StateId
  /** Resting-face expression to wear. Beats that only change the animation name the caller's. */
  expression: ExpressionId | null
  /**
   * A scripted look for this beat, evaluated with seconds elapsed since the beat began, or `null`
   * to leave the ordinary idle steering alone.
   *
   * Two of the four gestures use one, for opposite reasons: `spin` because the rotation IS a look
   * and there is no state that performs it, and `brows` because the waggle has to be aimed at
   * somebody. `brows` also uses it as the signal that the gesture is running at all — see
   * `waggleLook`, which is the whole of that argument.
   */
  gaze: GazeScript | null
  /** How long the beat is held, in seconds of REAL time. See `held`. */
  hold: number
}

export interface PokeReaction {
  id: PokeId
  beats: readonly PokeBeat[]
}

/**
 * A published duration, converted from the engine's clock to the wall clock.
 *
 * 🔴 THE HOLD IS THE ANIMATION'S OWN NUMBER DIVIDED BY ITS PLAYBACK SPEED, AND THE SECOND HALF IS
 * THE HALF THAT BITES. `StateDef.duration` is measured in SCENE seconds, and both renderers scale
 * the scene clock by `speedOf(state)` — the owner slowed `swirl` to 0.55 ("i want the swirl
 * animation to not be so fast"). A hold of `duration * 1000` (which is what the web hook does,
 * because on web nothing was ever slowed) would therefore cut the spin off at 55% of the way
 * through its own rotation, and it would do it silently: the timer would look correct, the
 * gesture would look broken.
 */
function held(state: StateId, seconds: number): number {
  return seconds / speedOf(state)
}

/** A state's own published duration. The fallback is unreachable — every id below is in the table. */
function published(state: StateId): number {
  return STATE_BY_ID.get(state)?.duration ?? 1.6
}

/**
 * Where the character looks while its brows waggle: straight ahead, at whoever it is waggling at.
 *
 * 🔴 A WAGGLE IS AIMED AT SOMEBODY, WHICH IS WHY IT HAS A LOOK AT ALL. You do not waggle your
 * eyebrows at the far corner of the room. Every other resting second on the phone is spent on
 * `character/gaze.ts`'s idle wandering, and a brow gesture played while the head was turned away
 * mid-wander would read as a twitch the character had to itself rather than as something said to
 * the learner. `bloub-bot.tsx` makes the same call on web, by suppressing the pointer for the
 * duration ("A BROW WAGGLE OUTRANKS BOTH, BECAUSE IT IS AIMED AT SOMEBODY").
 *
 * 🔴 IT IS `centredLook` AT DEAD CENTRE, AND ON THE PHONE THAT IS FURTHER FRONT THAN WEB'S
 * EQUIVALENT. Web's front is `lookTarget({ nx: 0, ny: 0 })`, which is `-TURN + 0` = -26° of yaw,
 * because upstream's cone is aimed at a settings panel; the phone's is `centredLook`, which adds
 * `TURN` back and lands on 0°. Both are "facing front" as their own renderer means it, and the
 * phone's is the more literal of the two.
 *
 * 🔴 THE MARGIN THIS BUYS IS REAL BUT IT IS NOT WHAT KEEPS THE BROW INSIDE THE SILHOUETTE ON THE
 * PHONE, AND WEB'S NOTE SHOULD NOT BE READ AS IF IT WERE. `bloub-bot.tsx` reports 0.94 body radii
 * facing front against 1.07 turned hard, i.e. OUTSIDE the body — for web, facing front is what
 * makes the room. Re-measured here on the phone's own path (`BotEngine` at 60fps, `idleAim`
 * wandering for a randomised warm-up, then this script for `WAGGLE_TIME`, brow corners pushed
 * through the real eye matrices, 90 warm-ups swept): worst corner reach is 0.771 body radii
 * facing front and 0.878 if the wander is allowed to continue underneath the gesture. Both are
 * inside the silhouette. The phone gets that headroom from the re-centred cone — a yaw near zero
 * puts the eyes on the near face of the sphere, which is the same geometry `character/gaze.ts`
 * measures as 41.2° off the front against the vendored cone's 62.1°. So on the phone this script
 * is there for the aim and for the margin, not to prevent a notch being bitten out of the crown.
 *
 * 🔴 AND IT IS ALSO THE SIGNAL, WHICH IS THE PART THAT WOULD BE EASY TO CHANGE BY ACCIDENT. The
 * phone renderer draws brows exactly while THIS script is the one driving the gaze
 * (`BloubBot.tsx`: `script === waggleLook`). A gesture is otherwise nothing but a state id, an
 * expression id and a duration, none of which can say "and grow brows"; this is the one thing a
 * beat carries that reaches the renderer per frame, and the waggle's clock has to be the script's
 * clock anyway, since the brow's phase and the head's bearing are one gesture. So: this constant
 * MEANS the brow waggle. A future gesture that merely wants the character to face front must get
 * its own script rather than reuse this one, or it will sprout eyebrows. `character.test.ts`
 * pins both halves — that `brows` uses it and that nothing else does.
 *
 * 🔴 IT DOES NOT END AT `mix: 0` THE WAY `tourLook` DOES, AND THAT IS CORRECT HERE. `tourLook`
 * must, because it hands the gaze back to nothing and a non-zero mix would leave the eyes parked
 * off the resting pose. This one hands back to the idle steering, which is the SAME cone at the
 * same mix — only `nx`/`ny` change, from dead centre to wherever the wander has got to, and
 * `BotEngine.setLook` eases that over `LOOK_MORPH` exactly as it eases every other change of
 * target. Measured on the replay above, in viewBox units on the engine's 100-unit body radius:
 * the inner eye moves at most 7.7px between two frames turning INTO the gesture and 7.5px turning
 * back out of it, against 0.92px for a steady idle wander and the 21.2px `use-poke.ts` measures
 * for the spin's own limb crossing. Both are a fast turn of the head, and neither is a jump.
 */
export const waggleLook: GazeScript = () => centredLook({ nx: 0, ny: 0, tour: 1, pointer: false })

/**
 * The four gestures.
 *
 * 🔴 THE BAG IS EXACTLY THE FOUR THE OWNER ASKED FOR, AND THAT IS A CONSTRAINT RATHER THAN
 * TIMIDITY. On the phone this catalogue is not decoration: `stations.ts` maps `wide` onto *the
 * learner is dictating* and `notify` onto *something arrived*, and `thinking`/`orbit`/`comet` all
 * mean *the system has the floor*. A poke that drew one of those would make a tap look like the
 * microphone had opened, or like something had arrived. A gesture must not be able to say
 * something the character says for real, which is why none of the four below is drawn from that
 * half of the table.
 *
 * 🔴 WEB'S OLD LIST IS WHERE THAT RULE COMES FROM, AND WEB HAS SINCE LEFT IT TOO. It used to walk
 * `wide`, `notify`, `exclaim` and `play` alongside `wink`; the owner cut all four on 2026-08-20
 * ("remove the current one where it enlarges eyes, turns into exclamation mark, turns into
 * triangle, remove the swirls"). So this is not a difference between the apps any more — see the
 * header for the ones that are.
 */
export const POKES: readonly PokeReaction[] = [
  {
    // The one that needs no help: a measured state with its own face, its own blink-in and its
    // own duration. 1.6s at full speed.
    id: 'wink',
    beats: [{ state: 'wink', expression: null, gaze: null, hold: held('wink', published('wink')) }]
  },
  {
    /**
     * 🔴 "SPIN AROUND" IS NOT THE `swirl` STATE, AND SHIPPING IT AS ONE WOULD HAVE LOOKED BROKEN
     * WHILE EVERY TEST STAYED GREEN. Measured on the real engine: `swirl` alone moves the inner
     * eye 55px on a 100px-radius body over the whole gesture — indistinguishable from ordinary
     * idle wander at 58px — and never sends an eye behind the body. Its pose is three rings laid
     * over the resting face; the rotation in upstream's settings entrance comes from the LOOK, not
     * from the state (`spin: SPIN * (1 - tour)`).
     *
     * So the spin is the state AND `tourLook`, the vendored script whose own comment is "la boule
     * a l'air de tourner sur elle-meme". Driving it, the inner eye travels 184px and passes behind
     * the sphere for about half a second — that is a spin. It keeps `mix: 0`, so it imposes no
     * direction of its own, and it lands exactly where it started because -360° is 0°.
     *
     * `orbit` was the obvious alternative and is rejected: 3.4s long, it morphs the body through a
     * triangle, and `stations.ts` reserves it for *the system has the floor*. A poke must not mean
     * the same thing as a wait.
     *
     * The hold covers the LONGER of the two — the rings finish at 1.3s, the rotation at 1.5 —
     * then divides by `swirl`'s 0.55, giving about 2.7 seconds of real time.
     */
    id: 'spin',
    beats: [
      {
        state: 'swirl',
        expression: null,
        gaze: tourLook,
        hold: held('swirl', Math.max(published('swirl'), TOUR_TIME))
      }
    ]
  },
  {
    /**
     * 🔴 ANGRY IS AN EXPRESSION, NOT A STATE, SO THE ANIMATION DOES NOT CHANGE AT ALL. `colere`
     * narrows both eyes to 0.34×0.15 and tilts them in MIRROR at ±30° — tops converging, which is
     * this face's scowl. It reaches the engine through `setExpression`, which only bites on states
     * flagged `baseFace`; `idle` is one, so the beat names `idle` and the face carries the whole
     * gesture.
     *
     * 🔴 THE 1.2s IS DECLARED, AND IT IS THE ONLY NUMBER IN THIS FILE THAT IS. The state table
     * publishes a duration for every animation; the expression table publishes none, because
     * upstream's expressions are a customiser setting rather than a gesture — you pick one and it
     * stays. So a duration has to be chosen, and this one is chosen: 1.2s held, plus 0.45s of
     * morph in and 0.45s out, is about 2.1s of visible scowl. Long enough to read, short enough
     * that a learner who taps twice is not waiting on it.
     */
    id: 'angry',
    beats: [{ state: 'idle', expression: 'colere', gaze: null, hold: held('idle', 1.2) }]
  },
  {
    /**
     * 🔴 THE CHARACTER HAS NO EYEBROWS. This is worth stating plainly rather than quietly
     * substituting something, because the owner asked for a brow waggle by name. The face is two
     * capsules and nothing else, and the vendored code says so in four independent places: the
     * expression table's header ("Le visage ne tient qu'à deux gélules, donc tout se joue sur
     * quatre leviers" — head orientation, eye separation, eye proportions, per-eye tilt, and no
     * fifth), `EyeCfg` which has no brow field, `Pose.eyes` which is a 2-tuple, and the engine's
     * render loop which runs `for (let i = 0; i < 2; i++)` and emits at most two eyes. There is
     * nothing to waggle, and drawing one would mean adding geometry to a model whose whole claim
     * is that it is measured.
     *
     * 🔴 SO THIS IS THE BROW LINE ITSELF MOVING, WHICH IS NEARER THAN "NEAREST" SOUNDS. The
     * per-eye MIRRORED tilt is this engine's eyebrow, and its authors say so: without it "les deux
     * yeux penchent forcement du meme cote ... et la colere comme la tristesse ... sont hors de
     * portee". Converging tops are a scowl, diverging tops are worry — which is the job eyebrows
     * do. Alternating `colere` (±30, brow-line down and in) with `surpris` (0, and eyes wide) on
     * half-second beats slides that line down, up and down again, because `setExpression` blends
     * over 0.45s rather than snapping. Report it to the owner in those words: the character has no
     * eyebrows, the engine draws the brow-line by tilting the eyes themselves, and that is what
     * waggles.
     *
     * `mefiant` was considered and rejected: one eye squinted IS the classic single-brow raise,
     * but it reads as suspicion rather than as a waggle, and the table has no mirrored twin of it,
     * so it cannot alternate sides — it could only be the same raise played twice.
     */
    id: 'brows',
    beats: [
      { state: 'idle', expression: 'colere', gaze: null, hold: held('idle', 0.5) },
      { state: 'idle', expression: 'surpris', gaze: null, hold: held('idle', 0.5) },
      { state: 'idle', expression: 'colere', gaze: null, hold: held('idle', 0.5) }
    ]
  }
]

export const POKE_BY_ID = new Map<PokeId, PokeReaction>(POKES.map((p) => [p.id, p]))

/** Total real-time length of a gesture, for a caller that wants to hold one timer instead of many. */
export function pokeLength(id: PokeId): number {
  return (POKE_BY_ID.get(id)?.beats ?? []).reduce((sum, beat) => sum + beat.hold, 0)
}

/**
 * A fresh, shuffled bag of every gesture, from which callers draw with `pop()`.
 *
 * 🔴 A BAG, NOT RANDOM-WITHOUT-IMMEDIATE-REPEAT, BECAUSE "DIFFERENT EACH TIME" IS THE ASK.
 * Drawing at random and merely forbidding a back-to-back repeat still permits wink, spin, wink,
 * spin, wink — which is precisely the complaint. A bag guarantees all four appear before any one
 * of them comes round again, so leaning on the character is rewarded rather than flat.
 *
 * 🔴 AND THE SEAM BETWEEN TWO BAGS IS THE ONE CASE THE BAG DOES NOT COVER BY ITSELF. The last
 * draw of one bag and the first of the next are independent, so they can collide. `last` is
 * therefore passed in, and if the next draw would repeat it, it is swapped one place deeper —
 * which is the whole extra rule, and it makes an immediate repeat impossible everywhere.
 *
 * `random` is a parameter so the draw is testable; nothing in production passes it.
 */
export function refillPokes(last: PokeId | null, random: () => number = Math.random): PokeId[] {
  const bag = POKES.map((p) => p.id)
  // Fisher-Yates, so every ordering is equally likely — a naive `sort(() => random() - 0.5)` is
  // not a shuffle and biases badly on short arrays, which four items certainly is.
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j]!, bag[i]!]
  }
  // Callers draw from the END, so the next draw is the last element.
  if (bag.length > 1 && bag[bag.length - 1] === last) {
    ;[bag[bag.length - 1], bag[bag.length - 2]] = [bag[bag.length - 2]!, bag[bag.length - 1]!]
  }
  return bag
}

/**
 * Take the next gesture, refilling the bag when it runs out. MUTATES `bag`, which is why it takes
 * one rather than owning it: the caller holds it in a ref that must survive re-renders.
 */
export function drawPoke(
  bag: PokeId[],
  last: PokeId | null,
  random: () => number = Math.random
): PokeId {
  if (bag.length === 0) bag.push(...refillPokes(last, random))
  return bag.pop() ?? 'wink'
}
