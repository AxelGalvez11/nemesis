// Which way a swipe on the Calendar is meant to be read.
//
// Owner 2026-07-27. The calendar used to change period on a HORIZONTAL swipe in
// every view, which fought the app's own gesture for opening the sidebar: dragging
// rightward from anywhere on the calendar moved you a month instead of revealing the
// drawer, and the drawer had no way in from this tab at all.
//
//   Month / year view : horizontal is the SIDEBAR, never the period.
//                       vertical steps the month (or the year, in year view).
//   Day view          : the day is the thing you flick through, so horizontal steps
//                       it -- but only from the right two thirds. The left third is
//                       reserved for the sidebar, so there is always a way out.
//
// PURE, so the thresholds and the third-of-the-screen boundary are testable without
// a device; the screen only wires the outcome to a setter.

export type SwipeIntent = "sidebar" | "prev" | "next" | "none";

/** Below these a drag is a tap or a wobble, not a swipe. Matches the numbers the
 *  calendar already used, so the flick that worked yesterday still works. */
export const SWIPE_DISTANCE = 44;
export const SWIPE_VELOCITY = 420;

/** The left slice of the screen that belongs to the sidebar in day view. */
export const SIDEBAR_ZONE = 1 / 3;

function carries(distance: number, velocity: number): boolean {
  return Math.abs(distance) >= SWIPE_DISTANCE || Math.abs(velocity) >= SWIPE_VELOCITY;
}

/**
 * Month and year view. Horizontal never changes the period any more — a rightward
 * drag reveals the sidebar, and a leftward one does nothing rather than guessing.
 * Vertical steps the period: up is forward, the direction the content would move.
 */
export function gridSwipeIntent(dx: number, dy: number, vx: number, vy: number): SwipeIntent {
  // Whichever axis the hand actually travelled on wins, so a sloppy diagonal cannot
  // both open the drawer and change the month.
  if (Math.abs(dx) > Math.abs(dy)) {
    if (!carries(dx, vx)) return "none";
    return dx > 0 ? "sidebar" : "none";
  }
  if (!carries(dy, vy)) return "none";
  return dy < 0 ? "next" : "prev";
}

/**
 * Day view. A swipe that STARTS in the left third is the sidebar; anywhere else it
 * steps the day. Judged on where the finger went DOWN, not where it ended, so a long
 * flick that crosses the boundary still does what it looked like it would.
 */
export function daySwipeIntent(startX: number, width: number, dx: number, vx: number): SwipeIntent {
  if (!carries(dx, vx)) return "none";
  // A zero/unknown width must not turn the whole screen into the sidebar zone.
  const inSidebarZone = width > 0 && startX < width * SIDEBAR_ZONE;
  if (inSidebarZone) return dx > 0 ? "sidebar" : "none";
  return dx < 0 ? "next" : "prev";
}
