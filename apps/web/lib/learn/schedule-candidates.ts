// Dates found in the learner's own material — and everything that has to be true before one of
// them is allowed to become a calendar entry.
//
// 🔴 DATES ARE THE MOST CONSEQUENTIAL THING NEMESIS CAN GET WRONG. A wrong explanation costs a
// few minutes and is usually caught by the next question. A wrong exam date costs the exam.
// So every rule here is written to fail towards "ask" rather than towards "assume":
//
//   • nothing is a candidate without provenance — which source, which excerpt
//   • the ORIGINAL WORDING is never discarded, only added to
//   • "next Thursday" is resolved against the moment it was SAID, not the moment it was read
//   • an ambiguous or hedged date does not silently become a confirmed event
//   • the same date from four sources is one event with four supports, not four events
//   • a later source that moves a date SURFACES the move; it never silently overwrites
//
// 🔴 AND THIS FILE NEVER WRITES TO AN EXTERNAL CALENDAR. Adding a high-confidence,
// source-grounded event to Nemesis's own calendar is a product decision the owner has made.
// Writing to someone's Google or Apple calendar from an AI extraction is not, and must stay
// behind an explicit, per-write authorisation that a human gives.

import type { SourceRef } from "./canvas-model";

export type ScheduleKind =
  | "class"
  | "exam"
  | "quiz"
  | "assignment"
  | "project"
  | "meeting"
  | "deadline"
  | "study"
  | "other";

/** Where a calendar entry came from. §19: these are three different kinds of thing and must
 *  not be flattened — an exam deadline and a review Nemesis suggested are not peers. */
export type ScheduleOrigin =
  /** The learner said so. */
  | "user"
  /** Extracted from their material. */
  | "source_extraction"
  /** Nemesis proposed it from the memory model. */
  | "nemesis_plan";

export type ExtractionStatus = "candidate" | "confirmed" | "rejected";

export interface ScheduleCandidate {
  id: string;
  canvasId: string;
  kind: ScheduleKind;
  title: string;
  /** ISO. Absent when the material gave a date with no time, or no date we could resolve. */
  startAt?: string;
  endAt?: string;
  dueAt?: string;
  /** 🔴 NEVER DISCARDED. "next Thursday" is what the professor actually said, and if the
   *  resolution is ever questioned this is the only thing that can answer it. Storing only the
   *  resolved date throws away the evidence for the resolution. */
  originalExpression?: string;
  /** The moment the expression was anchored against — the recording's timestamp, the document's
   *  date, or when the learner typed it. Without this a relative date cannot be checked. */
  resolvedAgainst?: string;
  timezone?: string;
  /**
   * Weekdays a repeating meeting falls on, 0 = Sunday. Absent for a one-off.
   *
   * 🔴 THE EXTRACTOR ALREADY KNEW THIS AND WAS THROWING IT AWAY. `meetingPatternOf` recovers
   * days, start and end from "Tuesday and Thursday 10:00-11:20 AM", and only the start time
   * survived — so a weekly class reached the calendar as a single undated entry and the
   * recurrence had to be re-derived downstream or lost. A candidate carrying `meetsOn` is one
   * series; the alternative is one row per occurrence, which is how "Tue/Thu, Aug 24 – Dec 4"
   * becomes thirty calendar entries nobody asked for.
   */
  meetsOn?: number[];
  /** Local wall-clock `HH:MM`, when the material states one. */
  startTime?: string;
  endTime?: string;
  /** 🔴 REQUIRED. A date with no provenance cannot be shown, because the learner's only
   *  defence against a hallucinated deadline is being able to ask where it came from. */
  sourceRefs: SourceRef[];
  confidence: number;
  status: ExtractionStatus;
  origin: ScheduleOrigin;
}

/** At or above this, a source-grounded date is solid enough to place on Nemesis's own calendar
 *  without asking. Below it, it is surfaced for confirmation.
 *
 *  §16: "Exam 1: September 12, 2026" and "I think we'll probably test this sometime next month"
 *  are not the same claim. The first is worth acting on; the second is worth mentioning. */
export const AUTO_CONFIRM_AT = 0.8;

/** Hedging language drops confidence hard. Structural rather than subject-matter: these are
 *  words about certainty, and they mean the same thing in a syllabus, a contract and a lab
 *  manual. */
const HEDGES = /\b(probably|maybe|might|may be|possibly|tentative(ly)?|around|sometime|i think|or so|roughly|approximately|tbd|to be (confirmed|determined|announced))\b/i;

/** Language that explicitly moves something already scheduled. §36: this is what makes a later
 *  mention authoritative rather than merely more recent. */
const RESCHEDULE = /\b(moved|rescheduled|pushed (back|to)|changed to|now on|postponed|brought forward|delayed (to|until))\b/i;

export function hasHedging(text: string): boolean {
  return HEDGES.test(text);
}

export function isReschedule(text: string): boolean {
  return RESCHEDULE.test(text);
}

// ------------------------------------------------------------ relative dates

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export interface ResolvedDate {
  /** ISO date at midnight UTC of the resolved day. */
  iso: string;
  /** What the material actually said. */
  expression: string;
  /** What it was measured from. */
  anchor: string;
  /** How sure the RESOLUTION is — separate from how sure we are the event is real. */
  confidence: number;
}

/** Turn a relative expression into a date, measured from when it was said.
 *
 *  🔴 ANCHORED TO THE UTTERANCE, NOT TO NOW. A professor saying "the exam is next Thursday" in
 *  a recording made three weeks ago does not mean next Thursday from today. Resolving against
 *  the moment of reading is the single most likely way this feature produces a confidently
 *  wrong date, and it is why `anchor` is a required argument rather than defaulting to now.
 *
 *  Returns null rather than guessing. An unresolvable expression is kept as text and shown as
 *  text — "the professor said 'later in the term'" is honest; inventing a Tuesday is not. */
export function resolveRelativeDate(expression: string, anchor: Date): ResolvedDate | null {
  const text = expression.trim().toLowerCase();
  if (!text) return null;
  const anchorIso = anchor.toISOString();
  const day = (offset: number, confidence: number): ResolvedDate => {
    const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + offset));
    return { iso: date.toISOString(), expression, anchor: anchorIso, confidence };
  };

  if (/\btoday\b/.test(text)) return day(0, 0.95);
  if (/\btomorrow\b/.test(text)) return day(1, 0.95);
  if (/\bday after tomorrow\b/.test(text)) return day(2, 0.9);

  // "in 3 days" / "in two weeks"
  const inMatch = text.match(/\bin (\d+|one|two|three|four|five|six|seven) (day|week)s?\b/);
  if (inMatch) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const count = Number(inMatch[1]) || words[inMatch[1]!] || 0;
    if (count > 0) return day(count * (inMatch[2] === "week" ? 7 : 1), 0.85);
  }

  // "next Thursday" / "this Friday" / bare "Thursday".
  const weekdayMatch = text.match(/\b(next|this|coming)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const target = WEEKDAYS.indexOf(weekdayMatch[2] as (typeof WEEKDAYS)[number]);
    const current = anchor.getUTCDay();
    let ahead = (target - current + 7) % 7;
    if (ahead === 0) ahead = 7; // "Thursday" said on a Thursday means the next one.
    // 🔴 "next Thursday" is genuinely ambiguous in English — some people mean the one coming,
    // some mean the one after. We take the coming one and say we are less sure, rather than
    // pretending the ambiguity is not there.
    const qualifier = weekdayMatch[1]?.trim();
    return day(ahead, qualifier === "next" ? 0.6 : 0.75);
  }

  return null;
}

// ------------------------------------------------------------------ matching

/** Normalised identity for reconciliation: same session, same kind, same day, same-ish title. */
function identity(candidate: ScheduleCandidate): string {
  const when = (candidate.dueAt ?? candidate.startAt ?? "").slice(0, 10);
  const title = candidate.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${candidate.canvasId}|${candidate.kind}|${title}|${when}`;
}

/** Identity WITHOUT the date, so a moved event still matches its earlier self. */
function subjectIdentity(candidate: ScheduleCandidate): string {
  const title = candidate.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${candidate.canvasId}|${candidate.kind}|${title}`;
}

export interface ScheduleConflict {
  subject: string;
  /** The earlier claim, and the later one that disagrees with it. */
  from: ScheduleCandidate;
  to: ScheduleCandidate;
  /** True when the later source explicitly said it moved, rather than merely differing. */
  explicit: boolean;
}

export interface Reconciliation {
  /** One entry per real event, with every source that supports it merged in. */
  merged: ScheduleCandidate[];
  /** Same subject, different dates. 🔴 SURFACED, NEVER SILENTLY RESOLVED. */
  conflicts: ScheduleConflict[];
}

/** Merge duplicates and surface disagreements.
 *
 *  §35: the same exam date appears in the syllabus, the slides, the recording and something the
 *  learner typed. That is ONE event with four supports — and more independent support is a
 *  reason to be more confident, not a reason to show it four times.
 *
 *  §36: when a later source gives a different date for the same subject, the disagreement is
 *  reported. Silently keeping the earlier one is how a learner sits an exam on the wrong day. */
export function reconcile(candidates: readonly ScheduleCandidate[]): Reconciliation {
  const byIdentity = new Map<string, ScheduleCandidate>();

  for (const candidate of candidates) {
    const key = identity(candidate);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, { ...candidate, sourceRefs: [...candidate.sourceRefs] });
      continue;
    }
    // Same event, another source saw it. Merge provenance and raise confidence — but never
    // past certainty, and only for genuinely distinct sources.
    const refs = [...existing.sourceRefs];
    for (const ref of candidate.sourceRefs) {
      if (!refs.some((seen) => seen.sourceId === ref.sourceId && seen.excerptId === ref.excerptId)) {
        refs.push(ref);
      }
    }
    const independent = new Set(refs.map((ref) => ref.sourceId)).size;
    byIdentity.set(key, {
      ...existing,
      sourceRefs: refs,
      // Each additional independent source closes some of the remaining gap to 1.
      confidence: Math.min(0.99, Math.max(existing.confidence, candidate.confidence) + (independent - 1) * 0.05),
    });
  }

  const merged = [...byIdentity.values()];

  // Now look for the same subject on different days.
  const bySubject = new Map<string, ScheduleCandidate[]>();
  for (const candidate of merged) {
    const key = subjectIdentity(candidate);
    bySubject.set(key, [...(bySubject.get(key) ?? []), candidate]);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [subject, group] of bySubject) {
    if (group.length < 2) continue;
    // Ordered by when the CLAIM was made, not by the date it claims — a recording from last
    // week saying "moved to the 15th" outranks a syllabus written in August.
    const ordered = [...group].sort((a, b) => (a.resolvedAgainst ?? "").localeCompare(b.resolvedAgainst ?? ""));
    for (let index = 1; index < ordered.length; index += 1) {
      const from = ordered[index - 1]!;
      const to = ordered[index]!;
      conflicts.push({
        subject,
        from,
        to,
        explicit: isReschedule(to.originalExpression ?? to.title),
      });
    }
  }

  return { merged, conflicts };
}

/** Should this go onto Nemesis's own calendar without asking?
 *
 *  🔴 Three independent conditions, all required. Confidence alone is not enough: a confident
 *  reading of a hedged sentence is still a hedged sentence, and an extraction with no
 *  provenance cannot be checked by the learner even if the model was sure. */
export function canAutoConfirm(candidate: ScheduleCandidate): boolean {
  if (candidate.origin === "nemesis_plan") return false;
  if (candidate.sourceRefs.length === 0) return false;
  if (candidate.confidence < AUTO_CONFIRM_AT) return false;
  if (candidate.originalExpression && hasHedging(candidate.originalExpression)) return false;
  return Boolean(candidate.startAt ?? candidate.dueAt);
}

/** 🔴 NEVER TRUE FOR AN EXTERNAL CALENDAR. Kept as an explicit function so that the rule is a
 *  thing code has to call and a reviewer can grep for, rather than an absence somebody has to
 *  notice. Writing to a learner's Google or Apple calendar requires a human authorising that
 *  specific write; nothing derived from extraction may do it on their behalf. */
export function canWriteToExternalCalendar(): false {
  return false;
}
