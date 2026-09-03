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
  monthGrid,
  saveCalendarEvent,
  weekGrid,
  WEEK_START_STORAGE_KEY,
  type WeekStart,
} from "@/lib/workspace/calendar-model";

import {
  type Calendar,
  calendarList,
  loadCalendars,
} from "@/lib/workspace/calendars";
import { connectionStatus } from "@/lib/workspace/composio-client";
import { hasCalendar } from "@/lib/workspace/composio-apps";
import type { ProviderDisagreement } from "@/lib/workspace/calendar-conflicts";
import type { DecodedCalendarEvent } from "@/lib/workspace/calendar-codec";
import {
  defaultWindow,
  pullGoogleEvents,
  resolveDisagreement,
  syncGoogleCalendar,
} from "@/lib/workspace/google-calendar-sync";
import {
  CALENDAR_FILTER_STORAGE_KEY,
  coloursInUse,
  LEGACY_KIND_FILTER_STORAGE_KEY,
  parseHiddenColors,
  serializeHiddenColors,
  visibleEvents,
} from "@/lib/workspace/calendar-filter";

import { CalendarHeader } from "./calendar-header";
import { SyncDisagreements } from "./sync-disagreements";
import { calendarColorOf } from "@/lib/workspace/calendar-colors";

import { DayRail } from "./day-rail";
import { type EventDraft, EventFormDialog } from "./event-dialogs";
import {
  AGENDA_WINDOW_DAYS,
  CALENDAR_VIEW_STORAGE_KEY,
  FOUR_DAY_COLUMNS,
  isCalendarViewMode,
  type CalendarViewMode,
} from "./format";
import { ScheduleView } from "./schedule-view";
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
  const [hiddenColors, setHiddenColors] = useState<Set<string>>(() => new Set());
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
  /**
   * The week starts on Sunday. Always.
   *
   * Owner 2026-09-01: "remove the 'starts sunday', it should always start
   * Sunday." It used to be a button that flipped between Sunday and Monday,
   * seeded from the browser's locale and remembered per device under
   * `nemesis.calendar.weekStart`.
   *
   * 🔴 THAT STORED KEY IS DELETED ON MOUNT, not merely ignored. A per-browser
   * preference that quietly contradicts the product's shape is the third bug of
   * its kind here — a pinned `nemesis.canvas.view` hid conversation history for
   * three separate reports before anyone looked at what the BROWSER carried.
   * Leaving a stale "1" in storage for a future reader to find is how that
   * happens a fourth time.
   */
  const weekStart: WeekStart = 0;

  // View mode: read from storage only after mount (SSR has no localStorage).
  // Also honour ?date= — the link every agent-written event carries. Without
  // this the calendar always opened on the current month, so the artifact card
  // for a Spring syllabus dropped the student four months away from the events
  // it claimed to link to (owner 2026-07-27: the card must route to the thing).
  useEffect(() => {
    setMounted(true);
    setView(loadStoredView());
    // Heal a browser pinned to Monday by the control that used to be here.
    try {
      window.localStorage.removeItem(WEEK_START_STORAGE_KEY);
    } catch {
      // Private mode: there was nothing stored to begin with.
    }
    setHiddenColors(parseHiddenColors(window.localStorage.getItem(CALENDAR_FILTER_STORAGE_KEY)));
    // The kind filter's stored value, cleared rather than left behind. It could
    // hide whole categories of event and there is no longer any control that
    // could bring them back — the same trap `nemesis.calendar.weekStart` was.
    try {
      window.localStorage.removeItem(LEGACY_KIND_FILTER_STORAGE_KEY);
    } catch {
      // Private mode: there was nothing stored to begin with.
    }
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

  /**
   * Event colour, then calendar colour, then the fallback — see event-colors.ts.
   *
   * 🔴🔴 IT SEARCHES `allCalendars`, AND SEARCHING `calendars` WAS WHY EVERYTHING WAS GREY. The
   * stored list holds only calendars a student has MADE; the primary one is never stored and is
   * prepended by `calendarList` (see calendars.ts). An event with no `calendarId` — which is every
   * event, because nothing creates a second calendar — looked itself up in a list it was never in,
   * found nothing, and fell through to the grey fallback. Giving `PRIMARY_CALENDAR` a colour does
   * nothing at all until this line can see it.
   */
  const calendarHex = useCallback(
    (calendarId: string | undefined) =>
      calendarColorOf(allCalendars.find((entry) => entry.id === (calendarId ?? ""))?.colorId)?.hex ?? null,
    [allCalendars],
  );

  const shownEvents = useMemo(() => visibleEvents(events, hiddenColors), [events, hiddenColors]);
  /** Read from ALL events, not the filtered ones — a colour must stay in the
   *  control after it is switched off, or there is no way to switch it back. */
  const colours = useMemo(() => coloursInUse(events), [events]);
  const byDate = useMemo(() => eventsByDate(shownEvents), [shownEvents]);

  function changeHiddenColors(next: Set<string>) {
    setHiddenColors(next);
    try {
      window.localStorage.setItem(CALENDAR_FILTER_STORAGE_KEY, serializeHiddenColors(next));
    } catch {
      // best-effort; the filter still applies for this session
    }
  }
  const monthDays = useMemo(
    () => monthGrid(cursor.getFullYear(), cursor.getMonth(), today, weekStart),
    [cursor, today, weekStart],
  );
  const weekDays = useMemo(() => weekGrid(cursor, today, weekStart), [cursor, today, weekStart]);
  /** 4 days from the cursor, NOT from a week boundary — Google's rule, and the
   *  reason the view is worth having: it follows where you are looking. */
  const fourDays = useMemo(
    () => Array.from({ length: FOUR_DAY_COLUMNS }, (_, i) => addDays(cursor, i)).map((date) => ({
      date, inMonth: true, isToday: dateKey(date) === dateKey(today), key: dateKey(date),
    })),
    [cursor, today],
  );
  /** Everything in the Schedule window, earliest first. Read from `byDate` so
   *  repeating events arrive already expanded into their occurrences. */
  const scheduleEvents = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (let i = 0; i < AGENDA_WINDOW_DAYS; i += 1) {
      const key = dateKey(addDays(cursor, i));
      const onDay = byDate.get(key);
      if (!onDay) continue;
      out.push(...[...onDay].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")));
    }
    return out;
  }, [byDate, cursor]);
  // Day view is the same grid with one column, so it takes the same shape.
  const dayColumn = useMemo(
    () => [{ date: cursor, inMonth: true, isToday: dateKey(cursor) === dateKey(today), key: dateKey(cursor) }],
    [cursor, today],
  );

  function goStep(delta: 1 | -1) {
    setCursor((prev) => {
      if (view === "day") return addDays(prev, delta);
      if (view === "fourDay") return addDays(prev, FOUR_DAY_COLUMNS * delta);
      if (view === "schedule") return addDays(prev, AGENDA_WINDOW_DAYS * delta);
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

  // ── Google Calendar ───────────────────────────────────────────────────────
  //
  // 🔴 THE CONTROL APPEARS ONLY IF THERE IS SOMETHING TO SYNC WITH. `hasCalendar` asks the app
  // catalogue rather than sniffing the slug for "calendar", which is the fix #933 made when
  // Outlook — mail and calendar in one toolkit — kept answering "no calendar" for every Microsoft
  // student. A failed read is "nothing connected", so the button simply stays away.
  const [canSync, setCanSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disagreements, setDisagreements] = useState<ProviderDisagreement[]>([]);
  const [resolving, setResolving] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (preview || !userId) return;
    let cancelled = false;
    connectionStatus().then((status) => {
      if (!cancelled) setCanSync(status.configured && hasCalendar(status.connected));
    });
    return () => {
      cancelled = true;
    };
  }, [preview, userId]);

  async function handleSync() {
    setSyncing(true);
    try {
      // 🔴 THE CAST IS HONEST, NOT A SHORTCUT. `events` is declared as CalendarEvent[] but every
      // row in it came out of `decodeCalendarEvent`, which populates the link fields when the row
      // has them. Widening the state's own type would ripple through every view for no gain; what
      // matters is that the values are really there, and the decoder is the only way in.
      const outcome = await syncGoogleCalendar(
        { preview, userId },
        { existing: events as DecodedCalendarEvent[] },
      );
      if (outcome.events.length > 0) {
        // Replace by id rather than appending: an update carries the id of the row it replaces, so
        // appending would leave the old copy sitting beside the new one on the same day.
        setEvents((prev) => [
          ...prev.filter((row) => !outcome.events.some((saved) => saved.id === row.id)),
          ...outcome.events,
        ]);
      }
      setDisagreements(outcome.disagreements);
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Settle one difference the way the student chose.
   *
   * 🔴 KEEPING GOOGLE'S VERSION NEEDS GOOGLE'S VERSION, WHICH IS NOT IN `disagreements`. That
   * carries the two readings for the student to compare, not a saveable row — so the calendar is
   * re-read to fetch the actual event before it is written. Reconstructing one from the compared
   * fields would silently drop everything not being compared.
   */
  async function handleResolve(row: ProviderDisagreement, keep: "nemesis" | "provider") {
    const mine = events.find((event) => event.id === row.local.id) as DecodedCalendarEvent | undefined;
    if (!mine) return;
    setResolving(row.externalId);
    try {
      let providerCopy: DecodedCalendarEvent | undefined;
      if (keep === "provider") {
        const pulled = await pullGoogleEvents(defaultWindow());
        providerCopy = pulled.events.find((entry) => entry.event.externalId === row.externalId)?.event;
      }
      // 🔴🔴 THE CLICK IS THE CONFIRMATION, AND WITHOUT SAYING SO THIS BUTTON DID NOTHING AT ALL.
      // Keeping the Nemesis version means writing to Google; `riskOf` classes every Google write as
      // needing approval, and `runAction` refuses an unconfirmed write before the network is
      // touched. So this came back "needs your confirmation" and the row simply sat there: a
      // control that looks live and is not, which is the defect the gating rule above exists to
      // prevent. The gate is there so a MODEL cannot write to somebody's calendar unseen; here a
      // person has read both versions side by side and pressed a button that names the change,
      // which is exactly the approval it is asking for.
      //
      // 🔴 AND IT TRAVELS FROM THE CLICK RATHER THAN BEING HARDCODED IN `pushEventToGoogle`, which
      // would drop the gate for every caller of that function, the model included.
      const settled = await resolveDisagreement(mine, keep, { preview, userId }, { confirmed: true, providerCopy });
      if (!settled.ok || !settled.event) return;
      const saved = settled.event;
      setEvents((prev) => prev.map((event) => (event.id === saved.id ? saved : event)));
      setDisagreements((prev) => prev.filter((entry) => entry.externalId !== row.externalId));
    } finally {
      setResolving(undefined);
    }
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
          colours={colours}
          hiddenColors={hiddenColors}
          onAddEvent={openAdd}
          onChangeHiddenColors={changeHiddenColors}
          onChangeView={setView}
          onStep={goStep}
          onSync={canSync ? handleSync : undefined}
          onToday={() => setCursor(new Date())}
          syncing={syncing}
          today={today}
          view={view}
        />
        <SyncDisagreements
          busy={resolving}
          found={disagreements}
          onDismiss={() => setDisagreements([])}
          onKeep={handleResolve}
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
              pendingSlot={quickCreate?.draft ?? null}
            />
          )}
          {view === "fourDay" && (
            <TimeGridView
              calendarHex={calendarHex}
              days={fourDays}
              eventsByDay={byDate}
              onAddOnDate={openAdd}
              onMoveEvent={handleGridMove}
              onOpenEvent={openEvent}
              onPickSlot={pickSlot}
              pendingSlot={quickCreate?.draft ?? null}
            />
          )}
          {view === "schedule" && (
            <ScheduleView
              calendarHex={calendarHex}
              events={scheduleEvents}
              hasAnyEvents={events.length > 0}
              loaded={mounted}
              onOpenEvent={openEvent}
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
              pendingSlot={quickCreate?.draft ?? null}
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
          onOpenDetails={(draft, title) => {
            setQuickCreate(null);
            setDialog({ draft: { ...draft, ...(title.trim() ? { title: title.trim() } : {}) }, mode: "add" });
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
