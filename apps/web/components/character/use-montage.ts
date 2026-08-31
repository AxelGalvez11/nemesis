"use client";

// The character wears a face while nothing is happening — and lets go of your cursor to do it.
//
// 🔴 A LAYER OVER THE BASE STATE, LIKE `usePoke` AND `useDoze`, AND THE ORDER OF THE THREE IS THE
// WHOLE BEHAVIOUR: `useDoze(useMontage(usePoke(state)))`. A poke beats a face, and falling asleep
// beats both — a sleeping character is not also pulling expressions.
//
// 🔴🔴 IT NOW RETURNS TWO THINGS, AND THE SECOND IS THE 2026-08-30 FIX (owner: *"during
// expressions the mouse still moves the mascot eyes"*). The face and the cursor used to be decided
// by two separate clocks that nobody had lined up, so an expression and pointer-tracking ran on
// top of each other most of the time — see `lib/character/attention.ts` for the full account. One
// clock decides both now, which is what makes them mutually exclusive rather than merely
// usually-different.

import { useEffect, useRef, useState } from "react";

import { attentionAt } from "@/lib/character/attention";
import { MONTAGE_HOLD_MS } from "@/lib/character/montage";
import { useTheme } from "@/components/theme-provider";
import type { StateId } from "@/lib/character/stations";

/** Checked more often than the shortest hold, so a face changes near its own moment, not late. */
const TICK_MS = 1_000;

export interface Montage {
  /** What to draw. */
  readonly state: StateId;
  /**
   * True while the character is wearing one of the montage's faces.
   *
   * 🔴 THE CALLER MUST TAKE THE CURSOR AWAY WHEN THIS IS TRUE. That is not a suggestion the hook
   * is making, it is the half of the rule the hook cannot enforce on its own: the dock owns
   * tracking. If a future surface renders this face and keeps tracking, the bug is back exactly as
   * it was, and it will look like the expressions have stopped working rather than like a gaze bug.
   */
  readonly absorbed: boolean;
}

export function useMontage(base: StateId, atRest: boolean, busy: boolean): Montage {
  // 🔴 THE LEARNER'S OWN LIST, OR NULL FOR THE DEFAULT SET. Read here rather than passed down,
  // because every caller would otherwise have to remember to thread it and forgetting one gives a
  // character that ignores the setting on exactly one surface.
  const { montage: chosen } = useTheme();
  const [entry, setEntry] = useState<string | null>(null);
  const sinceRef = useRef(0);
  // 🔴 SEEDED FROM A REF SET ONCE, NOT FROM A RENDER. Two characters mounted in the same second
  // would otherwise wear the same face for ever, and the front door hands over to the canvas.
  const seedRef = useRef(0);

  useEffect(() => {
    seedRef.current = Math.floor(performance.now() / 1000) % 13;
  }, []);

  // The rest CLOCK restarts whenever the character stops resting, which is what makes it always
  // WATCH YOU FIRST after anything happens rather than drifting off the moment an answer lands.
  useEffect(() => {
    if (atRest && !busy) {
      if (sinceRef.current === 0) sinceRef.current = performance.now();
      return;
    }
    sinceRef.current = 0;
    setEntry((was) => (was === null ? was : null));
  }, [atRest, busy]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const since = sinceRef.current;
      const at =
        !atRest || busy || since === 0
          ? null
          : attentionAt({ ms: performance.now() - since, chosen, seed: seedRef.current });
      const next = at && at.kind === "absorbed" ? at.entry : null;
      setEntry((was) => (was === next ? was : next));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [atRest, busy, chosen]);

  // 🔴 THE TWO ANSWERS COME FROM ONE VALUE, which is the point of the whole change. There is no
  // way to be absorbed without a face on, and no way to wear a face without the cursor being let
  // go of, because both are read off the same `entry`.
  if (entry === null) return { state: base, absorbed: false };
  return { state: entry as StateId, absorbed: true };
}

export { MONTAGE_HOLD_MS };
