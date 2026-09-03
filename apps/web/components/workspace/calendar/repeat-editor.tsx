"use client";

// The repeat control, laid out the way Google's is: one dropdown for the common
// answers, and the parts that need saying only appearing once they matter.
//
// 🔴 THIS IS THE FIRST TIME A REPEAT COULD BE EDITED AT ALL. The form used to
// print a sentence — "Repeats on Mon, Wed through 2026-06-12" — and offer no way
// to change it, because the stored shape could hold only that one kind of rule.
// A student whose seminar moved to fortnightly had to delete the series and
// build it again by hand.
//
// Everything here produces RFC 5545 lines through lib/workspace/rrule.ts, so what
// is built is exactly what Google would send, and what Google sends can be
// loaded back into these controls.

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { CHEVRON_STYLE, FIELD as SHARED_FIELD, SOFT_FIELD } from "./field-chrome";
import {
  type ByDay,
  dateOf,
  describeSpec,
  formatRecurrenceLines,
  type Frequency,
  parseRecurrenceLines,
  type RecurrenceSpec,
  type Weekday,
} from "@/lib/workspace/rrule";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth"];

/** The dropdown's answers. "custom" is what everything else collapses into. */
type Preset = "none" | "daily" | "weekly" | "fortnightly" | "monthly-day" | "monthly-weekday" | "yearly" | "custom";

interface RepeatEditorProps {
  /** The stored lines, or undefined for "does not repeat". */
  value: string[] | undefined;
  onChange: (lines: string[] | undefined) => void;
  /** The event's own date — every rule is anchored to it. */
  startDate: string;
}

function specOf(lines: string[] | undefined): RecurrenceSpec | null {
  return lines && lines.length > 0 ? parseRecurrenceLines(lines) : null;
}

/** Which dropdown entry describes this rule, or "custom" when none does. */
function presetOf(spec: RecurrenceSpec | null, start: Date): Preset {
  if (!spec) return "none";
  const { rule } = spec;
  const plainWeek = (rule.byDay?.length ?? 0) === 1 && rule.byDay![0]!.ordinal === undefined
    && rule.byDay![0]!.day === start.getDay();
  const noParts = (rule.byMonthDay?.length ?? 0) === 0 && (rule.byMonth?.length ?? 0) === 0;

  if (rule.freq === "DAILY" && rule.interval === 1 && (rule.byDay?.length ?? 0) === 0 && noParts) return "daily";
  if (rule.freq === "WEEKLY" && rule.interval === 1 && noParts) return "weekly";
  if (rule.freq === "WEEKLY" && rule.interval === 2 && plainWeek && noParts) return "fortnightly";
  if (rule.freq === "MONTHLY" && rule.interval === 1) {
    if ((rule.byDay?.length ?? 0) === 0 && (rule.byMonthDay?.length ?? 0) === 0) return "monthly-day";
    if (rule.byDay?.length === 1 && rule.byDay[0]!.ordinal !== undefined) return "monthly-weekday";
  }
  if (rule.freq === "YEARLY" && rule.interval === 1 && (rule.byDay?.length ?? 0) === 0 && noParts) return "yearly";
  return "custom";
}

/** A fresh rule for a chosen preset, anchored to the event's own date. */
function specForPreset(preset: Preset, start: Date, previous: RecurrenceSpec | null): RecurrenceSpec | null {
  if (preset === "none") return null;
  // Whatever end the student already chose is theirs to keep across a change of
  // shape — retyping "until 12 December" after switching to fortnightly is work
  // the control can simply not ask for.
  const ending = previous
    ? { ...(previous.rule.count !== undefined ? { count: previous.rule.count } : {}),
        ...(previous.rule.until ? { until: previous.rule.until } : {}) }
    : {};
  const base = { exceptDates: previous?.exceptDates ?? [], extraDates: [], weekStart: 1 as Weekday };
  const day = start.getDay() as Weekday;

  switch (preset) {
    case "daily":
      return { exceptDates: base.exceptDates, extraDates: [], rule: { freq: "DAILY", interval: 1, weekStart: 1, ...ending } };
    case "weekly":
      return { exceptDates: base.exceptDates, extraDates: [], rule: { byDay: [{ day }], freq: "WEEKLY", interval: 1, weekStart: 1, ...ending } };
    case "fortnightly":
      return { exceptDates: base.exceptDates, extraDates: [], rule: { byDay: [{ day }], freq: "WEEKLY", interval: 2, weekStart: 1, ...ending } };
    case "monthly-day":
      return { exceptDates: base.exceptDates, extraDates: [], rule: { freq: "MONTHLY", interval: 1, weekStart: 1, ...ending } };
    case "monthly-weekday":
      return {
        exceptDates: base.exceptDates,
        extraDates: [],
        rule: { byDay: [{ day, ordinal: Math.floor((start.getDate() - 1) / 7) + 1 }], freq: "MONTHLY", interval: 1, weekStart: 1, ...ending },
      };
    case "yearly":
      return { exceptDates: base.exceptDates, extraDates: [], rule: { freq: "YEARLY", interval: 1, weekStart: 1, ...ending } };
    default:
      return previous;
  }
}

// 🔴 SHARED, NOT LOCAL. This was its own `h-8 rounded-lg border …` and it had
// already drifted from the editor's: once those controls were sized to Google's
// 40px, the repeat dropdown was still 36 and sat visibly short beside the date
// field above it. Two constants that must agree are one constant.
const FIELD = SHARED_FIELD;

/**
 * The one line the rule collapses to, and the panel it opens.
 *
 * 🔴🔴 THIS ROW WAS 250px OF A 624px DIALOG. Owner, 2026-09-03: the editor
 * "looks a bit too close together … I need something that is not so bunched up"
 * and, of the same box, "a bit smaller". Those pull against each other, and the
 * only way to satisfy both is to show LESS at once rather than to space more
 * out. A repeat rule is read far more often than it is changed, so it reads as a
 * sentence and only becomes five controls when somebody presses it.
 *
 * 🔴 THE SENTENCE IS `describeSpec`, WHICH ALREADY EXISTED AND HAD NO CALLER.
 * It was written with the parser, tested, and never reached a screen — so this
 * is a stranded helper finding its surface, not a second way to say a rule.
 */
const SUMMARY = cn(SOFT_FIELD, "justify-between");

export function RepeatEditor({ value, onChange, startDate }: RepeatEditorProps) {
  const spec = useMemo(() => specOf(value), [value]);
  const start = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? dateOf(startDate) : new Date()), [startDate]);
  const preset = presetOf(spec, start);

  const push = (next: RecurrenceSpec | null) => onChange(next ? formatRecurrenceLines(next) : undefined);
  const edit = (change: (draft: RecurrenceSpec) => void) => {
    if (!spec) return;
    const draft: RecurrenceSpec = { ...spec, rule: { ...spec.rule } };
    change(draft);
    push(draft);
  };

  const ordinal = Math.floor((start.getDate() - 1) / 7) + 1;
  const weekdays = (spec?.rule.byDay ?? []).filter((entry) => entry.ordinal === undefined).map((entry) => entry.day);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {/* 🔴 THE LINE NEVER MOVES. Opening adds a panel BELOW the sentence rather
          than replacing it, so the thing you pressed is still there saying what
          the rule is while you change it — and pressing it again closes. An
          earlier draft swapped the line out for the select, which meant the
          summary you were editing towards disappeared the moment you started. */}
      <button aria-expanded={open} className={SUMMARY} onClick={() => setOpen((was) => !was)} type="button">
        <span className="truncate">{spec ? describeSpec(spec) : "Does not repeat"}</span>
        <svg
          aria-hidden
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
          fill="none"
          height="15"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
          viewBox="0 0 24 24"
          width="15"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* 🔴 THE PANEL IS A SOFT FILL, NOT A BORDERED CARD. A border here drew a
          form inside a form, which is what made this row the heaviest thing in
          the dialog. It groups by ground instead. */}
      {open && (
      <div className="flex flex-col gap-2 rounded-[0.75rem] bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] p-[14px]">
      <div className="flex items-center gap-2">
        <select
          aria-label="Repeats"
          className={cn(FIELD, "min-w-0 flex-1")}
          id="repeat-preset"
          style={CHEVRON_STYLE}
          onChange={(e) => push(specForPreset(e.target.value as Preset, start, spec))}
          value={preset}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
          <option value="fortnightly">Every 2 weeks</option>
          <option value="monthly-day">Monthly on day {start.getDate()}</option>
          <option value="monthly-weekday">
            Monthly on the {ORDINALS[ordinal] ?? `${ordinal}th`} {DAY_NAMES[start.getDay()]}
          </option>
          <option value="yearly">Every year</option>
          {/* Only offered once something already IS custom: it is a state a rule
              arrives in, not a shape a person builds from a dropdown. */}
          {preset === "custom" && <option value="custom">Custom</option>}
        </select>
      </div>

      {spec && (spec.rule.freq === "WEEKLY" || spec.rule.freq === "DAILY") && (
        <div aria-label="Days of the week" className="flex gap-1" role="group">
          {DAY_LABELS.map((label, day) => {
            const on = weekdays.includes(day as Weekday);
            return (
              <button
                aria-label={DAY_NAMES[day]}
                aria-pressed={on}
                className={cn(
                  // 🔴 32px, NOT 27, AND FILLED RATHER THAN OUTLINED. Seven
                  // hairline circles in a row read as a strip of noise at the old
                  // size; on a soft ground the chosen day is the only edge in the
                  // row, which is the one thing this control has to say.
                  "size-[32px] rounded-full text-[0.6875rem] font-semibold transition-colors",
                  on
                    ? "bg-(--theme-primary) text-primary-foreground"
                    : "bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] text-(--ui-text-tertiary) hover:bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]",
                )}
                key={`${label}-${day}`}
                onClick={() =>
                  edit((draft) => {
                    const next: ByDay[] = on
                      ? weekdays.filter((d) => d !== day).map((d) => ({ day: d }))
                      : [...weekdays, day as Weekday].sort((a, b) => a - b).map((d) => ({ day: d }));
                    // A weekly rule with no days is not a schedule; the last one
                    // standing cannot be switched off.
                    if (next.length === 0) return;
                    draft.rule.byDay = next;
                    draft.rule.freq = "WEEKLY";
                  })
                }
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {spec && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-(--ui-text-tertiary)" htmlFor="repeat-ends">Ends</label>
          <select
            className={FIELD}
            id="repeat-ends"
            style={CHEVRON_STYLE}
            onChange={(e) =>
              edit((draft) => {
                delete draft.rule.count;
                delete draft.rule.until;
                if (e.target.value === "on") {
                  const until = new Date(start.getFullYear(), start.getMonth() + 4, start.getDate());
                  draft.rule.until = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}`;
                }
                if (e.target.value === "after") draft.rule.count = 12;
              })
            }
            value={spec.rule.count !== undefined ? "after" : spec.rule.until ? "on" : "never"}
          >
            <option value="never">Never</option>
            <option value="on">On a date</option>
            <option value="after">After a number of times</option>
          </select>

          {spec.rule.until !== undefined && (
            <input
              aria-label="Repeat until"
              className={FIELD}
              onChange={(e) => edit((draft) => { draft.rule.until = e.target.value; })}
              type="date"
              value={spec.rule.until}
            />
          )}
          {spec.rule.count !== undefined && (
            <input
              aria-label="Number of times"
              className={cn(FIELD, "w-16 tabular-nums")}
              min={1}
              onChange={(e) => edit((draft) => { draft.rule.count = Math.max(1, Number(e.target.value) || 1); })}
              type="number"
              value={spec.rule.count}
            />
          )}
        </div>
      )}

      {spec && spec.exceptDates.length > 0 && (
        <p className="text-[0.6875rem] text-(--ui-text-quaternary)">
          {spec.exceptDates.length} {spec.exceptDates.length === 1 ? "date is" : "dates are"} skipped.
        </p>
      )}
      </div>
      )}
    </div>
  );
}

export type { Frequency };
