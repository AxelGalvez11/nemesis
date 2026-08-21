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
//  2. IT OWNS TWO CHANNELS, NOT ONE. Two of the four gestures are EXPRESSIONS rather than states
//     (`colere` for angry, and the brow-line waggle), so returning a `StateId` alone cannot carry
//     them. And they must come from the same place: the renderer resolves whatever expression id
//     it is given through `restingFace`, so if this hook and the screen both wrote that prop they
//     would overwrite each other every render. One owner per channel — this one.
//  3. IT RETURNS A GAZE SCRIPT. "Spin around" is not a state; the rotation lives in the LOOK.
//     See the `spin` entry in the shared table for the measurement that settles it.
//
// 🔴 GESTURES ARE HELD FOR THEIR OWN PUBLISHED DURATION, DIVIDED BY PLAYBACK SPEED — arithmetic
// that also lives in the shared table, because getting it wrong is invisible: the owner slowed
// `swirl` to 0.55, so web's `duration * 1000` would cut the spin off at 55% of its rotation and
// the timer would still look right.

import { useCallback, useEffect, useRef, useState } from "react";

import type { GazeScript } from "@nemesis/shared/bloub/gaze";
import type { StateId } from "@nemesis/shared/bloub/states";
import { POKE_BY_ID, drawPoke, type PokeId } from "@nemesis/shared/character/poke";

export interface Poked {
  /** Animation to render. The gesture's, while one is playing; otherwise `base`. */
  state: StateId;
  /** Resting-face expression to render. The gesture's, while one is playing; otherwise `resting`. */
  expression: string;
  /** A scripted look for the current beat, or null. Pass straight to `BloubBot`'s `gaze`. */
  gaze: GazeScript | null;
  /** Hand to `BloubBot`'s `onPoke`. */
  poke: () => void;
  /** True while a gesture is playing. */
  poking: boolean;
}

/** Which gesture is playing, and how far into it. Beats exist because the waggle has three. */
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
   * 🔴 "AN INTERRUPTED SPIN CORRUPTS THE ENGINE'S LOOK STATE" — RAISED BY A VERIFIER, MEASURED,
   * AND IT IS NOT TRUE (owner 2026-08-21). Writing the measurement down rather than the verdict,
   * because the reasoning that produced the claim is sound and will be produced again: the `spin`
   * gesture drives `tourLook`, whose `spin` field runs 360 → 0 over `TOUR_TIME`; a second tap here
   * calls `clear()` and starts a gesture whose beat has `gaze: null`; `BloubBot.tsx` then falls
   * back to `steer(...)`, which is `centredLook` at `tour: 1` and therefore `spin: SPIN * (1 -
   * tour)` = 0. So the target does drop from (say) 180° to 0° between one frame and the next, and
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
   *   spin interrupted by `angry` or `brows` (state `idle`,
   *     `baseFace`, so `steer` and a 0.24s catch-up),
   *     worst of nine cut points across the gesture ......... 23.2 px/frame
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
   *     not listening. An unresponsive character is a worse bug than an inelegant one.
   *   * LETTING THE OUTGOING GESTURE FINISH AND QUEUEING THE NEXT. The right shape IF there were a
   *     jump — it lets the engine land where it started rather than dragging it — but it costs up
   *     to 2.7s before the tap is answered, which is the same deadness bought more expensively.
   *     Nothing is broken, so nothing is paid for.
   *   * EASING THE SPIN OUT WITH A CURVE OF OUR OWN. Refused by name: a second set of curves
   *     running beside the engine's is what `character/gaze.ts` and `character/poke.ts` both
   *     decline for the gaze, and it would compete with a morph that is already doing this job
   *     correctly.
   *
   * The split in that table is `baseFace`, not the gesture's name: a beat on a `baseFace` state
   * lands in `steer` and catches up over 0.24s, a beat on any other state lands in `release()` and
   * takes `TURN_TIME`'s 1.1s. So the figures survive the gestures being renamed or reshuffled, and
   * what would invalidate them is a beat moving between those two kinds of state — which is worth
   * re-measuring for, and is the only thing that is.
   *
   * 🔴 AND A SPIN CANNOT CUT A SPIN, which is why the largest possible discontinuity — a fresh
   * `tourLook` starting at 360 while the old one has decayed to nearly 0 — is not in the table
   * above. `drawPoke` swaps the draw one place deeper when it would repeat `last`, so the same
   * gesture never follows itself. That is a property of the bag, not of this hook; if the bag's
   * no-immediate-repeat rule is ever dropped, this measurement has to be taken again.
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
    poke,
    poking: shot !== null,
  };
}
