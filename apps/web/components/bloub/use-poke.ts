"use client";

// Clicking the character makes it react, then go back to what it was doing.
//
// 🔴 A POKE IS A ONE-SHOT, NOT A STATE THE CALLER HAS TO UNSET. The obvious version — set a
// state on click, clear it in the click handler of something else — leaves the character
// stuck mid-gesture whenever the second click never comes. The reaction owns its own
// lifetime and hands the surface back to `base` on its own.
//
// 🔴 AND `base` WINS WHILE IT MATTERS. If Nemesis starts thinking during a poke, the poke is
// abandoned immediately: what the system is doing outranks a gesture the learner asked for
// two hundred milliseconds ago. Without that, a click could hide a busy state.
//
// ── WHAT A POKE DRAWS ────────────────────────────────────────────────────────
//
// 🔴🔴 EVERY GESTURE HERE IS OURS, NONE IS THE VENDORED PACK'S (owner 2026-08-23: *"I don't
// want any rainbow swirls or animations from the GitHub that we used… I want us to create
// our own animation language"*). The language's rules live in `lib/character/face.ts`; the
// short version: a creature, never an icon; physics, never effects. The vendored `swirl`,
// `wide`, `exclaim` and `play` states remain in the catalogue as a plain copy of upstream,
// and nothing in this product schedules them — guarded in `lib/character/character.test.ts`.
//
// The five, in the order repeated clicks walk them:
//   jump   — leaves the ground and LANDS SQUISHY (owner's word): the body flattens wide on
//            impact and rebounds. CSS on the wrapper; see `.bloub-jump` in bloub.css.
//   waggle — both brows rise and fall twice. Drawn as holes in the body's own mask through
//            the eye matrices, so they turn with the head; see `lib/character/brow.ts`.
//   spin   — one clean pirouette, body only. 🔴 THIS IS NOT THE OLD SWIRL: no arcs, no
//            colour trails, no eyes orbiting the body — the creature simply turns once,
//            with a lean in and a settle out. CSS on the wrapper; see `.bloub-spin`.
//   sigma  — one raised brow, half-lidded stare, lopsided smirk, held still and staring
//            straight ahead (the gaze is deliberately suppressed while it holds). The
//            owner asked for "a funny one, like a sigma emoji type"; the joke is that it
//            plays it completely straight.
//   wink   — the engine's own wink, kept from the start: it is entirely a face and the
//            one vendored gesture that was always the creature being a creature.

import { useCallback, useEffect, useRef, useState } from "react";

import type { FaceId } from "@/lib/character/face";
import { STATE_BY_ID, type StateId } from "@/lib/bloub/states";

/** Movement the engine does not know about, drawn over whatever pose is playing. */
export type PokeMotion = "jump" | "waggle" | "spin" | null;

interface Reaction {
  /** The engine state to hold. `idle` means "keep its ordinary face while the body moves". */
  readonly state: StateId;
  readonly motion: PokeMotion;
  /** A face from our own layer, worn for the reaction's whole hold. */
  readonly face: FaceId | null;
  /** How long to hold it, ms. Engine states use the animation's own published duration. */
  readonly hold: number;
}

/** How long the hop takes, start to landing. Must match `--bloub-jump-ms` in bloub.css. */
export const JUMP_MS = 620;
/** Up, down, up, down, gone. Must match WAGGLE_TIME in lib/character/brow.ts (seconds). */
export const WAGGLE_MS = 900;
/** One full turn, lean-in to settle. Must match `--bloub-spin-ms` in bloub.css. */
export const SPIN_MS = 760;
/** How long the sigma face holds. Long enough to be seen, short enough to stay a joke. */
export const SIGMA_MS = 1600;

/**
 * Reactions a poke can draw, in order.
 *
 * Repeated clicks walk the list rather than replaying one gesture, so leaning on the
 * character is rewarded rather than flat.
 *
 * 🔴 THE MOTIONS HOLD `idle`, THEY DO NOT REPLACE IT. A hop, a waggle and a spin are things
 * done WHILE wearing an ordinary face; swapping the pose underneath would fight the gesture.
 * `wink` is the opposite case — entirely a face — and `sigma` is a face from OUR layer.
 */
const REACTIONS: readonly Reaction[] = [
  { state: "idle", motion: "jump", face: null, hold: JUMP_MS },
  { state: "idle", motion: "waggle", face: null, hold: WAGGLE_MS },
  { state: "idle", motion: "spin", face: null, hold: SPIN_MS },
  { state: "idle", motion: null, face: "sigma", hold: SIGMA_MS },
  { state: "wink", motion: null, face: null, hold: (STATE_BY_ID.get("wink")?.duration ?? 1.6) * 1000 },
];

export function usePoke(base: StateId): {
  state: StateId;
  motion: PokeMotion;
  face: FaceId | null;
  poke: () => void;
  poking: boolean;
} {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const turn = useRef(0);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  // A busy state arriving mid-poke ends it — see the header.
  const busy = base !== "idle";
  useEffect(() => {
    if (busy && reaction) {
      clear();
      setReaction(null);
    }
  }, [busy, reaction]);

  useEffect(() => clear, []);

  const poke = useCallback(() => {
    if (base !== "idle") return;
    const next = REACTIONS[turn.current % REACTIONS.length]!;
    turn.current += 1;
    // 🔴 CLEARED FIRST, THEN SET, AND THE ORDER MATTERS FOR A REPEAT CLICK. Clicking again
    // mid-gesture must restart the NEW reaction's clock; leaving the old timer running would
    // end the new gesture early, on the remainder of the previous one.
    clear();
    setReaction(next);
    timer.current = window.setTimeout(() => setReaction(null), next.hold);
  }, [base]);

  return {
    state: reaction?.state ?? base,
    motion: reaction?.motion ?? null,
    face: reaction?.face ?? null,
    poke,
    poking: reaction !== null,
  };
}
