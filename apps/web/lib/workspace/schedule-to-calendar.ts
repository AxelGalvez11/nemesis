// Phase F: a schedule candidate becomes a calendar event — or explicitly does not.
//
// This is the boundary between "we found a date in your material" and "this is on your
// calendar", and it is deliberately a narrow, one-way door. Everything upstream
// (schedule-candidates.ts) is about reading dates carefully; everything downstream treats a
// calendar entry as a fact the learner will plan around.
//
// 🔴 REFUSING IS A FIRST-CLASS OUTCOME. `toCalendarEvent` returns null far more often than not,
// and every refusal has a stated reason. A pipeline that always produces something would put
// "we'll probably test this sometime next month" on someone's calendar as an exam.

import {
  canAutoConfirm,
  type ScheduleCandidate,
  type ScheduleKind,
} from "@/lib/learn/schedule-candidates";

import type { CalendarEventKind } from "./calendar-model";
import type { DecodedCalendarEvent } from "./calendar-codec";

/** Schedule kinds collapse into the calendar's smaller vocabulary.
 *
 *  Lossy on purpose, and the loss is recorded: the original kind survives on the candidate, and
 *  the calendar only needs enough to colour and group. Inventing new calendar kinds to preserve
 *  a distinction nothing renders would be schema churn for no reader. */
const KIND: Record<ScheduleKind, CalendarEventKind> = {
  class: "class",
  exam: "exam",
  quiz: "exam",
  assignment: "assignment",
  project: "assignment",
  deadline: "assignment",
  meeting: "other",
  study: "other",
  other: "other",
};

export interface ConversionRefusal {
  reason:
    | "no_date"
    | "not_confident_enough"
    | "no_provenance"
    | "hedged"
    | "is_a_plan_not_an_obligation";
}

/** ISO instant → the local date key the calendar stores.
 *
 *  🔴 `toISOString().slice(0,10)` is the bug this avoids — calendar-agent-range.ts already
 *  documents it: the UTC date says tomorrow every evening in the Americas, which silently moved
 *  same-day deadlines. The candidate's instant is converted in the LEARNER's zone. */
function localDateKey(iso: string, timezone?: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  try {
    // en-CA yields yyyy-mm-dd, which is the storage format already in use.
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(time));
  } catch {
    // An unknown timezone must not lose the date — fall back to the runtime's own zone.
    const date = new Date(time);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }
}

/** The calendar entry for a candidate, or the reason there isn't one. */
export function toCalendarEvent(
  candidate: ScheduleCandidate,
  eventId: string,
): { event: DecodedCalendarEvent } | ConversionRefusal {
  const instant = candidate.dueAt ?? candidate.startAt;
  if (!instant) return { reason: "no_date" };

  // A candidate the learner explicitly confirmed skips the automatic bar — they looked at it
  // and said yes, which is better evidence than any threshold.
  if (candidate.status !== "confirmed") {
    if (candidate.origin === "nemesis_plan") return { reason: "is_a_plan_not_an_obligation" };
    if (candidate.sourceRefs.length === 0) return { reason: "no_provenance" };
    if (!canAutoConfirm(candidate)) {
      return {
        reason: candidate.originalExpression && candidate.confidence >= 0.8 ? "hedged" : "not_confident_enough",
      };
    }
  }

  const date = localDateKey(instant, candidate.timezone);
  if (!date) return { reason: "no_date" };

  const event: DecodedCalendarEvent = {
    id: eventId,
    title: candidate.title,
    date,
    kind: KIND[candidate.kind],
    // 🔴 Everything needed to answer "where did this come from?" travels with it. A date on a
    // calendar with no way back to the sentence that produced it is exactly the thing §14 says
    // is too dangerous to show.
    origin: "source_extraction",
    canvasId: candidate.canvasId,
    sourceRefs: candidate.sourceRefs,
    confidence: candidate.confidence,
    ...(candidate.originalExpression ? { originalExpression: candidate.originalExpression } : {}),
    ...(candidate.resolvedAgainst ? { resolvedAgainst: candidate.resolvedAgainst } : {}),
    // Extracted events are read-only in the UI, which is what `source: "agent"` already means.
    source: "agent",
  };

  return { event };
}

export function isRefusal(
  result: { event: DecodedCalendarEvent } | ConversionRefusal,
): result is ConversionRefusal {
  return "reason" in result;
}
