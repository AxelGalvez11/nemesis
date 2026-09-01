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
//      plus exams, see drawsAsBar in kind-meta.ts.
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
import { type CellMetrics, fitEvents, orderForCell } from "@/lib/workspace/month-cell";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime, WEEKDAY_LABELS } from "./format";
import { drawsAsBar, KIND_META } from "./kind-meta";

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
}

/** Short capitals, the way Google heads its columns. WEEKDAY_LABELS are "Sun",
 *  "Mon" …; uppercasing in CSS keeps one list rather than a parallel array. */
export function MonthGrid({ days, eventsByDay, onOpenEvent, onPickDay, onSelectDay, selectedKey }: MonthGridProps) {
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
      <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 rounded-t-[inherit] border-b border-(--ui-stroke-tertiary) bg-background">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            className={cn(
              "px-2 py-1.5 text-center text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-(--ui-text-tertiary)",
              // Google tints only today's column heading, which is how you find
              // the current week without hunting for the filled date circle.
              visibleDays.some((day) => day.isToday && day.date.getDay() === index) && "text-(--theme-primary)",
            )}
            key={label}
          >
            {label}
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
        <EventLine event={PROBE_EVENT} onOpen={noop} />
        <MoreLink hidden={1} onOpen={noop} />
      </div>
    </div>
  );
}

const PROBE_EVENT: CalendarEvent = { date: "2026-01-01", id: "probe", kind: "class", title: "Probe", time: "09:00" };
function noop() {}

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
  day: MonthDay;
  events: CalendarEvent[];
  metrics: CellMetrics;
  onPick: (dateKeyStr: string, anchor: DOMRect) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onSelectDay: (dateKeyStr: string) => void;
  selected: boolean;
}

function DayCell({ day, events, metrics, onOpenEvent, onPick, onSelectDay, selected }: DayCellProps) {
  const ordered = orderForCell(events);
  const fit = fitEvents(ordered.length, metrics);

  return (
    <div
      className={cn(
        // Hairlines one step softer than the frame (quaternary vs tertiary):
        // 42 individually boxed cells is what read as "graph paper" (owner
        // 2026-08-03, "too boxy") — the rhythm stays, the ink goes down.
        "group relative flex flex-col gap-1 border-b border-r border-(--ui-stroke-quaternary) p-2 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
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
            "grid size-7 cursor-pointer place-items-center rounded-full text-sm font-medium tabular-nums transition-colors",
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
            <EventLine event={event} key={event.id} onOpen={onOpenEvent} />
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
 * An all-day deadline (and every exam) is a solid bar instead: see drawsAsBar.
 */
function EventLine({ event, onOpen }: { event: CalendarEvent; onOpen: (event: CalendarEvent) => void }) {
  const meta = KIND_META[event.kind];

  if (drawsAsBar(event.kind, event.time)) {
    return (
      <button
        className={cn(
          "pointer-events-auto flex items-baseline gap-1 rounded px-1.5 py-0.5 text-left text-[0.6875rem] font-semibold leading-tight",
          meta.bar,
        )}
        onClick={() => onOpen(event)}
        title={event.title}
        type="button"
      >
        {event.time && <span className="shrink-0 tabular-nums font-medium opacity-80">{formatEventTime(event.time)}</span>}
        <span className="truncate">{event.title}</span>
      </button>
    );
  }

  return (
    <button
      className="pointer-events-auto flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-[0.6875rem] leading-tight text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
      onClick={() => onOpen(event)}
      title={`${formatEventTime(event.time ?? "")} ${event.title}`.trim()}
      type="button"
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      <span className="shrink-0 tabular-nums text-(--ui-text-tertiary)">{formatEventTime(event.time ?? "")}</span>
      <span className="truncate font-medium">{event.title}</span>
    </button>
  );
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
