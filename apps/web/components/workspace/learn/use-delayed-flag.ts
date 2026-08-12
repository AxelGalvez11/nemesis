"use client";

import { useEffect, useState } from "react";

/**
 * True only once `active` has been true continuously for `delayMs`.
 *
 * 🔴 THIS IS WHAT KEEPS FAST WORK LOOKING INSTANT. Almost every request in the recall path finishes
 * in a few hundred milliseconds, and an indicator that appears and disappears inside that window is
 * not information — it is a flicker that pulls the eye off the question and gives it nothing in
 * return. Someone drilling fifty facts would cross that flash fifty times, which is precisely how a
 * surface starts to feel like an AI interface being waited on.
 *
 * 🔴 AND IT GOES FALSE IMMEDIATELY. Only the appearance is delayed: the moment the work finishes,
 * the indicator is gone. Holding it open for a minimum duration would be adding latency to make the
 * system look busier, which is the opposite of the point.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return shown;
}
