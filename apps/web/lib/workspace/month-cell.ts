// What fits inside one month-view day cell, and in what order.
//
// 🔴 THIS EXISTS BECAUSE "SHOW THREE" WAS A CONSTANT AND HAD TO STOP BEING ONE.
// `MAX_CHIPS_PER_DAY = 3` decided how many events a day showed, whatever height
// the row actually had. Two ways that is wrong at once:
//
//   - The month grid stretches to fill the window (month view is sized to need
//     no scrolling), so a tall window gives a cell room for five or six lines
//     and it drew three, wasting the space the layout had just fought for.
//   - Settings → Appearance has a Scaling control, and it works by setting
//     `document.documentElement.style.fontSize`. Every length in the cell is in
//     rem or derived from the text size, so at 125% three lines can stop fitting
//     — and the cap, being a number rather than a measurement, kept promising
//     three and let the third one clip.
//
// So the caller MEASURES (one row, one rendered line) and this decides. Pure and
// DOM-free, the same split as time-grid.ts: the arithmetic is testable, the
// component only reads boxes.

/** Measured pixels from a rendered month grid. Every one of these changes with
 *  the student's Scaling setting, which is why none of them is a constant. */
export interface CellMetrics {
  /** Height available to event lines: the cell minus its day-number row and padding. */
  contentHeight: number;
  /** One event line, including the gap beneath it. */
  lineHeight: number;
  /** The "+N more" row, including its gap. Usually shorter than a line. */
  moreHeight: number;
}

export interface CellFit {
  /** How many events to draw. */
  show: number;
  /** How many are left over — 0 means no "+N more" row. */
  hidden: number;
}

/**
 * How many of `total` events fit, and how many are left over.
 *
 * 🔴 THE SECOND PASS IS THE WHOLE POINT. If everything fits, everything shows
 * and there is no link. If it does not, the link itself occupies a row, so the
 * number that fits ALONGSIDE it is smaller — computing the cap once and then
 * adding a link underneath is how a cell ends up one row taller than its own
 * height. Google gets this right and it is the difference between a grid that
 * clips and one that does not.
 *
 * Always shows at least one event when there is one: a cell too short for even a
 * single line is a window nobody is reading the calendar in, and "+6 more" alone
 * tells a student less than one event and "+5 more".
 */
export function fitEvents(total: number, metrics: CellMetrics): CellFit {
  if (total <= 0) return { show: 0, hidden: 0 };

  const { contentHeight, lineHeight, moreHeight } = metrics;
  // A measurement that has not happened yet (a first render, a display:none
  // ancestor) must not be read as "nothing fits" — show everything and let the
  // observer correct it a frame later.
  if (!(lineHeight > 0) || !(contentHeight > 0)) return { show: total, hidden: 0 };

  const fits = Math.floor(contentHeight / lineHeight);
  if (fits >= total) return { show: total, hidden: 0 };

  const withLink = Math.floor((contentHeight - moreHeight) / lineHeight);
  const show = Math.max(1, Math.min(withLink, total - 1));
  return { show, hidden: total - show };
}

/**
 * The order a day's events are drawn in.
 *
 * Untimed first, then by clock time — which is what every calendar does and what
 * the all-day strip in the week grid already does. An event with no time is a
 * deadline ("essay due Friday"), and a deadline heads the day rather than
 * sorting into the middle of it at an hour nobody chose.
 */
export function orderForCell<T extends { time?: string }>(events: readonly T[]): T[] {
  return events.slice().sort((left, right) => {
    if (!left.time && !right.time) return 0;
    if (!left.time) return -1;
    if (!right.time) return 1;
    return left.time < right.time ? -1 : left.time > right.time ? 1 : 0;
  });
}
