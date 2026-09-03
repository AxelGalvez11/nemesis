"use client";

// Month view — MonthGrid + DayCell.
//
// Owner 2026-07-30: clicking a day should make an event on that day, the way
// Apple Calendar does. The whole cell is the target, so the hover-only "+"
// button that used to be the ONLY way in is gone — it was a control that
// appeared after you had already moved the mouse to where you wanted to click.
//
// 🔴 REBUILT AGAINST GOOGLE CALENDAR (owner 2026-09-01: "i want that familiar
// google calendar feel"). Four things changed, and all four were things this
// grid did the other way round from every calendar a student has used:
//
//   1. A TIMED EVENT IS A DOT AND WORDS, not a filled pill. Three or four
//      filled pills stacked in one cell is more paint than text; that is what
//      a busy day looked like. Only an all-day deadline keeps a solid bar —
//      see drawsAsBar in kind-meta.ts.
//   2. HOW MANY FIT IS MEASURED, not the constant three. See month-cell.ts.
//   3. "+N MORE" OPENS WHAT IS HIDDEN. It used to list the whole day again —
//      the events already visible included — and drop every time while doing
//      it, so the one control for a busy day answered a question nobody asked.
//   4. THE GRID IS LAID OUT GOOGLE'S WAY: short capital weekday headings
//      centred over each column, the date at the TOP-LEFT of its cell, and no
//      weekend tint (owner: "keep weekends untinted"). Right-aligned dates and
//      a shaded weekend were Apple's layout, and most of why this did not feel
//      like the calendar people know.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";
import { type ColorPaint, paintForEvent } from "@/lib/workspace/event-colors";
import { type CellMetrics, fitEvents, orderForCell } from "@/lib/workspace/month-cell";
import { cn } from "@/lib/utils";

import { MONTH_DATE, WEEKDAY_LABEL } from "./day-numeral";
import { formatEventDate, formatEventTime, WEEKDAY_LABELS } from "./format";
import { DEFAULT_PAINT, drawsAsBar } from "./kind-meta";

interface MonthGridProps {
  days: MonthDay[];
  eventsByDay: Map<string, CalendarEvent[]>;
  /** A day cell's empty space was clicked — raise the quick-create card over it. */
  onPickDay: (dateKeyStr: string, anchor: DOMRect) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  /** The date number or a "+N more" was pressed: show this whole day in the rail. */
  onSelectDay: (dateKeyStr: string) => void;
  /** Which day the rail is currently showing, so the grid can mark it. */
  selectedKey: string | null;
  /** A calendar's colour, for the event > calendar > kind fall-through. */
  calendarHex: CalendarHex;
}

/** Resolves a calendar id to its colour, or null when it has none. */
export type CalendarHex = (calendarId: string | undefined) => string | null;

/** Short capitals, the way Google heads its columns. WEEKDAY_LABELS are "Sun",
 *  "Mon" …; uppercasing in CSS keeps one list rather than a parallel array. */
export function MonthGrid({ calendarHex, days, eventsByDay, onOpenEvent, onPickDay, onSelectDay, selectedKey }: MonthGridProps) {
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

  const metrics = useCellMetrics();

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
    // viewable in default mode (no scroll needed)". The frame is the app's card
    // (rounded, elevated, hairline border) and the row floor is 4.5rem, so a
    // month fits with air to spare and rows stretch to share the real height.
    // bg-background, NOT --ui-bg-elevated (owner 2026-08-04: "nemesis dark
    // mode is 100% black style, not gray") — elevated renders grey in dark.
    <div className="flex flex-1 flex-col rounded-xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
      {/* Pinned for the rare window too short even for the relaxed grid.
          Needs its own background and the frame's top radius, or it paints
          square corners over the rounded card. */}
      {/* 🔴 THE HEADINGS COME FROM THE GRID'S OWN FIRST WEEK, not from a
          Sunday-first constant. The week can start on Monday now, and a fixed
          list would have labelled the Monday column "Sun" — a calendar that is
          wrong about which day is which is worse than one that starts on the
          wrong day. */}
      <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 rounded-t-[inherit] border-b border-(--ui-stroke-tertiary) bg-background">
        {visibleDays.slice(0, 7).map((headDay) => (
          <div
            className={cn(
              // 🔴 GOOGLE'S OWN 11 / 500 / 20px BAND, unconverted (2026-09-03), and the SAME
              // label the week header draws — see `day-numeral.ts`. It was 12.375/600 on an 18.6px
              // line in a 32px band: bolder and larger than the reference, above a grid the owner
              // had just called too zoomed in.
              "px-2 py-[4px] text-center text-(--ui-text-tertiary)",
              WEEKDAY_LABEL,
              // Google tints only today's column heading, which is how you find
              // the current week without hunting for the filled date circle.
              visibleDays.some((day) => day.isToday && day.date.getDay() === headDay.date.getDay())
                && "text-(--theme-primary)",
            )}
            key={headDay.key}
          >
            {WEEKDAY_LABELS[headDay.date.getDay()]}
          </div>
        ))}
      </div>
      {/* The 4.5rem floor keeps rows readable when a window really is tiny —
          then, and only then, the outer scroller comes back. overflow-hidden
          here is safe (no min-h-0: the grid can grow, never shrink below its
          rows) and clips square cell-hover tints to the card's bottom radius. */}
      <div
        className="grid flex-1 grid-cols-7 auto-rows-[minmax(4.5rem,1fr)] overflow-hidden rounded-b-[calc(0.75rem-1px)]"
        ref={metrics.gridRef}
      >
        {visibleDays.map((day) => (
          <DayCell
            calendarHex={calendarHex}
            day={day}
            events={eventsByDay.get(day.key) ?? []}
            key={day.key}
            metrics={metrics.value}
            onOpenEvent={onOpenEvent}
            onPick={onPickDay}
            onSelectDay={onSelectDay}
            selected={selectedKey === day.key}
          />
        ))}
      </div>
      {/* 🔴 THE RULER, and it is why the cap is no longer a constant. One line
          and one link rendered off-screen at the grid's real text size, so the
          arithmetic in month-cell.ts is fed measurements rather than guesses.
          Settings → Appearance changes the root font size, so every one of
          these heights moves with the student's Scaling setting. */}
      <div aria-hidden className="pointer-events-none invisible absolute -z-10 w-40" ref={metrics.probeRef}>
        <EventLine calendarHex={noHex} event={PROBE_EVENT} onOpen={noop} />
        <MoreLink hidden={1} onOpen={noop} />
      </div>
    </div>
  );
}

const PROBE_EVENT: CalendarEvent = { date: "2026-01-01", id: "probe", kind: "class", title: "Probe", time: "09:00" };
function noop() {}
/** The ruler measures a line's HEIGHT; its colour cannot change that. */
const noHex: CalendarHex = () => null;

/**
 * Measures a real cell and a real line, and re-measures when either could have
 * changed.
 *
 * 🔴 A RESIZE OBSERVER RATHER THAN A CONSTANT, because BOTH inputs move: the
 * grid stretches to the window (month view is sized to need no scrolling), and
 * Settings → Appearance sets `document.documentElement.style.fontSize`, which
 * changes every rem-derived height inside the cell. A number in a file can
 * track neither.
 */
function useCellMetrics() {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState<CellMetrics>({ contentHeight: 0, lineHeight: 0, moreHeight: 0 });

  const measure = useCallback(() => {
    const grid = gridRef.current;
    const probe = probeRef.current;
    if (!grid || !probe) return;
    const cell = grid.firstElementChild as HTMLElement | null;
    const stack = cell?.querySelector<HTMLElement>("[data-cell-stack]");
    const line = probe.children[0] as HTMLElement | undefined;
    const more = probe.children[1] as HTMLElement | undefined;
    if (!stack || !line || !more) return;
    const next: CellMetrics = {
      // The stack IS the space events may use — the day-number row and the
      // cell's padding are already outside it, so nothing has to be subtracted
      // here and no padding constant has to be kept in step with the classes.
      contentHeight: stack.clientHeight,
      // +2px for the `gap-0.5` between stacked lines (0.125rem at an 18px root).
      lineHeight: line.offsetHeight + 2,
      moreHeight: more.offsetHeight + 2,
    };
    setValue((current) =>
      current.contentHeight === next.contentHeight
      && current.lineHeight === next.lineHeight
      && current.moreHeight === next.moreHeight
        ? current
        : next,
    );
  }, []);

  // Once after mount, so the first paint is not left on the "show everything"
  // fallback. Empty deps: re-running this on every render is the other half of
  // the loop the absolute positioning above describes.
  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    // The probe too: its height is what changes when Settings → Appearance
    // changes the text size, and a scaling change need not resize the grid.
    if (probeRef.current) observer.observe(probeRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return { gridRef, probeRef, value };
}

interface DayCellProps {
  calendarHex: CalendarHex;
  day: MonthDay;
  events: CalendarEvent[];
  metrics: CellMetrics;
  onPick: (dateKeyStr: string, anchor: DOMRect) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onSelectDay: (dateKeyStr: string) => void;
  selected: boolean;
}

function DayCell({ calendarHex, day, events, metrics, onOpenEvent, onPick, onSelectDay, selected }: DayCellProps) {
  const ordered = orderForCell(events);
  const fit = fitEvents(ordered.length, metrics);

  return (
    <div
      className={cn(
        // Hairlines one step softer than the frame (quaternary vs tertiary):
        // 42 individually boxed cells is what read as "graph paper" (owner
        // 2026-08-03, "too boxy") — the rhythm stays, the ink goes down.
        // 🔴🔴 `p-1 gap-0.5`, AND IT WAS `p-2 gap-1` — 18px of padding and a 9px gap, which is
        // 27px of a 142px cell spent before a single event is drawn. Google's month cell has NO
        // padding at all (its chips run the full width and carry their own 8px right inset); ours
        // keeps 4.5px because our chips have a radius and a colour dot and would otherwise touch
        // the rule. Measured after: the stack a cell gives its events went 87px -> 107px, which is
        // the fourth event appearing where "+2 more" used to be. Owner, 2026-09-03: *"it feels a
        // bit big, especially when you have a lot of events."*
        "group relative flex flex-col gap-0.5 border-b border-r border-(--ui-stroke-quaternary) p-1 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
        // Days outside the month stay quieter. Weekends do NOT — owner
        // 2026-09-01, and Google does not tint them either.
        !day.inMonth && "bg-(--ui-bg-quaternary)/20",
        selected && "ring-1 ring-inset ring-(--theme-primary)",
      )}
    >
      {/* The cell itself is the create target, sitting BEHIND the day number
          and the events. A real button, so it is reachable by keyboard too —
          the hover "+" it replaced was the only focusable way in. */}
      <button
        aria-label={`Add event on ${formatEventDate(day.key)}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-none transition-colors hover:bg-(--ui-control-hover-background)/40 focus-visible:bg-(--ui-control-hover-background)/40"
        onClick={(clickEvent) => onPick(day.key, clickEvent.currentTarget.getBoundingClientRect())}
        type="button"
      />
      <div className="relative z-10 flex shrink-0 items-center">
        {/* 🔴 THE DATE IS A BUTTON NOW, which is what it is in Google: pressing
            it opens that day. Here it fills the rail beside the grid. The
            cell's own empty space still makes an event, so neither gesture
            took the other's job. */}
        <button
          aria-label={`Show ${formatEventDate(day.key)}`}
          className={cn(
            // 🔴 12px IN A 24px DISC, WHICH IS GOOGLE'S AND ALSO THE MIDDLE RUNG OF THE RAMP IN
            // `day-numeral.ts`. It was `text-sm` in `size-7` — 15.75px in a 31.5px circle, a third
            // larger than the reference and the loudest thing on the surface. Google draws no disc
            // at all except on today; ours keeps one because it is also the hover target for
            // opening the day.
            "grid cursor-pointer place-items-center rounded-full font-medium tabular-nums transition-colors",
            MONTH_DATE.disc,
            MONTH_DATE.text,
            day.isToday
              ? "bg-(--theme-primary) text-primary-foreground"
              : cn("hover:bg-(--ui-control-hover-background)", !day.inMonth && "text-(--ui-text-quaternary)"),
          )}
          onClick={() => onSelectDay(day.key)}
          type="button"
        >
          {day.date.getDate()}
        </button>
      </div>
      {/* 🔴 THE LIST IS ABSOLUTELY POSITIONED, AND THAT IS LOAD-BEARING, NOT
          STYLING. How many lines fit is measured from this box; if the lines
          were in flow they would contribute to the cell's height, the cell to
          the row's, and the row back to this box — so drawing one more line
          would make room for one more line. That is a real feedback loop and it
          crashed the page with "Maximum update depth exceeded" the first time
          this was built in flow. Out of flow, the cell's height depends only on
          the date row and the padding, and the measurement is stable.

          pointer-events-none on the LIST, auto on each line: it covers the
          whole cell, so without this it would swallow every click on the empty
          space under the last event — which is most of the cell, and exactly
          where people click to make one. */}
      <div className="relative z-10 min-h-0 flex-1" data-cell-stack>
        <div className="pointer-events-none absolute inset-0 flex flex-col gap-0.5 overflow-hidden">
          {ordered.slice(0, fit.show).map((event) => (
            <EventLine calendarHex={calendarHex} event={event} key={event.id} onOpen={onOpenEvent} />
          ))}
          {fit.hidden > 0 && <MoreLink hidden={fit.hidden} onOpen={() => onSelectDay(day.key)} />}
        </div>
      </div>
    </div>
  );
}

/**
 * One event on a month cell.
 *
 * A timed event is a coloured dot, its time and its name on the bare cell —
 * Google's own treatment, and the reason six events in a day stay readable.
 * An all-day deadline is a solid bar instead: see drawsAsBar.
 */
function EventLine({
  calendarHex,
  event,
  onOpen,
}: {
  calendarHex: CalendarHex;
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
}) {
  const meta = DEFAULT_PAINT;
  // Event colour, then the calendar's, then the kind's own classes. Inline
  // because the value is data — see event-colors.ts.
  const paint: ColorPaint | null = paintForEvent(event, calendarHex);
  // 🔴 A CANCELLED EVENT IS SHOWN, NOT HIDDEN. "Cancelled" is information: a
  // student looking at Tuesday needs to know the lecture WAS there and is off,
  // which is the opposite of the row quietly disappearing. Struck through and
  // faded is how every calendar says it.
  const cancelled = event.status === "cancelled";
  const tentative = event.status === "tentative";

  if (drawsAsBar(event.time)) {
    return (
      <button
        className={cn(
          "pointer-events-auto flex items-baseline gap-1 rounded px-1.5 py-0.5 text-left text-[0.6875rem] font-semibold leading-tight",
          !paint && meta.bar,
          cancelled && "line-through opacity-50",
          // A dashed edge on a tentative item, the way a provisional booking
          // reads: present, and not yet a promise.
          tentative && "border border-dashed border-current",
        )}
        onClick={() => onOpen(event)}
        style={paint?.bar}
        title={eventTitleHint(event)}
        type="button"
      >
        {event.time && <span className="shrink-0 tabular-nums font-medium opacity-80">{formatEventTime(event.time)}</span>}
        <span className="truncate">{event.title}</span>
      </button>
    );
  }

  return (
    <button
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-[0.6875rem] leading-tight text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)",
        cancelled && "line-through opacity-50",
      )}
      onClick={() => onOpen(event)}
      title={eventTitleHint(event)}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          !paint && meta.dot,
          tentative && "opacity-50 ring-1 ring-current",
        )}
        style={paint?.dot}
      />
      <span className="shrink-0 tabular-nums text-(--ui-text-tertiary)">{formatEventTime(event.time ?? "")}</span>
      <span className="truncate font-medium">{event.title}</span>
    </button>
  );
}

/** The hover text: the time, the title, and the two facts a glance cannot show. */
function eventTitleHint(event: CalendarEvent): string {
  const parts = [formatEventTime(event.time ?? ""), event.title].filter(Boolean);
  let hint = parts.join(" ").trim();
  if (event.location) hint += ` · ${event.location}`;
  if (event.status === "cancelled") hint += " · Cancelled";
  if (event.status === "tentative") hint += " · Tentative";
  return hint;
}

function MoreLink({ hidden, onOpen }: { hidden: number; onOpen: () => void }) {
  return (
    <button
      className="pointer-events-auto truncate rounded px-1 py-0.5 text-left text-[0.625rem] font-semibold text-muted-foreground hover:bg-(--ui-control-hover-background) hover:text-foreground"
      onClick={onOpen}
      type="button"
    >
      +{hidden} more
    </button>
  );
}
