import { useEffect, useRef, useState } from "react";
import { currentMicLevel, subscribeMicLevel } from "@/lib/mic-level";
import { initialMicHealth, type MicHealth, type MicHealthState, stepMicHealth } from "@/lib/mic-health";

// Turns the raw level stream into one of three words, for the line under the
// recorder's waveform.
//
// 🔴 THE POINT OF THIS HOOK IS WHAT IT DOESN'T DO: re-render.
// Levels arrive ~12 times a second. Putting them in state would re-render the
// recording screen twelve times a second for the entire lecture — the exact
// mistake lib/mic-level.ts was written to avoid ("Deliberately NOT React
// state"), and the one LiveWaveform sidesteps by driving Animated values
// imperatively. So the rolling state lives in a ref and `setState` is called
// ONLY when the category actually changes: a few times an hour, not 43,000.
//
// THE TICKER IS NOT REDUNDANT. Silence has to be detected from the PASSAGE of
// time, and the most complete silence — the speech engine stopping altogether —
// is precisely the case where no more events arrive to notice it with. A stream
// that stops publishing would otherwise freeze the state on its last reading and
// report "Listening" through a dead microphone. Ticking on the last known level
// means a stalled stream ages into a warning exactly like a quiet room does.
const TICK_MS = 500;

/** What the microphone is picking up, or "hearing" whenever `active` is false —
 *  a parked recorder must never accuse anyone of silence. */
export function useMicHealth(active: boolean): MicHealth {
  const [health, setHealth] = useState<MicHealth>("hearing");
  const stateRef = useRef<MicHealthState>(initialMicHealth());

  useEffect(() => {
    if (!active) {
      stateRef.current = initialMicHealth();
      setHealth("hearing");
      return;
    }
    stateRef.current = initialMicHealth();
    setHealth("hearing");

    // One place that folds a reading in, so the subscription and the ticker
    // cannot drift into two slightly different rules.
    const observe = (level: number) => {
      const next = stepMicHealth(stateRef.current, level, Date.now());
      const changed = next.health !== stateRef.current.health;
      stateRef.current = next;
      // The guard IS the optimisation — see the header.
      if (changed) setHealth(next.health);
    };

    const unsubscribe = subscribeMicLevel(observe);
    const ticker = setInterval(() => observe(currentMicLevel()), TICK_MS);
    return () => {
      unsubscribe();
      clearInterval(ticker);
    };
  }, [active]);

  return health;
}
