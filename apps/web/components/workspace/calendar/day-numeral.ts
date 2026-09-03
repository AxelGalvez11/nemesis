// How big a date is drawn, everywhere a date is drawn.
//
// 🔴🔴 THIS EXISTS BECAUSE THE THREE VIEWS DISAGREED BY MORE THAN 2x. Measured on screen
// 2026-09-03: the week and day headers drew 26px in a 46px disc, the month cell 12px in 24, the
// year's mini-months 10px in 18. Owner, the same day: *"on the weekday, I was mainly talking about
// the day headers — I think those are the biggest problem. Could you also make sure the sizing is
// consistent throughout all the different views?"*
//
// 🔴🔴 AND THIS IS THE ONE PLACE NEMESIS'S OWN RAMP BEATS GOOGLE'S — SAY IT OUT LOUD, BECAUSE
// EVERYTHING ELSE ON THIS SURFACE GOES THE OTHER WAY. Google draws 26px in its week header and
// 12px in its month cell: more than double, and by their own design, because their week header is
// one numeral per column with a whole band to itself. Matching that faithfully is what produced
// the object the owner has now asked to shrink FOUR separate times (see the history in
// `time-grid-view.tsx`). Each previous pass moved this row closer to Google and he came back; the
// thing he is comparing it against is not Google, it is the month view he was looking at a minute
// earlier. So the ramp is ours: a header numeral is bigger than a cell numeral, and one and a half
// times bigger rather than two and a sixth.
//
// 🔴 A RULE, NOT THREE FREE NUMBERS. 10 -> 12 -> 18, with discs at 18 -> 24 -> 30. The disc is its
// numeral plus **12px of ring** on the two surfaces that have room for it, which is what makes a
// date read as the same OBJECT at two scales rather than two different controls.
//
// 🔴 THE YEAR RUNG RINGS AT 8, NOT 12, AND THAT IS DELIBERATE RATHER THAN A LEFTOVER. I wrote "a
// constant 12px" here first and the guard below caught it: the year's mini-month puts seven
// columns in a ~130px card, so a 22px disc does not fit and the numerals would touch. The rule is
// therefore "12 where it fits, tighter in the thumbnail" — stated, because an unexplained 8 is the
// thing a later pass rounds to 12 and breaks the year view with.
//
// Adding a fourth surface means adding a rung here, not inventing a size in a component.
//
// 🔴 EXPLICIT PIXELS. `html { font-size: 112.5% }` in this app, so a rem here lands 1.125x too big
// and the ramp would stop being the ramp. Section 13 of `docs/google-calendar-reference.md` has
// the reasoning for the grid at large.

export interface DateSize {
  /** Tailwind class for the numeral's font size. */
  text: string;
  /** Tailwind class for the round box it sits in, filled when it is today. */
  disc: string;
}

/** The year's mini-months: a thumbnail, read as a shape rather than as numbers. Rings at 8 —
 *  seven of these to a ~130px card, so 12 would make the numerals touch. */
export const YEAR_DATE: DateSize = { disc: "size-[18px]", text: "text-[10px]" };

/** A month cell's date. Google's own 12px, and the rung the other two are measured against. */
export const MONTH_DATE: DateSize = { disc: "size-[24px]", text: "text-[12px]" };

/**
 * The week, day and four-day header.
 *
 * 🔴 18 AND 30, WHERE GOOGLE DRAWS 26 AND 46. This is the deliberate divergence the note at the
 * head of this file is about. The band it sits in comes down with it: 2 + 20 + 30 + 4 = 56px,
 * against the 84 that matched Google.
 */
export const HEADER_DATE: DateSize = { disc: "size-[30px]", text: "text-[18px]" };

/**
 * The weekday label above a date — SUN, MON — wherever one is drawn.
 *
 * 🔴 GOOGLE'S 11px ON A 20px LINE, AND THE SAME IN EVERY VIEW. The month grid and the week header
 * had already converged on this by different routes; naming it is what stops them parting again.
 */
export const WEEKDAY_LABEL = "text-[11px] font-medium uppercase leading-[20px] tracking-[0.05em]";
