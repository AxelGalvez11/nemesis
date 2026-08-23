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
// 🔴🔴 FOUR OF THE FIVE WERE REMOVED, AND THIS SHIPPED LATE. Owner 2026-08-20: "remove the
// current one where it enlarges eyes, turns into exclamation mark, turns into triangle,
// remove the swirls. he should jump, wink, or do an eyebrow waggle." Reported again on
// 2026-08-21 against production — "the mascot still does the colorful swirls, it still
// changes into the triangle and exclamation mark, i thought we fixed this" — because it HAD
// been fixed, on a branch that never merged, while this list stayed live.
//
// Each removal names a real state in the vendored table: `swirl` turns the body and sends the
// eyes around it, `wide` is the pair of enlarged eyes, `exclaim` replaces the body with an
// upright bar and a tear, and `play` is BOTH the spinning triangle and the swirl arcs (its
// SWOOSH arcs sweep across it).
//
// 🔴 THE FOUR THAT WENT ARE THE FOUR THAT STOP BEING THE CHARACTER. Every one of them either
// replaces the body with a glyph or bolts a notification onto it — the character briefly
// becomes a punctuation mark or a status indicator. A wink and a hop are things the SAME
// creature does, which is what makes leaning on it feel like poking something alive rather
// than cycling an icon.
//
// 🔴 THE EYEBROW WAGGLE IS NOT HERE, AND THAT IS A LIMIT RATHER THAN A CHOICE. It is the third
// gesture the owner asked for, and brows are geometry this renderer does not model — there is
// no brow anywhere in `bloub-bot.tsx`. Adding them is a change to the character's drawing, not
// to this list, so it is not smuggled into a fix whose whole point is to stop four animations
// that are live right now. The jump needs no such thing: leaving the ground is a transform on
// the element the character is drawn in, so it is CSS (see `.bloub-jump` in bloub.css) and the
// engine stays the single opinion about the face.

import { useCallback, useEffect, useRef, useState } from "react";

import { STATE_BY_ID, type StateId } from "@/lib/bloub/states";

/** Movement the engine does not know about, drawn over whatever pose is playing. */
export type PokeMotion = "jump" | null;

interface Reaction {
  /** The engine state to hold. `idle` means "keep its ordinary face while the body moves". */
  readonly state: StateId;
  readonly motion: PokeMotion;
  /** How long to hold it, ms. Engine states use the animation's own published duration. */
  readonly hold: number;
}

/** How long the hop takes, start to landing. Must match `--bloub-jump-ms` in bloub.css. */
export const JUMP_MS = 620;

/**
 * Reactions a poke can draw, in order.
 *
 * Repeated clicks walk the list rather than replaying one gesture, so leaning on the
 * character is rewarded rather than flat — the same reason the old list had five entries.
 *
 * 🔴 THE JUMP HOLDS `idle`, IT DOES NOT REPLACE IT. A hop is something done WHILE wearing an
 * ordinary face; swapping the pose underneath it would fight the gesture. `wink` is the
 * opposite case — it is entirely a face, and needs no motion.
 */
const REACTIONS: readonly Reaction[] = [
  { state: "idle", motion: "jump", hold: JUMP_MS },
  { state: "wink", motion: null, hold: (STATE_BY_ID.get("wink")?.duration ?? 1.6) * 1000 },
];

export function usePoke(base: StateId): {
  state: StateId;
  motion: PokeMotion;
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
    poke,
    poking: reaction !== null,
  };
}
