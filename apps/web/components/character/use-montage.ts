"use client";

// The character wears a different face every few seconds while nothing is happening.
//
// 🔴 A LAYER OVER THE BASE STATE, LIKE `usePoke` AND `useDoze`, AND THE ORDER OF THE THREE IS THE
// WHOLE BEHAVIOUR: `useDoze(useMontage(usePoke(state)))`. A poke beats a face, and falling asleep
// beats both — a sleeping character is not also pulling expressions.

import { useEffect, useRef, useState } from "react";

import { MONTAGE_HOLD_MS, montageFace, montageLoop } from "@/lib/character/montage";
import { useTheme } from "@/components/theme-provider";
import type { StateId } from "@/lib/character/stations";

/** Checked more often than the hold, so a face changes near its own moment rather than late. */
const TICK_MS = 1_000;

export function useMontage(
  base: StateId,
  atRest: boolean,
  busy: boolean,
  /**
   * Which absorbed stretch is running, or null while the character is following the pointer.
   *
   * 🔴🔴 THE CLOCK REACHES THE FACE HERE, AND THAT DIRECTION IS THE 2026-08-30 FIX. The dock used to
   * ask the montage what it was doing and only let go of the pointer if the answer happened to be a
   * loop — which meant 55 seconds of every 193 could never qualify. Now an absorbed stretch simply
   * takes the face: the character is GIVEN something to be absorbed in. See `montageLoop`.
   *
   * 🔴 IT STILL LOSES TO EVERYTHING ABOVE IT. `usePoke` is applied before this and `useDoze` after,
   * so a click still wins and a sleeping character is not pulled into a loop.
   */
  absorbedCycle: number | null,
): StateId {
  // 🔴 THE LEARNER'S OWN LIST, OR NULL FOR THE DEFAULT SET. Read here rather than passed down,
  // because every caller would otherwise have to remember to thread it and forgetting one gives a
  // character that ignores the setting on exactly one surface.
  const { montage: chosen } = useTheme();
  const [face, setFace] = useState<string | null>(null);
  const sinceRef = useRef(0);
  // 🔴 SEEDED FROM A REF SET ONCE, NOT FROM A RENDER. Two characters mounted in the same second
  // would otherwise wear the same face for ever, and the front door hands over to the canvas.
  const seedRef = useRef(0);

  useEffect(() => {
    seedRef.current = Math.floor(performance.now() / 1000) % 13;
  }, []);

  // The rest CLOCK restarts whenever the character stops resting, so the montage starts from its
  // first face after every turn rather than resuming wherever it happened to be.
  useEffect(() => {
    if (atRest && !busy) {
      if (sinceRef.current === 0) sinceRef.current = performance.now();
      return;
    }
    sinceRef.current = 0;
    setFace((was) => (was === null ? was : null));
  }, [atRest, busy]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const since = sinceRef.current;
      const next = montageFace({
        restingMs: since === 0 ? -1 : performance.now() - since,
        atRest,
        busy,
        seed: seedRef.current,
        chosen,
      });
      setFace((was) => (was === next ? was : next));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [atRest, busy, chosen]);

  // 🔴 ONLY AT REST, AND ONLY WHEN NOTHING ELSE OWNS THE FACE — the same two conditions the
  // scheduled montage obeys, so being absorbed can never paint over a turn in flight.
  if (absorbedCycle !== null && atRest && !busy) return montageLoop({ chosen, cycle: absorbedCycle });
  return face ?? base;
}

export { MONTAGE_HOLD_MS };
