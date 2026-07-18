// Week view — verbatim from desktop calendar/index.tsx §A.8 (WeekGrid + WeekDayColumn).

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime, WEEKDAY_LABELS } from "./format";
import { KIND_META } from "./kind-meta";

interface WeekGridProps {
  days: MonthDay[];
  eventsByDay: Map<string, CalendarEvent[]>;
  onAddOnDate: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function WeekGrid({ days, eventsByDay, onAddOnDate, onOpenEvent }: WeekGridProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid shrink-0 grid-cols-7 border-b border-border text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div className="px-2 py-2 text-center" key={label}>
            {label}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7">
        {days.map((day) => (
          <WeekDayColumn day={day} events={eventsByDay.get(day.key) ?? []} key={day.key} onAdd={onAddOnDate} onOpenEvent={onOpenEvent} />
        ))}
      </div>
    </div>
  );
}

interface WeekDayColumnProps {
  day: MonthDay;
  events: CalendarEvent[];
  onAdd: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

function WeekDayColumn({ day, events, onAdd, onOpenEvent }: WeekDayColumnProps) {
  return (
    <div className="group flex min-h-0 flex-col gap-1.5 border-r border-border p-1.5 last:border-r-0">
      <div className="flex shrink-0 items-center justify-between">
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full text-[0.6875rem] font-medium tabular-nums",
            day.isToday && "bg-(--theme-primary) text-primary-foreground",
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
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="px-1 pt-1 text-[0.625rem] text-(--ui-text-quaternary)">No events</p>
        ) : (
          events.map((event) => (
            <button
              className={cn(
                "truncate rounded px-1.5 py-1 text-left text-[0.6875rem] font-medium leading-tight",
                KIND_META[event.kind].chip,
              )}
              key={event.id}
              onClick={() => onOpenEvent(event)}
              title={event.title}
              type="button"
            >
              {event.time && <span className="tabular-nums opacity-70">{formatEventTime(event.time)} · </span>}
              {event.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
