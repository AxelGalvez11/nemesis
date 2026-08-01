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
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  type CalendarEvent,
  dateKey,
  deleteCalendarEvent,
  eventsByDate,
  loadCalendarEvents,
  monthGrid,
  saveCalendarEvent,
  weekGrid,
} from "@/lib/workspace/calendar-model";

import { CalendarHeader } from "./calendar-header";
import { type EventDraft, EventFormDialog } from "./event-dialogs";
import { CALENDAR_VIEW_STORAGE_KEY, isCalendarViewMode, type CalendarViewMode } from "./format";
import { MonthGrid } from "./month-grid";
import { type AnchorRect, QuickCreatePopover, type QuickCreateDraft } from "./quick-create-popover";
import { SyllabusDialog } from "./syllabus-dialog";
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
  const [syllabusOpen, setSyllabusOpen] = useState(false);

  // View mode: read from storage only after mount (SSR has no localStorage).
  // Also honour ?date= — the link every agent-written event carries. Without
  // this the calendar always opened on the current month, so the artifact card
  // for a Spring syllabus dropped the student four months away from the events
  // it claimed to link to (owner 2026-07-27: the card must route to the thing).
  useEffect(() => {
    setMounted(true);
    setView(loadStoredView());
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

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const monthDays = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth(), today), [cursor, today]);
  const weekDays = useMemo(() => weekGrid(cursor, today), [cursor, today]);
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
        <CalendarHeader
          cursor={cursor}
          onAddEvent={openAdd}
          onChangeView={setView}
          onImportSyllabus={() => setSyllabusOpen(true)}
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
              days={weekDays}
              eventsByDay={byDate}
              onAddOnDate={openAdd}
              onMoveEvent={handleGridMove}
              onOpenEvent={openEvent}
              onPickSlot={pickSlot}
            />
          )}
          {view === "month" && (
            <MonthGrid days={monthDays} eventsByDay={byDate} onOpenEvent={openEvent} onPickDay={pickDay} />
          )}
          {view === "year" && (
            <YearGrid eventsByDay={byDate} onSelectMonth={openMonth} today={today} year={cursor.getFullYear()} />
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

      {syllabusOpen && (
        <SyllabusDialog onClose={() => setSyllabusOpen(false)} onImport={handleImport} uid={preview ? null : userId} />
      )}

      {dialog?.mode === "add" && (
        <EventFormDialog draft={dialog.draft} mode="add" onClose={() => setDialog(null)} onSave={handleSave} />
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
