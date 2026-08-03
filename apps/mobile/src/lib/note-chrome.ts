// When a note's floating controls are on screen.
//
// Owner 2026-08-01: "in the library, as users scroll down a note, the buttons
// should dissappear and reappaer if user scrolls upward." The note page floats
// two clusters over the text — the back button and mode pill at the top, the
// navigation pill bar at the bottom — and on a long note they sit over the
// words for the entire read.
//
// DIRECTION, NOT POSITION. The rule is about which way the hand just moved, so
// it is one comparison between consecutive scroll offsets rather than anything
// to do with how far down the note is. That is what makes "flick up to get the
// controls back" work from anywhere in a document instead of only near the top.
//
// Pure and separate from the screen so it can be tested: a Deno test cannot
// import a React Native component, and a rule with three thresholds in it is
// exactly the kind that acquires an off-by-one nobody notices.

/**
 * Movement under this many points is ignored.
 *
 * A finger resting on a scroll view emits a steady dribble of one- and two-point
 * updates, and momentum settling at the end of a fling reverses direction for a
 * few frames. Without a floor the controls would flicker through both.
 */
const SCROLL_SLOP = 6;

/**
 * Above this offset the controls are always shown, whichever way the note just
 * moved.
 *
 * At the top of a note there is nothing scrolled away to make room for, so
 * hidden controls would read as missing rather than as tucked away — and it
 * guarantees a way back: open a note, and the buttons are there.
 */
const ALWAYS_SHOWN_TOP = 40;

/**
 * @param showing what the screen is doing now
 * @param offsetY the scroll view's current position
 * @param lastOffsetY its position at the previous event
 * @returns whether the floating controls should be on screen
 */
export function noteChromeShown(showing: boolean, offsetY: number, lastOffsetY: number): boolean {
  if (offsetY <= ALWAYS_SHOWN_TOP) return true;
  const delta = offsetY - lastOffsetY;
  // Reading DOWN the note — the text is travelling up and the student is moving
  // through it, which is the moment the controls are worth least.
  if (delta > SCROLL_SLOP) return false;
  // Going back up. Almost always someone reaching for something, and the
  // controls are what they are reaching for.
  if (delta < -SCROLL_SLOP) return true;
  return showing;
}
