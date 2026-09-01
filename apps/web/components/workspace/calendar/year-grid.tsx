// Year view — YearGrid + MiniMonth.
//
// Owner 2026-08-03: "the year mode doesnt have the same type of dark mode."
// This was the one calendar view still styled with the legacy shadcn tokens
// (border-border / bg-card / text-muted-foreground) — a parallel hand-set
// palette that never got the dark-mode contrast tuning the real --ui-* cascade
// did, so its borders and greys sat visibly off next to Month. Everything here
// uses the same --ui-* tokens as its sibling views.
//
// 🔴 THE DOT UNDER EVERY DATE IS GONE (owner 2026-09-01). A year view exists to
// answer one question — WHEN IS THIS YEAR HEAVY? — and one fixed-colour dot per
// day could not answer it:
//
//   - One dot meant one lecture, and one dot meant a day with an exam and four
//     other things. Every busy day and every quiet day looked identical.
//   - The dot was `--theme-primary` whatever the day held, so exam week looked
//     like any other week. Finding your exams in a year was a hunt.
//   - It sat BELOW the number, so each date needed two rows and the twelve
//     months were taller and looser than they had any need to be.
//
// The date itself carries the load now: a wash for a day with something on it,
// stronger as the day fills, and an exam day filled in solid. Same information
// in half the height, and the one thing a student is looking for is the one
// thing that stands out.

import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { monthGrid } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { WEEKDAY_LABELS } from "./format";

/**
 * How many events count as a full day.
 *
 * 🔴 THREE BANDS, NOT A CONTINUOUS SCALE, and the numbers come from what a day
 * of study actually looks like. One or two things is an ordinary day and gets a
 * wash you can see but not read as a warning. Three or four is a full day. Five
 * or more is the day you would move something off. A smooth gradient across the
 * whole range would make every day slightly different from its neighbour and
 * none of them mean anything.
 */
const BUSY_FULL = 5;
const BUSY_SOME = 3;

interface YearGridProps {
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelectMonth: (year: number, month: number) => void;
  today: Date;
  year: number;
}

export function YearGrid({ eventsByDay, onSelectMonth, today, year }: YearGridProps) {
  return (
    <div className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary) bg-background p-3 shadow-[0_3px_12px_rgba(0,0,0,0.04)] sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, month) => (
        <MiniMonth
          days={monthGrid(year, month, today)}
          eventsByDay={eventsByDay}
          key={month}
          month={month}
          onSelectMonth={onSelectMonth}
          year={year}
        />
      ))}
    </div>
  );
}

interface MiniMonthProps {
  days: ReturnType<typeof monthGrid>;
  eventsByDay: Map<string, CalendarEvent[]>;
  month: number;
  onSelectMonth: (year: number, month: number) => void;
  year: number;
}

function MiniMonth({ days, eventsByDay, month, onSelectMonth, year }: MiniMonthProps) {
  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long" });

  return (
    <button
      className="flex flex-col gap-1.5 rounded-xl border border-(--ui-stroke-tertiary) p-2 text-left transition-colors hover:border-(--ui-stroke-primary) hover:bg-(--ui-control-hover-background)"
      onClick={() => onSelectMonth(year, month)}
      type="button"
    >
      <p className="px-0.5 text-[0.6875rem] font-semibold">{monthName}</p>
      {/* 🔴 THE DAY LETTERS WERE MISSING ENTIRELY. Without them you cannot tell
          which column is Monday without counting from the edge, and every
          calendar a student has used — Google, Apple, the one on the wall —
          puts them there. First letter only: seven of them have to fit across a
          quarter-width card. */}
      <div className="grid grid-cols-7" aria-hidden>
        {WEEKDAY_LABELS.map((label, index) => (
          <span
            className="text-center text-[0.5rem] font-semibold tracking-[0.02em] text-(--ui-text-quaternary)"
            key={`${label}-${index}`}
          >
            {label.charAt(0)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const events = eventsByDay.get(day.key) ?? [];
          const hasExam = events.some((event) => event.kind === "exam");
          return (
            <div className={cn("flex justify-center", !day.inMonth && "opacity-30")} key={day.key}>
              <span
                className={cn(
                  "grid size-4 place-items-center rounded-full text-[0.5625rem] tabular-nums text-(--ui-text-tertiary)",
                  // Order matters: today wins over an exam wins over a count.
                  // A student looking at the year wants "where am I" answered
                  // before "what is that day", and an exam is never just a
                  // busy day.
                  day.isToday
                    ? "bg-(--theme-primary) font-semibold text-primary-foreground"
                    : hasExam
                      ? "bg-(--ui-exam) font-bold text-white"
                      : busyClass(events.length),
                )}
              >
                {day.date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

/** The wash behind a date, by how full the day is. */
function busyClass(count: number): string {
  if (count >= BUSY_FULL) return "bg-(--ui-cyan) font-semibold text-white";
  if (count >= BUSY_SOME) return "bg-(--ui-cyan)/45 font-medium text-foreground";
  if (count >= 1) return "bg-(--ui-cyan)/15 text-(--ui-text-secondary)";
  return "";
}
