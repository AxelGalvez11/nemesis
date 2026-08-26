// Poking the character on the phone: one small gesture per tap, a different one each time.
//
// 🔴 THE PHONE'S COUNTERPART OF `apps/web/components/bloub/use-poke.ts`, AND IT KEEPS THAT FILE'S
// TWO RULES VERBATIM. A poke is a ONE-SHOT that owns its own lifetime — the caller never has to
// unset it, because the version where a second click clears the first leaves the character stuck
// mid-gesture whenever the second click never comes. And `base` WINS WHILE IT MATTERS: if Nemesis
// starts thinking during a gesture, the gesture is abandoned on the spot, because what the system
// is doing outranks something the learner asked for two hundred milliseconds ago. A tap must
// never be able to hide a wait.
//
// 🔴 WHAT IS DIFFERENT FROM WEB, AND WHY. Three things, all of them forced:
//
//  1. THE DRAW IS A RESHUFFLED BAG, NOT A WALK. Owner, 2026-08-20: "a small animation and
//     different each time". Web walks its list strictly in order and says so in its own comment.
//     The bag lives in `@nemesis/shared/character/poke` with the reasoning; here it is just a ref.
//  2. IT OWNS TWO CHANNELS, NOT ONE. One of the four gestures is an EXPRESSION rather than a state
//     (`colere` for angry), so returning a `StateId` alone cannot carry it. And it must come from
//     the same place the resting face does: the renderer resolves whatever expression id it is
//     given through `restingFace`, so if this hook and the screen both wrote that prop they would
//     overwrite each other every render. One owner per channel — this one.
//  3. IT RETURNS A GAZE SCRIPT, AND ONE GESTURE RIDES ON IT. The brow waggle turns the character
//     to face front — a waggle is aimed at somebody — and that same script is what tells the
//     renderer to cut brows into the mask at all: see `waggleLook` in the shared table and the
//     `script === waggleLook` branch in `BloubBot.tsx`. Web needs no gaze channel, because on web
//     the waggle is a boolean prop on the renderer.
//
//     🔴 THIS USED TO SAY "TWO GESTURES", AND THE SECOND ONE IS GONE (owner 2026-08-21: "remove
//     the colorful swirls around the mascot"). The channel was built for `spin`, whose rotation
//     lived entirely in the LOOK rather than in any state; that gesture drew `swirl`, i.e. three
//     colour-wheel arcs around the body, and has been removed from the shared table — where the
//     measurement behind it is kept in full. The channel stays because the waggle needs it.
//
// 🔴 AND SINCE 2026-08-21 IT RETURNS A FOURTH CHANNEL, `motion`, WHICH IS WEB'S OWN WORD FOR IT.
// Owner, twice: "he should jump" (2026-08-20, answered on web the same day) and "the character
// still does not jump" (2026-08-21, looking at the phone). A jump is not a pose — the vendored
// pose table describes a face on a sphere, and leaving the ground is the whole body moving through
// space — so it cannot be a `state` and must not become one. It is a transform on the view the
// character is drawn in, exactly as web's is a transform on a wrapper element, and this hook says
// WHICH motion while `BloubBot` owns the curve. See `JUMP_KEYFRAMES` in the shared table.
//
// 🔴 GESTURES ARE HELD FOR THEIR OWN PUBLISHED DURATION, DIVIDED BY PLAYBACK SPEED — arithmetic
// that also lives in the shared table, because getting it wrong is invisible: the owner slowed
// `swirl` to 0.55, so web's `duration * 1000` would have cut the old spin off at 55% of its
// rotation and the timer would still have looked right. The hop is the one beat that does NOT go
// through that division, because it runs on the platform animator's wall clock rather than on the
// engine's scene clock; the `jump` entry in the shared table is where that is argued.

import { useCallback, useEffect, useRef, useState } from "react";

import type { GazeScript } from "@nemesis/shared/bloub/gaze";
import type { StateId } from "@nemesis/shared/bloub/states";
import { POKE_BY_ID, drawPoke, type PokeId, type PokeMotion } from "@nemesis/shared/character/poke";

export interface Poked {
  /** Animation to render. The gesture's, while one is playing; otherwise `base`. */
  state: StateId;
  /** Resting-face expression to render. The gesture's, while one is playing; otherwise `resting`. */
  expression: string;
  /** A scripted look for the current beat, or null. Pass straight to `BloubBot`'s `gaze`. */
  gaze: GazeScript | null;
  /**
   * A whole-body movement for the current beat, or null. Pass straight to `BloubBot`'s `motion`.
   *
   * 🔴 IT GOES BACK TO `null` BETWEEN GESTURES, AND THAT IS WHAT RESTARTS THE HOP. `BloubBot`
   * starts the transform on the transition into `"jump"`, the same way web's class is removed and
   * re-added; if this ever held its last value after a gesture ended, a second jump later in the
   * bag would set the same value and start nothing at all.
   */
  motion: PokeMotion;
  /** Hand to `BloubBot`'s `onPoke`. */
  poke: () => void;
  /** True while a gesture is playing. */
  poking: boolean;
}

/**
 * Which gesture is playing, and how far into it.
 *
 * Every gesture in the shared table is one beat today — the waggle was three until the renderer
 * could draw a real brow, and the walker below is kept because a gesture that changes face
 * part-way through is a list of poses and nothing else.
 */
interface Shot {
  id: PokeId;
  beat: number;
}

export function usePoke(base: StateId, resting = "neutre"): Poked {
  const [shot, setShot] = useState<Shot | null>(null);
  /** The bag, mid-draw. A ref because it must survive re-renders; `drawPoke` refills it in place. */
  const bag = useRef<PokeId[]>([]);
  const last = useRef<PokeId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  // 🔴 THE BEAT WALKER LIVES IN A REF SO IT CAN CALL ITSELF WITHOUT A STALE CLOSURE. A gesture is
  // a list of held poses, and each one schedules the next; written as a `useCallback` it would
  // have to name itself in its own dependency list, and written as a chain of effects it would
  // restart on every unrelated re-render. It reads nothing from the render scope but the setter.
  const runRef = useRef<(id: PokeId, beat: number) => void>(() => {});
  runRef.current = (id, beat) => {
    const step = POKE_BY_ID.get(id)?.beats[beat];
    if (!step) {
      // Past the last beat: the gesture is over and the surface goes back to `base`.
      setShot(null);
      return;
    }
    setShot({ id, beat });
    timer.current = setTimeout(() => runRef.current(id, beat + 1), step.hold * 1000);
  };

  // A busy state arriving mid-gesture ends it — see the header.
  const busy = base !== "idle";
  useEffect(() => {
    if (busy && shot) {
      clear();
      setShot(null);
    }
  }, [busy, shot]);

  // 🔴 THE TIMER IS CLEARED ON UNMOUNT, and this matters more here than on web: the character is
  // mounted on a screen inside a tab navigator, so a learner who taps it and immediately switches
  // tabs unmounts it mid-gesture. A `setTimeout` that fires afterwards would call `setShot` on a
  // gone component. `clear` reads only a ref, so the first render's copy is the right one to keep.
  useEffect(() => clear, []);

  /**
   * A tap. It CUTS whatever is playing and starts the next gesture immediately.
   *
   * 🔴 EVERYTHING BELOW WAS MEASURED ON THE `spin` GESTURE, WHICH WAS REMOVED ON 2026-08-21
   * ("remove the colorful swirls around the mascot"). It is kept, in full, for two reasons: the
   * question it settles will be asked again by the next reader of this hook, and the harness and
   * the scale it establishes are what make the NEW figures at the bottom mean anything. Read it as
   * a record of the worst case this hook has ever had to survive, not as a description of what a
   * tap does today. The spin's own reasoning lives in `@nemesis/shared/character/poke`, where the
   * entry used to be.
   *
   * 🔴 "AN INTERRUPTED SPIN CORRUPTS THE ENGINE'S LOOK STATE" — RAISED BY A VERIFIER, MEASURED,
   * AND IT WAS NOT TRUE (owner 2026-08-21). Writing the measurement down rather than the verdict,
   * because the reasoning that produced the claim is sound and will be produced again: the `spin`
   * gesture drove `tourLook`, whose `spin` field runs 360 → 0 over `TOUR_TIME`; a second tap here
   * calls `clear()` and starts a gesture whose beat has `gaze: null`; `BloubBot.tsx` then falls
   * back to `steer(...)`, which is `centredLook` at `tour: 1` and therefore `spin: SPIN * (1 -
   * tour)` = 0. So the target did drop from (say) 180° to 0° between one frame and the next, and
   * on paper that is the ball snapping back a half turn.
   *
   * It does not snap, because `BotEngine.setLook` does not assign — it stores the CURRENT
   * effective look as `lookPrev` and `lookAtTime` eases from there to the new target over
   * `LOOK_MORPH` (0.24s) with `easeOutQuint`. There is no field left holding a stale value and
   * nothing to reconcile: the reversal is a curve, and it is a curve the engine was already
   * running for every pointer move upstream.
   *
   * 🔴 THE NUMBERS, so the next person does not have to take that on faith. `BloubBot`'s loop was
   * replayed at 60fps — bounded delta, scene clock scaled by `speedOf(state)`, the script on the
   * scene clock, `steer`/`release` where the renderer puts them — and the eye centre's movement
   * BETWEEN CONSECUTIVE FRAMES sampled, in viewBox units on the engine's 100-unit body radius:
   *
   *   resting gaze, steady state ............................ 0.96 px/frame
   *   spin interrupted by `angry` (state `idle`, `baseFace`,
   *     so `steer` and a 0.24s catch-up), worst of nine cut
   *     points across the gesture ........................... 23.2 px/frame
   *   spin interrupted by `wink` (state `wink`, NOT
   *     `baseFace`, so `release()` and a 1.1s `TURN_TIME`) ... 30.6 px/frame
   *   the spin's OWN limb crossing, uninterrupted ........... 21.2 px/frame
   *   the spin's OWN opening frame, uninterrupted ........... 88.4 px/frame
   *
   * The worst interruption is therefore a THIRD of what every spin already does on its way in, and
   * about the same as the limb crossing the vendored `gaze.ts` describes as deliberate and says in
   * as many words not to soften. Frame by frame after a cut it reads 14.4, 23.2, 18.4, 13.4, 9.4,
   * 6.5, 4.5, 3.0, 2.1, 1.4, 0.9, 0.6, 0.3 — a decaying ramp with no overshoot, settled inside a
   * quarter second. On the 52pt dock the viewBox's 316 units are 52 points, so that worst frame is
   * 5.0pt of travel. That is a fast reversal, not a jump, and nothing is fixed.
   *
   * 🔴 THE 88.4px OPENING IS NOT THE INTERRUPTION'S DOING AND IS LEFT ALONE. It is `LOOK_MORPH`
   * catching up from the idle steering (`mix: 1`, `spin: 0`) to `tourLook`'s first sample
   * (`mix: 0`, `spin: 360`), it happens on every spin including one nobody interrupts, and web has
   * had it since the engine was vendored. Recorded here so it is not rediscovered as an
   * interruption bug by whoever measures this next.
   *
   * 🔴 TRIED AND REJECTED, in the order they were weighed:
   *   * IGNORING TAPS WHILE A GESTURE PLAYS. One line, and it makes the measurement above moot.
   *     Rejected outright: the owner asked for "a small animation and different each time", and a
   *     character that goes dead for 2.7 seconds after the spin is drawn teaches the learner it is
   *     not listening. An unresponsive character is a worse bug than an inelegant one. (The worst
   *     case is 1.6s now that the spin is gone and `wink` is the longest gesture. The argument is
   *     unchanged and the number is only smaller.)
   *   * LETTING THE OUTGOING GESTURE FINISH AND QUEUEING THE NEXT. The right shape IF there were a
   *     SNAP — it lets the engine land where it started rather than dragging it — but it costs up
   *     to 2.7s before the tap is answered, which is the same deadness bought more expensively.
   *     Nothing is broken, so nothing is paid for. ("Snap" here means a discontinuity in the gaze;
   *     it predates there being a gesture called `jump` and does not refer to one.)
   *   * EASING THE SPIN OUT WITH A CURVE OF OUR OWN. Refused by name: a second set of curves
   *     running beside the engine's is what `character/gaze.ts` and `character/poke.ts` both
   *     decline for the gaze, and it would compete with a morph that is already doing this job
   *     correctly.
   *
   * 🔴 `brows` IS NO LONGER IN THAT SECOND ROW, BECAUSE IT STOPPED GOING THROUGH `steer` (owner
   * 2026-08-21). It used to be the eye-tilt substitute — `idle`, no gaze — so an interrupted spin
   * handed straight back to the idle steering exactly as `angry` does. It now carries
   * `waggleLook`, so the cut lands in the SCRIPT branch and the new target is dead centre rather
   * than wherever the wander has got to. Re-measured on the same replay, holding the harness fixed
   * so the two are comparable: worst 19.6 px/frame across the nine cut points, against 20.6 for
   * `angry` under that same harness. Marginally GENTLER, which stands to reason — a fixed target
   * is nearer the spin's own landing point than a wandering one — and well inside the spin's own
   * 21.2 px limb crossing. (The 23.2 above is the earlier harness's figure for `angry` and is left
   * as it was measured; the two harnesses differ in warm-up and cut points, and re-deriving
   * somebody else's number from a different rig is how a table stops being reproducible.)
   *
   * The split in that table is `baseFace`, not the gesture's name: a beat on a `baseFace` state
   * lands in `steer` or in a script and catches up over `LOOK_MORPH`'s 0.24s, a beat on any other
   * state lands in `release()` and takes `TURN_TIME`'s 1.1s. So the figures survive the gestures
   * being renamed or reshuffled. What invalidates them is a beat moving between those two kinds of
   * state, or — as `brows` just did — between the steering and a script.
   *
   * 🔴 AND A SPIN COULD NOT CUT A SPIN, which is why the largest possible discontinuity — a fresh
   * `tourLook` starting at 360 while the old one has decayed to nearly 0 — is not in the table
   * above. `drawPoke` swaps the draw one place deeper when it would repeat `last`, so the same
   * gesture never follows itself. That is a property of the bag, not of this hook; if the bag's
   * no-immediate-repeat rule is ever dropped, this measurement has to be taken again.
   *
   * ── AND HERE IS THE SET THAT ACTUALLY SHIPS (2026-08-21) ────────────────────
   *
   * 🔴 THE WORST CUT IS NOW A THIRD OF WHAT IT WAS, AND IT IS MEASURED RATHER THAN ASSUMED FROM
   * THE SPIN'S REMOVAL. Re-run on the same shape of harness (BloubBot's loop at 60fps, bounded
   * delta, scene clock scaled by `speedOf`, the gaze script on the scene clock, nine cut points
   * per ordered pair, five warm-ups each), worst eye-centre movement between consecutive frames in
   * viewBox units on the engine's 100-unit body radius:
   *
   *   wink  cut by angry 9.8   wink  cut by brows 11.5   wink  cut by jump 11.5
   *   angry cut by wink  3.8   angry cut by brows  7.2   angry cut by jump  1.1
   *   brows cut by wink  2.7   brows cut by angry  7.0   brows cut by jump  7.5
   *   jump  cut by wink  3.5   jump  cut by angry  0.8   jump  cut by brows 7.6
   *
   *   uninterrupted: wink 3.3, angry 0.9, brows 5.8, jump 0.6
   *   resting gaze, steady state: 0.79
   *
   * 11.5 px/frame is the whole of it — 1.9pt on the 52pt dock — against 30.6 with the spin in the
   * bag, and it is smaller than the spin's OWN uninterrupted limb crossing (21.2). Nothing here
   * needs softening and nothing is softened. (These are a different harness's numbers from the
   * table above and are not comparable term by term with it: the warm-ups and cut points differ,
   * which is also why the resting figure reads 0.79 here and 0.96 there. Both are recorded as
   * measured, because re-deriving somebody else's number on a different rig is how a table stops
   * being reproducible.)
   *
   * 🔴 THE HOP IS INVISIBLE TO ALL OF THIS, AND ITS 0.6 IS THE PROOF RATHER THAN A COINCIDENCE. A
   * jump is a transform on the VIEW the character is drawn in; the engine is never told about it,
   * so during a hop the eyes are doing nothing but the ordinary idle wander — which is exactly
   * what 0.6 px/frame is. That is the practical half of `character/poke.ts`'s claim that a body
   * transform does not compete with the engine: there is no channel through which it could.
   *
   * 🔴 CUTTING A HOP MID-AIR DROPS THE CHARACTER TO THE GROUND IN ONE FRAME, AND THAT IS WEB'S
   * BEHAVIOUR RATHER THAN A PHONE COMPROMISE. `motion` goes back to `null`, `BloubBot` cancels the
   * transform and returns the wrapper to its resting position; on web, removing `.bloub-jump`
   * removes the animation and the element snaps back the same way. Softening it was considered
   * and rejected for the reason the third bullet above gives: the character would then be running
   * a landing curve nobody asked for, over a tap that has already been answered by a new gesture.
   * A cut is not a landing, and pretending otherwise costs a frame of honesty for nothing.
   */
  const poke = useCallback(() => {
    // Same guard as the effect above, for the race the effect cannot see: a tap that lands in the
    // same frame the system takes the floor.
    if (base !== "idle") return;
    clear();
    const next = drawPoke(bag.current, last.current);
    last.current = next;
    runRef.current(next, 0);
  }, [base]);

  const step = shot ? POKE_BY_ID.get(shot.id)?.beats[shot.beat] : undefined;
  return {
    state: step?.state ?? base,
    expression: step?.expression ?? resting,
    // Module-level constants on both sides, so this reference is stable across renders and the
    // renderer's effect does not restart the script on every frame's worth of re-rendering.
    gaze: step?.gaze ?? null,
    motion: step?.motion ?? null,
    poke,
    poking: shot !== null,
  };
}
