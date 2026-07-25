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

/** The scroller's height, and so the bar's. One control tall — matches
 *  `control.lg` in theme/tokens.ts, hard-coded here to keep this module free of
 *  imports (and therefore trivially testable). Kept in step by a test. */
export const ACCESSORY_BAR_HEIGHT = 44;

/** Space between the pill's edge and the screen's, left and right. Matches the
 *  rail's `paddingHorizontal: space(3)`. */
export const ACCESSORY_RAIL_PADDING = 12;

/** Narrow enough to fit any phone, wide enough that the bar is unmistakably
 *  present if a window measurement ever arrives broken. */
export const MIN_ACCESSORY_PILL_WIDTH = 120;

/**
 * The pill's width in points: the screen, less the rail's padding on both sides.
 *
 * Full-width-minus-margins rather than shrink-to-fit, because fourteen
 * formatting buttons cannot fit on an iPhone anyway — the bar is meant to scroll,
 * and it can only scroll inside a width somebody gave it.
 *
 * Never returns 0 or a negative number, however narrow the window is reported
 * as: a zero here is the exact failure this module exists to prevent, so the
 * floor is a real minimum rather than a clamp to nothing.
 */
export function accessoryPillWidth(windowWidth: number, railPadding = ACCESSORY_RAIL_PADDING): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) return MIN_ACCESSORY_PILL_WIDTH;
  return Math.max(MIN_ACCESSORY_PILL_WIDTH, Math.round(windowWidth - railPadding * 2));
}
