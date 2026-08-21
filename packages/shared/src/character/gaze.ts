// Where the character looks when nothing has asked it to look anywhere.
//
// 🔴 THIS EXISTS BECAUSE THE PHONE HAD NO ANSWER TO THAT QUESTION AND THE CHARACTER STARED.
// Owner, 2026-08-20: "the mascot should be looking around not just staring away to the right."
// The complaint is exact and the cause was findable. `../bloub/face.ts` puts the resting head at
// `REST_GAZE = { yaw: 28.49, pitch: 28.62 }` — up and to the RIGHT — and with no look target the
// engine renders that pose plus only the resting drift, which is ±7.1° of yaw and ±5.5° of pitch
// on purpose ("assez retenu": enough to read as alive, not enough to read as looking around). So
// the phone was not animating anything wrong. It was never entering the engine's look mode at
// all: `BloubBot`'s loop said `if (aimAt) aim(aimAt); else release()`, and nothing on the phone
// passes `aimAt`, so `release()` ran on every frame of every resting second.
//
// 🔴 AND THE FIX IS A TARGET, NOT AN ANIMATION. The temptation is to write a gaze animation next
// to the engine — a sweep with its own easing and its own idea of where the eyes may go. That
// would be a second opinion about the character's face, competing with a state table whose poses
// are measured off a reference recording rather than chosen. What this file produces is only the
// two normalised numbers `../bloub/gaze.ts`'s `lookTarget` already takes from a pointer; the
// cone's WIDTH, the mix, the entry turn and the catch-up all stay where they were written. The
// one thing this file does change is where that cone is POINTED, and it does it by composing the
// vendored rule rather than by rewriting it — see `centredLook` at the bottom.
//
// 🔴 IT IS SHARED, NOT PHONE-LOCAL, FOR THE REASON `stations.ts` AND `pool.ts` GIVE. Where the
// character's eyes go while it waits is an opinion about the character, and there is one of
// those. Web does not read it today only because web has a real pointer to follow — but a web
// session that never moves a mouse (a touch laptop, a keyboard user) sits on the same fixed
// bearing, and when that is fixed it must be fixed with this rule and not a second one.
//
// 🔴 AND THE LOOK CONE ITSELF WAS AIMED AT SOMETHING WE DO NOT HAVE (owner, 2026-08-20: "make
// sure it doesnt just look around to the left"). Giving the phone a target fixed the staring but
// not the direction, and the reason is structural rather than a matter of amplitudes:
// `../bloub/gaze.ts`'s `lookTarget` returns `yaw: -TURN + nx * YAW_MAX` with `TURN = 26` and
// `YAW_MAX = 16`, so the reachable yaw is -42° to -10° and is NEVER positive. No value of `nx`
// centres it — that would need `nx = 26/16 = 1.625`, and both renderers clamp to ±1 (they must:
// see the amplitude note below). The vendored comment says the intent outright: entering the
// settings view the bot "cesse de regarder en haut a droite ... pour regarder a GAUCHE, du cote
// du panneau" — it turns toward the side panel it sits beside. Our character stands alone on the
// canvas, so it was aiming at a panel that is not there. `centredLook` below cancels that turn.

import type { Look } from '../bloub/engine.ts'
import { TURN, lookTarget, type Aim } from '../bloub/gaze.ts'
import { clamp, loopNoise } from '../bloub/math.ts'

/** A gaze target in `lookTarget`'s own units: -1 to 1, right and down positive. */
export interface IdleAim {
  nx: number
  ny: number
}

/**
 * Two octaves per axis, which is `../bloub/face.ts`'s own construction for the resting drift
 * rather than a new one: a slow term that carries the glance and a faster, smaller one that keeps
 * it from reading as a metronome. Being a pure function of the scene clock, it inherits every
 * property the engine's drift has — pausing, resuming and jumping to an arbitrary date all give
 * the same picture, and there is no state to get out of step with the loop.
 *
 * 🔴 THE PERIODS ARE COPRIME WITH THE DRIFT'S AND WITH EACH OTHER. `liveliness` runs at 11.3/3.7
 * (yaw) and 9.1/4.3 (pitch); these four are 8.6/3.1 and 6.7/2.9. A period shared with the drift
 * would make the sweep and the drift one motion instead of two, and a 2:1 ratio BETWEEN the axes
 * — 3.1 against 6.2 was the first draft — traces the same figure-eight over and over, which the
 * eye learns in about fifteen seconds. Measured over fifteen minutes of scene clock, the two axes
 * correlate at -0.004: the glance really is two-dimensional and not a diagonal.
 *
 * 🔴 THE SEEDS ARE SWEPT, NOT PICKED. `loopNoise` is three sines at fixed relative phase, so its
 * own waveform is not symmetric — the first draft ran to -0.89 one way and only +0.56 the other,
 * and a gaze that always swings further to one side is halfway back to the complaint. The four
 * seeds below come from sweeping the phase pairs for the widest envelope that stays symmetric:
 * ±0.914 on yaw, ±0.858 on pitch.
 *
 * 🔴 AND THE AMPLITUDES STOP SHORT OF 1, WHICH IS THE POINT RATHER THAN TIMIDITY. `lookTarget` is
 * fed a value the caller has already clamped to ±1, so noise that overshoots does not look
 * bigger — it flattens into a plateau at the edge of the cone, which is a stare. Verified over
 * 36,000 frames: the clamp below never fires. It is left in as the arithmetic guard
 * `BotEngine.setLook` says it will not do on its callers' behalf, not as a shaping step.
 *
 * Resulting envelope, once `centredLook` has applied `YAW_MAX`, `PITCH` and `PITCH_MAX`, and the
 * engine has added back the resting drift that `pointer: false` keeps alive: -20.2° to +17.7° of
 * yaw and -5.7° to +24.0° of pitch, measured over thirty minutes of scene clock on the real
 * engine. It reaches BOTH WAYS, which it did not before — see the header's note on `TURN`; the
 * 1.3° that the yaw sits off dead centre is `loopNoise`'s own asymmetric waveform inside the
 * engine's drift, not the cone.
 *
 * 🔴 AND THE ENVELOPE IS THE STEADY STATE, WHICH IS THE HALF OF THE PROTOCOL THAT WAS MISSING
 * (owner 2026-08-21). Re-measured by driving `centredLook` through a real `BotEngine` at 60fps
 * for thirty minutes of scene clock and reading `sample`'s own two lines (`engine.ts` 470-471:
 * `lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin`) off the engine's own
 * `lookAtTime`, DISCARDING the first two seconds. Those two seconds have to go, and saying so is
 * what makes the numbers reproducible: `BotEngine.setLook` eases toward a new target over
 * `LOOK_MORPH` (0.24s, `easeOutQuint`) from wherever the look currently is, and at t=0 that is
 * `NO_LOOK` — `mix: 0`, so the pose's own `REST_GAZE` still commands. Sample from a cold start
 * and the yaw reads +31.6 and the pitch +30.7 at the top, which is the resting bearing showing
 * through the catch-up and not a direction this cone can hold. The figures above are what the
 * character actually sits inside once it has arrived.
 *
 * 🔴 THE FIGURES MOVED BY A TENTH OF A DEGREE FROM THE ONES FIRST WRITTEN HERE (-20.4/+17.8 and
 * -5.8/+24.1), AND THE MEASUREMENT WON. They are re-measured, not re-derived: `packages/shared/
 * src/character.test.ts` was driving the engine through the vendored `lookTarget` — the OLD
 * left-biased cone — while this paragraph described `centredLook`, so nothing in the suite had
 * ever touched the path these numbers describe. The suite now drives `centredLook`, and the
 * off-by-a-tenth is the price of that: whatever produced the originals is not reproducible from
 * this file, and a number nobody can reproduce is folklore. Re-run the protocol above and you get
 * these.
 *
 * 🔴 THE AMPLITUDE AND SEED REASONING ABOVE IS UNTOUCHED BY THAT RE-CENTRING, and it has to be
 * said because the two look like the same knob. `centredLook` SHIFTS the cone; it does not widen
 * it. `YAW_MAX` and `PITCH_MAX` are the same numbers, the ±0.914/±0.858 sweep is the same sweep,
 * and the "never reaches the clamp" guard still stands exactly as written.
 *
 * No eye crosses the limb and vanishes, and the new extremes are markedly SAFER than the old
 * ones, which is the counter-intuitive part: worst case is an eye centre 41.2° off the front,
 * against 62.1° before, where 90° is where the engine drops it from the frame. Both re-measured
 * 2026-08-21 under the protocol above and both reproduced to the tenth. The reason is geometric —
 * a yaw near zero puts the eyes on the near face of the sphere, where the old cone parked them
 * out toward the rim. In exchange the look-around gets BIGGER, because near the front a degree of
 * yaw buys more screen movement: the inner eye covers 62.4px of a 100px-radius body in steady
 * state, against 48.7px on the old bearing and the 18.8px the resting drift alone manages over
 * the same thirty minutes (17.0px over the single minute `character.test.ts` can afford).
 *
 * 🔴 AND "BIGGER" IS A CLAIM ABOUT THE INNER EYE ONLY, WHICH THE RE-MEASUREMENT MADE PLAIN RATHER
 * THAN OVERTURNED. Taken on the OUTER eye the old bearing is fractionally wider — 64.2px against
 * this cone's 62.2px — because on a head yawed to -26° that eye is the one dragged across the
 * front of the sphere, which is exactly the geometry the paragraph above describes, seen from the
 * other side. It buys that width by parking its partner out at the rim, which is the 62.1°. The
 * pair moves further and reads as less, and that is the trade this cone declines.
 */
export function idleAim(t: number): IdleAim {
  return {
    nx: clamp(loopNoise(t, 8.6, 3.6) * 0.85 + loopNoise(t, 3.1, 3.0) * 0.3, -1, 1),
    ny: clamp(loopNoise(t, 6.7, 3.2) * 0.8 + loopNoise(t, 2.9, 4.1) * 0.28, -1, 1)
  }
}

/**
 * `lookTarget`'s cone, re-centred on the front.
 *
 * Adding `TURN` back cancels the `-TURN` in `lookTarget`'s own first term exactly, so the yaw
 * becomes `nx * YAW_MAX` and nothing else changes: the rule, the pitch, the `mix` ramp, the entry
 * turn's `spin` and the `wander` flag all remain the engine's, and `TURN` is imported rather than
 * copied so the two can never drift apart.
 *
 * 🔴 COMPOSED, NOT FORKED, AND NOT AN EDIT TO THE VENDORED SIDE. Two alternatives were weighed.
 * An optional `turn` parameter on `lookTarget` defaulting to `TURN` would work and would leave
 * web byte-identical — but it is still an edit to vendored code, and this composition needs none.
 * Re-deriving the cone here would be a second gaze system, which `BloubBot.tsx` and
 * `CanvasDock.tsx` already argue against by name and by scar.
 *
 * 🔴 WEB IS DELIBERATELY NOT ON THIS YET. `apps/web/components/bloub/bloub-bot.tsx` calls
 * `lookTarget` directly and follows a real cursor, so it is untouched — but it has the same bug
 * in a milder form: with the cursor to the RIGHT of the character the head still yaws only to
 * -10°, so it looks left at a pointer on its right. Fixing that is one import swap there, and it
 * changes a behaviour nobody has complained about, so it is its own decision rather than a
 * side effect of this one. This function living here is what keeps it a one-line follow-up.
 */
export function centredLook(aim: Aim): Look {
  const look = lookTarget(aim)
  return { ...look, yaw: look.yaw + TURN }
}
