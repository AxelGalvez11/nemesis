// Month view — verbatim from desktop calendar/index.tsx §A.7 (MonthGrid + DayCell).

import { Popover, PopoverContent, PopoverTrigger } from "@/components/desktop-ui/popover";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime, MAX_CHIPS_PER_DAY, WEEKDAY_LABELS } from "./format";
import { KIND_META } from "./kind-meta";

interface MonthGridProps {
  days: MonthDay[];
  eventsByDay: Map<string, CalendarEvent[]>;
  onAddOnDate: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function MonthGrid({ days, eventsByDay, onAddOnDate, onOpenEvent }: MonthGridProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-(--ui-stroke-tertiary) bg-background">
      <div className="grid shrink-0 grid-cols-7 border-b border-(--ui-stroke-tertiary) text-sm font-medium text-(--ui-text-secondary)">
        {WEEKDAY_LABELS.map((label) => (
          <div className="px-3 py-2 text-right" key={label}>
            {label}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => (
          <DayCell day={day} events={eventsByDay.get(day.key) ?? []} key={day.key} onAdd={onAddOnDate} onOpenEvent={onOpenEvent} />
        ))}
      </div>
    </div>
  );
}

interface DayCellProps {
  day: MonthDay;
  events: CalendarEvent[];
  onAdd: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

function DayCell({ day, events, onAdd, onOpenEvent }: DayCellProps) {
  const visible = events.slice(0, MAX_CHIPS_PER_DAY);
  const overflow = events.length - visible.length;

  // Weekends get a quieter ground than weekdays, and days outside the month a
  // quieter one again — three steps rather than the old two, which is what
  // gives the grid a readable rhythm instead of one flat sheet of cells.
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

  return (
    <div
      className={cn(
        "group flex min-h-24 flex-col gap-1 border-b border-r border-(--ui-stroke-tertiary) p-2 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
        day.inMonth && isWeekend && "bg-(--ui-bg-quaternary)/10",
        !day.inMonth && "bg-(--ui-bg-quaternary)/20",
      )}
    >
      <div className="flex shrink-0 flex-row-reverse items-center justify-between">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-sm font-medium tabular-nums",
            day.isToday ? "bg-(--theme-primary) text-primary-foreground" : !day.inMonth && "text-(--ui-text-quaternary)",
          )}
        >
          {day.date.getDate()}
        </span>
        <Button
          aria-label={`Add event on ${formatEventDate(day.key)}`}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onAdd(day.key)}
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name="add" size="0.75rem" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5">
        {visible.map((event) => (
          <button
            className={cn(
              "flex items-baseline gap-1 truncate rounded px-1.5 py-0.5 text-left text-[0.6875rem] font-medium leading-tight",
              KIND_META[event.kind].chip,
            )}
            key={event.id}
            onClick={() => onOpenEvent(event)}
            title={event.title}
            type="button"
          >
            {/* Timed events lead with the time, the way a real calendar does —
                it is the thing you scan a month grid for. */}
            {event.time && <span className="shrink-0 tabular-nums opacity-70">{formatEventTime(event.time)}</span>}
            <span className="truncate">{event.title}</span>
          </button>
        ))}
        {overflow > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="truncate rounded px-1 py-0.5 text-left text-[0.625rem] font-medium text-muted-foreground hover:text-foreground"
                type="button"
              >
                +{overflow} more
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1.5">
              <div className="flex flex-col gap-0.5">
                {events.map((event) => (
                  <button
                    className={cn("truncate rounded px-1.5 py-1 text-left text-xs font-medium", KIND_META[event.kind].chip)}
                    key={event.id}
                    onClick={() => onOpenEvent(event)}
                    type="button"
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
