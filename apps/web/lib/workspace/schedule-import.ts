/**
 * From extracted candidates to a Calendar import the learner can look at before
 * anything is written.
 *
 * 🔴 THE REFUSALS ARE OUTPUT, NOT CONTROL FLOW. `toCalendarEvent` has always
 * returned a reason when it declines, and every caller so far has thrown that
 * reason away — so a syllabus row that produced no calendar entry produced no
 * explanation either, and the student saw a shorter list with nothing saying
 * why. A refusal a user never sees is indistinguishable from an extraction that
 * never happened, which is the failure this whole area keeps repeating. Both
 * halves of the plan come back.
 *
 * 🔴 AND NOTHING HERE WRITES. The plan is a proposal: the caller shows it,
 * the learner approves it, and only then does `saveCalendarEvent` run. Writing
 * from inside a function called "plan" is how an import becomes irreversible
 * before anyone has read it.
 */

import { createHash } from "node:crypto";

import type { ScheduleCandidate } from "@/lib/learn/schedule-candidates";
import { AUTO_CONFIRM_AT } from "@/lib/learn/schedule-candidates";

import type { DecodedCalendarEvent } from "./calendar-codec";
import { isRefusal, toCalendarEvent, type ConversionRefusal } from "./schedule-to-calendar";

/** One candidate that will not become a calendar entry, and the reason in the open. */
export interface ImportRefusal {
  candidateId: string;
  title: string;
  reason: ConversionRefusal["reason"];
  /** The row as the document wrote it, so the learner can judge the refusal. */
  evidence?: string;
}

export interface CalendarImportPlan {
  /** Ready to write: confident, dated, provenance-carrying. */
  events: DecodedCalendarEvent[];
  /**
   * Extracted, plausible, and NOT confident enough to place unasked.
   *
   * Kept apart from `events` rather than mixed in with a flag: the difference
   * between "this is on your calendar" and "is this right?" is the entire point
   * of the confidence bar, and one list with a boolean is how that distinction
   * gets lost at the first UI that forgets to read it.
   */
  needsApproval: { candidate: ScheduleCandidate; event: DecodedCalendarEvent }[];
  refused: ImportRefusal[];
}

export interface ImportOptions {
  /**
   * Stable identity of the document these came from.
   *
   * 🔴 THE SOURCE, NOT THE PARSE, AND NOT THE CANVAS. `parsedDocumentId` changes
   * every time the file is re-read, so keying on it would duplicate the whole
   * syllabus on every re-import — the exact thing idempotency is for.
   * `identity()` in `schedule-candidates.ts` keys on `canvasId` instead, because
   * it deduplicates candidates WITHIN one canvas session; this key has to
   * survive across sessions and across re-parses, so it uses the source. The two
   * answer different questions and are deliberately not shared.
   */
  sourceId: string;
  /**
   * The last day a repeating meeting runs, IF the document states it.
   *
   * Never inferred here. Without it a recurring meeting is refused with
   * `no_series_end` rather than given an end that looks reasonable.
   */
  seriesEnd?: string;
}

/**
 * A calendar id that is the same every time the same row is imported.
 *
 * 🔴 IDEMPOTENCY LIVES HERE OR NOWHERE. `saveCalendarEvent` upserts on `id`, so
 * a stable id makes re-importing a syllabus a no-op and a random one makes it a
 * duplicate. Built from the source, the kind, the normalised title and the date:
 * everything that identifies the obligation, and nothing that changes when the
 * document is merely re-read.
 *
 * 🔴 KNOWN LIMIT: a learner who RENAMES an event and re-imports gets a second
 * entry, because the title is part of the key. Dropping the title would be worse
 * — every undated row in one document would collapse onto one id — so the
 * trade is deliberate and the tests state it.
 *
 * PURE.
 */
export function calendarEventId(candidate: ScheduleCandidate, sourceId: string): string {
  const title = candidate.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const when = (candidate.dueAt ?? candidate.startAt ?? "").slice(0, 10);
  const series = candidate.meetsOn?.length ? `w${[...candidate.meetsOn].sort((a, b) => a - b).join("")}` : "";
  const digest = createHash("sha256")
    .update(`${sourceId}|${candidate.kind}|${title}|${when}|${series}`, "utf8")
    .digest("hex");
  // Prefixed so a calendar row's origin is legible without a join.
  return `sched-${digest.slice(0, 24)}`;
}

/**
 * Turn candidates into a reviewable import.
 *
 * PURE — no network, no storage, no clock.
 */
export function planCalendarImport(
  candidates: readonly ScheduleCandidate[],
  options: ImportOptions,
): CalendarImportPlan {
  const events: DecodedCalendarEvent[] = [];
  const needsApproval: CalendarImportPlan["needsApproval"] = [];
  const refused: ImportRefusal[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const id = calendarEventId(candidate, options.sourceId);
    const result = toCalendarEvent(candidate, id, {
      ...(options.seriesEnd ? { seriesEnd: options.seriesEnd } : {}),
    });

    if (isRefusal(result)) {
      // 🔴 A CONFIDENCE REFUSAL IS NOT A DEAD END. The row was extracted, it has a
      // date and provenance, and the only thing missing is the learner's yes — so
      // it goes to `needsApproval` rather than being reported as unusable. Only a
      // candidate that cannot become an event at all is truly refused.
      const askable = result.reason === "not_confident_enough" || result.reason === "hedged";
      if (askable) {
        const forced = toCalendarEvent({ ...candidate, status: "confirmed" }, id, {
          ...(options.seriesEnd ? { seriesEnd: options.seriesEnd } : {}),
        });
        if (!isRefusal(forced) && !seen.has(id)) {
          seen.add(id);
          needsApproval.push({ candidate, event: forced.event });
          continue;
        }
      }
      refused.push({
        candidateId: candidate.id,
        reason: result.reason,
        title: candidate.title,
        ...(candidate.originalExpression ? { evidence: candidate.originalExpression.slice(0, 200) } : {}),
      });
      continue;
    }

    // Two rows of one document describing the same obligation collapse to one
    // entry rather than two identical ones — the same fact the stable id encodes,
    // enforced within a single import as well as across repeats of it.
    if (seen.has(id)) continue;
    seen.add(id);
    events.push(result.event);
  }

  return { events, needsApproval, refused };
}

/**
 * Accept one proposal the learner said yes to.
 *
 * The candidate becomes `confirmed`, which is what lets it past the automatic
 * bar in `toCalendarEvent` — a learner who looked at a row and approved it is
 * better evidence than any threshold, and this is where that is recorded rather
 * than assumed.
 *
 * PURE.
 */
export function approve(candidate: ScheduleCandidate): ScheduleCandidate {
  return { ...candidate, confidence: Math.max(candidate.confidence, AUTO_CONFIRM_AT), status: "confirmed" };
}
