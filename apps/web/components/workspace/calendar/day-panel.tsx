// Day view — verbatim from desktop calendar/index.tsx §A.9 (DayPanel).

import { Badge } from "@/components/desktop-ui/badge";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { dateKey } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventTime } from "./format";
import { KIND_META } from "./kind-meta";

interface DayPanelProps {
  date: Date;
  events: CalendarEvent[];
  onAddOnDate: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  today: Date;
}

export function DayPanel({ date, events, onAddOnDate, onOpenEvent, today }: DayPanelProps) {
  const isToday = dateKey(date) === dateKey(today);
  const weekdayLong = date.toLocaleDateString(undefined, { weekday: "long" });
  const dayMonthLong = date.toLocaleDateString(undefined, { day: "numeric", month: "long" });

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{weekdayLong}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{dayMonthLong}</h2>
            {isToday && <Badge>Today</Badge>}
          </div>
        </div>
        <Button
          aria-label={`Add event on ${dayMonthLong}`}
          onClick={() => onAddOnDate(dateKey(date))}
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name="add" size="0.875rem" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <EmptyState className="min-h-40" description="Nothing due today." title="All clear" />
        ) : (
          <div className="flex flex-col gap-1">
            {events.map((event) => (
              <button
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-control-hover-background)"
                key={event.id}
                onClick={() => onOpenEvent(event)}
                type="button"
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", KIND_META[event.kind].dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{event.title}</span>
                  <span className="block text-[0.6875rem] text-muted-foreground">
                    {event.time ? formatEventTime(event.time) : "No time set"}
                    {event.course ? ` · ${event.course}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
