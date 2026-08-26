// What the character does when the learner pokes it on the PHONE, and which gesture comes next.
//
// 🔴 THE OWNER NAMED THIS SET TWICE, A DAY APART, AND THE TWO LISTS DISAGREE. On 2026-08-20, about
// the phone: "the mascot when tapped should do a small animation and different each time such as
// wink, spin around, angry, or eye brow wiggle or waggle." On the SAME DAY, about the web
// character: "remove the current one where it enlarges eyes, turns into exclamation mark, turns
// into triangle, remove the swirls. he should jump, wink, or do an eyebrow waggle." Web obeyed the
// second line. This table was built against the first, so the phone kept a `spin` gesture made out
// of the `swirl` state — and `swirl` draws `RINGS.slice(0, 3)`, three arcs coloured by
// `bloub/decor.ts`'s `wheel(hue)`. Those arcs ARE "the swirls".
//
// 🔴 SO ON 2026-08-21 THE OWNER SAID BOTH HALVES AGAIN, LOOKING AT THE PHONE: "the character still
// does not jump ... remove the colorful swirls around the mascot." Neither is a new idea; both are
// a day-old instruction that reached one app and not the other. The set below is now WINK, ANGRY,
// BROW WAGGLE, JUMP. The spin's own reasoning was correct and is NOT deleted — it is kept as a
// removal record where the entry stood, because the measurement behind it is expensive to redo and
// somebody will one day propose the gesture again.
//
// ── WHICH APP THIS FILE DESCRIBES, AND WHICH IT DOES NOT ─────────────────────
//
// 🔴 THIS TABLE IS THE PHONE'S. IT IS THE ONLY ONE READING IT, AND SAYING SO IS THE POINT.
// `apps/mobile/src/components/bloub/use-poke.ts` is the sole importer of this module anywhere in
// the repo. `apps/web/components/bloub/use-poke.ts` never touches it: it holds a private
// `REACTIONS` array of its own and walks it strictly in order. So a reader looking at the four
// gestures below is looking at what a TAP DOES ON THE PHONE, and nothing else.
//
// 🔴 THE TWO SETS NOW AGREE ON THREE OF FOUR, AND WHAT IS LEFT IS DELIBERATE RATHER THAN A PORTING
// GAP. Web's three, in its own fixed order, are JUMP (a CSS hop on a wrapper element —
// `bloub.css`), WINK (the engine state) and BROW WAGGLE. The phone's four are those same three
// plus ANGRY. The scowl is not an oversight on web's side and not drift on this one: the owner
// named it on 2026-08-20 and has never withdrawn it, and the 2026-08-21 line removes the spin and
// asks for the jump without mentioning it. Web simply was never given a list with it in.
//
// 🔴 TWO OTHER DIFFERENCES ARE REAL AND ARE ALSO NOT GAPS. The phone draws from a RESHUFFLED BAG
// while web walks its list in order — owner, 2026-08-20: "different each time"; see `refillPokes`.
// And the phone keeps the `gaze` channel that was built for the spin, because the brow waggle
// rides it: `waggleLook` is both the bearing and the signal that tells the renderer to cut brows
// into the mask. Web needs neither, which is why its hook returns a `motion` string and nothing
// else.
//
// 🔴 THE HOP IS THE SAME HOP ON BOTH, AND IT IS PINNED THAT WAY RATHER THAN COPIED AND HOPED FOR.
// Web's lives in `apps/web/components/bloub/bloub.css` as `@keyframes bloub-jump`. Nothing on the
// phone can read CSS, so the same shape is written below as numbers — `JUMP_MS`, `JUMP_EASE`,
// `JUMP_KEYFRAMES` — and `packages/shared/src/character.test.ts` PARSES that stylesheet and
// asserts the two are equal, percentage for percentage. Porting a curve by eye is how two
// characters end up hopping differently a year later with nothing failing anywhere.
//
// 🔴 THE FILE STILL LIVES IN `packages/shared/src/character/` RATHER THAN IN THE PHONE, AND THAT
// IS A BET RATHER THAN A DESCRIPTION OF TODAY. `stations.ts` and `pool.ts` are here because one
// opinion about the character must not be forked per app, and which gesture a poke draws is such
// an opinion — but it IS forked today, and the fork is web's private table, not this one. Here is
// where the merged table would go, `brow.ts` beside it is the half that already reached both
// renderers, and `JUMP_KEYFRAMES` below is the half that now reaches both under test even though
// web still reads its own copy. Moving this file into `apps/mobile` would make the fork permanent
// and cost the re-merge; leaving it here costs nothing and keeps the seam visible.
//
// 🔴 EVERY POSE HERE IS VENDORED, AND THE TWO THINGS THAT ARE NOT ARE NAMED AS SUCH. Every `state`
// is an id from the vendored table and every `expression` is an id from the vendored expression
// list. What is NOT in those tables is the BROW — geometry the two-capsule pose model does not
// carry — and the HOP, which is the whole body leaving the ground and therefore a transform on the
// element the character is drawn in rather than a pose of its face. Both are layered OVER the
// engine exactly the way `character/gaze.ts` layers a look target over it, and no file in
// `packages/shared/src/bloub` is edited to make room for either.

import type { ExpressionId } from '../bloub/expressions.ts'
import type { GazeScript } from '../bloub/gaze.ts'
import { STATE_BY_ID, type StateId } from '../bloub/states.ts'
import { WAGGLE_TIME } from './brow.ts'
import { centredLook } from './gaze.ts'
import { speedOf } from './stations.ts'

/** The four gestures a poke can draw. */
export type PokeId = 'wink' | 'angry' | 'brows' | 'jump'

/**
 * Movement of the whole character that the engine has no vocabulary for, drawn over whatever pose
 * is playing. Web's `PokeMotion` spelled the same way and for the same reason — see `bloub.css`.
 *
 * 🔴 WEB'S UNION ALSO CARRIES `"waggle"` AND THE PHONE'S DOES NOT, WHICH IS NOT AN OMISSION. On
 * web the brow waggle is a boolean prop on the renderer and rides this channel to get there; on
 * the phone it rides the GAZE channel instead, because `waggleLook` has to exist anyway (a waggle
 * is aimed at somebody) and one signal is better than two that must agree. Adding `"waggle"` here
 * would create a second way to start the same gesture, and the two would eventually disagree.
 */
export type PokeMotion = 'jump' | null

/**
 * One held pose inside a gesture. Every gesture below is a single beat today; the list survives
 * because a gesture that changes face part-way through is a list of poses and nothing else, and
 * `brows` WAS three of them until the renderers learned to draw a brow — see its note.
 *
 * 🔴 A BEAT IS A POSE PLUS A DURATION, NEVER A CURVE. There is no easing, no interpolation and no
 * per-frame arithmetic in any beat's `state`, `expression`, `gaze` or `hold`, and that is the rule
 * rather than an accident: the engine already morphs between states (`StateDef.morph`) and between
 * expressions (`BotEngine.SHAPE_MORPH`, 0.45s each way, `easeOutQuint`). A second set of curves
 * running beside it would be a hand-rolled animation competing with a measured one, which is
 * exactly what `character/gaze.ts` refuses to do for the gaze.
 *
 * 🔴 `motion` IS THE ONE DOCUMENTED EXCEPTION, AND IT IS AN EXCEPTION RATHER THAN THE RULE BEING
 * QUIETLY DROPPED (owner 2026-08-21, "the character still does not jump"). It does carry a curve —
 * `JUMP_KEYFRAMES` below — but that curve never touches the engine: it is a transform on the VIEW
 * the character is drawn in, one layer outside everything the engine owns, in the same place
 * `character/brow.ts` puts a brow and `character/gaze.ts` puts a look target. The engine's morphs
 * keep running underneath it untouched, no pose is invented, and nothing in
 * `packages/shared/src/bloub` is edited. The rule the original note is protecting is "do not run a
 * second animator against the face"; a curve that moved an eye, a silhouette or an expression
 * would break it. This one moves the box the face is inside, which is the only way a jump can be
 * expressed at all — web reached the same conclusion in `use-poke.ts` and said so in its header.
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
   * Exactly one of the four gestures uses one: `brows`, because a waggle has to be aimed at
   * somebody. It also uses it as the signal that the gesture is running at all — see `waggleLook`,
   * which is the whole of that argument. (`spin` was the second, and it was the reason this field
   * exists; see the removal record below. The field stays because the waggle needs it.)
   */
  gaze: GazeScript | null
  /**
   * A movement of the whole body for this beat, or `null` for a beat that only changes the face.
   *
   * The renderer owns the curve — see `JUMP_KEYFRAMES` — because a transform is drawn in whatever
   * the platform's own animator is: a CSS `@keyframes` on web, a Reanimated shared value on the
   * phone. What the beat carries is the NAME of the motion and how long the gesture is held for.
   */
  motion: PokeMotion
  /** How long the beat is held, in seconds of REAL time. See `held`. */
  hold: number
}

/**
 * How long the hop takes, start to landing, in milliseconds.
 *
 * 🔴 IT MUST STAY EQUAL TO WEB'S, AND THE EQUALITY IS TESTED RATHER THAN TRUSTED. Web's copy is
 * `JUMP_MS` in `apps/web/components/bloub/use-poke.ts` and the `--bloub-jump-ms` fallback in
 * `apps/web/components/bloub/bloub.css`. `character.test.ts` reads the stylesheet and compares.
 */
export const JUMP_MS = 620

/**
 * The hop's easing, as cubic-bezier control points — web's `cubic-bezier(0.33, 0, 0.2, 1)`.
 *
 * 🔴 IT IS APPLIED PER KEYFRAME INTERVAL, NOT ONCE ACROSS THE WHOLE HOP, BECAUSE THAT IS WHAT CSS
 * DOES AND GETTING IT WRONG IS INVISIBLE IN A DIFF. A CSS `animation-timing-function` set on the
 * animation applies to EVERY segment between adjacent keyframes, so web's hop is six eased
 * segments and not one eased ramp through six waypoints. A phone port that eased the whole 620ms
 * once would hit the same six positions at the same six instants and travel between them
 * differently — which is exactly the kind of difference nobody can point at and everybody can see.
 */
export const JUMP_EASE: readonly [number, number, number, number] = [0.33, 0, 0.2, 1]

/** One waypoint of the hop. `at` is the fraction of `JUMP_MS` elapsed, i.e. web's keyframe %. */
export interface HopFrame {
  /** 0 at take-off, 1 at the end of the landing squash. */
  at: number
  /** Vertical offset as a fraction of the character's OWN height. Negative is up, as in CSS. */
  y: number
  /** Vertical scale, about the character's feet — see the `transform-origin` note below. */
  scaleY: number
}

/**
 * Web's `@keyframes bloub-jump`, as numbers.
 *
 * 🔴 THE SHAPE IS THE POINT AND IT IS NOT SYMMETRICAL. A fast crouch, a quick rise, a slower hang
 * at the top (which is where a jump becomes readable at all), then a fall that lands harder than
 * the push-off — gravity is not symmetrical with a jump's push-off — and a squash on landing.
 * Web's own note in `bloub.css` argues the crouch small on purpose: a deep one on a 52pt character
 * reads as a glitch rather than as a wind-up.
 *
 * 🔴 `y` IS A FRACTION OF THE CHARACTER'S HEIGHT, NOT A PIXEL COUNT, AND THAT IS WHY THE HOP
 * SURVIVES THE TWO SIZES THE APP DRAWS. Web writes `translateY(-58%)`, which CSS resolves against
 * the element's own height; the phone multiplies by the `size` prop. The character is 52pt in the
 * dock and 112pt on the landing, and a hop written in points would either be a twitch on one or a
 * leap on the other.
 *
 * 🔴 THE SCALE IS ABOUT THE FEET (`transform-origin: 50% 100%`), AND THAT IS LOAD-BEARING. Squash
 * reads as weight only if the body flattens AGAINST the floor. Scaled about its middle the
 * character shrinks symmetrically and reads as being resized rather than as landing on something —
 * web's stylesheet says the same thing beside the same number.
 */
export const JUMP_KEYFRAMES: readonly HopFrame[] = [
  { at: 0, y: 0, scaleY: 1 },
  // The crouch.
  { at: 0.12, y: 0.02, scaleY: 0.9 },
  // Up, and stretched slightly along the direction of travel.
  { at: 0.34, y: -0.58, scaleY: 1.06 },
  // The hang.
  { at: 0.5, y: -0.66, scaleY: 1 },
  // The fall, back to the ground.
  { at: 0.78, y: 0, scaleY: 1 },
  // Landing: flattens...
  { at: 0.88, y: 0, scaleY: 0.86 },
  // ...then comes back.
  { at: 1, y: 0, scaleY: 1 }
]

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
 * because on web nothing was ever slowed) would therefore have cut the old `spin` gesture off at
 * 55% of the way through its own rotation, and it would have done it silently: the timer would
 * look correct, the gesture would look broken.
 *
 * 🔴 TODAY THE DIVISION IS A NO-OP, AND THIS FUNCTION IS KEPT ANYWAY AS A GUARD RATHER THAN AS A
 * FIX (2026-08-21). `swirl` was the only retimed state and the only gesture using it — the spin —
 * has been removed, so every surviving beat runs on `idle` or `wink`, both at `speedOf` 1, and
 * every call below currently returns its argument unchanged. Inlining it would be a smaller file
 * and the wrong file: `SPEED` in `stations.ts` is a taste dial the owner has already turned once,
 * and the day it is turned on `idle` or `wink` the beats have to follow the scene clock or the
 * gesture ends before the animation does. The one beat that must NOT go through here is the hop,
 * which does not run on the scene clock at all — see the `jump` entry.
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
 * back out of it, against 0.92px for a steady idle wander and the 21.2px `use-poke.ts` measured
 * for the limb crossing of the spin that used to be in this table (removed 2026-08-21; the figure
 * is kept because it is the only calibration anybody took of what this engine's own deliberate
 * motion costs per frame). Both are a fast turn of the head, and neither is a snap.
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
 * 🔴 AND SINCE 2026-08-21 THERE IS A SECOND CONSTRAINT: NO GESTURE MAY DRAW A COLOURED ARC. Six of
 * the vendored states carry decor from `bloub/decor.ts` whose gradient stops come from
 * `wheel(hue)` — `swirl` (three rings), `orbit` (six), `play` (the SWOOSH bouquet) and `comet`
 * (four ribbons). The owner has now asked twice for the swirls to go, so every one of those is out
 * of bounds for a poke, not just the one that was in the bag. `character.test.ts` samples every
 * beat's state through the real engine and fails if a single frame carries an arc, because reading
 * the four ids above and believing they are clean is exactly how `swirl` survived the first
 * instruction.
 *
 * 🔴 WEB'S OLD LIST IS WHERE THE FIRST RULE COMES FROM, AND WEB HAS SINCE LEFT IT TOO. It used to
 * walk `wide`, `notify`, `exclaim` and `play` alongside `wink`; the owner cut all four on
 * 2026-08-20 ("remove the current one where it enlarges eyes, turns into exclamation mark, turns
 * into triangle, remove the swirls"). So this is not a difference between the apps any more — see
 * the header for the one that is.
 */
export const POKES: readonly PokeReaction[] = [
  {
    // The one that needs no help: a measured state with its own face, its own blink-in and its
    // own duration. 1.6s at full speed.
    id: 'wink',
    beats: [
      { state: 'wink', expression: null, gaze: null, motion: null, hold: held('wink', published('wink')) }
    ]
  },
  /*
   * ── THE SPIN, REMOVED 2026-08-21 ───────────────────────────────────────────
   *
   * 🔴 THIS RECORD OUTLIVES THE GESTURE ON PURPOSE. The entry that stood here was:
   *
   *     id: 'spin',
   *     beats: [{ state: 'swirl', expression: null, gaze: tourLook,
   *               hold: held('swirl', Math.max(published('swirl'), TOUR_TIME)) }]
   *
   * It needed `tourLook` from `../bloub/gaze.ts` — the import went with it — and it is the reason
   * `PokeBeat.gaze` exists at all.
   *
   * 🔴 WHY IT WENT. Owner, 2026-08-20, about the WEB character: "remove the current one where it
   * enlarges eyes, turns into exclamation mark, turns into triangle, remove the swirls. he should
   * jump, wink, or do an eyebrow waggle." Web obeyed. The phone did not, because the phone had
   * been given a different list the same day with "spin around" in it, and each app was built
   * against the one it was handed. Owner, 2026-08-21, looking at the phone: "the character still
   * does not jump, also ... remove the colorful swirls around the mascot."
   *
   * 🔴 AND THERE IS NO VERSION OF THIS GESTURE THAT KEEPS THE ROTATION AND LOSES THE COLOUR,
   * WHICH IS WHY IT IS A REMOVAL AND NOT A RETUNE. `swirl` IS its rings: `states.ts` builds it
   * from `RINGS.slice(0, 3)` and every arc's gradient stops come from `decor.ts`'s `wheel(hue)`, a
   * full hue wheel at constant luminosity. Those three coloured arcs sweeping the body are exactly
   * what the owner is pointing at. Dropping the arcs would mean editing vendored state geometry,
   * which `stations.ts`'s header forbids for a taste call, and would leave a state that no longer
   * animates anything.
   *
   * 🔴 THE MEASUREMENT THAT BUILT IT WAS RIGHT AND IS KEPT, BECAUSE THE OBVIOUS REBUILD IS WRONG
   * IN A WAY NO TEST CATCHES. "Spin around" is NOT the `swirl` state. Measured on the real engine:
   * `swirl` alone moves the inner eye 55px on a 100px-radius body over the whole gesture —
   * indistinguishable from ordinary idle wander at 58px — and never sends an eye behind the body.
   * Its pose is three rings laid over the resting face; the rotation in upstream's settings
   * entrance comes from the LOOK, not from the state (`spin: SPIN * (1 - tour)`). So the spin had
   * to be the state AND `tourLook`, the vendored script whose own comment is "la boule a l'air de
   * tourner sur elle-meme": driving that, the inner eye travels 184px and passes behind the sphere
   * for about half a second. It kept `mix: 0`, so it imposed no direction of its own, and it
   * landed exactly where it started because -360° is 0°.
   *
   * `orbit` was the obvious alternative and was rejected twice over: 3.4s long, it morphs the body
   * through a triangle, `stations.ts` reserves it for *the system has the floor* — a poke must not
   * mean the same thing as a wait — and it draws all six `RINGS`, so it is MORE of what the owner
   * has now asked to remove, not less.
   *
   * The hold covered the LONGER of the two — the rings finish at 1.3s, the rotation at 1.5 — then
   * divided by `swirl`'s 0.55, giving about 2.7 seconds of real time. That arithmetic is why
   * `held` exists; it is still load-bearing for the other three gestures.
   *
   * 🔴 WHAT WOULD HAVE TO CHANGE TO BRING IT BACK. Only an owner instruction that withdraws the
   * two above; nothing technical is in the way. Then: re-import `tourLook` and `TOUR_TIME`,
   * restore the entry verbatim, add `'spin'` to `PokeId`, and expect `character.test.ts`'s "no
   * poke draws a coloured arc" test to fail — that test is the fence, and it should be argued with
   * rather than deleted, since it is what stops the swirls coming back by accident. Note also that
   * `apps/mobile/src/app/(tabs)/learn.tsx` passes `speed={speedOf(greeter.state)}` precisely so a
   * spin plays at `swirl`'s 0.55; that line is correct either way and needs no change.
   */
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
    beats: [{ state: 'idle', expression: 'colere', gaze: null, motion: null, hold: held('idle', 1.2) }]
  },
  {
    /**
     * 🔴 THE VENDORED MODEL HAS NO BROWS, SO THE BROW IS ANOTHER HOLE IN THE MASK. That first half
     * is worth stating plainly, because it is true and it is what shapes everything else: the face
     * is two capsules and the vendored code says so in four independent places — the expression
     * table's header ("Le visage ne tient qu'à deux gélules, donc tout se joue sur quatre leviers":
     * head orientation, eye separation, eye proportions, per-eye tilt, and no fifth), `EyeCfg`,
     * which has no brow field, `Pose.eyes`, which is a 2-tuple, and the engine's render loop, which
     * runs `for (let i = 0; i < 2; i++)` and emits at most two eyes.
     *
     * What does NOT follow from it is that a brow cannot be drawn. `character/brow.ts` draws one
     * without touching the pose model at all: the eyes are HOLES cut in the body rather than shapes
     * laid on it, so a brow is one more hole in the SAME mask, placed through the SAME eye matrix —
     * which is what makes it foreshorten as the head turns, tilt with the eye it belongs to, and
     * clip against the silhouette exactly as its eye does. Nothing is added to a measured table;
     * the geometry is Nemesis's own and lives outside `packages/shared/src/bloub`, the way
     * `character/gaze.ts` layers a look target over the engine without editing it.
     *
     * 🔴 THIS ENTRY USED TO BE AN EYE-TILT SUBSTITUTE, AND IT WAS REPLACED RATHER THAN REFINED
     * (owner 2026-08-21). It held `idle` and alternated the `colere` and `surpris` EXPRESSIONS on
     * three half-second beats, which slides the engine's brow-LINE — the per-eye mirrored tilt —
     * down, up and down again. That was an honest substitute at the time and its reasoning was
     * sound as far as it went: the mirrored tilt really is the lever this face uses for a scowl,
     * and `setExpression` really does blend over 0.45s rather than snapping.
     *
     * It went for two reasons, in order of weight. The owner asked for an eyebrow waggle BY NAME
     * and the web character had been performing one since `brow.ts` shipped, so the phone was the
     * odd one out rather than the constrained one. And the comment that justified it had stopped
     * being true: it said the character has no eyebrows and that "drawing one would mean adding
     * geometry to a model whose whole claim is that it is measured" — by then `brow.ts` existed,
     * `apps/web/components/bloub/bloub-bot.tsx` was resolving `browFrame` into two mask nodes every
     * frame of a waggle, and no vendored file had been touched to make that happen. A comment that
     * describes the reason a thing is impossible, while the thing runs on the other renderer, is
     * worse than no comment.
     *
     * `mefiant` was the substitute's own rejected alternative and stays rejected for its original
     * reason: one eye squinted IS the classic single-brow raise, but it reads as suspicion, and the
     * table has no mirrored twin of it, so it could only be the same raise played twice.
     *
     * 🔴 ONE BEAT, NOT THREE, BECAUSE THE UP-AND-DOWN IS NOW GEOMETRY RATHER THAN A CHANGE OF POSE.
     * `browFrame` carries the two full lifts inside `WAGGLE_TIME` on its own cosine, so a beat list
     * would be a second clock beating against it. The face underneath does not change at all: the
     * expression is `null`, which means the caller's resting face, exactly as web holds `idle` and
     * an ordinary face under its waggle.
     *
     * 🔴 AND THE HOLD IS `WAGGLE_TIME`, NOT A NUMBER OF ITS OWN. Both renderers evaluate
     * `browFrame` on the SCENE clock, which they scale by `speedOf(state)`; `held` divides by the
     * same rate, so the beat and the geometry stay the same length whatever that rate becomes.
     * `idle` is at 1 today, so this is 0.9s of real time. The brows are already gone before the
     * beat ends — `browFrame` closes them at about 0.898s — so nothing is left on screen when the
     * gesture hands the character back.
     */
    id: 'brows',
    beats: [
      { state: 'idle', expression: null, gaze: waggleLook, motion: null, hold: held('idle', WAGGLE_TIME) }
    ]
  },
  {
    /**
     * 🔴 THE HOP THE PHONE NEVER GOT (owner 2026-08-20 "he should jump", again 2026-08-21 "the
     * character still does not jump"). Web has had it since the day that first line landed; this
     * is the same gesture, not a new one, and its keyframes are pinned equal to web's by test —
     * see `JUMP_KEYFRAMES`.
     *
     * 🔴 IT IS NOT A POSE, WHICH IS WHY THE BEAT NAMES `idle` AND CARRIES A `motion` INSTEAD OF
     * NAMING A STATE. There is no jump in the vendored table and there should not be: that table
     * describes a face on a sphere — where the eyes sit, how wide they open, what the silhouette
     * is — and leaving the ground is the whole body moving through space. Adding one would be an
     * edit to vendored geometry to express something the geometry is not about, and re-vendoring
     * would stop being a copy. The transform lives one layer out, in the renderer's own animator.
     *
     * 🔴 THE FACE IS `idle` AND THE EXPRESSION IS THE CALLER'S, BECAUSE A JUMP IS SOMETHING DONE
     * WHILE WEARING AN ORDINARY FACE. Swapping the pose underneath it would fight the gesture —
     * web says the same in its own table ("THE JUMP AND THE WAGGLE HOLD `idle`, THEY DO NOT
     * REPLACE IT"), and `wink` is the opposite case: entirely a face, needing no motion at all.
     *
     * 🔴 THE HOLD IS THE LITERAL `JUMP_MS`, NOT `held('idle', …)`, AND THAT DIFFERS FROM EVERY
     * OTHER BEAT IN THIS FILE ON PURPOSE. `held` divides by `speedOf(state)` because a beat's
     * content is played on the ENGINE's scene clock, which both renderers scale. The hop is not:
     * it runs on the platform animator's wall clock (`@keyframes` on web, a Reanimated shared
     * value on the phone), so it takes 620ms of real time whatever the scene clock is doing. If
     * `idle` were ever slowed the way `swirl` was, `held('idle', 0.62)` would stretch this beat
     * past the hop and leave the character standing still, on the ground, waiting for a timer —
     * which would read as a hang rather than as a slower jump. Slowing the hop means changing
     * `JUMP_MS` (and web's, together), not the playback rate.
     */
    id: 'jump',
    beats: [{ state: 'idle', expression: null, gaze: null, motion: 'jump', hold: JUMP_MS / 1000 }]
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
 * Drawing at random and merely forbidding a back-to-back repeat still permits wink, jump, wink,
 * jump, wink — which is precisely the complaint. A bag guarantees all four appear before any one
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
