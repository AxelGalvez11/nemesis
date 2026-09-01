// Repeat rules, in the format every real calendar speaks (RFC 5545 RRULE).
//
// 🔴 WHY THIS REPLACES `{ days, until, except }`. That shape could say exactly one
// thing: "these weekdays, every week, until this date". A student's real timetable
// is full of rules it cannot express — a fortnightly seminar, a lab on the first
// Monday of each month, a class that meets twelve times and stops. Worse, it could
// not RECEIVE one: anything arriving from Google carries an RRULE, and a reader
// that only understands weekly-by-weekday has to either drop the rule or silently
// flatten "every other Tuesday" into "every Tuesday" — which puts a student in a
// lab that is not running.
//
// So the stored rule is now the standard string, and this module is the only place
// that reads or writes it. Pure and DOM-free, like time-grid.ts: the arithmetic is
// testable and nothing here touches storage.
//
// 🔴 THE SUBSET IS DELIBERATE, AND IT IS THE SUBSET GOOGLE'S OWN UI CAN PRODUCE.
// FREQ, INTERVAL, BYDAY (with ordinals), BYMONTHDAY, BYMONTH, COUNT, UNTIL, WKST.
// Not supported: BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR and friends — no calendar
// UI emits them, and a parser that pretends to understand a rule it cannot expand
// is worse than one that says it does not.

/** 0 = Sunday … 6 = Saturday, matching Date#getDay throughout this codebase. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ByDay {
  /** 1 = first, -1 = last. Only meaningful for MONTHLY/YEARLY. */
  ordinal?: number;
  day: Weekday;
}

export interface RecurrenceRule {
  freq: Frequency;
  /** Every n-th day/week/month/year. Always >= 1. */
  interval: number;
  byDay?: ByDay[];
  /** Negative counts back from the end of the month: -1 is the last day. */
  byMonthDay?: number[];
  /** 1 = January. */
  byMonth?: number[];
  /** Stop after this many occurrences, counted from the series start. */
  count?: number;
  /** Inclusive local yyyy-mm-dd. */
  until?: string;
  /** Which day a week starts on, for INTERVAL on weekly rules. RFC default is Monday. */
  weekStart: Weekday;
}

export interface RecurrenceSpec {
  rule: RecurrenceRule;
  /** EXDATE — dates the series does NOT meet. A cancelled lab, a reading week. */
  exceptDates: string[];
  /** RDATE — extra dates bolted onto the series that the rule would not produce. */
  extraDates: string[];
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far a rule with no end is expanded.
 *
 * 🔴 A RULE WITH NO `UNTIL` AND NO `COUNT` IS INFINITE, and a weekly class
 * genuinely is one — nobody writes an end date on "Physics, Tuesdays". Something
 * has to stop the loop, and it is better that it be a stated horizon than a
 * browser hanging. Eighteen months covers any academic year plus the next, which
 * is the longest window any surface in this app asks for.
 */
export const HARD_HORIZON_MONTHS = 18;

// ---------------------------------------------------------------------------
// parsing
// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local yyyy-mm-dd for a Date, never UTC — the whole calendar is local-day based. */
export function keyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** yyyy-mm-dd → a local Date at midnight. */
export function dateOf(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}

/** "20260612" or "20260612T140000Z" → local yyyy-mm-dd. */
function parseIcsDate(raw: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, zulu] = match;
  if (zulu && hh) {
    // A UTC instant can land on the previous or next local day, and UNTIL is
    // compared against local calendar days everywhere else in this app.
    const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return keyOf(new Date(utc.getTime()));
  }
  return `${y}-${m}-${d}`;
}

function parseByDay(value: string): ByDay[] {
  const out: ByDay[] = [];
  for (const part of value.split(",")) {
    const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(part.trim().toUpperCase());
    if (!match) continue;
    const day = DAY_CODES.indexOf(match[2] as (typeof DAY_CODES)[number]) as Weekday;
    const ordinal = match[1] ? Number(match[1]) : undefined;
    if (ordinal === 0) continue;
    out.push(ordinal === undefined ? { day } : { day, ordinal });
  }
  return out;
}

function parseNumbers(value: string, keep: (n: number) => boolean): number[] {
  return value
    .split(",")
    .map((piece) => Number(piece.trim()))
    .filter((n) => Number.isInteger(n) && keep(n));
}

/**
 * Parse the lines Google puts in an event's `recurrence` array.
 *
 * Returns null rather than a half-rule: a rule missing its FREQ cannot be
 * expanded, and guessing one would put a student somewhere they are not due.
 */
export function parseRecurrenceLines(lines: readonly string[]): RecurrenceSpec | null {
  let rule: RecurrenceRule | null = null;
  const exceptDates: string[] = [];
  const extraDates: string[] = [];

  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const line = raw.trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    // "EXDATE;TZID=Europe/London" — the name is everything before the first ";".
    const name = line.slice(0, colon).split(";")[0]!.toUpperCase();
    const body = line.slice(colon + 1);

    if (name === "RRULE") {
      const parts = new Map<string, string>();
      for (const piece of body.split(";")) {
        const eq = piece.indexOf("=");
        if (eq > 0) parts.set(piece.slice(0, eq).trim().toUpperCase(), piece.slice(eq + 1).trim());
      }
      const freq = (parts.get("FREQ") ?? "").toUpperCase();
      if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") continue;

      const interval = Number(parts.get("INTERVAL") ?? "1");
      const next: RecurrenceRule = {
        freq,
        interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
        weekStart: (DAY_CODES.indexOf((parts.get("WKST") ?? "MO").toUpperCase() as (typeof DAY_CODES)[number]) as Weekday) ?? 1,
      };
      if (next.weekStart < 0) next.weekStart = 1;

      const byDay = parts.has("BYDAY") ? parseByDay(parts.get("BYDAY")!) : [];
      if (byDay.length > 0) next.byDay = byDay;
      const byMonthDay = parts.has("BYMONTHDAY")
        ? parseNumbers(parts.get("BYMONTHDAY")!, (n) => n !== 0 && n >= -31 && n <= 31)
        : [];
      if (byMonthDay.length > 0) next.byMonthDay = byMonthDay;
      const byMonth = parts.has("BYMONTH") ? parseNumbers(parts.get("BYMONTH")!, (n) => n >= 1 && n <= 12) : [];
      if (byMonth.length > 0) next.byMonth = byMonth;

      const count = Number(parts.get("COUNT") ?? "");
      if (Number.isInteger(count) && count > 0) next.count = count;
      const until = parts.has("UNTIL") ? parseIcsDate(parts.get("UNTIL")!) : null;
      if (until) next.until = until;

      rule = next;
      continue;
    }

    if (name === "EXDATE" || name === "RDATE") {
      const target = name === "EXDATE" ? exceptDates : extraDates;
      for (const piece of body.split(",")) {
        const key = parseIcsDate(piece) ?? (DATE_KEY.test(piece.trim()) ? piece.trim() : null);
        if (key) target.push(key);
      }
    }
  }

  if (!rule) return null;
  return {
    exceptDates: [...new Set(exceptDates)].sort(),
    extraDates: [...new Set(extraDates)].sort(),
    rule,
  };
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

function formatByDay(byDay: readonly ByDay[]): string {
  return byDay.map((entry) => `${entry.ordinal ?? ""}${DAY_CODES[entry.day]}`).join(",");
}

/** Back to the lines Google expects, so a rule made here can be sent as-is. */
export function formatRecurrenceLines(spec: RecurrenceSpec): string[] {
  const { rule } = spec;
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay && rule.byDay.length > 0) parts.push(`BYDAY=${formatByDay(rule.byDay)}`);
  if (rule.byMonthDay && rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byMonth && rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  // COUNT and UNTIL are mutually exclusive in RFC 5545; COUNT wins if both got set.
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${rule.until.replaceAll("-", "")}`);
  if (rule.freq === "WEEKLY" && rule.interval > 1 && rule.weekStart !== 1) {
    parts.push(`WKST=${DAY_CODES[rule.weekStart]}`);
  }

  const lines = [`RRULE:${parts.join(";")}`];
  if (spec.exceptDates.length > 0) lines.push(`EXDATE:${spec.exceptDates.map((d) => d.replaceAll("-", "")).join(",")}`);
  if (spec.extraDates.length > 0) lines.push(`RDATE:${spec.extraDates.map((d) => d.replaceAll("-", "")).join(",")}`);
  return lines;
}

// ---------------------------------------------------------------------------
// expansion
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole local days between two midnights, DST included. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Start of the week containing `date`, for a given first-day-of-week. */
function weekStartOf(date: Date, weekStart: Weekday): Date {
  const shift = (date.getDay() - weekStart + 7) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
}

/** Which occurrence of its own weekday this date is within its month: 1st, 2nd… */
function ordinalInMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

/** …and counting back: -1 for the last one of that weekday in the month. */
function ordinalFromMonthEnd(date: Date): number {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return -(Math.floor((daysInMonth - date.getDate()) / 7) + 1);
}

/** Does this date satisfy the rule's BY* parts, ignoring interval and bounds? */
function matchesPattern(rule: RecurrenceRule, start: Date, date: Date): boolean {
  if (rule.byMonth && rule.byMonth.length > 0 && !rule.byMonth.includes(date.getMonth() + 1)) return false;

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    const ok = rule.byMonthDay.some((n) => (n > 0 ? n === date.getDate() : daysInMonth + n + 1 === date.getDate()));
    if (!ok) return false;
  }

  if (rule.byDay && rule.byDay.length > 0) {
    const ok = rule.byDay.some((entry) => {
      if (entry.day !== date.getDay()) return false;
      if (entry.ordinal === undefined) return true;
      return entry.ordinal > 0 ? ordinalInMonth(date) === entry.ordinal : ordinalFromMonthEnd(date) === entry.ordinal;
    });
    if (!ok) return false;
  }

  // Defaults when a frequency's defining part is absent: the rule repeats on the
  // same footing as the day it started. WEEKLY with no BYDAY means the start's
  // weekday; MONTHLY with neither BYDAY nor BYMONTHDAY means the same date each
  // month; YEARLY with nothing means the same day each year.
  const hasDayPart = (rule.byDay?.length ?? 0) > 0 || (rule.byMonthDay?.length ?? 0) > 0;
  if (rule.freq === "WEEKLY" && !hasDayPart && date.getDay() !== start.getDay()) return false;
  if (rule.freq === "MONTHLY" && !hasDayPart) {
    // A start on the 31st simply does not occur in a 30-day month, which is what
    // every calendar does rather than sliding it to the 30th.
    if (date.getDate() !== start.getDate()) return false;
  }
  if (rule.freq === "YEARLY") {
    if (!hasDayPart && date.getDate() !== start.getDate()) return false;
    if ((rule.byMonth?.length ?? 0) === 0 && date.getMonth() !== start.getMonth()) return false;
  }

  return true;
}

/** Is this date on one of the rule's active periods, per FREQ + INTERVAL? */
function matchesInterval(rule: RecurrenceRule, start: Date, date: Date): boolean {
  if (rule.interval <= 1) return true;
  switch (rule.freq) {
    case "DAILY":
      return daysBetween(start, date) % rule.interval === 0;
    case "WEEKLY": {
      const weeks = Math.round(
        daysBetween(weekStartOf(start, rule.weekStart), weekStartOf(date, rule.weekStart)) / 7,
      );
      return weeks % rule.interval === 0;
    }
    case "MONTHLY":
      return monthsBetween(start, date) % rule.interval === 0;
    case "YEARLY":
      return (date.getFullYear() - start.getFullYear()) % rule.interval === 0;
  }
}

export interface ExpandWindow {
  /** Inclusive local yyyy-mm-dd. Omit for "from the series start". */
  from?: string;
  /** Inclusive local yyyy-mm-dd. Omit for "to the rule's own end". */
  to?: string;
}

/**
 * Every date this series meets, as local yyyy-mm-dd keys.
 *
 * 🔴 COUNTING ALWAYS STARTS AT THE SERIES START, NEVER AT THE WINDOW. "twelve
 * lectures" means twelve from the first one; if the walk began at the window it
 * would hand back twelve more every time a student scrolled to a later month.
 * The window filters what is RETURNED, it does not move the count.
 */
export function expandSpec(spec: RecurrenceSpec, startKey: string, window: ExpandWindow = {}): string[] {
  if (!DATE_KEY.test(startKey)) return [];
  const { rule } = spec;
  const start = dateOf(startKey);
  const skipped = new Set(spec.exceptDates);

  const horizon = new Date(start.getFullYear(), start.getMonth() + HARD_HORIZON_MONTHS, start.getDate());
  const ruleEnd = rule.until ? dateOf(rule.until) : horizon;
  const walkEnd = ruleEnd < horizon ? ruleEnd : horizon;
  const windowFrom = window.from && DATE_KEY.test(window.from) ? dateOf(window.from) : null;
  const windowTo = window.to && DATE_KEY.test(window.to) ? dateOf(window.to) : null;

  const out: string[] = [];
  let seen = 0;
  // 🔴 STEP BY CALENDAR DAY, NEVER BY 24 HOURS. Adding a day's worth of
  // milliseconds is wrong twice a year: on the morning clocks go back, midnight
  // plus 24h is 23:00 of the SAME day. Normalising that back to midnight — the
  // obvious repair — returns the day it started on, and the loop never advances.
  // It hung for three minutes and then died with "Invalid array length", and the
  // daylight-saving test in calendar-issues.test.ts is what caught it.
  // Constructing the next date from its parts asks the runtime for "tomorrow",
  // which is the question actually being asked.
  for (
    let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    cursor <= walkEnd;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  ) {
    if (!matchesInterval(rule, start, cursor)) continue;
    if (!matchesPattern(rule, start, cursor)) continue;

    seen += 1;
    if (rule.count !== undefined && seen > rule.count) break;

    const key = keyOf(cursor);
    if (skipped.has(key)) continue;
    if (windowFrom && cursor < windowFrom) continue;
    if (windowTo && cursor > windowTo) continue;
    out.push(key);
  }

  // RDATE: dates bolted on that the rule itself would not produce. Google uses
  // these for a one-off extra session on an otherwise regular series.
  for (const extra of spec.extraDates) {
    if (!DATE_KEY.test(extra) || skipped.has(extra) || out.includes(extra)) continue;
    const date = dateOf(extra);
    if (windowFrom && date < windowFrom) continue;
    if (windowTo && date > windowTo) continue;
    out.push(extra);
  }

  return [...new Set(out)].sort();
}

// ---------------------------------------------------------------------------
// the old shape
// ---------------------------------------------------------------------------

export interface LegacyRecurrence {
  days: number[];
  until: string;
  except?: string[];
}

/**
 * The pre-RRULE shape, lifted into a real rule.
 *
 * 🔴 EVERY ROW ALREADY IN THE DATABASE IS IN THAT SHAPE, so this is not a
 * convenience — it is the only reason those rows keep working. It is exactly
 * expressible: weekly, on these weekdays, until this date.
 */
export function specFromLegacy(legacy: LegacyRecurrence): RecurrenceSpec {
  return {
    exceptDates: [...new Set(legacy.except ?? [])].sort(),
    extraDates: [],
    rule: {
      byDay: legacy.days.map((day) => ({ day: day as Weekday })),
      freq: "WEEKLY",
      interval: 1,
      until: legacy.until,
      weekStart: 1,
    },
  };
}

/**
 * Back to the old shape, or null when the rule says more than it can hold.
 *
 * 🔴 NULL IS THE IMPORTANT RETURN. It is what stops a fortnightly seminar being
 * written back to an older client as a weekly one. A caller that gets null must
 * write no legacy value at all rather than an approximation — a wrong schedule
 * is worse than a missing one, because nothing about it looks wrong.
 */
export function specToLegacy(spec: RecurrenceSpec): LegacyRecurrence | null {
  const { rule } = spec;
  if (rule.freq !== "WEEKLY") return null;
  if (rule.interval !== 1) return null;
  if (rule.count !== undefined) return null;
  if (!rule.until) return null;
  if ((rule.byMonthDay?.length ?? 0) > 0 || (rule.byMonth?.length ?? 0) > 0) return null;
  if (spec.extraDates.length > 0) return null;
  const byDay = rule.byDay ?? [];
  if (byDay.length === 0) return null;
  if (byDay.some((entry) => entry.ordinal !== undefined)) return null;
  return {
    days: [...new Set(byDay.map((entry) => entry.day))].sort((a, b) => a - b),
    except: spec.exceptDates,
    until: rule.until,
  };
}

/** One line a person can read: "Every 2 weeks on Mon, Wed until 12 Dec 2026". */
export function describeSpec(spec: RecurrenceSpec): string {
  const { rule } = spec;
  const unit = { DAILY: "day", MONTHLY: "month", WEEKLY: "week", YEARLY: "year" }[rule.freq];
  const every = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const parts = [every];
  if (rule.byDay && rule.byDay.length > 0) {
    const days = rule.byDay.map((entry) => {
      const name = names[entry.day];
      if (entry.ordinal === undefined) return name;
      const which = entry.ordinal === -1 ? "last" : ["", "1st", "2nd", "3rd", "4th", "5th"][entry.ordinal] ?? `${entry.ordinal}th`;
      return `the ${which} ${name}`;
    });
    parts.push(`on ${days.join(", ")}`);
  } else if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    parts.push(`on day ${rule.byMonthDay.join(", ")}`);
  }

  if (rule.count !== undefined) parts.push(`, ${rule.count} times`);
  else if (rule.until) parts.push(`until ${dateOf(rule.until).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`);

  const text = parts.join(" ").replace(" , ", ", ");
  if (spec.exceptDates.length === 0) return text;
  return `${text} (${spec.exceptDates.length} skipped)`;
}
