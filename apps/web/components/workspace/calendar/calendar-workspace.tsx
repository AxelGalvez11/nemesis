"use client";

// Calendar — verbatim from desktop calendar/index.tsx §A.4–A.13, since cloud-
// first phone (2026-07-20 §5) now backed by `calendar_events` cloud rows, with
// localStorage as an offline/warm cache (see lib/workspace/calendar-model.ts).
// Four view modes (Day/Week/Month/Year) plus an always-present Agenda rail.
// View mode persists to localStorage["nemesis.calendar.view"] (unrelated to
// the event data itself, still local-only by design).

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  type CalendarEvent,
  dayEvents,
  deleteCalendarEvent,
  eventsByDate,
  loadCalendarEvents,
  monthGrid,
  saveCalendarEvent,
  upcomingEvents,
  weekGrid,
} from "@/lib/workspace/calendar-model";

import { Agenda } from "./agenda";
import { CalendarHeader } from "./calendar-header";
import { DayPanel } from "./day-panel";
import { EventFormDialog, EventViewDialog } from "./event-dialogs";
import { AGENDA_WINDOW_DAYS, CALENDAR_VIEW_STORAGE_KEY, isCalendarViewMode, type CalendarViewMode } from "./format";
import { MonthGrid } from "./month-grid";
import { SyllabusDialog } from "./syllabus-dialog";
import { WeekGrid } from "./week-grid";
import { YearGrid } from "./year-grid";

type DialogState =
  | { mode: "add"; date: string }
  | { mode: "edit"; event: CalendarEvent }
  | { mode: "view"; event: CalendarEvent }
  | null;

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
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [syllabusOpen, setSyllabusOpen] = useState(false);

  // View mode: read from storage only after mount (SSR has no localStorage).
  useEffect(() => {
    setMounted(true);
    setView(loadStoredView());
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
    setLoaded(false);
    loadCalendarEvents({ userId, preview }).then((state) => {
      if (cancelled) return;
      setEvents(state.events);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, preview]);

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const upcoming = useMemo(() => upcomingEvents(events, today, AGENDA_WINDOW_DAYS), [events, today]);
  const monthDays = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth(), today), [cursor, today]);
  const weekDays = useMemo(() => weekGrid(cursor, today), [cursor, today]);

  function goStep(delta: 1 | -1) {
    setCursor((prev) => {
      if (view === "day") return addDays(prev, delta);
      if (view === "week") return addWeeks(prev, delta);
      if (view === "year") return addYears(prev, delta);
      return addMonths(prev, delta);
    });
  }

  function openAdd(dateKeyStr: string) {
    setDialog({ mode: "add", date: dateKeyStr });
  }

  function openEvent(event: CalendarEvent) {
    setDialog(event.source === "agent" ? { mode: "view", event } : { mode: "edit", event });
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
  // 'manual' — editable and deletable, unlike agent-written events which the
  // UI routes to a read-only dialog with no way out (see event-dialogs.tsx).
  // Written one at a time so a single bad row cannot lose the whole import.
  async function handleImport(imported: CalendarEvent[]) {
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
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <CalendarHeader
          cursor={cursor}
          onAddEvent={openAdd}
          onChangeView={setView}
          onImportSyllabus={() => setSyllabusOpen(true)}
          onStep={goStep}
          today={today}
          view={view}
        />
        <div className="grid flex-1 grid-cols-1 gap-4 px-6 pb-8 max-sm:px-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {view === "day" && (
            <DayPanel
              date={cursor}
              events={dayEvents(events, cursor)}
              onAddOnDate={openAdd}
              onOpenEvent={openEvent}
              today={today}
            />
          )}
          {view === "week" && (
            <WeekGrid days={weekDays} eventsByDay={byDate} onAddOnDate={openAdd} onOpenEvent={openEvent} />
          )}
          {view === "month" && (
            <MonthGrid days={monthDays} eventsByDay={byDate} onAddOnDate={openAdd} onOpenEvent={openEvent} />
          )}
          {view === "year" && (
            <YearGrid eventsByDay={byDate} onSelectMonth={openMonth} today={today} year={cursor.getFullYear()} />
          )}
          <Agenda events={upcoming} hasAnyEvents={events.length > 0} loaded={loaded} onOpenEvent={openEvent} />
        </div>
      </div>

      {syllabusOpen && (
        <SyllabusDialog onClose={() => setSyllabusOpen(false)} onImport={handleImport} uid={preview ? null : userId} />
      )}

      {dialog?.mode === "view" && <EventViewDialog event={dialog.event} onClose={() => setDialog(null)} />}
      {dialog?.mode === "add" && (
        <EventFormDialog initialDate={dialog.date} mode="add" onClose={() => setDialog(null)} onSave={handleSave} />
      )}
      {dialog?.mode === "edit" && (
        <EventFormDialog
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
