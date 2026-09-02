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

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { CHEVRON_STYLE, FIELD as SHARED_FIELD } from "./field-chrome";
import {
  type ByDay,
  dateOf,
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

  return (
    // 🔴 THE BOX ONLY EXISTS WHEN THERE IS SOMETHING TO GROUP. With no repeat
    // set this is one dropdown, and a bordered card around one dropdown was the
    // heaviest thing in a form the owner had just asked to lighten (2026-09-01,
    // "it's too bunched in together"). The extras below — the weekday chips and
    // the Ends row — only appear once `spec` exists, and THEY are what a box is
    // for. The word "Repeats" went with it: the row already carries the repeat
    // icon, and the first option says "Does not repeat" in full.
    <div className={cn("flex flex-col gap-2", spec && "rounded-lg border border-(--ui-stroke-tertiary) p-2.5")}>
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
                  "size-6 rounded-full text-[0.625rem] font-semibold transition-colors",
                  on
                    ? "bg-(--theme-primary) text-primary-foreground"
                    : "border border-(--ui-stroke-secondary) text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background)",
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
  );
}

export type { Frequency };
