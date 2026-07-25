// The rotating headline on the sign-in screen — "Let's study", "Let's remember",
// "Let's get ahead", typed out and rubbed out in turn behind a block cursor
// (owner 2026-07-24, matching the reference screens they sent).
//
// A STATE MACHINE, not a pile of timers. The obvious way to write this is nested
// setTimeouts that type a line, wait, erase it, then schedule the next line —
// and every one of those is a timer that can outlive the screen, fire while a
// sheet is over it, or double up if the effect re-runs. Here one interval calls
// one pure function, so the screen holds a single timer it can clear, and the
// awkward moments (a line that finished typing, a line that finished erasing,
// the wrap from the last line back to the first) are all just transitions with
// tests on them.

export type TypewriterPhase = "typing" | "holding" | "erasing";

export interface TypewriterState {
  /** Index into the caller's list of lines. */
  line: number;
  /** How many characters of that line are currently shown. */
  chars: number;
  phase: TypewriterPhase;
  /** Ticks spent in the current phase — only "holding" reads it. */
  ticks: number;
}

export const TYPEWRITER_START: TypewriterState = { line: 0, chars: 0, phase: "typing", ticks: 0 };

/** Advance one tick.
 *
 *  `lineLengths` is the character count of each line, so this file never needs
 *  the strings themselves — which is what keeps it testable without deciding
 *  what the headline says.
 *
 *  `holdTicks` is how long a finished line sits there before it starts erasing. */
export function nextTypewriterState(
  state: TypewriterState,
  lineLengths: readonly number[],
  holdTicks: number,
): TypewriterState {
  // No lines to type: stand still rather than dividing by zero on the wrap.
  if (lineLengths.length === 0) return state;

  // A line index out of range can only come from the caller's list changing
  // underneath a running animation. Start over rather than reading undefined.
  const length = lineLengths[state.line];
  if (length === undefined) return TYPEWRITER_START;

  switch (state.phase) {
    case "typing":
      // Note the >=, not ===: a list that shortened mid-animation can leave
      // chars past the end, and === would type forever without ever arriving.
      if (state.chars >= length) return { ...state, chars: length, phase: "holding", ticks: 0 };
      return { ...state, chars: state.chars + 1, phase: "typing", ticks: 0 };

    case "holding":
      if (state.ticks + 1 >= holdTicks) return { ...state, phase: "erasing", ticks: 0 };
      return { ...state, ticks: state.ticks + 1 };

    case "erasing":
      if (state.chars <= 0) {
        return { line: (state.line + 1) % lineLengths.length, chars: 0, phase: "typing", ticks: 0 };
      }
      return { ...state, chars: state.chars - 1, ticks: 0 };
  }
}
