// Pure formatter for the Library row's sub-line (IMG_6539: "Modified 5 hours
// ago" under a day, else "Modified Aug 28") — dependency-free like
// relative-time.ts, which this module leans on rather than duplicates.
//
// Distinct from relative-time.ts's own two formatters because neither matches
// the reference exactly: shortRelativeTime prints compact "3h"/"2d" (a list
// row's timestamp elsewhere in this app, not this one), and longRelativeTime
// keeps counting up in days/weeks/months forever ("3 weeks ago") — the
// reference instead SWITCHES to a calendar date once a day has passed
// ("Modified Aug 26"), which is what a folder holds days after it was
// touched. So this file composes longRelativeTime for the sub-day case and a
// bare calendar date past that, with the "Modified " prefix the reference
// always shows.

import { longRelativeTime } from "./relative-time.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Modified 5 hours ago" for anything younger than a day, "Modified Aug 28"
 * (no year — the reference never shows one) past that. `now` is a parameter,
 * mirroring relative-time.ts, so this is testable without a live clock and
 * without hardcoding a locale's month-name spelling in the test.
 */
export function libraryModifiedLabel(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const ms = Math.max(0, now - then);
  if (ms < DAY_MS) return `Modified ${longRelativeTime(iso, now)}`;
  return `Modified ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
