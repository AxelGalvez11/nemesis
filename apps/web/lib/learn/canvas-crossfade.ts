// Content leaving and content arriving, as a state machine.
//
// 🔴🔴 THE EXIT IS THE WHOLE FEATURE, AND IT IS THE HALF REACT WILL NOT GIVE YOU. `.canvas-swap`
// has always faded content IN — 140ms, which is below the threshold anyone notices, so the owner's
// reading of it ("there are also no fade in or fade out animations?") is accurate. Fading OUT is a
// different problem in kind: by the time the new content exists the old one has already been
// unmounted, so there is nothing left to animate. Something has to hold the outgoing node past its
// own removal, and that is the only reason this module exists.
//
// 🔴 PURE, BECAUSE THE BUG IN A CROSS-FADE IS ALWAYS A STUCK STATE. Content that changes twice
// inside one transition, a key that changes back to what it already was, an unmount mid-fade —
// each of those ends with the canvas showing nothing or showing the wrong thing FOREVER, and none
// of them is reproducible by hand. They are three lines each here.

/** How long each half takes. Two-phase, so a full swap is the sum. */
export const FADE_OUT_MS = 160;
export const FADE_IN_MS = 220;

export type FadePhase =
  /** Nothing is moving. The current content is fully opaque. */
  | "settled"
  /** The OLD content is still mounted and fading down. */
  | "leaving"
  /** The NEW content is mounted and fading up. */
  | "entering";

export interface FadeState {
  /** The content identity currently on screen — which may be the OUTGOING one while leaving. */
  showing: string;
  phase: FadePhase;
}

export function initialFade(key: string): FadeState {
  return { phase: "settled", showing: key };
}

/**
 * Something new arrived.
 *
 * 🔴 A KEY THAT HAS NOT CHANGED IS NOT A TRANSITION, and saying so here rather than in the effect is
 * what stops a re-render restarting the animation. React re-renders for reasons that have nothing
 * to do with content — a parent's state, a hover — and an unguarded version would fade the same
 * sentence out and back in every time, which reads as flickering rather than as motion.
 *
 * 🔴 AND AN INTERRUPTION IS NOT A RESTART. If content changes again while the old one is still
 * leaving, the phase stays `leaving` and only the destination changes: whatever is on screen is
 * already fading down, and starting it again would snap it back to full opacity first.
 */
export function fadeTo(state: FadeState, incoming: string): FadeState {
  if (incoming === state.showing && state.phase !== "leaving") return state;
  if (state.phase === "leaving") return state;
  return { phase: "leaving", showing: state.showing };
}

/** The outgoing content has finished fading. Swap in the new identity and fade it up. */
export function fadeSwap(state: FadeState, incoming: string): FadeState {
  if (state.phase !== "leaving") return state;
  return { phase: "entering", showing: incoming };
}

/** The incoming content has finished arriving. */
export function fadeSettle(state: FadeState): FadeState {
  if (state.phase !== "entering") return state;
  return { phase: "settled", showing: state.showing };
}

/**
 * What the wrapper should paint right now.
 *
 * 🔴 `holdPrevious` IS THE INSTRUCTION TO RENDER SOMETHING THAT NO LONGER EXISTS UPSTREAM. During
 * `leaving`, the caller's `children` are already the NEW content; painting them would show the new
 * thing fading out and then fading in, which is the wrong content in the wrong direction.
 */
export function fadeStyle(state: FadeState): { opacity: number; holdPrevious: boolean; ms: number } {
  if (state.phase === "leaving") return { holdPrevious: true, ms: FADE_OUT_MS, opacity: 0 };
  if (state.phase === "entering") return { holdPrevious: false, ms: FADE_IN_MS, opacity: 1 };
  return { holdPrevious: false, ms: 0, opacity: 1 };
}
