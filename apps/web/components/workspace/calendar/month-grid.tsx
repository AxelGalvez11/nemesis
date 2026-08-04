// Month view — MonthGrid + DayCell, ported from desktop calendar/index.tsx §A.7.
//
// Owner 2026-07-30: clicking a day should make an event on that day, the way
// Apple Calendar does. The whole cell is the target now, so the hover-only "+"
// button that used to be the ONLY way in is gone — it was a control that
// appeared after you had already moved the mouse to where you wanted to click.

import { Popover, PopoverContent, PopoverTrigger } from "@/components/desktop-ui/popover";
import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime, MAX_CHIPS_PER_DAY, WEEKDAY_LABELS } from "./format";
import { KIND_META } from "./kind-meta";

interface MonthGridProps {
  days: MonthDay[];
  eventsByDay: Map<string, CalendarEvent[]>;
  /** A day cell was clicked — raise the quick-create card over it. */
  onPickDay: (dateKeyStr: string, anchor: DOMRect) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function MonthGrid({ days, eventsByDay, onOpenEvent, onPickDay }: MonthGridProps) {
  // monthGrid() always hands over 42 cells — six weeks — but many months fit
  // in five (or four). Rendering a whole trailing week of grey next-month days
  // was a sixth of the height the view did not need, and height is exactly
  // what "fully viewable with no scroll" (owner 2026-08-03) is short of. The
  // model stays untouched; the view just drops trailing weeks that contain no
  // day of the month. Leading weeks always contain day 1, so only the tail
  // can be all-outside.
  const weeks: MonthDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  while (weeks.length > 1 && weeks[weeks.length - 1]!.every((day) => !day.inMonth)) weeks.pop();
  const visibleDays = weeks.flat();

  return (
    // Owner 2026-08-01, again 2026-08-02: month view could not scroll. Two
    // rules on THIS div caused it. `min-h-0` lets a flex child shrink below its
    // own content, and `overflow-hidden` then swallowed whatever no longer fit
    // — so the parent's `overflow-y-auto` was never told there was more, and
    // there was nothing to scroll.
    //
    // 🔴 THE CLIP WAS HERE, NOT ON THE SCROLLER. The scroller two levels up is
    // correct and always was. This div must never carry `min-h-0` — with
    // min-height at its default `auto` it can never shrink below its rows, so
    // an oversized month grows the page and the outer scroller takes over.
    //
    // Owner 2026-08-03: "it looks too boxy... the monthly view should be fully
    // viewable in default mode (no scroll needed)". Two changes together:
    // the frame is now the app's card (rounded, elevated, hairline border)
    // instead of a bare rectangle, and the row floor came down from 6rem to
    // 4.5rem — on a 1440x727 window that is at most 6x79px + header ≈ 515px in
    // 651px of room, so a month fits with air to spare and rows stretch to
    // share whatever height the window really has.
    <div className="flex flex-1 flex-col rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
      {/* Pinned for the rare window too short even for the relaxed grid.
          Needs its own background and the frame's top radius, or it paints
          square corners over the rounded card. */}
      <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 rounded-t-[inherit] border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) text-sm font-medium text-(--ui-text-secondary)">
        {WEEKDAY_LABELS.map((label) => (
          <div className="px-3 py-2 text-right" key={label}>
            {label}
          </div>
        ))}
      </div>
      {/* The 4.5rem floor keeps rows readable when a window really is tiny —
          then, and only then, the outer scroller comes back. overflow-hidden
          here is safe (no min-h-0: the grid can grow, never shrink below its
          rows) and clips square cell-hover tints to the card's bottom radius. */}
      <div className="grid flex-1 grid-cols-7 auto-rows-[minmax(4.5rem,1fr)] overflow-hidden rounded-b-[calc(0.75rem-1px)]">
        {visibleDays.map((day) => (
          <DayCell day={day} events={eventsByDay.get(day.key) ?? []} key={day.key} onOpenEvent={onOpenEvent} onPick={onPickDay} />
        ))}
      </div>
    </div>
  );
}

interface DayCellProps {
  day: MonthDay;
  events: CalendarEvent[];
  onPick: (dateKeyStr: string, anchor: DOMRect) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

function DayCell({ day, events, onOpenEvent, onPick }: DayCellProps) {
  const visible = events.slice(0, MAX_CHIPS_PER_DAY);
  const overflow = events.length - visible.length;

  // Weekends get a quieter ground than weekdays, and days outside the month a
  // quieter one again — three steps rather than the old two, which is what
  // gives the grid a readable rhythm instead of one flat sheet of cells.
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

  return (
    <div
      className={cn(
        // Hairlines one step softer than the frame (quaternary vs tertiary):
        // 42 individually boxed cells is what read as "graph paper" (owner
        // 2026-08-03, "too boxy") — the rhythm stays, the ink goes down.
        "group relative flex flex-col gap-1 border-b border-r border-(--ui-stroke-quaternary) p-2 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
        day.inMonth && isWeekend && "bg-(--ui-bg-quaternary)/10",
        !day.inMonth && "bg-(--ui-bg-quaternary)/20",
      )}
    >
      {/* The cell itself is the create target, sitting BEHIND the day number
          and the chips. A real button, so it is reachable by keyboard too —
          the hover "+" it replaced was the only focusable way in. */}
      <button
        aria-label={`Add event on ${formatEventDate(day.key)}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-none transition-colors hover:bg-(--ui-control-hover-background)/40 focus-visible:bg-(--ui-control-hover-background)/40"
        onClick={(clickEvent) => onPick(day.key, clickEvent.currentTarget.getBoundingClientRect())}
        type="button"
      />
      <div className="relative z-10 flex shrink-0 flex-row-reverse items-center justify-between">
        <span
          className={cn(
            "pointer-events-none grid size-7 place-items-center rounded-full text-sm font-medium tabular-nums",
            day.isToday ? "bg-(--theme-primary) text-primary-foreground" : !day.inMonth && "text-(--ui-text-quaternary)",
          )}
        >
          {day.date.getDate()}
        </span>
      </div>
      {/* pointer-events-none on the COLUMN, auto on each chip: the column is
          flex-1 and fills the cell, so without this it would swallow every
          click on the empty space under the last chip — which is most of the
          cell, and exactly where people click to make an event. */}
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {visible.map((event) => (
          <button
            className={cn(
              "pointer-events-auto flex items-baseline gap-1 truncate rounded px-1.5 py-0.5 text-left text-[0.6875rem] font-medium leading-tight",
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
                className="pointer-events-auto truncate rounded px-1 py-0.5 text-left text-[0.625rem] font-medium text-muted-foreground hover:text-foreground"
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
