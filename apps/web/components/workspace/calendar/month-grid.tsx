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
  return (
    // Owner 2026-08-01, again 2026-08-02: month view could not scroll. Two
    // rules on THIS div caused it. `min-h-0` lets a flex child shrink below its
    // own content, and `overflow-hidden` then swallowed whatever no longer fit
    // — so the parent's `overflow-y-auto` was never told there was more, and
    // there was nothing to scroll.
    //
    // MEASURED on the live app, August 2026, 1440x727:
    //   before  this div 624 tall holding 766 of content  → 142px CLIPPED,
    //           scroller 651 = content 651, scrolled 0px. The last week of the
    //           month simply did not exist.
    //   after   this div 766 = its content, scroller 651 of 793 → scrolls 142.
    //
    // 🔴 THE CLIP IS HERE, NOT ON THE SCROLLER. The scroller two levels up is
    // correct and always was; it reported "nothing to scroll" because this div
    // had already hidden the overflow. Do not go looking for the bug up there.
    <div className="flex flex-1 flex-col border border-(--ui-stroke-tertiary) bg-background">
      {/* Pinned, because the month now genuinely scrolls. Without this the day
          names scroll away with the weeks and the bottom of a long month is
          seven unlabelled columns — the same complaint that put the day and
          week headings outside their own scroller. Needs its own background:
          a transparent sticky row lets the week rows slide visibly under it. */}
      <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 border-b border-(--ui-stroke-tertiary) bg-background text-sm font-medium text-(--ui-text-secondary)">
        {WEEKDAY_LABELS.map((label) => (
          <div className="px-3 py-2 text-right" key={label}>
            {label}
          </div>
        ))}
      </div>
      {/* `grid-rows-6` is repeat(6, minmax(0,1fr)) — the 0 floor lets a row
          shrink under its own cells, which is how six weeks got crushed into
          one screen. A real 6rem floor per row means a month is genuinely as
          tall as its content, and still stretches to fill a big window. */}
      <div className="grid flex-1 grid-cols-7 auto-rows-[minmax(6rem,1fr)]">
        {days.map((day) => (
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
        "group relative flex min-h-24 flex-col gap-1 border-b border-r border-(--ui-stroke-tertiary) p-2 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
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
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col gap-0.5">
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
