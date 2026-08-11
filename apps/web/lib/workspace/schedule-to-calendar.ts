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
  AUTO_CONFIRM_AT,
  canAutoConfirm,
  hasHedging,
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
    | "is_a_plan_not_an_obligation"
    /**
     * A repeating meeting whose LAST DAY the document never states.
     *
     * 🔴 A GUESSED END IS WORSE THAN NO SERIES, WHICH IS WHY THIS EXISTS. `recurrence.until` is
     * required by `CalendarEvent`, and the tempting fill-in — "the latest dated thing in this
     * document" — is a fabrication: on a real syllabus the last dated row is the final EXAM, so a
     * Tuesday/Thursday class would silently stop on exam day and every meeting after it would
     * vanish from the calendar. Missing work the student was never shown is the worst failure this
     * pipeline has, so the series is refused and kept as a candidate to confirm instead.
     */
    | "no_series_end";
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
  options: {
    /**
     * The last day a repeating meeting runs, when the DOCUMENT states one.
     *
     * Never derived. A caller that does not know it gets `no_series_end` rather than a series
     * that ends somewhere plausible.
     */
    seriesEnd?: string;
  } = {},
): { event: DecodedCalendarEvent } | ConversionRefusal {
  const recurring = (candidate.meetsOn?.length ?? 0) >= 2;
  const instant = candidate.dueAt ?? candidate.startAt;
  // A recurring meeting has weekdays and times and NO single date; requiring one would refuse
  // every class series with `no_date`, which is true of the row and false about the document.
  if (!instant && !recurring) return { reason: "no_date" };

  // 🔴 STRUCTURAL IMPOSSIBILITY IS REPORTED BEFORE CONFIDENCE, and the order is the whole
  // usefulness of the reason. A recurring candidate has no `startAt`, so `canAutoConfirm` — which
  // ends in `Boolean(startAt ?? dueAt)` — refuses EVERY series no matter how certain it is, and
  // the caller was told `hedged`. That sends a reader looking for tentative language in a row that
  // has none, when the actual missing fact is the last day of term.
  if (recurring && !options.seriesEnd) return { reason: "no_series_end" };

  // A candidate the learner explicitly confirmed skips the automatic bar — they looked at it
  // and said yes, which is better evidence than any threshold.
  if (candidate.status !== "confirmed") {
    if (candidate.origin === "nemesis_plan") return { reason: "is_a_plan_not_an_obligation" };
    if (candidate.sourceRefs.length === 0) return { reason: "no_provenance" };
    // A series is judged on the same evidence minus the single date it cannot have: the weekdays
    // ARE its when. Passing it through `canAutoConfirm` unchanged would fail it on the one clause
    // that does not apply.
    const confident = recurring
      ? candidate.confidence >= AUTO_CONFIRM_AT
        && !(candidate.originalExpression && hasHedging(candidate.originalExpression))
      : canAutoConfirm(candidate);
    if (!confident) {
      return {
        reason: candidate.originalExpression && candidate.confidence >= 0.8 ? "hedged" : "not_confident_enough",
      };
    }
  }

  const date = instant
    ? localDateKey(instant, candidate.timezone)
    : options.seriesEnd && candidate.resolvedAgainst
      ? localDateKey(candidate.resolvedAgainst, candidate.timezone)
      : null;
  if (!date) return { reason: recurring ? "no_series_end" : "no_date" };

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
    ...(candidate.startTime ? { time: candidate.startTime } : {}),
    ...(candidate.endTime ? { endTime: candidate.endTime } : {}),
    // ONE series, not one row per occurrence.
    ...(recurring && options.seriesEnd
      ? { recurrence: { days: [...candidate.meetsOn!].sort((a, b) => a - b), until: options.seriesEnd } }
      : {}),
  };

  return { event };
}

export function isRefusal(
  result: { event: DecodedCalendarEvent } | ConversionRefusal,
): result is ConversionRefusal {
  return "reason" in result;
}
