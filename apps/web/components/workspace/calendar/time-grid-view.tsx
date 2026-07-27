"use client";

// The shared time grid behind both the week and day views: an hour gutter, one
// column per day, event blocks positioned by start time and sized by duration,
// a live "now" line, and an all-day strip for everything without a time.
//
// Week and Day are the same component with a different number of columns —
// they were near-duplicates before, and every fix had to be made twice.
//
// Layout arithmetic lives in time-grid.ts (pure, tested). This file only paints.

import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";
import { KIND_META } from "./kind-meta";
import {
  blockGeometry,
  hourLabels,
  hourWindow,
  layoutDay,
  nowOffset,
  offsetFor,
  windowHeight,
} from "./time-grid";

/** How often the "now" line moves. A minute is the smallest visible step, and
 *  anything faster would re-render the grid for no reason. */
const NOW_TICK_MS = 60_000;

const GUTTER_WIDTH = "3.25rem";

interface TimeGridViewProps {
  days: MonthDay[];
  eventsByDay: Map<string, CalendarEvent[]>;
  onAddOnDate: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function TimeGridView({ days, eventsByDay, onAddOnDate, onOpenEvent }: TimeGridViewProps) {
  const [now, setNow] = useState<Date | null>(null);

  // Set after mount only: rendering a clock during SSR gives the server and the
  // client different HTML and React discards the whole tree with a hydration
  // error. Null until mounted means no line on the first paint, then it appears.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const layouts = days.map((day) => layoutDay(eventsByDay.get(day.key) ?? []));
  const window = hourWindow(layouts);
  const labels = hourLabels(window);
  const gridHeight = windowHeight(window);
  const hasAllDay = layouts.some((layout) => layout.allDay.length > 0);
  const todayIndex = days.findIndex((day) => day.isToday);
  const nowTop = now && todayIndex >= 0 ? nowOffset(now, window) : null;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Day headings, pinned above the scrolling grid. */}
      <div className="flex shrink-0 border-b border-border">
        <div className="shrink-0" style={{ width: GUTTER_WIDTH }} />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day) => (
            <div className="group flex items-center justify-center gap-1.5 border-l border-border py-2" key={day.key}>
              {/* Shown in day view too: a lone floating number reads as an
                  orphan, and "FRI 24" costs nothing. */}
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                {day.date.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-[0.75rem] font-medium tabular-nums",
                  day.isToday ? "bg-(--theme-primary) text-primary-foreground" : "text-foreground",
                )}
              >
                {day.date.getDate()}
              </span>
              <Button
                aria-label={`Add event on ${formatEventDate(day.key)}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onAddOnDate(day.key)}
                size="icon-xs"
                variant="ghost"
              >
                <Codicon name="add" size="0.75rem" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* All-day strip. Most syllabus deadlines have no time; they belong here
          rather than at an invented hour on the grid. Rendered only when
          something is in it, so an ordinary week keeps the space. */}
      {hasAllDay && (
        <div className="flex shrink-0 border-b border-border bg-(--ui-bg-quaternary)/30">
          <div
            className="shrink-0 py-1.5 pr-2 text-right text-[0.625rem] uppercase tracking-[0.08em] text-(--ui-text-quaternary)"
            style={{ width: GUTTER_WIDTH }}
          >
            All day
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {layouts.map((layout, index) => (
              <div className="flex flex-col gap-0.5 border-l border-border p-1" key={days[index]?.key ?? index}>
                {layout.allDay.map((event) => (
                  <button
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-left text-[0.6875rem] font-medium leading-tight",
                      KIND_META[event.kind].chip,
                    )}
                    key={event.id}
                    onClick={() => onOpenEvent(event)}
                    title={event.title}
                    type="button"
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The grid itself. Rendered at its natural height — the workspace
          container above already scrolls, and a nested scroll area inside a
          flex child is the shape that collapses to zero height. */}
      <div>
        <div className="flex">
          <div className="relative shrink-0" style={{ height: gridHeight, width: GUTTER_WIDTH }}>
            {labels.map((hour) => (
              <div
                className="absolute right-2 -translate-y-1/2 text-[0.625rem] tabular-nums text-(--ui-text-quaternary)"
                key={hour}
                style={{ top: offsetFor(hour * 60, window) }}
              >
                {hour === 0 ? "" : formatEventTime(`${String(hour).padStart(2, "0")}:00`)}
              </div>
            ))}
          </div>

          <div
            className="relative grid flex-1"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, height: gridHeight }}
          >
            {/* Hour rules, drawn once across the whole grid rather than per
                column, so they stay a single continuous line. */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {labels.map((hour) => (
                <div
                  className="absolute inset-x-0 border-t border-border/60"
                  key={hour}
                  style={{ top: offsetFor(hour * 60, window) }}
                />
              ))}
            </div>

            {days.map((day, index) => (
              <DayColumn
                key={day.key}
                layout={layouts[index]}
                onAdd={onAddOnDate}
                onOpenEvent={onOpenEvent}
                day={day}
                window={window}
              />
            ))}

            {/* The now line, drawn last so it sits above the blocks. Only on
                today's column, and only when the time is inside the window. */}
            {nowTop !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 border-t border-(--theme-primary)"
                style={{
                  left: `${(todayIndex / days.length) * 100}%`,
                  top: nowTop,
                  width: `${(1 / days.length) * 100}%`,
                }}
              >
                <span className="absolute -left-0.5 -top-1 size-1.5 rounded-full bg-(--theme-primary)" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DayColumnProps {
  day: MonthDay;
  layout: ReturnType<typeof layoutDay> | undefined;
  window: ReturnType<typeof hourWindow>;
  onAdd: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

function DayColumn({ day, layout, window, onAdd, onOpenEvent }: DayColumnProps) {
  const timed = layout?.timed ?? [];

  return (
    <div className="relative border-l border-border">
      {/* Click an empty patch to add an event on that day. */}
      <button
        aria-label={`Add event on ${formatEventDate(day.key)}`}
        className="absolute inset-0 h-full w-full cursor-pointer"
        onClick={() => onAdd(day.key)}
        type="button"
      />
      {timed.map((item) => {
        const top = offsetFor(item.startMinute, window);
        const height = offsetFor(item.endMinute, window) - top;
        const geometry = blockGeometry(item.column, item.columns);
        return (
          // The opaque backing MUST be its own element. Putting `bg-card` in
          // the button's own class list alongside KIND_META's `bg-…/15` puts
          // two backgrounds in one tailwind-merge group, and tailwind-merge
          // keeps the LAST one — so `bg-card` was silently dropped and the
          // blocks stayed 15% translucent. Staggered blocks sit ON TOP of each
          // other, so a see-through one reads as a muddy colour, not a stack.
          <div
            className="absolute overflow-hidden rounded-md bg-card shadow-sm"
            key={item.event.id}
            style={{
              height: Math.max(height - 2, 14),
              left: `calc(${geometry.leftPct}% + 1px)`,
              top,
              width: `calc(${geometry.widthPct}% - 3px)`,
              zIndex: geometry.zIndex,
            }}
          >
            <button
              className={cn(
                "flex size-full flex-col overflow-hidden rounded-md border border-border/70 px-1.5 py-1 text-left text-[0.6875rem] font-medium leading-tight transition-shadow hover:shadow-md",
                KIND_META[item.event.kind].chip,
              )}
              onClick={() => onOpenEvent(item.event)}
              title={item.event.title}
              type="button"
            >
              <span className="block w-full truncate">{item.event.title}</span>
              {/* The time only earns its line when the block is tall enough AND
                  not squeezed by a stack — otherwise it renders as "9:…". */}
              {height > 26 && geometry.widthPct > 55 && item.event.time && (
                <span className="block w-full truncate text-[0.625rem] tabular-nums opacity-70">
                  {formatEventTime(item.event.time)}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
