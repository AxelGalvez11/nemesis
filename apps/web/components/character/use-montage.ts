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

import { attentionAt, SETTLE_MS } from "@/lib/character/attention";
import { MONTAGE_HOLD_MS } from "@/lib/character/montage";
import type { StateId } from "@/lib/character/stations";

/**
 * Checked more often than the shortest hold, so a face changes near its own moment, not late.
 *
 * 🔴🔴 IT MUST STAY WELL UNDER `SETTLE_MS`, AND THAT IS A CORRECTNESS BOUND RATHER THAN A FEEL ONE.
 * The settling beat is 400ms; at the 1000ms this replaces, a tick could land before it and after
 * it and never once observe it, so the character would step straight from watching into an
 * expression and the seam this exists to close would still be there on most transitions. A hundred
 * milliseconds gives every beat at least three chances to be seen. The work per tick is a modulo
 * and a comparison against a value that is usually unchanged, so nothing re-renders on the ticks
 * that find nothing new.
 */
const TICK_MS = 100;

/** The beat, as a value `entry` can hold. Not a `StateId`: nothing draws it, it only means "the
 *  cursor is already released and the resting face is still on". */
const SETTLING = "\u0000settling";

export interface Montage {
  /** What to draw. */
  readonly state: StateId;
  /**
   * True whenever the cursor must be let go of: while a face is playing AND through the settling
   * beat at either end of it.
   *
   * 🔴 THE CALLER MUST TAKE THE CURSOR AWAY WHEN THIS IS TRUE. That is not a suggestion the hook
   * is making, it is the half of the rule the hook cannot enforce on its own: the dock owns
   * tracking. If a future surface renders this face and keeps tracking, the bug is back exactly as
   * it was, and it will look like the expressions have stopped working rather than like a gaze bug.
   *
   * 🔴🔴 IT IS TRUE FOR LONGER THAN A FACE IS ON SCREEN, AND THAT IS THE 2026-08-31 FIX. During a
   * settling beat this is true while `state` is still the RESTING face, so the character has let
   * the pointer go and its head has slid off the cursor BEFORE any expression begins. The dock
   * applies this on its own 120ms poll, which used to mean the face could start up to 120ms before
   * the pointer was released and then ease out over 400ms more; with the beat in front, that skew
   * lands harmlessly inside a stretch where nothing expressive is showing.
   */
  readonly absorbed: boolean;
}

export function useMontage(base: StateId, atRest: boolean, busy: boolean): Montage {
  // 🔴 THE DEFAULT SET, AND THERE IS NO LONGER ANY OTHER (owner 2026-08-31: *"remove this from
  // settings, the choosing of the montage of the character"*). This used to read a per-device
  // preference the Appearance card wrote; the card and the preference are both gone, so
  // `attentionAt` is asked with nothing chosen and `resolveMontage` hands back `MONTAGE`. The
  // character still pulls faces at rest — what went is the choosing, not the behaviour.
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

  // 🔴 `null` IS WATCHING, A STRING IS A FACE, AND `SETTLING` IS THE BEAT BETWEEN. One piece of
  // state carries all three so a render can never hold two of them at once.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const since = sinceRef.current;
      const at =
        !atRest || busy || since === 0
          ? null
          : attentionAt({ ms: performance.now() - since, seed: seedRef.current });
      const next = at === null ? null : at.kind === "absorbed" ? at.entry : at.kind === "settle" ? SETTLING : null;
      setEntry((was) => (was === next ? was : next));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [atRest, busy]);

  // 🔴 THE TWO ANSWERS COME FROM ONE VALUE, which is the point of the whole change. There is no
  // way to be absorbed without a face on, and no way to wear a face without the cursor being let
  // go of, because both are read off the same `entry`.
  //
  // 🔴 AND THE BEAT IS THE THIRD ANSWER: cursor released, resting face still on. It is what makes
  // the two states impossible to overlap rather than merely unlikely to — see `SETTLE_MS`.
  if (entry === null) return { state: base, absorbed: false };
  if (entry === SETTLING) return { state: base, absorbed: true };
  return { state: entry as StateId, absorbed: true };
}

export { MONTAGE_HOLD_MS };
