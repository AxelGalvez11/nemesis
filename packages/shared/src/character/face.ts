// How far the character's head leans while it is resting.
//
// 🔴 THIS EXISTS BECAUSE THE OWNER SAID THE MASCOT WAS "TILTED" (owner, 2026-08-20: "change the
// mascot to be not so 'tilted'"). The lean is one number: `../bloub/face.ts`'s
// `REST_GAZE = { yaw: 28.49, pitch: 28.62, roll: -13 }`. That `roll: -13` is a resting POSE
// measured off the reference recording, not a constant anything computes from — every other state
// carries its own roll (wink +6.7, wide +11.6, notify -12.2, egg -17.1, play -6) and the fifteen
// non-neutral expressions run -15 to +8. So the resting lean is one opinion in a table of many.
//
// 🔴 -5, NOT 0, AND THE DIFFERENCE IS THE WHOLE POINT. Measured on the real engine — the angle of
// the line joining the two eye centres, over a minute of scene clock, with the drift running and
// the centred idle gaze driving, which is the configuration that actually ships: today's -13
// shows as -15.3°..-10.4° of visible lean; -8 shows -10.1°..-5.8°; -6 shows -8.0°..-4.0°; -5
// shows -7.0°..-3.0°; -4 shows -6.0°..-2.1°; 0 shows -1.8°..+1.7°. At 0 the pair is dead level and the face goes fully symmetric — and it is
// NOT "no tilt", because each capsule still leans from the sphere's tangent frame plus the +10°
// pitch. What is lost at 0 is the head lean, the only asymmetry in a face made of two identical
// capsules, and it reads flat and mask-like. -5 keeps about 40% of the signature — visibly a
// lean, not a list — and it is not a number invented here: `attentif`, the pose the vendored
// table's own author chose for an attentive bot, is -4, and `somnolent` is -3. The owner said
// "not SO tilted", not "no tilt". The defensible band is -4 to -6; they differ by about a degree
// of visible lean and this is a taste call worth looking at on a device before it is called done.
//
// 🔴 AND IT IS DONE HERE, NOT BY EDITING THE VENDORED CONSTANT. Three alternatives were tried and
// rejected:
//   (a) changing `REST_GAZE.roll` in `../bloub/face.ts` — the smallest diff, and wrong twice over.
//       It is a vendored constant whose own comment says it was FITTED to reference frames rather
//       than chosen, so re-tuning it makes re-vendoring a merge instead of a copy; and it leaks,
//       because `states.ts`'s `base()` spreads `{...REST_GAZE}` into idle, thinking, alert,
//       exclaim, sleep, swirl, burst and comet, several of which are eyeless and none of which
//       asked for a taste change.
//   (b) an additive optional `roll` parameter on the vendored side — still an edit to vendored
//       code, and unnecessary once you notice that `BotEngine.setExpression` is already the
//       supported hook for "the resting face is configurable".
//   (c) simply passing `expression="attentif"` from the call sites — zero new code and roll -4,
//       but it silently changes the eye size too (0.21×0.44 against 0.186×0.412) and the split,
//       and it buries a product decision inside a string in a screen file.
// What is left is this: the engine already replaces gaze/split/eyes on every state flagged
// `baseFace` (engine.ts `posed`), which is exactly `idle` and `swirl` — exactly "the resting
// character". So the renderers resolve their `expression` prop through `restingFace` instead of
// the vendored map, and nothing under `../bloub/` changes.
//
// 🔴 IT IS SHARED, SO BOTH RENDERERS LEAN THE SAME. `stations.ts` and `pool.ts` both argue that
// one opinion about the character must not be forked per app; the resting tilt is exactly such an
// opinion, and leaving web on -13 would be the second copy those headers exist to prevent. The
// visible consequence on web is intended and is not a slip: the character's resting lean softens
// in `idle` and `swirl`, and in every frozen board that renders the default `neutre`.

import { EXPRESSIONS, type BotExpression, type ExpressionId } from '../bloub/expressions.ts'
import { REST_GAZE } from '../bloub/face.ts'

/** Head roll of the resting face, in degrees. Negative leans the head to its left. */
export const REST_ROLL = -5

/**
 * The expression table, with the resting face re-tuned and nothing else touched.
 *
 * 🔴 ONLY THE FACE THAT INHERITS THE VIDEO'S RESTING POSE IS RETUNED, and the test for that is
 * the roll itself rather than the id. The other fifteen entries are CHOSEN poses with rolls of
 * their own — `curieux` is -15 on purpose ("c'est le roulis qui porte la curiosite"), `confus` is
 * +8 — and flattening those would replace a table of moods with one mood repeated.
 *
 * 🔴 BUILT ONCE, NOT PER CALL, BECAUSE THE ENGINE COMPARES BY REFERENCE. `BotEngine.setExpression`
 * opens with `if (expression === this.expr) return`, so handing it a freshly allocated twin of the
 * current expression on every render would start a 0.45s morph from a value to itself, every
 * render. Returning the same object for the same id keeps that early return working exactly as it
 * does with the vendored `EXPRESSION_BY_ID`.
 */
const RESTING = new Map<string, BotExpression>(
  EXPRESSIONS.map((e) => [
    e.id,
    e.gaze.roll === REST_GAZE.roll ? { ...e, gaze: { ...e.gaze, roll: REST_ROLL } } : e
  ])
)

/**
 * The expression a renderer should actually give the engine for `id`.
 *
 * Drop-in for `EXPRESSION_BY_ID.get(id) ?? null`: unknown ids give `null`, which is what both
 * renderers already pass when the customiser holds something they do not recognise.
 *
 * 🔴 THE RETURNED `id` STAYS `'neutre'`. `../bloub/eyefit.ts` keys its tabulated eye seating by
 * expression id (`decalageDesYeux(radii, state, expr)`), and an id that is not in the table falls
 * back silently to the state's own entry — the eyes would be seated for "no expression" instead
 * of for this one. The seating itself is computed from each expression's NOMINAL gaze at import,
 * so moving the resting roll by 8° does shift the true seating by ~3.7px on a 100px radius; that
 * is inside the ±7.1° of drift the solver already budgets for, it only reaches web's non-circular
 * customiser shapes (the phone renders the circle, for which the table returns zero by
 * construction), and it is worth re-measuring rather than assuming.
 */
export function restingFace(id: string): BotExpression | null {
  return RESTING.get(id) ?? null
}

/** The ids this module knows, re-exported so callers need not import from the vendored side. */
export type { ExpressionId }
