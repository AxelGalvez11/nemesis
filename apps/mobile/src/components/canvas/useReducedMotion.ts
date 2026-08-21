// The system's "Reduce Motion" setting, as a hook.
//
// 🔴 IT IS READ, NOT ASSUMED, AND THE SUBSCRIPTION MATTERS. A learner can turn Reduce Motion on
// from Control Centre without leaving the app, so a one-shot read at mount would leave the canvas
// crossfading for the rest of the session. `BloubBot.tsx` already does exactly this — the pattern
// is copied from there rather than invented, so the character and the surface it sits on agree
// about whether motion is wanted.
//
// 🔴 REDUCED MOTION MEANS "NO SWEEP", NOT "NO SIGNAL". The web's rule (globals.css:951-969) is
// that the animation stops and the RESTING appearance stays: the forming bars keep their fill, the
// pulsing dot holds at 0.6 opacity. So callers must use this to skip the transition, never to skip
// the element.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => setReduced(on));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
