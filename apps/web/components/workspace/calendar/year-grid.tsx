// Year view — verbatim from desktop calendar/index.tsx §A.10 (YearGrid + MiniMonth).

import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { monthGrid } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

interface YearGridProps {
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelectMonth: (year: number, month: number) => void;
  today: Date;
  year: number;
}

export function YearGrid({ eventsByDay, onSelectMonth, today, year }: YearGridProps) {
  return (
    <div className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-3 sm:grid-cols-3 xl:grid-cols-4">
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
      className="flex flex-col gap-1.5 rounded-xl border border-border p-2 text-left transition-colors hover:border-(--theme-primary)/60 hover:bg-(--ui-control-hover-background)"
      onClick={() => onSelectMonth(year, month)}
      type="button"
    >
      <p className="px-0.5 text-[0.6875rem] font-semibold">{monthName}</p>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => (
          <div className={cn("flex flex-col items-center gap-0.5", !day.inMonth && "opacity-30")} key={day.key}>
            <span
              className={cn(
                "grid size-4 place-items-center rounded-full text-[0.5625rem] tabular-nums text-muted-foreground",
                day.isToday && "bg-(--theme-primary) font-semibold text-primary-foreground",
              )}
            >
              {day.date.getDate()}
            </span>
            <span
              className={cn(
                "size-1 rounded-full",
                (eventsByDay.get(day.key)?.length ?? 0) > 0 && "bg-(--theme-primary)",
              )}
            />
          </div>
        ))}
      </div>
    </button>
  );
}
