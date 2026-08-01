// The date census: find EVERY date in a syllabus in real code, before a model
// is involved at all.
//
// WHY THIS EXISTS. The first version of the import asked a model to find the
// dated items and, for each, hand back the verbatim sentence it read the date
// out of. That quote was the safety rail: it stopped the model inventing dates.
// It also, measured against the owner's real 30-page syllabus, threw most of
// the schedule away.
//
// The reason is the shape of a schedule TABLE. When a PDF is flattened to text
// a table row does not stay on one line — the date cell, the time cell and the
// topic cell come out as separate runs, and in this syllabus roughly two
// hundred characters of competency codes sit between the date and the thing
// happening on it:
//
//     Week 5
//     Tuesday,
//     September
//     8th
//     Pre-Class
//     Assignment • Pre-class quiz
//     1.1.8, 1.1.9, … 3.4.5           <- ~25 lines of codes
//     1-2:50 CT
//     Outpatient Diabetes Management Activity
//
// The old prompt asked for a quote "long enough to be unique". A date on its
// own is not unique — twenty rows start with a Tuesday — so the only unique
// quote spans from the date into the topic, and that span DOES NOT EXIST
// contiguously in the text. Every such quote failed the check and every one of
// those rows was silently dropped. Measured: all four cross-cell quotes fail,
// all seven single-cell quotes pass.
//
// So the job is split by what each side is actually good at:
//
//   code  — finds every date, and decides what date it is. Deterministic,
//           complete, and it cannot invent one.
//   model — says what happens on that date. It never supplies a date, so it
//           cannot get one wrong, and a bad label costs a poor title rather
//           than a missing event.
//
// That inversion is the whole point: a labelling failure now degrades to a
// badly-named event instead of a lost deadline.
//
// FIELD-AGNOSTIC BY CONSTRUCTION. Nothing here looks at subject matter. It
// reads month names, digits and weekday names — which a law syllabus and a
// mechanical-engineering syllabus share exactly. There is no keyword list to
// go stale.
//
// PURE. No network, no clock of its own, no database.

/** Longest spelling first inside each month so "sept" never matches as "sep". */
const MONTH_PATTERN =
  "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|" +
  "september|sept|sep|october|oct|november|nov|december|dec";

/** Index of each spelling, 0 = January. Built once from the same source as the
 *  pattern so the two can never drift apart. */
const MONTH_INDEX: Record<string, number> = {
  apr: 3, april: 3, aug: 7, august: 7, dec: 11, december: 11, feb: 1, february: 1,
  jan: 0, january: 0, jul: 6, july: 6, jun: 5, june: 5, mar: 2, march: 2, may: 4,
  nov: 10, november: 10, oct: 9, october: 9, sep: 8, sept: 8, september: 8,
};

const WEEKDAY_PATTERN =
  "sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat";

const WEEKDAY_INDEX: Record<string, number> = {
  fri: 5, friday: 5, mon: 1, monday: 1, sat: 6, saturday: 6, sun: 0, sunday: 0,
  thu: 4, thur: 4, thurs: 4, thursday: 4, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
};

/**
 * At most three whitespace characters between the parts of one date.
 *
 * Not `\s+`. A flattened table puts "August" and "11th" on separate lines — one
 * newline — so some slack is required; unlimited slack would let a month at the
 * bottom of one column pair with a number from an unrelated row far below.
 */
const GAP = String.raw`[ \t]{0,3}\n?[ \t]{0,3}`;

/** "Tuesday, September 8th", "Feb. 29, 2025", "August\n11th", "September 7st"
 *  (the ordinal is read and discarded, so a source typo costs nothing). */
const NAMED_DATE = new RegExp(
  String.raw`\b(?:(${WEEKDAY_PATTERN})(?![a-z])\.?${GAP},?${GAP})?` +
    String.raw`(${MONTH_PATTERN})(?![a-z])\.?${GAP},?${GAP}` +
    String.raw`(\d{1,2})(?:st|nd|rd|th)?` +
    String.raw`(?:${GAP},?${GAP}(\d{4}))?`,
  "gi",
);

/** "9/8", "09/08/26", "9/8/2026". */
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;

/** One date as the document wrote it, before a year is settled on. */
export interface DateMention {
  /** Character offset of the match in the source text. Identity for the whole
   *  pipeline: the model refers to a mention by its position in this list, and
   *  the date itself never makes the round trip through the model. */
  index: number;
  /** Exactly as written, newlines and all. */
  raw: string;
  /** 1-12. */
  month: number;
  /** 1-31, already checked against the month's real length. */
  day: number;
  /** Only when the document states it. */
  year?: number;
  /** Only when the document names one, 0 = Sunday. The strongest year check
   *  available: see resolveYear. */
  statedWeekday?: number;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Two-digit years are this century. A syllabus is never from 1998. */
function fullYear(raw: string): number {
  const value = Number(raw);
  return raw.length === 2 ? 2000 + value : value;
}

/**
 * Every date the document mentions, in order, deduplicated by position.
 *
 * Finding too many is safe and finding too few is not, so this is deliberately
 * generous: the labelling step is allowed to reject an entry ("not a scheduled
 * item"), which is how a date in a policy paragraph — the owner's syllabus
 * quotes a Board of Trustees statement dated Feb. 29, 2025 — gets discarded by
 * something that can read it in context. PURE.
 */
export function findDateMentions(text: string): DateMention[] {
  const found: DateMention[] = [];

  for (const match of text.matchAll(NAMED_DATE)) {
    if (match.index === undefined) continue;
    const month = MONTH_INDEX[match[2]!.toLowerCase()];
    const day = Number(match[3]);
    if (month === undefined || day < 1 || day > DAYS_IN_MONTH[month]!) continue;
    const mention: DateMention = { day, index: match.index, month: month + 1, raw: match[0] };
    if (match[1]) mention.statedWeekday = WEEKDAY_INDEX[match[1].toLowerCase()];
    if (match[4]) mention.year = fullYear(match[4]);
    found.push(mention);
  }

  // 🔴 A BARE "5/10" IS USUALLY NOT A DATE.
  //
  // Measured on the owner's syllabus: the numeric scan pulled fourteen false
  // dates out of the SPECS grading table — "Pass ≤5/10 in-class quizzes",
  // "Completion of 2/7 pre-class assignments", "3/6 in-class assignments".
  // Every one is a fraction whose two halves happen to be a valid month and a
  // valid day. Fourteen of forty-four entries were junk.
  //
  // The rule below is the document deciding for itself, with no keyword list:
  // if a syllabus writes its dates by NAME, then names are its date style and a
  // bare slash pair is something else. When a document has no named dates at
  // all, the slash pairs are the schedule and are taken.
  //
  // A slash pair carrying a YEAR is unambiguous and always taken. That matters
  // beyond fractions: "5/10" cannot be told from "10/5" without knowing whether
  // the writer puts the month or the day first, and a syllabus does not say.
  const namesItsDates = found.length > 0;
  for (const match of text.matchAll(NUMERIC_DATE)) {
    if (match.index === undefined) continue;
    if (!match[3] && namesItsDates) continue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]!) continue;
    const mention: DateMention = { day, index: match.index, month, raw: match[0] };
    if (match[3]) mention.year = fullYear(match[3]);
    found.push(mention);
  }

  found.sort((a, b) => a.index - b.index);

  // A numeric scan can land inside a span the named scan already claimed
  // ("10/15" inside "October 10/15"). Keep the first, drop anything starting
  // before the previous match ends.
  const merged: DateMention[] = [];
  let reach = -1;
  for (const mention of found) {
    if (mention.index < reach) continue;
    merged.push(mention);
    reach = mention.index + mention.raw.length;
  }
  return merged;
}

// ── Deciding the year ────────────────────────────────────────────────────────

/**
 * How far either side of today a bare "Oct 14" is allowed to land.
 *
 * Kept to one year on purpose. A wider window makes a MIS-STATED weekday
 * authoritative: with four candidate years there are four distinct weekdays to
 * hit, so a syllabus that typed "Friday" for a Tuesday would find a year that
 * agrees and confidently file the event two years out. With three, a wrong
 * weekday usually matches nothing and falls through to "nearest", which is the
 * right kind of wrong. A syllabus in hand is for a term that is close.
 */
const NEAR_YEARS = [-1, 0, 1] as const;

/** Only when the near window contains no real date at all — which in practice
 *  means a bare "February 29", whose year is genuinely elsewhere. Widening here
 *  costs nothing, because it cannot be reached while any near year works. */
const WIDE_YEARS = [-4, -3, -2, 2, 3, 4] as const;

export interface ResolvedDate {
  mention: DateMention;
  /** ISO yyyy-mm-dd, local, no timezone — the calendar's own format. */
  date: string;
  /** How the year was settled, so the review screen can be honest about it. */
  basis: "stated" | "weekday" | "nearest";
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Real calendar date only — February 30 is not one, and `new Date` would
 *  quietly roll it into March. */
function exists(year: number, month: number, day: number): boolean {
  const built = new Date(year, month - 1, day);
  return built.getFullYear() === year && built.getMonth() === month - 1 && built.getDate() === day;
}

/**
 * Settle the year for one mention.
 *
 * A syllabus writes "Tuesday, August 11th" and expects you to know which year.
 * The old code let the model guess and then checked the guess was within
 * eighteen months, which is a weak test — it accepts a guess a whole year out,
 * and it does not even reject the Board of Trustees date in the owner's file.
 *
 * The document usually states the answer without meaning to: it names the
 * WEEKDAY. For a fixed month and day the weekday advances one year to the next
 * (two across a leap day), so across any four consecutive years no two share
 * one — the stated weekday picks the year outright. Measured on the owner's
 * syllabus: 2026 agrees on 20 of 20 dates, 2025 on none, 2027 on none.
 *
 * Order: what the document states, then the weekday, then nearest to today.
 * PURE — `today` is passed in.
 */
export function resolveYear(mention: DateMention, today: Date): ResolvedDate | null {
  if (mention.year !== undefined) {
    if (!exists(mention.year, mention.month, mention.day)) return null;
    return { basis: "stated", date: iso(mention.year, mention.month, mention.day), mention };
  }

  const near = (offsets: readonly number[]): number[] =>
    offsets.map((offset) => today.getFullYear() + offset).filter((year) => exists(year, mention.month, mention.day));

  const candidates = near(NEAR_YEARS).length > 0 ? near(NEAR_YEARS) : near(WIDE_YEARS);
  if (candidates.length === 0) return null;

  if (mention.statedWeekday !== undefined) {
    const agreeing = candidates.filter(
      (year) => new Date(year, mention.month - 1, mention.day).getDay() === mention.statedWeekday,
    );
    // Exactly one is the normal case and the point of the check. More than one
    // cannot happen inside this window, but if the window is ever widened,
    // ambiguity must fall through rather than pick arbitrarily.
    if (agreeing.length === 1) {
      return { basis: "weekday", date: iso(agreeing[0]!, mention.month, mention.day), mention };
    }
  }

  const nearest = candidates.reduce((best, year) => {
    const distance = Math.abs(new Date(year, mention.month - 1, mention.day).getTime() - today.getTime());
    const bestDistance = Math.abs(new Date(best, mention.month - 1, mention.day).getTime() - today.getTime());
    return distance < bestDistance ? year : best;
  }, candidates[0]!);
  return { basis: "nearest", date: iso(nearest, mention.month, mention.day), mention };
}

/** Every mention that resolves to a real date, in document order. */
export function resolveMentions(mentions: DateMention[], today: Date): ResolvedDate[] {
  return mentions.flatMap((mention) => {
    const resolved = resolveYear(mention, today);
    return resolved ? [resolved] : [];
  });
}

// ── What the model is shown ──────────────────────────────────────────────────

/** Characters either side of a date to show the model. Wide enough to cross the
 *  wall of competency codes between a date cell and its topic cell in a
 *  flattened table — the gap that broke the old approach — and narrow enough
 *  that thirty of them still fit comfortably in one request. */
export const CONTEXT_RADIUS = 400;

export interface CensusEntry {
  /** Position in the list handed to the model. The model answers with this. */
  ordinal: number;
  resolved: ResolvedDate;
  /** The slice of the syllabus around the date. The ONLY text the model is
   *  shown for this entry, and therefore the only text a title may come from. */
  context: string;
}

/** Pair each resolved date with the text around it. PURE. */
export function censusEntries(text: string, resolved: ResolvedDate[], radius = CONTEXT_RADIUS): CensusEntry[] {
  return resolved.map((item, position) => {
    const from = Math.max(0, item.mention.index - radius);
    const to = Math.min(text.length, item.mention.index + item.mention.raw.length + radius);
    return {
      context: text.slice(from, to).replace(/\s+/g, " ").trim(),
      ordinal: position + 1,
      resolved: item,
    };
  });
}

// ── Asking the model for names, and nothing else ─────────────────────────────

export const CENSUS_SYSTEM_PROMPT =
  "You name calendar entries. You are given dates that have ALREADY been found and confirmed in a course " +
  "syllabus, each with the text around it. Your only job is to say what happens on each one. " +
  "Return strict JSON only — no markdown fences, no prose outside the JSON. Never use emojis. " +
  "Never return a date: the dates are settled and yours would be ignored. " +
  "Name the entry using the syllabus's own words wherever it gives them.";

/** How much of the document's opening to show alongside the dates. The course
 *  name, the term, and the standing weekly class time live at the top of a
 *  syllabus and often nowhere near any dated row — so a prompt built only from
 *  date contexts would never see them. */
export const HEADER_CHARS = 3_000;

/**
 * The numbered list the model answers against.
 *
 * Every entry carries its ordinal, the settled date, and the surrounding text.
 * The model replies with the same ordinals, so nothing that matters — no date,
 * no position — has to survive a round trip through it.
 */
export function buildCensusPrompt(entries: CensusEntry[], header = ""): string {
  const list = entries
    .map((entry) => `${entry.ordinal}. [${entry.resolved.date}] …${entry.context}…`)
    .join("\n\n");
  const opening = header.trim() ? `How the syllabus opens:\n${header.trim()}\n\n` : "";
  return (
    opening +
    `${entries.length} dates were found in this syllabus. For each one, say what happens on it.\n\n` +
    'Return JSON shaped: {"course":"…","term":"…",' +
    '"labels":[{"n":1,"title":"…","kind":"assignment|exam|class|rotation|other"}],' +
    '"meetings":[{"title":"…","daysOfWeek":[1,3,5],"startTime":"HH:MM","endTime":"HH:MM",' +
    '"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","location":"…","sourceQuote":"…"}]}\n\n' +
    "Rules for `labels`:\n" +
    "- One entry per number. Do not skip numbers and do not invent numbers.\n" +
    '- `title` is what a student would want to see in their calendar — "Exam 3", "COPD Case", ' +
    '"Immunization record due". Take the syllabus\'s own wording; do not embellish it.\n' +
    '- Set {"n":N,"skip":true} instead when the date is not a scheduled item — a date inside a policy ' +
    "statement, a citation, a form revision date, an office-hours example. Skipping is correct and expected.\n" +
    "- Days with no class (a holiday, a reading week, a break) ARE scheduled items. Name them and use " +
    '`kind` "other" — a student needs to see them.\n\n' +
    "Rules for `meetings`: put the recurring class time here — the pattern that repeats every week, not the " +
    "one-off rows above. daysOfWeek are numbers where 0 is Sunday. sourceQuote must be copied exactly from " +
    "the text, at least eight characters. Return an empty array if the syllabus states no repeating time.\n\n" +
    "`course` is the course's name or code as the syllabus writes it; `term` is the term. Omit either if the " +
    "text below does not say.\n\n" +
    `Dates:\n${list}`
  );
}

/** One row of the model's reply, before any checking. */
export interface CensusLabel {
  n: number;
  title?: string;
  kind?: string;
  skip?: boolean;
}

export interface LabelledDate {
  entry: CensusEntry;
  title: string;
  kind: string;
}

export interface CensusOutcome {
  labelled: LabelledDate[];
  /** Dates the model judged not to be scheduled items. Expected, not a failure. */
  skipped: CensusEntry[];
  /** Dates the model did not answer for. THE NUMBER THAT MATTERS: this is the
   *  old silent failure made countable. Reported to the student, never dropped
   *  quietly. */
  unlabelled: CensusEntry[];
}

/**
 * Match the model's answers back to the dates they belong to.
 *
 * Anything the model did not answer for is kept and counted rather than
 * forgotten — the failure this whole module exists to fix was invisible
 * precisely because missing rows left no trace. PURE.
 */
export function applyLabels(entries: CensusEntry[], labels: unknown): CensusOutcome {
  const byOrdinal = new Map(entries.map((entry) => [entry.ordinal, entry]));
  const labelled: LabelledDate[] = [];
  const skipped: CensusEntry[] = [];
  const answered = new Set<number>();

  for (const row of Array.isArray(labels) ? labels : []) {
    if (!row || typeof row !== "object") continue;
    const label = row as CensusLabel;
    const ordinal = typeof label.n === "number" ? label.n : Number.NaN;
    const entry = byOrdinal.get(ordinal);
    // An ordinal outside the list is the model losing its place; there is no
    // date to attach it to, so there is nothing to salvage.
    if (!entry || answered.has(ordinal)) continue;
    answered.add(ordinal);

    if (label.skip === true) {
      skipped.push(entry);
      continue;
    }
    const title = typeof label.title === "string" ? label.title.trim().replace(/\s+/g, " ") : "";
    if (!title) {
      skipped.push(entry);
      continue;
    }
    labelled.push({ entry, kind: typeof label.kind === "string" ? label.kind : "other", title });
  }

  return {
    labelled,
    skipped,
    unlabelled: entries.filter((entry) => !answered.has(entry.ordinal)),
  };
}
