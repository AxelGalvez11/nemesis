"use client";

// The day rail: one day, opened out beside the month grid.
//
// 🔴 THIS REPLACED A POPOVER, AND THE REPLACEMENT IS THE POINT (owner
// 2026-09-01, choosing Option B). "+N more" used to raise a floating card that
// listed the whole day again — the events already on the cell included — with
// every time stripped off. Three things are better here:
//
//   1. It never hides the month. A popover covers the days either side, which
//      are exactly the days you are comparing against when you ask "when am I
//      free?".
//   2. It shows the GAPS. A month grid can say what is on Wednesday; it can
//      never say "you have nothing between 2pm and 7pm", and that is the fact a
//      student actually plans revision around. Nothing else in the product says
//      it either.
//   3. It reuses the day view's own arithmetic — `layoutDay` — so an untimed
//      deadline lands at the top rather than at an invented hour, and a block's
//      length is the length the day view would draw. One source of truth for
//      what a day looks like.

import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { parseDateKey } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventTime } from "./format";
import { paintForEvent } from "@/lib/workspace/event-colors";

import { KIND_META } from "./kind-meta";
import { clockOf, layoutDay } from "./time-grid";

/**
 * The shortest emptiness worth naming, in minutes.
 *
 * 🔴 NINETY, NOT SIXTY, AND THE NUMBER IS DOING WORK. An hour between two
 * classes is walking and lunch; it is not study time, and calling it "1 hour
 * free" on every ordinary weekday would train a student to stop reading the
 * line. Ninety minutes is the shortest gap a person can actually sit down in.
 */
const GAP_MINUTES = 90;

interface DayRailProps {
  calendarHex: (calendarId: string | undefined) => string | null;
  dateKey: string;
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
  onAddOnDate: (dateKeyStr: string) => void;
  onClose: () => void;
}

export function DayRail({ calendarHex, dateKey, events, onAddOnDate, onClose, onOpenEvent }: DayRailProps) {
  const date = parseDateKey(dateKey);
  const { allDay, timed } = layoutDay(events);
  const total = allDay.length + timed.length;

  return (
    <aside className="flex w-[15rem] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary) bg-background p-3 shadow-[0_3px_12px_rgba(0,0,0,0.04)] max-lg:w-full">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.01em]">
            {date.toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long" })}
          </p>
          <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
            {total === 0 ? "Nothing scheduled" : `${total} ${total === 1 ? "event" : "events"}`}
          </p>
        </div>
        <button
          aria-label="Close this day"
          className="shrink-0 rounded px-1.5 text-base leading-none text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      {total === 0 ? (
        <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">
          The whole day is free.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {allDay.map((event) => (
            <RailRow calendarHex={calendarHex} event={event} key={event.id} onOpen={onOpenEvent} when="All day" />
          ))}
          {timed.map((item, index) => {
            // The gap is measured from the END of the previous block, which is
            // why this reads layoutDay's positions rather than the raw times:
            // a three-hour lab starting at 1pm does not leave you free at 2pm.
            const previous = timed[index - 1];
            const gap = previous ? item.startMinute - previous.endMinute : 0;
            return (
              <div className="contents" key={item.event.id}>
                {gap >= GAP_MINUTES && <FreeGap from={previous!.endMinute} to={item.startMinute} />}
                <RailRow
                  calendarHex={calendarHex}
                  event={item.event}
                  onOpen={onOpenEvent}
                  when={formatEventTime(item.event.time ?? clockOf(item.startMinute))}
                />
              </div>
            );
          })}
        </div>
      )}

      <button
        className="mt-auto shrink-0 rounded-lg border border-(--ui-stroke-tertiary) px-2 py-1.5 text-[0.6875rem] font-medium text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
        onClick={() => onAddOnDate(dateKey)}
        type="button"
      >
        Add to this day
      </button>
    </aside>
  );
}

function RailRow({
  calendarHex,
  event,
  onOpen,
  when,
}: {
  calendarHex: (calendarId: string | undefined) => string | null;
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  when: string;
}) {
  const paint = paintForEvent(event, calendarHex);
  const cancelled = event.status === "cancelled";
  // The rail has room for the line a month cell never does, so location goes here
  // rather than into a tooltip nobody hovers on a touchscreen.
  const under = [event.location, event.course].filter(Boolean).join(" · ");

  return (
    <button className="flex items-start gap-2 text-left" onClick={() => onOpen(event)} type="button">
      <span className="w-[3.25rem] shrink-0 pt-1 text-[0.625rem] tabular-nums text-(--ui-text-tertiary)">{when}</span>
      <span
        className={cn(
          "min-w-0 flex-1 rounded-md border-l-2 px-2 py-1 text-[0.6875rem] font-medium leading-tight",
          !paint && KIND_META[event.kind].block,
          cancelled && "opacity-55",
          event.status === "tentative" && "border-dashed",
        )}
        style={paint?.block}
      >
        <span className={cn("block truncate", cancelled && "line-through")}>{event.title}</span>
        {under && <span className="block truncate text-[0.625rem] opacity-70">{under}</span>}
        {cancelled && (
          <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.06em] opacity-80">Cancelled</span>
        )}
      </span>
    </button>
  );
}

/** How long you are free, in the words a person would use. */
function FreeGap({ from, to }: { from: number; to: number }) {
  const minutes = to - from;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  // Rounded to the nearest quarter of an hour and spoken, not "2h 23m": this is
  // a line you glance at to decide whether an afternoon is worth sitting down
  // for, and the exact minute count is on the two events either side of it.
  const length = rest >= 45
    ? `${hours + 1} hours`
    : rest >= 15
      ? `${hours}½ hours`
      : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return (
    <p className="pl-[3.25rem] text-[0.625rem] italic text-(--ui-text-quaternary)">
      {length} free, {formatEventTime(clockOf(from))} to {formatEventTime(clockOf(to))}
    </p>
  );
}
