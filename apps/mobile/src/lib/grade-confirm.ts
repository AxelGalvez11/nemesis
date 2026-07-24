// The review screen's grade "confirm hold" — owner 2026-07-23: "tapping right
// side should leave 'good' on for a second while the rest disappear", and the
// same for Again on the left.
//
// Why this is a module rather than two expressions inline in review.tsx: the
// tap zones are INVISIBLE and the two halves of the card are indistinguishable,
// so this lit button is the only thing telling a student which grade a blind
// half-screen tap actually registered. Getting it wrong isn't cosmetic — the
// student reads the wrong grade and doesn't know their card was scheduled a day
// out. Both rules below are pure, so they're pinned by tests.
//
// See review.tsx grade() for the sequencing this feeds.

/**
 * How much longer to wait before advancing, given how long the grade RPC
 * already took.
 *
 * The hold is a FLOOR on visible time, never a timer that advances the card on
 * its own. Advancing stays gated on the server's answer in grade(); a
 * free-running setTimeout would race it three ways — a slow grade writing its
 * result back over the NEXT card, a failed grade still skipping a card the
 * server never recorded, and a gap wide enough to let a second tap through.
 *
 * Clamped at BOTH ends, because wall-clock time can run backwards (an NTP
 * correction, the user changing the clock mid-review) and hand this a negative
 * elapsed. Clamping only the result would turn that into a wait LONGER than the
 * floor — the card would sit there past the hold for no reason. Clamping the
 * input first keeps the answer inside [0, floorMs] whatever the clock does.
 */
export function confirmHoldRemaining(elapsedMs: number, floorMs: number): number {
  return Math.max(0, floorMs - Math.max(0, elapsedMs));
}

/** How one grade button renders. `hidden` keeps its slot — see gradeButtonState. */
export type GradeButtonState = "idle" | "lit" | "hidden" | "dimmed";

/**
 * Which of the four grade buttons is lit, hidden, or dimmed right now.
 *
 * `flashGrade` outranks `grading` deliberately: both are true for the whole
 * confirm hold, and if the in-flight dim won, the one button the student is
 * meant to be reading would render at half opacity.
 *
 * `hidden` means invisible but still occupying its slot in the row — the
 * survivor must not stretch to fill the width, or the thing you're meant to
 * read jumps as it appears.
 *
 * @param rating     this button's grade
 * @param flashGrade the grade being confirmed, or null outside a hold
 * @param grading    true while any grade is on the wire
 */
export function gradeButtonState(
  rating: string,
  flashGrade: string | null,
  grading: boolean,
): GradeButtonState {
  if (flashGrade !== null) return rating === flashGrade ? "lit" : "hidden";
  // No hold, but a grade is on the wire: the retry-after-failure case. Dim the
  // whole row rather than hiding three of it — a disappearance here would read
  // as a confirmation the student never actually got.
  if (grading) return "dimmed";
  return "idle";
}
