"use client";

// Calendar — verbatim from desktop calendar/index.tsx §A.4–A.13, since cloud-
// first phone (2026-07-20 §5) now backed by `calendar_events` cloud rows, with
// localStorage as an offline/warm cache (see lib/workspace/calendar-model.ts).
// Four view modes (Day/Week/Month/Year) plus an always-present Agenda rail.
// View mode persists to localStorage["nemesis.calendar.view"] (unrelated to
// the event data itself, still local-only by design).

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  type CalendarEvent,
  type CalendarEventKind,
  dateKey,
  deleteCalendarEvent,
  eventsByDate,
  loadCalendarEvents,
  localeWeekStart,
  monthGrid,
  saveCalendarEvent,
  weekGrid,
  WEEK_START_STORAGE_KEY,
  type WeekStart,
} from "@/lib/workspace/calendar-model";

import {
  type Calendar,
  calendarList,
  deleteCalendar,
  hiddenCalendarIds,
  loadCalendars,
  PRIMARY_CALENDAR,
  saveCalendar,
} from "@/lib/workspace/calendars";
import {
  CALENDAR_FILTER_STORAGE_KEY,
  parseHiddenKinds,
  serializeHiddenKinds,
  visibleEvents,
} from "@/lib/workspace/calendar-filter";

import { CalendarHeader } from "./calendar-header";
import { calendarColorOf } from "@/lib/workspace/calendar-colors";

import { CalendarList } from "./calendar-list";
import { DayRail } from "./day-rail";
import { type EventDraft, EventFormDialog } from "./event-dialogs";
import { CALENDAR_VIEW_STORAGE_KEY, isCalendarViewMode, type CalendarViewMode } from "./format";
import { MonthGrid } from "./month-grid";
import { type AnchorRect, QuickCreatePopover, type QuickCreateDraft } from "./quick-create-popover";
import { TimeGridView } from "./time-grid-view";
import type { GestureResult } from "./use-time-grid-gestures";
import { YearGrid } from "./year-grid";

type DialogState =
  | { mode: "add"; draft: EventDraft }
  | { mode: "edit"; event: CalendarEvent }
  | null;

/** The quick-create card and where it hangs. Lives up here rather than inside
 *  each grid so month and week raise the same card, and "Details" can hand off
 *  to the dialog that is already a sibling of it. */
interface QuickCreateState {
  draft: QuickCreateDraft;
  anchor: AnchorRect;
}

function loadStoredView(): CalendarViewMode {
  if (typeof window === "undefined") return "month";
  const raw = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
  return isCalendarViewMode(raw) ? raw : "month";
}

export function CalendarWorkspace() {
  const { session } = useAuth();
  const preview = useWorkspacePreview() !== null;
  const userId = session?.user.id ?? null;
  const today = useMemo(() => new Date(), []);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<CalendarViewMode>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  /** Kinds the student has switched OFF. Empty by default, so a category added
   *  later is visible rather than silently filtered out — see calendar-filter.ts. */
  const [hiddenKinds, setHiddenKinds] = useState<Set<CalendarEventKind>>(() => new Set());
  /**
   * The day opened out beside the month grid, or null for none.
   *
   * 🔴 A DATE KEY, NOT AN EVENT LIST, so the rail re-reads `byDate` on every
   * change. Holding the events themselves would show a stale day the moment one
   * was added, edited or deleted from the rail — which is precisely where they
   * are edited from.
   */
  const [railKey, setRailKey] = useState<string | null>(null);
  /** The student's own calendars. The primary one is never in here — see calendars.ts. */
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  /** Whether the primary calendar's own tick box is off. Tab-local, not stored. */
  const [primaryHidden, setPrimaryHidden] = useState(false);
  /**
   * Sunday or Monday. Read after mount only: the server has no locale and no
   * localStorage, and a grid that starts on a different day on the server than
   * in the browser is a hydration mismatch that throws the whole tree away.
   */
  const [weekStart, setWeekStart] = useState<WeekStart>(0);

  // View mode: read from storage only after mount (SSR has no localStorage).
  // Also honour ?date= — the link every agent-written event carries. Without
  // this the calendar always opened on the current month, so the artifact card
  // for a Spring syllabus dropped the student four months away from the events
  // it claimed to link to (owner 2026-07-27: the card must route to the thing).
  useEffect(() => {
    setMounted(true);
    setView(loadStoredView());
    const stored = window.localStorage.getItem(WEEK_START_STORAGE_KEY);
    setWeekStart(stored === "0" || stored === "1" ? (Number(stored) as WeekStart) : localeWeekStart());
    setHiddenKinds(parseHiddenKinds(window.localStorage.getItem(CALENDAR_FILTER_STORAGE_KEY)));
    const requested = new URLSearchParams(window.location.search).get("date");
    const parsed = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? new Date(`${requested}T12:00:00`) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) setCursor(parsed);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
  }, [mounted, view]);

  // Events: cloud-aware load (preview/signed-out stay pure-local — see
  // calendar-model.ts) drives the Agenda's "Loading…" state until the first
  // read completes. Re-runs if the session resolves after mount (userId flips
  // from null to a real id) or preview status changes.
  useEffect(() => {
    let cancelled = false;
    loadCalendarEvents({ userId, preview }).then((state) => {
      if (cancelled) return;
      setEvents(state.events);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, preview]);

  /** Everything downstream — month chips, the week grid, the agenda — reads
   *  this, so a hidden kind disappears from every view at once rather than from
   *  whichever one remembered to filter. */
  useEffect(() => {
    let cancelled = false;
    loadCalendars({ preview, userId }).then((next) => {
      if (!cancelled) setCalendars(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, preview]);

  const allCalendars = useMemo(() => calendarList(calendars), [calendars]);
  const hiddenCalendars = useMemo(() => hiddenCalendarIds(calendars), [calendars]);

  /** Event colour, then calendar colour, then the kind's own — see event-colors.ts. */
  const calendarHex = useCallback(
    (calendarId: string | undefined) =>
      calendarColorOf(calendars.find((entry) => entry.id === calendarId)?.colorId)?.hex ?? null,
    [calendars],
  );

  async function changeCalendar(next: Calendar) {
    // 🔴 THE PRIMARY CALENDAR IS NOT A ROW, so its own tick box and colour live
    // only in this tab. Writing it would create a calendar nothing points at and
    // leave every existing event still pointing at null.
    setCalendars((current) =>
      next.id === PRIMARY_CALENDAR.id
        ? current
        : current.some((entry) => entry.id === next.id)
          ? current.map((entry) => (entry.id === next.id ? next : entry))
          : [...current, next],
    );
    if (next.id === PRIMARY_CALENDAR.id) {
      setPrimaryHidden(next.hidden ?? false);
      return;
    }
    await saveCalendar(next, { preview, userId });
  }

  async function removeCalendar(id: string) {
    setCalendars((current) => current.filter((entry) => entry.id !== id));
    // The events survive and fall back to the primary calendar: the column is
    // ON DELETE SET NULL, and null already means primary.
    setEvents((current) => current.map((event) => (event.calendarId === id ? { ...event, calendarId: undefined } : event)));
    await deleteCalendar(id, { preview, userId });
  }

  const shownEvents = useMemo(() => {
    const byKind = visibleEvents(events, hiddenKinds);
    return byKind.filter((event) =>
      event.calendarId ? !hiddenCalendars.has(event.calendarId) : !primaryHidden,
    );
  }, [events, hiddenKinds, hiddenCalendars, primaryHidden]);
  const byDate = useMemo(() => eventsByDate(shownEvents), [shownEvents]);

  function changeHiddenKinds(next: Set<CalendarEventKind>) {
    setHiddenKinds(next);
    try {
      window.localStorage.setItem(CALENDAR_FILTER_STORAGE_KEY, serializeHiddenKinds(next));
    } catch {
      // best-effort; the filter still applies for this session
    }
  }
  const monthDays = useMemo(
    () => monthGrid(cursor.getFullYear(), cursor.getMonth(), today, weekStart),
    [cursor, today, weekStart],
  );
  const weekDays = useMemo(() => weekGrid(cursor, today, weekStart), [cursor, today, weekStart]);
  // Day view is the same grid with one column, so it takes the same shape.
  const dayColumn = useMemo(
    () => [{ date: cursor, inMonth: true, isToday: dateKey(cursor) === dateKey(today), key: dateKey(cursor) }],
    [cursor, today],
  );

  function goStep(delta: 1 | -1) {
    setCursor((prev) => {
      if (view === "day") return addDays(prev, delta);
      if (view === "week") return addWeeks(prev, delta);
      if (view === "year") return addYears(prev, delta);
      return addMonths(prev, delta);
    });
  }

  function openAdd(dateKeyStr: string) {
    setDialog({ draft: { date: dateKeyStr }, mode: "add" });
  }

  /** A slot was clicked or dragged out on the time grid. */
  function pickSlot(result: GestureResult, anchor: DOMRect) {
    setDialog(null);
    setQuickCreate({
      anchor: { height: anchor.height, left: anchor.left, top: anchor.top, width: anchor.width },
      draft: { date: result.dateKey, endTime: result.range.endTime, time: result.range.time },
    });
  }

  /** A month cell was clicked. No time — a month grid cannot say one, and
   *  inventing 9am for a deadline is how a calendar starts lying. */
  function pickDay(dateKeyStr: string, anchor: DOMRect) {
    setDialog(null);
    setQuickCreate({
      anchor: { height: anchor.height, left: anchor.left, top: anchor.top, width: anchor.width },
      draft: { date: dateKeyStr },
    });
  }

  /**
   * An event was dragged to a new time, day, or length.
   *
   * A recurring event is left alone: `recurrence` describes a whole series, and
   * dragging one of its instances would silently move every other one too. The
   * form is where a series gets edited, so the drag simply does not commit.
   */
  async function handleGridMove(event: CalendarEvent, result: GestureResult) {
    if (event.recurrence) return;
    if (event.date === result.dateKey && event.time === result.range.time && event.endTime === result.range.endTime) {
      return;
    }
    const next: CalendarEvent = {
      ...event,
      date: result.dateKey,
      endTime: result.range.endTime,
      time: result.range.time,
    };
    // Paint the new position immediately; the save catches up. A calendar that
    // waits for a round trip before the block lands feels like it dropped it.
    setEvents((prev) => prev.map((row) => (row.id === next.id ? next : row)));
    try {
      const stored = await saveCalendarEvent(next, { preview, userId });
      setEvents((prev) => prev.map((row) => (row.id === stored.id ? stored : row)));
    } catch {
      // Put it back where it was rather than leaving the student looking at a
      // position that was never written.
      setEvents((prev) => prev.map((row) => (row.id === event.id ? event : row)));
    }
  }

  // EVERY event opens the editable form, whoever wrote it. This used to send a
  // source:'agent' row to a read-only dialog whose advice was "ask it to change
  // this" — advice nobody could act on, since AGENT_TOOLS has no update or
  // delete tool. Chat stopped writing that marker on 2026-07-28, but rows
  // written before then still carry it, so the fix has to be on the read side
  // too or those stay frozen forever.
  function openEvent(event: CalendarEvent) {
    const original = event.seriesId ? events.find((candidate) => candidate.id === event.seriesId) : event;
    setDialog({ mode: "edit", event: original ?? event });
  }

  function openMonth(year: number, month: number) {
    setCursor(new Date(year, month, 1));
    setView("month");
  }

  // Per-event cloud write (see lib/workspace/calendar-model.ts) — errors
  // propagate to EventFormDialog's own try/catch, which shows them inline.
  async function handleSave(saved: CalendarEvent) {
    const stored = await saveCalendarEvent(saved, { userId, preview });
    setEvents((prev) => [...prev.filter((e) => e.id !== stored.id), stored]);
    setDialog(null);
  }

  async function handleDelete(id: string) {
    await deleteCalendarEvent(id, { userId, preview });
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setDialog(null);
  }

  // Syllabus import goes through the SAME per-event save path as a hand-made
  // event, so imported rows get identical validation and land as source:
  // 'manual'. Every event is editable and deletable now, whatever wrote it.
  // Written one at a time so a single bad row cannot lose the whole import.
  async function handleImport(imported: CalendarEvent[]) {
    // Refuse here rather than trusting the disabled button in SyllabusDialog.
    // In preview, saveCalendarEvent writes to the UNSCOPED legacy localStorage
    // key — the one migrateLocalCalendarToCloud claims and uploads for the
    // first account that later signs in on this browser. A guard two
    // components away is not where that should be prevented.
    if (preview || !userId) throw new Error("Sign in to import a syllabus.");

    const saved: CalendarEvent[] = [];
    const failures: string[] = [];
    for (const event of imported) {
      try {
        saved.push(await saveCalendarEvent(event, { userId, preview }));
      } catch {
        failures.push(event.title);
      }
    }
    if (saved.length > 0) {
      setEvents((prev) => [...prev.filter((e) => !saved.some((row) => row.id === e.id)), ...saved]);
    }
    if (failures.length > 0) {
      throw new Error(
        `Added ${saved.length}, but couldn't add: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""}`,
      );
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background) pt-(--titlebar-height)">
      {/* Does NOT scroll. It used to, which meant the toolbar and the day
          headings slid away with the hours. Day and week now scroll inside
          their own grid; month and year scroll here, below. */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 px-5 pb-1 max-sm:px-2">
          <CalendarList
            calendars={allCalendars.map((entry) =>
              entry.id === PRIMARY_CALENDAR.id ? { ...entry, hidden: primaryHidden } : entry,
            )}
            onCreate={(name) => void changeCalendar({ id: crypto.randomUUID(), name })}
            onDelete={(id) => void removeCalendar(id)}
            onSave={(next) => void changeCalendar(next)}
            onToggleHidden={(entry) => void changeCalendar({ ...entry, hidden: !entry.hidden })}
          />
          {/* 🔴 A CONTROL, NOT JUST A LOCALE GUESS. The browser's answer is right
              for most people and wrong for the student who moved country, keeps
              their timetable the other way round, or simply prefers it. Stored
              per device, like the view mode beside it. */}
          <button
            className="rounded-lg border border-(--ui-stroke-secondary) px-2.5 py-1 text-xs font-medium text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
            onClick={() => {
              const next: WeekStart = weekStart === 0 ? 1 : 0;
              setWeekStart(next);
              try {
                window.localStorage.setItem(WEEK_START_STORAGE_KEY, String(next));
              } catch {
                // Private mode: the choice still holds for this session.
              }
            }}
            title="Which day the week starts on"
            type="button"
          >
            Starts {weekStart === 0 ? "Sunday" : "Monday"}
          </button>
        </div>
        <CalendarHeader
          cursor={cursor}
          hiddenKinds={hiddenKinds}
          onAddEvent={openAdd}
          onChangeHiddenKinds={changeHiddenKinds}
          onChangeView={setView}
          onStep={goStep}
          onToday={() => setCursor(new Date())}
          today={today}
          view={view}
        />
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col px-5 pb-5 max-sm:px-2 max-sm:pb-2",
            // Month and year are one page-sized picture and scroll as a whole.
            // Day and week must NOT scroll here — their grid scrolls itself,
            // and a second scrollbar out here would drag the day headings off.
            (view === "month" || view === "year") && "overflow-y-auto",
          )}
        >
          {/* Day and Week are the same time grid with a different column count
              — they were near-duplicate components before, so every fix had to
              be made twice. */}
          {view === "day" && (
            <TimeGridView
              calendarHex={calendarHex}
              days={dayColumn}
              eventsByDay={byDate}
              onAddOnDate={openAdd}
              onMoveEvent={handleGridMove}
              onOpenEvent={openEvent}
              onPickSlot={pickSlot}
            />
          )}
          {view === "week" && (
            <TimeGridView
              calendarHex={calendarHex}
              days={weekDays}
              eventsByDay={byDate}
              onAddOnDate={openAdd}
              onMoveEvent={handleGridMove}
              onOpenEvent={openEvent}
              onPickSlot={pickSlot}
            />
          )}
          {view === "month" && (
            // 🔴 THE RAIL IS A SIBLING OF THE GRID, NOT AN OVERLAY (owner
            // 2026-09-01, Option B). A popover covers the days either side —
            // exactly the days you compare against when deciding when to study.
            // Below `lg` it stacks under the grid instead, because 15rem of a
            // narrow window is most of the month.
            <div className="flex min-h-0 flex-1 gap-3 max-lg:flex-col">
              <MonthGrid
                calendarHex={calendarHex}
                days={monthDays}
                eventsByDay={byDate}
                onOpenEvent={openEvent}
                onPickDay={pickDay}
                onSelectDay={setRailKey}
                selectedKey={railKey}
              />
              {railKey && (
                <DayRail
                  calendarHex={calendarHex}
                  dateKey={railKey}
                  events={byDate.get(railKey) ?? []}
                  onAddOnDate={openAdd}
                  onClose={() => setRailKey(null)}
                  onOpenEvent={openEvent}
                />
              )}
            </div>
          )}
          {view === "year" && (
            <YearGrid eventsByDay={byDate} onSelectMonth={openMonth} today={today} weekStart={weekStart} year={cursor.getFullYear()} />
          )}
        </div>
      </div>

      {quickCreate && (
        <QuickCreatePopover
          anchor={quickCreate.anchor}
          draft={quickCreate.draft}
          onCancel={() => setQuickCreate(null)}
          onCreate={async (created) => {
            await handleSave(created);
            setQuickCreate(null);
          }}
          onOpenDetails={(draft, title, kind) => {
            setQuickCreate(null);
            setDialog({ draft: { ...draft, kind, ...(title.trim() ? { title: title.trim() } : {}) }, mode: "add" });
          }}
        />
      )}

      {dialog?.mode === "add" && (
        <EventFormDialog calendars={allCalendars} draft={dialog.draft} mode="add" onClose={() => setDialog(null)} onSave={handleSave} />
      )}
      {dialog?.mode === "edit" && (
        <EventFormDialog
          calendars={allCalendars}
          event={dialog.event}
          mode="edit"
          onClose={() => setDialog(null)}
          onDelete={() => handleDelete(dialog.event.id)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
