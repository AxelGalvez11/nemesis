// Conflict detection for calendar writes (owner 2026-08-03: "chat should be
// able to recognize, when uploading syllabus, if there are dates that
// conflict"). Pure functions — the syllabus importer and the chat's
// add_calendar_event tool both call these, so the two write paths cannot
// drift in what they consider a conflict.
//
// Two different findings, deliberately kept apart:
//   - a DUPLICATE (same name, same day) is almost always the same syllabus
//     imported twice — it is SKIPPED, because adding it again helps nobody;
//   - a CLASH (two timed things occupying the same clock time) is real life —
//     it is still saved, and FLAGGED, because whether to drop one is the
//     student's call, not the importer's.

import { expandRecurringEvents, parseDateKey, type CalendarEvent } from "./calendar-model";

export interface CalendarClash {
  incoming: CalendarEvent;
  existing: CalendarEvent;
}

export interface CalendarConflictSplit {
  /** Already on the calendar (same name, same day) — do not save again. */
  duplicates: CalendarEvent[];
  /** Saved AND worth mentioning: they overlap something already scheduled. */
  clashes: CalendarClash[];
  /** Everything that should actually be written (includes the clashes). */
  toSave: CalendarEvent[];
}

const normalizeTitle = (title: string) => title.trim().toLowerCase().replace(/\s+/g, " ");

function minutesOf(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** How long an event without a stated end is assumed to occupy. An hour is the
 *  common class block; the exact number only affects how generously "same
 *  time" is read, never what gets saved. */
const DEFAULT_DURATION_MINUTES = 60;

/** Two events clash when they sit on the same date and their clock ranges
 *  cross. Events without a time (all-day rows, date-only deadlines) never
 *  clash — a due date does not occupy the hour. */
export function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  if (a.date !== b.date) return false;
  const aStart = minutesOf(a.time);
  const bStart = minutesOf(b.time);
  if (aStart === null || bStart === null) return false;
  const aEnd = minutesOf(a.endTime) ?? aStart + DEFAULT_DURATION_MINUTES;
  const bEnd = minutesOf(b.endTime) ?? bStart + DEFAULT_DURATION_MINUTES;
  return aStart < bEnd && bStart < aEnd;
}

export function isDuplicateEvent(event: CalendarEvent, existing: CalendarEvent): boolean {
  return event.date === existing.date && normalizeTitle(event.title) === normalizeTitle(existing.title);
}

export function splitCalendarConflicts(
  incoming: readonly CalendarEvent[],
  existing: readonly CalendarEvent[],
): CalendarConflictSplit {
  const duplicates: CalendarEvent[] = [];
  const clashes: CalendarClash[] = [];
  const toSave: CalendarEvent[] = [];

  for (const event of incoming) {
    if (existing.some((row) => isDuplicateEvent(event, row))) {
      duplicates.push(event);
      continue;
    }
    const hit = existing.find((row) => eventsOverlap(event, row));
    if (hit) clashes.push({ existing: hit, incoming: event });
    toSave.push(event);
  }

  return { clashes, duplicates, toSave };
}

/** One plain-English line about what was skipped or double-booked; empty when
 *  there is nothing to say. The callers append it to their own "Added N
 *  events" sentence. */
export function conflictSummary(split: CalendarConflictSplit): string {
  const parts: string[] = [];
  if (split.duplicates.length) {
    parts.push(`Skipped ${split.duplicates.length} already on your calendar`);
  }
  if (split.clashes.length) {
    const [first] = split.clashes;
    const example = first ? ` (for example ${first.incoming.title} overlaps ${first.existing.title} on ${first.existing.date})` : "";
    parts.push(`${split.clashes.length} land${split.clashes.length === 1 ? "s" : ""} at the same time as something already scheduled${example}`);
  }
  return parts.length ? `${parts.join(". ")}.` : "";
}

// ── Auditing what is ALREADY on the calendar ────────────────────────────────
// The split above guards one incoming batch. These look at the calendar as it
// stands, so the chat can answer "clean up my calendar" with findings instead
// of feelings. Owner 2026-08-05, verbatim requirements: distinguish an EXACT
// duplicate from a PROBABLE one, recognize CONFLICTING VERSIONS of the same
// academic event (the "old calendar says Exam 2 is Oct 12, newest syllabus
// says Oct 14" case), and never call two unrelated events at the same time
// duplicates — an overlap is real life, not a copy.

export interface CalendarIssueEventRef {
  id: string;
  title: string;
  date: string;
  kind: string;
  time?: string;
  course?: string;
  /** This row is a repeating rule; `date` is one meeting of it. */
  recurring?: true;
}

/**
 * 🔴 `id` is ALWAYS a real `calendar_events` row id.
 *
 * `expandRecurringEvents` rewrites an occurrence's id to `<rowId>@<date>`, which
 * exists nowhere in the database. A finding carrying one would hand the model a
 * handle that every update and delete then fails on — so the series id wins and
 * the occurrence's date travels in `date`, exactly as `eventsInWindow` does it.
 */
function issueRef(event: CalendarEvent): CalendarIssueEventRef {
  return {
    date: event.date,
    id: event.seriesId ?? event.id,
    kind: event.kind,
    title: event.title,
    ...(event.course ? { course: event.course } : {}),
    ...(event.time ? { time: event.time } : {}),
    ...(event.seriesId ? { recurring: true as const } : {}),
  };
}

/**
 * When the same finding recurs, because a repeating class meets the same clash
 * every week.
 *
 * 🔴 This is why findings are collapsed rather than listed per meeting. A MWF
 * 9 AM lecture clashing with a MWF 9 AM lab is ONE problem the student has to
 * solve once — but expanded across a term it is ~45 identical rows, which
 * floods the answer and pushes the tool result past its serialization budget.
 * One finding, a count, and enough dates to recognise it.
 */
export interface RepeatSummary {
  /** How many dates the same rows collide on. */
  occurrences: number;
  /** The first few, in order. */
  dates: string[];
}

export interface ExactDuplicateGroup {
  date: string;
  title: string;
  /** 2+ rows with this exact title on this exact date — an import run twice. */
  events: CalendarIssueEventRef[];
  repeats?: RepeatSummary;
}

export interface ProbableDuplicatePair {
  date: string;
  reason: string;
  first: CalendarIssueEventRef;
  second: CalendarIssueEventRef;
  repeats?: RepeatSummary;
}

export interface ConflictingVersionsGroup {
  title: string;
  kind: string;
  /** The same named exam/assignment sitting on DIFFERENT dates — sources
   *  disagree, and the newest trustworthy one should win (or the student
   *  decides). Never auto-fixed; surfaced for reconciliation. */
  events: CalendarIssueEventRef[];
}

export interface OverlapPair {
  date: string;
  first: CalendarIssueEventRef;
  second: CalendarIssueEventRef;
  repeats?: RepeatSummary;
}

export interface CalendarIssues {
  exact_duplicates: ExactDuplicateGroup[];
  probable_duplicates: ProbableDuplicatePair[];
  conflicting_versions: ConflictingVersionsGroup[];
  overlaps: OverlapPair[];
}

/** Words that make two titles comparable. 4+ chars keeps "Exam 2" vs "Lab 2"
 *  from matching on the bare digit. */
function titleWords(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((word) => word.length >= 4));
}

/** Why two same-day titles look like the same event, or null when they don't. */
function similarTitleReason(a: string, b: string): string | null {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
    return "one title contains the other";
  }
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return null;
  let shared = 0;
  for (const word of wa) if (wb.has(word)) shared += 1;
  const smaller = Math.min(wa.size, wb.size);
  return shared >= 2 && shared * 2 >= smaller ? "their titles share most of their words" : null;
}

/** Only kinds where "the same name on two dates" means sources disagree.
 *  Classes and rotations legitimately repeat under one name every week. */
const VERSIONED_KINDS = new Set(["assignment", "exam"]);

/** How far apart two dates can sit and still plausibly be versions of one
 *  event rather than "Exam 2" this term and next term. */
const VERSION_SPAN_DAYS = 45;

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`));
  return Math.round(ms / 86_400_000);
}

/** How many colliding dates a collapsed finding names before it just counts. */
const REPEAT_SAMPLE_DATES = 3;

/** The real database row behind an event — a recurring occurrence answers with
 *  its series, which is what makes two meetings of one class the same thing. */
const rowIdOf = (event: CalendarEvent) => event.seriesId ?? event.id;

/**
 * Fold findings that name the same rows on different dates into one, keeping
 * the earliest and recording how often it repeats. See RepeatSummary.
 */
function collapseRepeats<T extends { date: string; repeats?: RepeatSummary }>(
  findings: readonly T[],
  identityOf: (finding: T) => string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const finding of findings) {
    const key = identityOf(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.values()].map((group) => {
    const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const first = ordered[0]!;
    if (ordered.length === 1) return first;
    return {
      ...first,
      repeats: {
        dates: ordered.slice(0, REPEAT_SAMPLE_DATES).map((finding) => finding.date),
        occurrences: ordered.length,
      },
    };
  });
}

/** Both row ids of a pair, order-independent, so A-vs-B and B-vs-A are one. */
const pairKey = (a: CalendarIssueEventRef, b: CalendarIssueEventRef) => [a.id, b.id].sort().join("|");

/** The widest window these rows can speak about: every stated date, plus the
 *  end of every repeating rule. Used when the caller names no window, so the
 *  answer covers the same ground the rows themselves do. */
function windowOf(events: readonly CalendarEvent[]): { from: string; to: string } | null {
  if (events.length === 0) return null;
  let from = events[0]!.date;
  let to = events[0]!.date;
  for (const event of events) {
    if (event.date < from) from = event.date;
    if (event.date > to) to = event.date;
    if (event.recurrence && event.recurrence.until > to) to = event.recurrence.until;
  }
  return { from, to };
}

/**
 * Classified findings over whatever rows the caller loaded. Pure. Feed it the
 * COMPLETE range being reconciled — findings over a partial load are partial.
 *
 * 🔴 REPEATING RULES ARE EXPANDED INTO THE DATES THEY ACTUALLY MEET first
 * (owner 2026-08-05, Phase 2 item 1). Until this, a rule was audited as its
 * single stored row, so a one-off event landing on top of one meeting of a
 * weekly class was invisible: the row said Monday 25 August, the lecture row
 * said Monday 25 August *and then every Monday after it*, and only the first
 * was ever compared. Everything a student would call a clash with class was
 * missed.
 *
 * The findings are then collapsed back per pair of ROWS, because the student
 * has one problem to fix, not one per week.
 */
export function findCalendarIssues(
  events: readonly CalendarEvent[],
  window?: { from: string; to: string },
): CalendarIssues {
  const range = window ?? windowOf(events);
  const occurrences = range
    ? expandRecurringEvents([...events], parseDateKey(range.from), parseDateKey(range.to))
        .filter((event) => event.date >= range.from && event.date <= range.to)
        // 🔴 A CANCELLED EVENT IS NOT A CLASH. It is still drawn on the calendar
        // — struck through, because "this was here and is off" is information a
        // student needs — but reporting it as a conflict, a duplicate, or an
        // exam with nothing booked before it would be reporting on a thing that
        // is not happening. Every finding below reads this list.
        .filter((event) => event.status !== "cancelled")
    : [];

  // Exact duplicates: same normalized title on the same date.
  const byDateTitle = new Map<string, CalendarEvent[]>();
  for (const event of occurrences) {
    const key = `${event.date} ${normalizeTitle(event.title)}`;
    byDateTitle.set(key, [...(byDateTitle.get(key) ?? []), event]);
  }
  const exact_duplicates = collapseRepeats(
    [...byDateTitle.values()]
      .filter((group) => group.length > 1)
      .map((group): ExactDuplicateGroup => ({
        date: group[0]!.date,
        events: group.map(issueRef),
        title: group[0]!.title,
      })),
    (group) => group.events.map((ref) => ref.id).sort().join("|"),
  ).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  // Probable duplicates and honest overlaps: pairwise within each date.
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of occurrences) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  const probableRaw: ProbableDuplicatePair[] = [];
  const overlapsRaw: OverlapPair[] = [];
  for (const sameDay of byDate.values()) {
    for (let i = 0; i < sameDay.length; i += 1) {
      for (let j = i + 1; j < sameDay.length; j += 1) {
        const a = sameDay[i]!;
        const b = sameDay[j]!;
        // Two meetings of ONE repeating rule are not two events.
        if (rowIdOf(a) === rowIdOf(b)) continue;
        // Same-title pairs are already in exact_duplicates.
        if (normalizeTitle(a.title) === normalizeTitle(b.title)) continue;
        const reason = similarTitleReason(a.title, b.title);
        if (reason) {
          probableRaw.push({ date: a.date, first: issueRef(a), reason, second: issueRef(b) });
          continue; // A likely-same event is not ALSO an "unrelated overlap".
        }
        if (eventsOverlap(a, b)) overlapsRaw.push({ date: a.date, first: issueRef(a), second: issueRef(b) });
      }
    }
  }
  const probable_duplicates = collapseRepeats(probableRaw, (pair) => pairKey(pair.first, pair.second))
    .sort((a, b) => a.date.localeCompare(b.date));
  const overlaps = collapseRepeats(overlapsRaw, (pair) => pairKey(pair.first, pair.second))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Conflicting versions: one named exam/assignment on more than one date.
  // Course is part of the identity when both rows carry one — "Exam 2" in two
  // different courses is two real exams, not a disagreement.
  const byIdentity = new Map<string, CalendarEvent[]>();
  for (const event of occurrences) {
    if (!VERSIONED_KINDS.has(event.kind)) continue;
    const key = `${normalizeTitle(event.title)} ${event.kind} ${(event.course ?? "").trim().toLowerCase()}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), event]);
  }
  const conflicting_versions: ConflictingVersionsGroup[] = [...byIdentity.values()]
    .flatMap((group) => {
      // 🔴 DISTINCT ROWS, not distinct dates. Sources disagreeing means two
      // rows claiming different dates for one exam. A single repeating rule
      // also lands on many dates and is not a disagreement with anything —
      // reporting it as one would send the student hunting for a second exam
      // that does not exist.
      const rows = [...new Set(group.map(rowIdOf))];
      const dates = [...new Set(group.map((event) => event.date))].sort();
      if (rows.length < 2 || dates.length < 2) return [];
      if (daysBetween(dates[0]!, dates[dates.length - 1]!) > VERSION_SPAN_DAYS) return [];
      const seen = new Set<string>();
      return [{
        events: group
          .filter((event) => !seen.has(rowIdOf(event)) && seen.add(rowIdOf(event)))
          .map(issueRef)
          .sort((a, b) => a.date.localeCompare(b.date)),
        kind: group[0]!.kind,
        title: group[0]!.title,
      }];
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return { conflicting_versions, exact_duplicates, overlaps, probable_duplicates };
}

// ── The same event, in two calendars, disagreeing ──────────────────────────
// Owner 2026-09-02, verbatim: "be able to resolve discrepancies with
// scheduling."
//
// 🔴 A FIFTH KIND OF FINDING, NOT A FIFTH COPY OF THE OVERLAP CODE. Everything
// above audits ONE calendar against itself: two rows that are secretly the same
// thing, or two things booked on top of each other. This audits one calendar
// against ANOTHER — the student moved their exam in Google, or Nemesis moved it
// here, and now the two disagree about when it is. That is a question the
// findings above cannot ask, because until `externalId` existed there was no way
// to know that two rows in two systems were the same event at all.
//
// 🔴 IT SHARES THIS FILE'S VOCABULARY ON PURPOSE. `CalendarIssueEventRef`,
// `normalizeTitle`, `minutesOf` and the row-id rule are all reused rather than
// re-implemented, so a change to what "the same time" means lands on both.
//
// 🔴🔴 AND IT NEVER RESOLVES ANYTHING BY ITSELF. `suggested` says who moved most
// recently and that is ALL it is: a recommendation for a student to accept. The
// whole file's standing rule is that a clash is real life and the call is the
// student's, and silently overwriting the date of somebody's exam because a
// timestamp sorted later is the worst possible place to break it.

/** What two copies of one event can disagree about. */
export type DisagreementField = "date" | "time" | "endTime" | "title" | "location";

export interface FieldDisagreement {
  field: DisagreementField;
  /** What the Nemesis row says. Empty string means it says nothing. */
  nemesis: string;
  /** What the outside calendar says. */
  provider: string;
}

export interface ProviderDisagreement {
  /** The Nemesis row, by its real `calendar_events` id. */
  local: CalendarIssueEventRef;
  /** The provider's copy, as it would look on this calendar. */
  provider: CalendarIssueEventRef;
  /** Which outside calendar, and which event in it. */
  providerName: string;
  externalId: string;
  fields: FieldDisagreement[];
  /**
   * Who changed it most recently, when both sides can say.
   *
   * 🔴 "unknown" IS A REAL ANSWER AND THE COMMON ONE. It needs BOTH a provider
   * timestamp and the moment Nemesis last reconciled; a row that has never been
   * synced has no second half, so there is nothing to compare and the honest
   * answer is that we cannot tell. Guessing "the provider" here would quietly
   * make Google win every argument by default.
   */
  suggested: "nemesis" | "provider" | "unknown";
}

/** The same clock, however each side wrote it down. "9:00" and "09:00:00" are
 *  one time, and a disagreement reported between them is noise. */
function sameClock(a: string | undefined, b: string | undefined): boolean {
  const left = minutesOf(a);
  const right = minutesOf(b);
  if (left === null && right === null) return (a ?? "") === (b ?? "");
  return left === right;
}

/** Free text, compared the way a person would read it. */
const sameText = (a: string | undefined, b: string | undefined) =>
  (a ?? "").trim().toLowerCase().replace(/\s+/g, " ") === (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** An event carrying enough of a link to be matched against an outside copy. */
interface LinkedRow extends CalendarEvent {
  externalId?: string;
  externalProvider?: string;
  externalCalendar?: string;
  externalUpdated?: string;
  externalSyncedAt?: string;
  updatedAt?: string;
}

/** The one string that says "this row and that event are the same event". */
const linkKeyOf = (row: LinkedRow) =>
  row.externalProvider && row.externalId
    ? `${row.externalProvider}|${row.externalCalendar ?? "primary"}|${row.externalId}`
    : "";

/**
 * Where a Nemesis row and its copy in an outside calendar disagree.
 *
 * Both lists are whole events, not occurrences: a repeating series is one row
 * on each side, and comparing every meeting of it would report one problem
 * fifty times — the same flood `collapseRepeats` exists to prevent above.
 *
 * 🔴 ROWS WITH NO LINK ARE NOT A DISAGREEMENT. An event that lives only in
 * Nemesis and one that lives only in Google are not two versions of anything;
 * they are two events. Reporting them here would turn every unsynced calendar
 * into a wall of false conflicts on the first run.
 */
export function findProviderDisagreements(
  local: readonly LinkedRow[],
  provider: readonly LinkedRow[],
): ProviderDisagreement[] {
  const byLink = new Map<string, LinkedRow>();
  for (const row of local) {
    const key = linkKeyOf(row);
    if (key) byLink.set(key, row);
  }

  const out: ProviderDisagreement[] = [];
  for (const remote of provider) {
    const key = linkKeyOf(remote);
    if (!key) continue;
    const mine = byLink.get(key);
    if (!mine) continue;

    const fields: FieldDisagreement[] = [];
    if (mine.date !== remote.date) fields.push({ field: "date", nemesis: mine.date, provider: remote.date });
    if (!sameClock(mine.time, remote.time)) {
      fields.push({ field: "time", nemesis: mine.time ?? "", provider: remote.time ?? "" });
    }
    if (!sameClock(mine.endTime, remote.endTime)) {
      fields.push({ field: "endTime", nemesis: mine.endTime ?? "", provider: remote.endTime ?? "" });
    }
    if (!sameText(mine.title, remote.title)) {
      fields.push({ field: "title", nemesis: mine.title, provider: remote.title });
    }
    if (!sameText(mine.location, remote.location)) {
      fields.push({ field: "location", nemesis: mine.location ?? "", provider: remote.location ?? "" });
    }
    if (fields.length === 0) continue;

    out.push({
      externalId: remote.externalId!,
      fields,
      local: issueRef(mine),
      provider: issueRef(remote),
      providerName: remote.externalProvider ?? "google",
      suggested: whoMovedLast(mine, remote),
    });
  }
  return out.sort((a, b) => a.local.date.localeCompare(b.local.date) || a.local.title.localeCompare(b.local.title));
}

/**
 * Which side changed since the two were last agreed.
 *
 * 🔴 IT COMPARES EACH SIDE TO THE LAST SYNC, NOT TO EACH OTHER. Comparing the
 * two timestamps directly answers "which was touched more recently", which is a
 * different question and gets it wrong the moment a student edits in Nemesis and
 * Google's copy happens to carry a later `updated` from some unrelated change.
 * The question that matters is which side has moved SINCE they last agreed, and
 * if both have, nobody wins automatically and the student decides.
 */
function whoMovedLast(mine: LinkedRow, remote: LinkedRow): ProviderDisagreement["suggested"] {
  const agreedAt = mine.externalSyncedAt;
  if (!agreedAt) return "unknown";
  const providerMoved = !!remote.externalUpdated && remote.externalUpdated > agreedAt;
  const nemesisMoved = !!mine.updatedAt && mine.updatedAt > agreedAt;
  if (providerMoved && !nemesisMoved) return "provider";
  if (nemesisMoved && !providerMoved) return "nemesis";
  return "unknown";
}

/** One plain-English line about what disagrees. Empty when nothing does. */
export function disagreementSummary(found: readonly ProviderDisagreement[]): string {
  if (found.length === 0) return "";
  const first = found[0]!;
  const what = first.fields.map((entry) => entry.field === "endTime" ? "end time" : entry.field).join(" and ");
  const rest = found.length - 1;
  const also = rest > 0 ? `, and ${rest} other${rest === 1 ? "" : "s"}` : "";
  return `${first.local.title} has a different ${what} in Google than it does here${also}.`;
}
