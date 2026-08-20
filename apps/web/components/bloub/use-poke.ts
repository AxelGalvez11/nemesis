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

import { useCallback, useEffect, useRef, useState } from "react";

import { STATE_BY_ID, type StateId } from "@/lib/bloub/states";

/** Reactions a poke can draw, in order. Repeated clicks walk the list rather than
 *  replaying one gesture, so leaning on the character is rewarded rather than flat. */
const REACTIONS: StateId[] = ["wink", "wide", "notify", "exclaim", "play"];

export function usePoke(base: StateId): { state: StateId; poke: () => void; poking: boolean } {
  const [reaction, setReaction] = useState<StateId | null>(null);
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
    setReaction(next);
    clear();
    // Held for the animation's own published duration rather than a number picked here, so a
    // gesture is never cut off partway through its morph.
    const hold = (STATE_BY_ID.get(next)?.duration ?? 1.6) * 1000;
    timer.current = window.setTimeout(() => setReaction(null), hold);
  }, [base]);

  return { state: reaction ?? base, poke, poking: reaction !== null };
}
