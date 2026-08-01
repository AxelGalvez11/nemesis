// Geometry for the floating pill bars that ride above the keyboard
// (`InputAccessoryView` on iOS): the note editor's formatting toolbar and the
// add-card sheet's cloze toolbar.
//
// WHY THIS IS A MODULE AND NOT TWO STYLESHEETS
//
// An `InputAccessoryView` has no size of its own — iOS sizes it to whatever its
// React child measures. That makes it the one place in the app where a view with
// an INDEFINITE size renders as literally nothing while every prop still reads
// as correct. Both toolbars have now been reported invisible twice, for the same
// reason on two different axes:
//
//   1. HEIGHT (found 2026-07-23, batch 13). A horizontal `<ScrollView>` has no
//      intrinsic height. The accessory view sized to its child, the child had no
//      height, and they agreed on 0. Fixed then by giving the scroller an
//      explicit height — which is `ACCESSORY_BAR_HEIGHT` below.
//
//   2. WIDTH (found 2026-07-24, this batch — the fix above was shipped and the
//      owner still saw no toolbar). Exactly the same trap on the other axis, and
//      the reason it survived: a horizontal `<ScrollView>` takes its width FROM
//      ITS PARENT, but the parent pill was shrink-to-fit inside a centring rail,
//      so the pill was waiting on the scroller and the scroller was waiting on
//      the pill. Yoga settles that circle at zero. `maxWidth: "100%"` looked like
//      a width but is a percentage of an indefinite parent, so it clamps nothing.
//      The result is a bar the full height of a button and zero pixels wide.
//
// The tell that separates the two cases from the ones that always worked: every
// accessory bar whose buttons sit in a plain `<View>` renders fine (the table
// editor's size controls, the note title's Done button), because a row of
// buttons measures itself from its children. Only the two SCROLLING bars break.
// A scroller that sized itself to its content would have nothing to scroll — so
// giving it a definite width is not a workaround, it is the contract.
//
// Hence: both axes come from here, as plain numbers, and neither toolbar is
// allowed to describe its own size. Pure arithmetic, so the rule is testable —
// which is the point, since nothing else in the suite can catch a view that
// lays out to zero.

// Both numbers below are declared with LITERAL types (`= 44 as const`), not
// `number`. That is what lets NoteBlockEditor assert at COMPILE TIME that they
// still equal the theme tokens they claim to match — see the assertions next to
// its styles. Writing the values here rather than importing theme/tokens keeps
// this module import-free, which is what makes it testable at all: the test
// runner cannot resolve the `@/` aliases or load React Native.
//
// A test that asserted `ACCESSORY_BAR_HEIGHT === 44` would only be pinning the
// constant against itself. The compile-time check is the one that means something.

/** The scroller's height, and so the bar's. One control tall — must equal
 *  `control.lg` in theme/tokens.ts, which tsc enforces. */
export const ACCESSORY_BAR_HEIGHT = 44 as const;

/** Space between the pill's edge and the screen's, left and right. Must equal
 *  the rail's `paddingHorizontal`, i.e. `space(3)`, which tsc enforces.
 *
 *  If this were SMALLER than the rail's real padding, the pill would be wider
 *  than the space left for it and would clip at both screen edges — a new
 *  visual bug on the one surface that has already failed twice. */
export const ACCESSORY_RAIL_PADDING = 12 as const;

/** Narrow enough to fit any phone, wide enough that the bar is unmistakably
 *  present if a window measurement ever arrives broken. */
export const MIN_ACCESSORY_PILL_WIDTH = 120;

/**
 * The pill's width in points: the screen, less the rail's padding on both sides,
 * less anything sharing the rail with it.
 *
 * Full-width-minus-margins rather than shrink-to-fit, because fourteen
 * formatting buttons cannot fit on an iPhone anyway — the bar is meant to scroll,
 * and it can only scroll inside a width somebody gave it.
 *
 * `reserved` is room set aside for a SIBLING on the same rail — the note
 * editor's put-the-keyboard-away button (owner 2026-08-01: "add a button put
 * keyboard down it should sit beside the editing toolbar on the right of it").
 * It has to be subtracted HERE rather than left to flexbox: the pill's width is
 * an explicit number precisely because nothing on this rail is allowed to
 * measure itself, and a sibling laid out beside a pill that still claims the
 * whole screen would push itself off the right-hand edge.
 *
 * Never returns 0 or a negative number, however narrow the window is reported
 * as: a zero here is the exact failure this module exists to prevent, so the
 * floor is a real minimum rather than a clamp to nothing.
 */
export function accessoryPillWidth(
  windowWidth: number,
  railPadding: number = ACCESSORY_RAIL_PADDING,
  reserved = 0,
): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) return MIN_ACCESSORY_PILL_WIDTH;
  const usable = windowWidth - railPadding * 2 - Math.max(0, reserved);
  return Math.max(MIN_ACCESSORY_PILL_WIDTH, Math.round(usable));
}
