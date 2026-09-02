"use client";

// Schedule — Google's sixth view, and the one that answers "what is coming up"
// without making you read a grid.
//
// 🔴 THIS WAS `agenda.tsx`, A RAIL NOTHING RENDERED. Its own header said "Always
// visible alongside every view mode" and no view had mounted it for months: it
// was a card with a fixed "Next 30 days" title, sized for a sidebar that no
// longer exists. Owner 2026-09-01: "the calendar is missing schedule view and 4
// day view from Google Calendar." It is a full view now, and it is reachable.
//
// Google's shape, which is why it reads as a schedule rather than a list: one
// row per DAY down the left, its events beside it, and days with nothing in them
// are not drawn at all.

import { EmptyState } from "@/components/desktop-ui/empty-state";
import { type CalendarEvent, parseDateKey } from "@/lib/workspace/calendar-model";
import { paintForEvent } from "@/lib/workspace/event-colors";
import { cn } from "@/lib/utils";

import { formatEventTime } from "./format";
import { DEFAULT_PAINT } from "./kind-meta";

interface ScheduleViewProps {
  calendarHex: (calendarId: string | undefined) => string | null;
  /** Already filtered and windowed by the workspace, earliest first. */
  events: CalendarEvent[];
  hasAnyEvents: boolean;
  loaded: boolean;
  onOpenEvent: (event: CalendarEvent) => void;
}

/** Events grouped by date key, keeping the order they arrived in. */
function byDay(events: readonly CalendarEvent[]): Array<[string, CalendarEvent[]]> {
  const days = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = days.get(event.date);
    if (list) list.push(event);
    else days.set(event.date, [event]);
  }
  return [...days.entries()];
}

export function ScheduleView({ calendarHex, events, hasAnyEvents, loaded, onOpenEvent }: ScheduleViewProps) {
  if (!loaded) {
    return <div className="grid min-h-32 flex-1 place-items-center text-xs text-(--ui-text-secondary)">Loading…</div>;
  }
  if (events.length === 0) {
    return (
      <EmptyState
        className="min-h-40 flex-1"
        description={
          hasAnyEvents
            ? "Nothing in this stretch. Step forward to look further ahead."
            : "Drop a syllabus on the calendar, or press + to add something."
        }
        title={hasAnyEvents ? "All clear" : "Nothing scheduled yet"}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary) bg-background">
      {byDay(events).map(([key, list]) => {
        const date = parseDateKey(key);
        return (
          // The date column is fixed so every day's events start on the same
          // line, which is the whole reason this reads as a schedule.
          <div
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-(--ui-stroke-tertiary) px-4 py-3 last:border-b-0"
            key={key}
          >
            <div className="pt-1">
              <div className="text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-(--ui-text-secondary)">
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="text-[1.25rem] font-normal leading-tight tabular-nums text-foreground">
                {date.getDate()}
              </div>
              <div className="text-[0.6875rem] text-(--ui-text-secondary)">
                {date.toLocaleDateString(undefined, { month: "short" })}
              </div>
            </div>
            <div className="flex min-w-0 flex-col">
              {list.map((event) => {
                const paint = paintForEvent(event, calendarHex);
                return (
                  <button
                    className="flex w-full items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-control-hover-background)"
                    key={event.id}
                    onClick={() => onOpenEvent(event)}
                    type="button"
                  >
                    <span
                      className={cn("size-2 shrink-0 translate-y-[-1px] rounded-full", !paint && DEFAULT_PAINT.dot)}
                      style={paint ? { backgroundColor: paint.dot.backgroundColor } : undefined}
                    />
                    {/* The time gets a fixed column so titles line up, and reads
                        quieter than the title beside it — Google's rule. */}
                    <span className="w-[5.5rem] shrink-0 text-[0.75rem] tabular-nums text-(--ui-text-secondary)">
                      {event.time ? formatEventTime(event.time) : "All day"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-foreground">{event.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
