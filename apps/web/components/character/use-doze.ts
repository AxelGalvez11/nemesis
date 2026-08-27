"use client";

// The character falls asleep when nothing has happened for a long time, and wakes on anything.
//
// 🔴 A LAYER OVER THE BASE STATE, EXACTLY LIKE `usePoke`, AND FOR THE SAME REASON. What the system
// is doing is decided by the surface and arrives as a prop; dozing is a fact about the LEARNER that
// only the browser knows. Two hooks that each take the state and hand back the state compose
// without either of them knowing about the other.
//
// 🔴 THE ORDER IS `useDoze(usePoke(state))`, NOT THE OTHER WAY ROUND. A poke is a wake-up: clicking
// a sleeping character must play the click, not be swallowed by the sleep it just ended.

import { useEffect, useRef, useState } from "react";

import { DOZE_AFTER_MS, isDozing } from "@/lib/character/doze";
import { ACTIVITY_STATE, type StateId } from "@/lib/character/stations";

/** How often the clock is checked. Coarse on purpose: this fires once every few minutes at most. */
const TICK_MS = 5_000;

export function useDoze(base: StateId, away: boolean): StateId {
  const [dozing, setDozing] = useState(false);
  const lastRef = useRef(0);
  // 🔴 `performance.now()` IS READ INSIDE AN EFFECT, NOT AT MODULE OR RENDER TIME. Rendered on the
  // server it does not exist, and seeded at render the clock would restart on every re-render —
  // which for this component is several times a second while a turn is in flight, so the character
  // could never reach the threshold at all.
  useEffect(() => {
    lastRef.current = performance.now();
  }, []);

  // Anything the learner does is a wake-up. Capture, because the canvas's own scroller and the
  // composer both stop propagation in places and a sleeping mascot must not be the thing that
  // proves it.
  useEffect(() => {
    const wake = () => {
      lastRef.current = performance.now();
      setDozing((was) => (was ? false : was));
    };
    const opts = { capture: true, passive: true } as const;
    for (const kind of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const) {
      window.addEventListener(kind, wake, opts);
    }
    return () => {
      for (const kind of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const) {
        window.removeEventListener(kind, wake, { capture: true });
      }
    };
  }, []);

  // 🔴 A CHANGE OF WHAT NEMESIS IS DOING IS ALSO A WAKE-UP, and it has to be, because a turn can
  // arrive from somewhere the learner did not touch — a document finishing, a scheduled lesson.
  const working = base !== ACTIVITY_STATE.resting;
  useEffect(() => {
    if (!working) return;
    lastRef.current = performance.now();
    setDozing(false);
  }, [working]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const idleMs = performance.now() - lastRef.current;
      const next = isDozing({ idleMs, working, away });
      setDozing((was) => (was === next ? was : next));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [working, away]);

  return dozing ? ACTIVITY_STATE.dozing : base;
}

export { DOZE_AFTER_MS };
