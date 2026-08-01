"use client";

// The shared time grid behind both the week and day views: an hour gutter, one
// column per day, event blocks positioned by start time and sized by duration,
// a live "now" line, and an all-day strip for everything without a time.
//
// Week and Day are the same component with a different number of columns —
// they were near-duplicates before, and every fix had to be made twice.
//
// Layout arithmetic lives in time-grid.ts and gesture bookkeeping in
// use-time-grid-gestures.ts, both pure of the DOM. This file only paints.

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime, hourLabel } from "./format";
import { KIND_META } from "./kind-meta";
import {
  blockDetail,
  blockGeometry,
  INLINE_MIN_PX,
  renderedBlockHeight,
  clockOf,
  FULL_DAY,
  type HourWindow,
  hourLabels,
  layoutDay,
  nowOffset,
  offsetFor,
  SCROLL_TO_HOUR,
  windowHeight,
} from "./time-grid";
import { type GestureResult, useTimeGridGestures } from "./use-time-grid-gestures";

/** How often the "now" line moves. A minute is the smallest visible step, and
 *  anything faster would re-render the grid for no reason. */
const NOW_TICK_MS = 60_000;

/** Wide enough for the longest hour label ("12 AM") and for "All day" to stay
 *  on one line. Both were wrapping at 3.25rem once the app's default text size
 *  put the root at 20px. */
/** Google's hour gutter is 51px on a 16px root — 3.1875rem — and ours was
 *  3.75rem, wide enough that "11 AM" floated away from the grid it labels. */
const GUTTER_WIDTH = "3.1875rem";

/**
 * The timezone the grid is drawn in, as Google labels it: "GMT-05".
 *
 * Read from the browser rather than stored, and deliberately the OFFSET rather
 * than the zone name: the offset is what makes a syllabus written in another
 * timezone readable against these rows, and it is also the thing that changes
 * across daylight saving while the zone name does not.
 */
function gmtLabel(): string {
  // getTimezoneOffset is minutes BEHIND UTC, so its sign is inverted from the
  // way GMT offsets are written.
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const rest = abs % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

interface TimeGridViewProps {
  days: MonthDay[];
  eventsByDay: Map<string, CalendarEvent[]>;
  onAddOnDate: (dateKeyStr: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  /** A slot was clicked or dragged out — raise the quick-create card over it. */
  onPickSlot: (result: GestureResult, anchor: DOMRect) => void;
  /** An event was dragged to a new time, day, or length. */
  onMoveEvent: (event: CalendarEvent, result: GestureResult) => void;
}

export function TimeGridView({ days, eventsByDay, onAddOnDate, onMoveEvent, onOpenEvent, onPickSlot }: TimeGridViewProps) {
  const [now, setNow] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Open scrolled to the working day. The grid runs midnight to midnight, so
  // without this every student lands on a screenful of empty small hours and
  // has to scroll down before the calendar means anything. Set directly rather
  // than animated: this is the opening position, not a movement to watch.
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = offsetFor(SCROLL_TO_HOUR * 60, FULL_DAY);
  }, []);

  // Set after mount only: rendering a clock during SSR gives the server and the
  // client different HTML and React discards the whole tree with a hydration
  // error. Null until mounted means no line on the first paint, then it appears.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const layouts = days.map((day) => layoutDay(eventsByDay.get(day.key) ?? []));
  // Named `hours`, not `window`: the pointer code below and the gesture hook
  // both live near the real `window`, and shadowing it is the kind of thing
  // that reads fine and breaks the first time someone reaches for it.
  //
  // Always the whole day now. It used to be computed from the events on screen,
  // which made the grid change length as events moved and left hours that could
  // not be reached at all.
  const hours = FULL_DAY;
  const labels = hourLabels(hours);
  const gridHeight = windowHeight(hours);
  const hasAllDay = layouts.some((layout) => layout.allDay.length > 0);
  const todayIndex = days.findIndex((day) => day.isToday);
  const nowTop = now && todayIndex >= 0 ? nowOffset(now, hours) : null;

  const { beginCreate, beginMove, beginResize, gesture, gridRef, handlePointerMove, handlePointerUp, preview } =
    useTimeGridGestures({ days, hours, onCommit: onMoveEvent, onOpenEvent, onPickSlot });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-(--ui-stroke-tertiary) bg-background">
      {/* Day headings, pinned above the scrolling grid. */}
      <div className="flex shrink-0 border-b border-border">
        {/* Google labels the gutter with the timezone the grid is drawn in.
            Worth copying literally: a student reading a syllabus written in
            another timezone needs to know which one these rows mean. Taken
            from the browser, never hardcoded. */}
        <div
          className="flex shrink-0 items-end justify-end whitespace-nowrap pb-1 pr-1.5 text-[0.625rem] font-medium tracking-[0.01em] text-(--ui-text-quaternary)"
          style={{ width: GUTTER_WIDTH }}
        >
          {gmtLabel()}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day) => (
            // STACKED, the way Google Calendar does it: a small uppercase
            // weekday sitting above a large date number, with today's number
            // filled into a full circle. Measured off calendar.google.com at
            // 1440px — weekday 11px, date 26px regular, today a 46px round chip
            // — and converted by RATIO to this app's 20px root rather than
            // pinned to Google's pixels, so the whole header still scales with
            // the student's text-size setting.
            <div className="group relative flex flex-col items-center justify-center border-l border-border pb-1.5 pt-2" key={day.key}>
              <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)">
                {day.date.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "mt-0.5 grid size-[2.875rem] place-items-center rounded-full text-[1.625rem] font-normal leading-none tabular-nums",
                  day.isToday ? "bg-foreground text-background" : "text-foreground",
                )}
              >
                {day.date.getDate()}
              </span>
              {/* Absolute, not in the flow: stacked, an inline button would
                  shove the date number off the column's centre line and the
                  whole row would jitter on hover. */}
              <Button
                aria-label={`Add event on ${formatEventDate(day.key)}`}
                className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
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
            className="shrink-0 whitespace-nowrap py-1.5 pr-2 text-right text-[0.625rem] uppercase tracking-[0.06em] text-(--ui-text-quaternary)"
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

      {/* The grid scrolls INSIDE this box, so the day headings and the all-day
          strip above stay put while the hours move past them — how Google
          Calendar behaves, and the point of drawing a whole day.

          The comment that used to sit here said a nested scroll area
          "collapses to zero height". That is true only when an ancestor is
          missing min-h-0: a flex child defaults to min-height:auto and refuses
          to shrink below its content, so the scrollbar lands on the page
          instead. Every flex ancestor from here to the route now carries
          min-h-0, which is what makes this work. */}
      <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="flex">
          <div className="relative shrink-0" style={{ height: gridHeight, width: GUTTER_WIDTH }}>
            {labels.map((hour, index) => {
              const { suffix, value } = hourLabel(hour);
              return (
                <div
                  className={cn(
                    "absolute right-2 flex items-baseline gap-0.5 whitespace-nowrap text-[0.625rem] tabular-nums text-(--ui-text-quaternary)",
                    // Every label is centred on its own hour rule — except the
                    // first, which sits ON the top edge, where centring pushed
                    // half of it up into the all-day strip.
                    index === 0 ? "translate-y-0" : "-translate-y-1/2",
                  )}
                  key={hour}
                  style={{ top: offsetFor(hour * 60, hours) }}
                >
                  <span>{value}</span>
                  {suffix && <span className="text-[0.5rem] tracking-[0.03em]">{suffix}</span>}
                </div>
              );
            })}
          </div>

          {/* The grid IS the create surface: pressing anywhere that is not an
              event block starts a new one at the minute pressed, and dragging
              sets how long it runs. The per-column transparent "add" button
              that used to sit here could only ever produce an untimed event,
              because a click target has no idea where inside itself it was hit. */}
          <div
            className={cn("relative grid flex-1", gesture && "cursor-ns-resize select-none")}
            onPointerDown={beginCreate}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, height: gridHeight }}
          >
            {/* Hour rules, drawn once across the whole grid rather than per
                column, so they stay a single continuous line. */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {labels.map((hour) => (
                <div
                  className="absolute inset-x-0 border-t border-border/60"
                  key={hour}
                  style={{ top: offsetFor(hour * 60, hours) }}
                />
              ))}
            </div>

            {days.map((day, index) => (
              <DayColumn
                key={day.key}
                layout={layouts[index]}
                onOpenEvent={onOpenEvent}
                onResizeStart={beginResize}
                onMoveStart={beginMove}
                day={day}
                window={hours}
              />
            ))}

            {/* What the drag currently describes. Move and resize leave the
                real block in place and show this on top, so the change is
                visible against where it came from. */}
            {preview && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-20 overflow-hidden rounded-md border border-(--theme-primary) bg-(--theme-primary)/20 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-tight text-(--theme-primary)"
                style={{
                  height: Math.max(offsetFor(preview.endMinute, hours) - offsetFor(preview.startMinute, hours), 16),
                  left: `calc(${(preview.dayIndex / days.length) * 100}% + 2px)`,
                  top: offsetFor(preview.startMinute, hours),
                  width: `calc(${(1 / days.length) * 100}% - 4px)`,
                }}
              >
                <span className="block truncate">{preview.label}</span>
                <span className="block truncate text-[0.625rem] tabular-nums opacity-80">
                  {formatEventTime(clockOf(preview.startMinute))} – {formatEventTime(clockOf(preview.endMinute))}
                </span>
              </div>
            )}

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
  window: HourWindow;
  onOpenEvent: (event: CalendarEvent) => void;
  onMoveStart: (nativeEvent: React.PointerEvent, event: CalendarEvent) => void;
  onResizeStart: (nativeEvent: React.PointerEvent, event: CalendarEvent) => void;
}

function DayColumn({ day, layout, window, onMoveStart, onOpenEvent, onResizeStart }: DayColumnProps) {
  const timed = layout?.timed ?? [];

  return (
    <div className="relative border-l border-border">
      {timed.map((item) => {
        const top = offsetFor(item.startMinute, window);
        const height = offsetFor(item.endMinute, window) - top;
        const geometry = blockGeometry(item.column, item.columns);
        // What the box is actually GIVEN, which is what decides how much fits.
        const boxHeight = renderedBlockHeight(height);
        // A staggered block is also narrow, and a time squeezed beside a title
        // in a 40%-wide column renders as "9:…". Width vetoes the roomier tiers
        // the same way height does.
        const detail = geometry.widthPct > 55 ? blockDetail(boxHeight) : "title";
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
              height: boxHeight,
              left: `calc(${geometry.leftPct}% + 1px)`,
              top,
              width: `calc(${geometry.widthPct}% - 3px)`,
              zIndex: geometry.zIndex,
            }}
          >
            {/* Still a button, and still opens on a plain click — but the click
                is decided on pointer UP by the gesture hook, after it knows
                whether the pointer travelled. An onClick here as well would
                fire a second time at the end of every drag and open the event
                the student just finished moving. */}
            <button
              className={cn(
                "flex size-full cursor-grab overflow-hidden rounded-md border border-border/70 px-1.5 text-left font-medium leading-tight transition-shadow hover:shadow-md active:cursor-grabbing",
                // Each tier pays for its extra line by giving up padding, so the
                // content always fits the box rather than being sliced by it.
                detail === "stacked" && "flex-col py-1 text-[0.6875rem]",
                detail === "inline" && "items-baseline gap-1 py-0.5 text-[0.6875rem]",
                detail === "title" && "items-center py-0 text-[0.625rem] leading-none",
                KIND_META[item.event.kind].chip,
              )}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                keyEvent.preventDefault();
                onOpenEvent(item.event);
              }}
              onPointerDown={(pointerEvent) => {
                // Stop the grid underneath from also starting a new event.
                pointerEvent.stopPropagation();
                onMoveStart(pointerEvent, item.event);
              }}
              title={item.event.title}
              type="button"
            >
              <span className={cn("truncate", detail === "inline" ? "min-w-0 flex-1" : "block w-full")}>
                {item.event.title}
              </span>
              {/* Stacked gives the time its own line; inline sets it beside the
                  title and lets the TITLE do the truncating, because a clipped
                  time ("10:…") is worse than a clipped title. A block in the
                  title tier has room for neither and shows only the name — the
                  full details are one click away either way. */}
              {detail !== "title" && item.event.time && (
                <span
                  className={cn(
                    "truncate text-[0.625rem] tabular-nums opacity-70",
                    detail === "inline" ? "shrink-0" : "block w-full",
                  )}
                >
                  {formatEventTime(item.event.time)}
                </span>
              )}
            </button>
            {/* The resize grip. Only on blocks tall enough that it does not eat
                the whole target — on a short one, dragging the body to a new
                time is the sane gesture and resizing is the form's job. */}
            {boxHeight >= INLINE_MIN_PX && (
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                onPointerDown={(pointerEvent) => {
                  pointerEvent.stopPropagation();
                  onResizeStart(pointerEvent, item.event);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
