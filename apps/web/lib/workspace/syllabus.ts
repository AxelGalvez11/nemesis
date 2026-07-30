// Syllabus → calendar: the extraction contract and, more importantly, the
// VERIFICATION that stands between a language model and the student's calendar.
//
// The owner's standing rule is that figures are computed in real code, never
// guessed by the model. Dates are exactly the kind of thing a model invents
// fluently — it will happily produce "Midterm — October 14" for a syllabus
// that never mentions a midterm, and the result looks identical to a correct
// row. So the model's job here is deliberately narrow: find candidate items
// and, for each one, hand back the VERBATIM sentence it read the date out of.
// Everything after that is arithmetic done here:
//
//   1. the quote must actually occur in the extracted syllabus text
//   2. the date must be a real calendar date (2026-02-30 is not)
//   3. the date must fall inside a plausible academic window
//   4. the kind must be one of the five the database CHECK constraint allows
//
// Anything failing a check is DROPPED and reported with a reason, so the
// review screen can tell the student "4 items couldn't be verified" instead of
// silently importing them. Nothing here writes: this module is pure so the
// rules can be tested without a database, a network, or a model.
//
// Recurrence is a known gap, handled honestly rather than faked — see
// meetingToAnchorEvent below.

import type { CalendarEvent, CalendarEventKind } from "@/lib/workspace/calendar-model";

/** Ceiling on what one import may create. A syllabus with more rows than this
 *  is far more likely to be a parsing failure than a real course, and an
 *  unbounded insert is not something to hand a model. */
export const MAX_IMPORT_EVENTS = 120;

/** How far outside the stated term a date may fall before it is treated as a
 *  hallucination. Syllabi routinely omit the year ("Oct 14"), so the model has
 *  to infer one; this is the check on that inference. */
export const TERM_WINDOW_MONTHS = 18;

const VALID_KINDS: readonly CalendarEventKind[] = ["assignment", "exam", "rotation", "class", "other"];

/** Minimum quote length worth checking. A two-character "quote" would match
 *  almost any document and verify nothing. */
const MIN_QUOTE_CHARS = 8;

// ── The shape the model is asked for ─────────────────────────────────────────

/** A single dated item: one deadline, exam, or one-off session. */
export interface SyllabusDatedItem {
  title: string;
  /** ISO yyyy-mm-dd, local date, no timezone. */
  date: string;
  /** 24-hour HH:MM, optional — many syllabus deadlines are date-only. */
  time?: string;
  kind: CalendarEventKind;
  /** Verbatim from the syllabus. The whole verification hinges on this. */
  sourceQuote: string;
}

/** A repeating meeting pattern ("Lecture MWF 9:00–9:50, Aug 25 – Dec 12").
 *  Captured at full fidelity even though the current calendar table cannot
 *  store recurrence — see the mapping note below. */
export interface SyllabusMeeting {
  title: string;
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  startTime?: string;
  endTime?: string;
  /** First and last date the pattern runs, ISO yyyy-mm-dd. */
  startDate?: string;
  endDate?: string;
  location?: string;
  sourceQuote: string;
}

export interface SyllabusExtraction {
  course?: string;
  term?: string;
  dated: SyllabusDatedItem[];
  meetings: SyllabusMeeting[];
}

/** Why one candidate did not survive. Shown to the student, so the wording is
 *  plain rather than technical. */
export interface DroppedItem {
  title: string;
  reason: string;
}

export interface VerifiedSyllabus {
  course: string | null;
  term: string | null;
  /** Ready to write, in date order. */
  events: CalendarEvent[];
  /** Recurring patterns, kept separate because they are lossy — see below. */
  meetings: SyllabusMeeting[];
  dropped: DroppedItem[];
  /** Set when there is genuinely nothing to import, so the caller says that
   *  rather than rendering an empty confirmation screen. */
  note?: string;
}

// ── Choosing what the model reads ────────────────────────────────────────────

/** Anything that looks like a course-calendar date: "1/6", "01/06/26", "Jan 6",
 *  "January 6". Used only to LOCATE the schedule, never to parse it — the dates
 *  themselves are the model's job, checked afterwards against the source. */
const DATE_LIKE =
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi;

/**
 * The part of a long document worth showing the model.
 *
 * Taking the opening N characters assumes the schedule comes first. Measured
 * against a real 13-page syllabus, every one of its 87 dated sessions sat in the
 * last quarter — an appendix after the grading and attendance policy — so the
 * opening slice contained no dates at all and the import came back empty.
 *
 * When a document fits, it is returned whole. When it does not, the window that
 * holds the most dates wins, snapped to a line boundary so a table row is never cut
 * in half (a severed row would take its quote with it and be dropped in
 * verification). PURE.
 */
export function scheduleWindow(text: string, limit: number): string {
  if (text.length <= limit) return text;

  const positions: number[] = [];
  for (const match of text.matchAll(DATE_LIKE)) {
    if (match.index !== undefined) positions.push(match.index);
  }
  if (positions.length === 0) return text.slice(0, limit);

  // Slide a window of `limit` characters over the date positions and keep the
  // start that covers the most of them. Candidates are the dates themselves, so
  // this costs one pass rather than one per character.
  let bestStart = 0;
  let bestCount = 0;
  let end = 0;
  for (let start = 0; start < positions.length; start += 1) {
    const from = positions[start]!;
    while (end < positions.length && positions[end]! < from + limit) end += 1;
    const count = end - start;
    if (count > bestCount) {
      bestCount = count;
      bestStart = from;
    }
  }

  // Back up to the start of the line, and take some of what came before: a
  // schedule table's heading row names the columns the rows depend on. When there is
  // no line break to back up to — a PDF that extracted as one long run — the offset
  // stands on its own, because falling back to the start of the document would throw
  // away the very schedule this just located.
  const lead = Math.min(bestStart, Math.floor(limit * 0.1));
  const wanted = Math.max(0, bestStart - lead);
  const breakAt = text.lastIndexOf("\n", wanted);
  const from = breakAt >= 0 ? breakAt + 1 : wanted;
  const slice = text.slice(from, from + limit);
  const lastBreak = slice.lastIndexOf("\n");
  return lastBreak > limit * 0.5 ? slice.slice(0, lastBreak) : slice;
}

// ── Verification helpers ─────────────────────────────────────────────────────

/** Collapse whitespace and case so a quote still matches when the PDF
 *  extractor broke a line mid-sentence or double-spaced a table cell. This is
 *  the ONLY latitude given: the words themselves must be the syllabus's own. */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when `quote` really occurs in `source`. Deliberately strict about
 *  content and lenient only about spacing. */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const needle = normalizeForMatch(quote);
  if (needle.length < MIN_QUOTE_CHARS) return false;
  return normalizeForMatch(source).includes(needle);
}

/** Strict ISO date validity — rejects both malformed strings and dates that
 *  do not exist. `new Date("2026-02-30")` rolls over to March 2 rather than
 *  failing, so the round-trip comparison is the actual check. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const built = new Date(year, month - 1, day);
  return built.getFullYear() === year && built.getMonth() === month - 1 && built.getDate() === day;
}

/** Normalize a time to HH:MM, or drop it. The calendar's `time` column is free
 *  text, but the edit dialog renders it into `<input type="time">`, which shows
 *  blank for anything that is not HH:MM — so a "9am" that survived here would
 *  look like data loss the first time the student opened the event. */
export function normalizeTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.trim().toLowerCase();

  const iso = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (iso) {
    const hour = Number(iso[1]);
    const minute = Number(iso[2]);
    if (hour > 23 || minute > 59) return undefined;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const meridiem = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return undefined;
    if (meridiem[3] === "pm" && hour !== 12) hour += 12;
    if (meridiem[3] === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return undefined;
}

/** Map to a kind the database will accept. The `kind` column has a five-value
 *  CHECK constraint; a sixth value fails the insert for the WHOLE batch, so an
 *  unrecognised kind becomes 'other' rather than being passed through. */
export function toValidKind(raw: unknown): CalendarEventKind {
  if (typeof raw !== "string") return "other";
  const value = raw.trim().toLowerCase();
  if (VALID_KINDS.includes(value as CalendarEventKind)) return value as CalendarEventKind;
  // Vocabulary a syllabus actually uses, mapped to the nearest kind we store.
  if (/^(quiz|midterm|final|test|examination)$/.test(value)) return "exam";
  if (/^(homework|hw|paper|essay|project|lab report|problem set|pset|reading|due)$/.test(value)) return "assignment";
  if (/^(lecture|seminar|recitation|tutorial|discussion|lab)$/.test(value)) return "class";
  if (/^(clinical|placement|practicum|shift|rotation)$/.test(value)) return "rotation";
  return "other";
}

function monthsBetween(from: Date, to: Date): number {
  return Math.abs((to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

// ── Recurrence: the honest gap ───────────────────────────────────────────────

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Human-readable pattern, e.g. "Mon/Wed/Fri 09:00–09:50". */
export function describeMeeting(meeting: SyllabusMeeting): string {
  const days = meeting.daysOfWeek
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_SHORT[day])
    .join("/");
  // Normalize here too: the anchor event's `time` field is normalized, and a
  // note reading "9:00" beside a time field reading "09:00" looks like two
  // different times to the student.
  const start = normalizeTime(meeting.startTime);
  const end = normalizeTime(meeting.endTime);
  const span = start ? ` ${start}${end ? `–${end}` : ""}` : "";
  const range =
    meeting.startDate && meeting.endDate ? `, ${meeting.startDate} to ${meeting.endDate}` : "";
  return `${days || "Weekly"}${span}${range}`;
}

/** A recurring meeting becomes one compact series row. The production table
 * now has `end_time` and `recurrence`; the UI expands that rule for display,
 * so a semester schedule is editable as one class rather than 45 copies. */
export function meetingToAnchorEvent(meeting: SyllabusMeeting, id: string, course: string | null): CalendarEvent | null {
  if (!meeting.startDate || !isRealDate(meeting.startDate) || !meeting.endDate || !isRealDate(meeting.endDate)) return null;
  const pattern = describeMeeting(meeting);
  const event: CalendarEvent = {
    id,
    title: meeting.title.trim() || "Class",
    date: meeting.startDate,
    kind: "class",
    // Imported events belong to the student once they confirm them. Writing
    // them as 'agent' would route every one to the read-only view dialog,
    // which has no edit and no delete — a wrong date would be permanent.
    source: "manual",
    recurrence: { days: meeting.daysOfWeek, until: meeting.endDate },
    note: `Repeats: ${pattern}${meeting.location ? ` · ${meeting.location}` : ""}\nFrom your syllabus.`,
  };
  const time = normalizeTime(meeting.startTime);
  const endTime = normalizeTime(meeting.endTime);
  if (time) event.time = time;
  if (endTime) event.endTime = endTime;
  if (course) event.course = course;
  return event;
}

// ── The gate ─────────────────────────────────────────────────────────────────

export interface VerifyOptions {
  /** The text the syllabus was actually extracted from. Every quote is checked
   *  against this — without it nothing can be verified and nothing is kept. */
  sourceText: string;
  /** Today, injected so the plausibility window is testable. */
  today: Date;
  /** Supplies event ids; injected to keep this module pure. */
  newId: () => string;
}

/**
 * Turn a model's raw extraction into events that are safe to show the student.
 * Drops anything unverifiable and says why. Never throws on bad input — a
 * malformed model reply produces an empty result with a note, not an error.
 */
export function verifySyllabus(raw: SyllabusExtraction | null, options: VerifyOptions): VerifiedSyllabus {
  const { sourceText, today, newId } = options;
  const dropped: DroppedItem[] = [];
  const events: CalendarEvent[] = [];

  if (!raw || !sourceText.trim()) {
    return { course: null, term: null, events: [], meetings: [], dropped, note: "Nothing could be read from that file." };
  }

  const course = typeof raw.course === "string" && raw.course.trim() ? raw.course.trim() : null;
  const term = typeof raw.term === "string" && raw.term.trim() ? raw.term.trim() : null;
  const seen = new Set<string>();

  for (const item of Array.isArray(raw.dated) ? raw.dated : []) {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!title) {
      dropped.push({ title: "(untitled)", reason: "No title" });
      continue;
    }
    if (typeof item.date !== "string" || !isRealDate(item.date)) {
      dropped.push({ title, reason: "The date could not be read as a real date" });
      continue;
    }
    // The core check: the model must show its work, and the work must be real.
    if (typeof item.sourceQuote !== "string" || !quoteAppearsIn(item.sourceQuote, sourceText)) {
      dropped.push({ title, reason: "Not found in the syllabus text" });
      continue;
    }
    const [year, month, day] = item.date.split("-").map(Number);
    const when = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    if (monthsBetween(today, when) > TERM_WINDOW_MONTHS) {
      dropped.push({ title, reason: `The date (${item.date}) is too far from now to be this term` });
      continue;
    }
    // A syllabus repeats its due dates in a table AND in prose; without this
    // the same deadline lands twice. Deduping BEFORE the cap matters: a
    // syllabus that restates 30 deadlines would otherwise burn 30 slots on
    // copies and report real items at the end as "over the limit".
    const key = `${title.toLowerCase()}|${item.date}`;
    if (seen.has(key)) continue;
    if (events.length >= MAX_IMPORT_EVENTS) {
      dropped.push({ title, reason: `Over the ${MAX_IMPORT_EVENTS}-event import limit` });
      continue;
    }
    seen.add(key);

    const event: CalendarEvent = { id: newId(), title, date: item.date, kind: toValidKind(item.kind), source: "manual" };
    const time = normalizeTime(item.time);
    if (time) event.time = time;
    if (course) event.course = course;
    event.note = `From your syllabus: “${item.sourceQuote.trim().replace(/\s+/g, " ").slice(0, 300)}”`;
    events.push(event);
  }

  const meetings: SyllabusMeeting[] = [];
  for (const meeting of Array.isArray(raw.meetings) ? raw.meetings : []) {
    const title = typeof meeting?.title === "string" ? meeting.title.trim() : "";
    if (!title) continue;
    if (typeof meeting.sourceQuote !== "string" || !quoteAppearsIn(meeting.sourceQuote, sourceText)) {
      dropped.push({ title, reason: "Not found in the syllabus text" });
      continue;
    }
    const days = Array.isArray(meeting.daysOfWeek)
      ? meeting.daysOfWeek.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : [];
    if (days.length === 0) {
      dropped.push({ title, reason: "No weekdays given for the repeating schedule" });
      continue;
    }
    meetings.push({ ...meeting, title, daysOfWeek: days });
  }

  events.sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)));

  const result: VerifiedSyllabus = { course, term, events, meetings, dropped };
  if (events.length === 0 && meetings.length === 0) {
    result.note =
      dropped.length > 0
        ? "Nothing in that file could be matched back to a date in the text."
        : "No dates or class times were found in that file.";
  }
  return result;
}

// ── The extraction prompt ────────────────────────────────────────────────────

export const SYLLABUS_SYSTEM_PROMPT =
  "You read course syllabi and pull out dates. Return strict JSON only — no markdown fences, no prose outside the JSON. " +
  "Never use emojis. You are being checked: every item you return must carry a sourceQuote copied VERBATIM from the " +
  "syllabus text, and any item whose quote is not found in that text word-for-word is discarded. Never write a date " +
  "the syllabus does not state, and never reword a quote to make it fit.";

/** The user-side instruction. `todayIso` is passed in (rather than computed
 *  here) so callers stay pure and testable, and so the model has a real anchor
 *  for resolving a bare "Oct 14" to a year. */
export function buildSyllabusPrompt(text: string, todayIso: string): string {
  return (
    `Today is ${todayIso}. Read this course syllabus and return JSON shaped:\n` +
    '{"course":"…","term":"…",' +
    '"dated":[{"title":"…","date":"YYYY-MM-DD","time":"HH:MM","kind":"assignment|exam|class|rotation|other","sourceQuote":"…"}],' +
    '"meetings":[{"title":"…","daysOfWeek":[1,3,5],"startTime":"HH:MM","endTime":"HH:MM","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","location":"…","sourceQuote":"…"}]}\n\n' +
    "Put one-off things — assignment deadlines, exams, quizzes, presentations, single events — in `dated`. " +
    "Put repeating class meetings in `meetings`, with daysOfWeek as numbers where 0 is Sunday. " +
    "If the syllabus gives a date without a year, work the year out from the term and today's date. " +
    "Omit `time` when the syllabus gives no time — do not invent one. " +
    "sourceQuote must be a short span copied exactly from the text below, long enough to be unique (at least eight characters). " +
    "If the file is not a syllabus, or contains no dates, return empty arrays.\n\n" +
    `Syllabus text:\n${text}`
  );
}
