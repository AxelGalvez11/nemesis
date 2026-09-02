"use client";

// Event dialogs — verbatim from desktop calendar/index.tsx §A.13. Every event
// opens EventFormDialog, in 'add' or 'edit' mode. The two-step destructive
// actions use an explicit confirmation prompt before deletion.
//
// There used to be a second, read-only EventViewDialog here for agent-authored
// rows (source === 'agent'), whose only copy was "Ask it to change this" — an
// instruction the student could not follow, because no update or delete tool
// has ever existed in AGENT_TOOLS. It was deleted 2026-07-28 along with the
// dispatch that reached it: an event the student asked for is theirs to correct.

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { Textarea } from "@/components/desktop-ui/textarea";
import {
  type CalendarEvent,
  isAllDay,
} from "@/lib/workspace/calendar-model";
import type { Calendar } from "@/lib/workspace/calendars";
import { EVENT_COLORS } from "@/lib/workspace/event-colors";
import { formatRecurrenceLines, parseRecurrenceLines, specFromLegacy, specToLegacy } from "@/lib/workspace/rrule";
import { Clock, FileText, Layers3, LinkIcon, Palette, RefreshCw, Trash2 } from "@/lib/workspace/icons";
import { CHEVRON_STYLE, CONTROL_HEIGHT, DATE_FIELD, FIELD } from "./field-chrome";
import { cn } from "@/lib/utils";

import { clockOf, minutesOf, SNAP_MINUTES } from "./time-grid";
import { RepeatEditor } from "./repeat-editor";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";

const newEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Zones offered in the picker.
 *
 * 🔴 THE BROWSER'S OWN LIST, NOT A HAND-WRITTEN ONE. `Intl.supportedValuesOf`
 * returns every zone the runtime actually knows, which is the only list that
 * cannot disagree with the runtime that has to interpret the result. Older
 * engines lack it, so the fallback is the reader's own zone plus UTC — enough to
 * save an event, never enough to be wrong about one.
 */
const TIME_ZONES: readonly string[] = (() => {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const all = typeof supported === "function" ? supported("timeZone") : [];
  if (all.length === 0) return [...new Set([local, "UTC"])];
  // The reader's own zone first: it is the answer nine times in ten.
  return [local, ...all.filter((zone) => zone !== local)];
})();

/**
 * Native selects wearing the same chrome as every Input beside them.
 *
 * 🔴 THEY USED TO BE THE BROWSER'S OWN. Owner 2026-09-01: the editor "looks
 * clunky, and it doesn't look finished ... it just showed default functions for
 * the calendar stuff". A hand-rolled height and border that ALMOST matched the
 * inputs, plus the platform's own dropdown arrow, is what that reads as. This
 * takes `controlVariants` — the thing Input itself is built from — so the two
 * cannot drift again, then replaces the platform arrow with a drawn one.
 */
const CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 4.5 6 7.5 9 4.5'/></svg>\")";

/**
 * One line of the editor: a fixed icon column, then the control.
 *
 * Google's event editor is built this way, and it is why a form with a dozen
 * fields still reads as a list rather than a wall. Ours was a flat stack of
 * identical full-width boxes with no labels, so nothing said which box was
 * which — two rows of coloured dots sat next to each other answering entirely
 * different questions.
 */
function Row({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  icon?: typeof Clock;
  label?: string;
}) {
  return (
    // Google's icon sits 20px clear of its field; ours sat 13.5. Both the column
    // gap and the row padding are its measurements converted.
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-[1.25rem]">
      <div className={cn("grid place-items-center text-(--ui-text-tertiary)", CONTROL_HEIGHT)}>
        {Icon ? <Icon size={16} /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2 py-[0.25rem]">
        {label ? (
          <span className="-mb-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-(--ui-text-tertiary)">{label}</span>
        ) : null}
        {children}
      </div>
    </div>
  );
}

// ── Add / Edit form ──────────────────────────────────────────────────────────

/** What the quick-create card had filled in when the student asked for the full
 *  form. Everything is optional but the date, which the click already decided. */
export interface EventDraft {
  date: string;
  title?: string;
  time?: string;
  endTime?: string;
}

interface EventFormDialogProps {
  mode: "add" | "edit";
  /** Starting values for `add`. Replaced the old bare `initialDate` so that
   *  pressing "Details" on the quick-create card carries the title, the time
   *  range and the type across instead of making the student type them again. */
  draft?: EventDraft;
  event?: CalendarEvent;
  /** Everything the student can file this on, primary first. */
  calendars?: Calendar[];
  onClose: () => void;
  onSave: (event: CalendarEvent) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function EventFormDialog({ mode, draft, event, calendars = [], onClose, onSave, onDelete }: EventFormDialogProps) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(event?.title ?? draft?.title ?? "");
  const [date, setDate] = useState(event?.date ?? draft?.date ?? "");
  const [time, setTime] = useState(event?.time ?? draft?.time ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? draft?.endTime ?? "");

  /**
   * The two time fields, kept in an order that can exist.
   *
   * 🔴 THE FORM USED TO SAVE AN END BEFORE ITS START. Both inputs were bare
   * setState, so an event could be stored running from 11:45 to 11:30. Nothing
   * complained: `durationOf` in time-grid.ts only trusts an end when
   * `end > start` and otherwise falls back to the default length, so the block
   * DREW as a normal 45 minutes while the row underneath said something
   * impossible and the form said it back to you on reopening.
   *
   * Google's editor cannot express that state — its end-time list only offers
   * times after the start, and moving the start carries the end along. These
   * two handlers are that behaviour.
   */
  const moveStart = (next: string) => {
    setTime(next);
    // Carry the end so the length survives, which is what Google does and what
    // makes dragging a lecture an hour later a single edit rather than two.
    const from = minutesOf(time);
    const to = minutesOf(next);
    const end = minutesOf(endTime);
    if (from === null || to === null || end === null) return;
    setEndTime(clockOf(Math.min(24 * 60 - 1, end + (to - from))));
  };

  const moveEnd = (next: string) => {
    const start = minutesOf(time);
    const end = minutesOf(next);
    // Nothing to compare against yet (an all-day draft, or a half-typed field):
    // take it as given rather than inventing a constraint out of a blank.
    if (start === null || end === null) return setEndTime(next);
    setEndTime(end > start ? next : clockOf(Math.min(24 * 60 - 1, start + SNAP_MINUTES)));
  };
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  // Undefined on an existing row means "guess from the time", which is what the
  // whole product did before there was a flag — so the box starts where the
  // guess would have landed and the student can disagree with it.
  const [allDay, setAllDay] = useState(event ? isAllDay(event) : !(draft?.time));
  const [colorId, setColorId] = useState(event?.colorId ?? "");
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? "");
  const [rrule, setRrule] = useState<string[] | undefined>(
    event?.rrule ?? (event?.recurrence ? formatRecurrenceLines(specFromLegacy(event.recurrence)) : undefined),
  );
  const [note, setNote] = useState(event?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !date || saving) return;
    setSaving(true);
    setError(null);

    const built: CalendarEvent = {
      id: mode === "edit" && event ? event.id : newEventId(),
      title: title.trim(),
      date,
      /**
       * 🔴 CARRIED, NEVER EDITED. Owner 2026-09-01: "I don't want anything like
       * type, you know, like assignment exam rotation. That's too specific to
       * school. This should be generalist as possible, like Google Calendar."
       *
       * The FIELD stays: a syllabus import, `schedule-to-calendar` and the agent
       * tools all still set it, and dropping it here would erase it from every
       * row the owner opened. It simply has no control any more, and nothing on
       * the calendar shows it. New events are "other", which is the one value
       * that claims nothing about what the event is.
       */
      kind: event?.kind ?? "other",
      source: "manual",
    };
    if (!allDay && time) built.time = time;
    if (!allDay && endTime) built.endTime = endTime;
    built.allDay = allDay;
    if (endDate && endDate > date) built.endDate = endDate;
    // Only worth storing when it differs from the reader's own zone: writing the
    // browser's zone onto every event would make a student's whole calendar look
    // like it came from somewhere, and pin it there if they moved.
    if (!allDay && event?.timeZone) built.timeZone = event.timeZone;
    if (rrule && rrule.length > 0) {
      built.rrule = rrule;
      // 🔴 THE OLD SHAPE IS WRITTEN TOO, BUT ONLY WHEN IT CAN HOLD THE RULE.
      // `specToLegacy` returns null for anything it would have to approximate,
      // and an approximated schedule is worse than a missing one because nothing
      // about it looks wrong. A client on an older deploy then sees no repeat
      // rather than the wrong one.
      const spec = parseRecurrenceLines(rrule);
      const legacy = spec ? specToLegacy(spec) : null;
      if (legacy) built.recurrence = legacy;
    }
    if (colorId) built.colorId = colorId;
    // Empty means the primary calendar, which is what null means in the database
    // and what every event written before calendars existed already is.
    if (calendarId) built.calendarId = calendarId;
    /**
     * 🔴 EVERYTHING BELOW IS CARRIED, NOT REBUILT — and that is the whole reason
     * this block exists. `built` starts empty, so a field this form stops
     * editing is a field that gets ERASED the first time the owner opens an
     * event and presses Save. Guests, reminders, location and the rest lost
     * their controls on 2026-09-01 ("I don't think we need guess ... location is
     * like just another fancy thing"); they did not lose their data.
     */
    if (event?.location) built.location = event.location;
    if (event?.attendees?.length) built.attendees = event.attendees;
    if (event?.reminders?.overrides?.length) built.reminders = event.reminders;
    if (event?.guestsCanModify !== undefined) built.guestsCanModify = event.guestsCanModify;
    if (event?.guestsCanInviteOthers !== undefined) built.guestsCanInviteOthers = event.guestsCanInviteOthers;
    if (event?.guestsCanSeeOtherGuests !== undefined) built.guestsCanSeeOtherGuests = event.guestsCanSeeOtherGuests;
    if (event?.course) built.course = event.course;
    if (event?.conference) built.conference = event.conference;
    if (event?.attachments) built.attachments = event.attachments;
    if (event?.eventType) built.eventType = event.eventType;
    if (event?.sourceTitle) built.sourceTitle = event.sourceTitle;
    if (event?.sourceUrl) built.sourceUrl = event.sourceUrl;
    // Only stored when it is not the default: writing "confirmed", "opaque" and
    // "default" onto every row would fill three columns with the absence of a
    // decision, and absent already means exactly that everywhere that reads them.
    if (event?.status && event.status !== "confirmed") built.status = event.status;
    if (event?.transparency === "transparent") built.transparency = "transparent";
    if (event?.visibility && event.visibility !== "default") built.visibility = event.visibility;
    if (note.trim()) built.note = note.trim();

    try {
      await onSave(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || saving) return;
    if (!(await confirm({ body: `“${title || "this event"}” is deleted. This can't be undone.`, title: "Delete this event?" }))) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete. Try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent banner={error || undefined} bannerTone="error" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit event" : "Add event"}</DialogTitle>
          {/* Radix wants a description for `aria-describedby`, so this says what
              the dialog IS. It used to list "assignment, exam, rotation, class",
              which is now a labelled Type row two inches below it. */}
          <DialogDescription>
            {mode === "edit" ? "Change anything here, or delete the event." : "Everything but a title is optional."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col">
          {/* 🔴 SIX FIELDS. Owner 2026-09-01: "basically, I just need a way to map
              events onto a calendar ... Google Calendar has all these extra
              things, I need ours to have just the basics — maybe changing events
              calendars, repeating maybe, and the title ... maybe a description
              for it, that's about it."

              Gone with that: the type picker (assignment/exam/rotation — "too
              specific to school", and this product is field-agnostic), guests
              ("too Google Calendar-like, and I don't think we even have a
              function for that" — correct, Nemesis has never emailed anyone),
              reminders, location, course, status, free/busy, visibility and the
              timezone picker.

              Every one of those fields is still CARRIED on save (see `built`
              above). Removing a control is not the same as deleting the column,
              and an editor that silently erased a location on Save would be a
              worse bug than the clutter it replaced. */}
          <input
            aria-label="Title"
            autoFocus
            className="mb-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-[1.0625rem] font-medium text-foreground outline-none placeholder:text-(--ui-text-quaternary) hover:border-(--ui-stroke-tertiary) focus:border-(--ui-stroke-secondary)"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a title"
            value={title}
          />

          <Row icon={Clock}>
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-1.5">
              <Input aria-label="Date" className={DATE_FIELD} onChange={(e) => setDate(e.target.value)} type="date" value={date} />
              {allDay ? (
                <Input
                  aria-label="Last day"
                  className={cn(DATE_FIELD, "col-span-2")}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="Last day"
                  type="date"
                  value={endDate}
                />
              ) : (
                <>
                  <Input aria-label="Start time" className={DATE_FIELD} onChange={(e) => moveStart(e.target.value)} type="time" value={time} />
                  <Input aria-label="End time" className={DATE_FIELD} onChange={(e) => moveEnd(e.target.value)} type="time" value={endTime} />
                </>
              )}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-(--ui-text-secondary)">
              <input checked={allDay} className="accent-(--ui-text-primary)" onChange={(e) => setAllDay(e.target.checked)} type="checkbox" />
              All day
            </label>
          </Row>

          <Row icon={RefreshCw}>
            <RepeatEditor onChange={setRrule} startDate={date} value={rrule} />
          </Row>

          {/* One row of colours, and it is the only thing that tells two events
              apart at a glance now — which is exactly what the owner asked for:
              "the only differentiating thing should be filtering by color". */}
          <Row icon={Palette} label="Colour">
            <div className="flex flex-wrap items-center gap-2" role="group">
              <button
                aria-label="Default colour"
                aria-pressed={colorId === ""}
                className={cn(
                  "grid size-[1.375rem] place-items-center rounded-full border border-dashed border-(--ui-stroke-primary) text-[0.625rem] text-(--ui-text-tertiary) transition-transform hover:scale-110",
                  colorId === "" && "ring-2 ring-(--ui-text-secondary) ring-offset-2 ring-offset-(--ui-bg-elevated)",
                )}
                onClick={() => setColorId("")}
                title="Default colour"
                type="button"
              >
                ×
              </button>
              {EVENT_COLORS.map((color) => (
                <button
                  aria-label={color.name}
                  aria-pressed={colorId === color.id}
                  className={cn(
                    "size-[1.375rem] rounded-full transition-transform hover:scale-110",
                    colorId === color.id && "ring-2 ring-(--ui-text-secondary) ring-offset-2 ring-offset-(--ui-bg-elevated)",
                  )}
                  key={color.id}
                  onClick={() => setColorId(color.id)}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                  type="button"
                />
              ))}
            </div>
          </Row>

          {calendars.length > 1 && (
            <Row icon={Layers3} label="Calendar">
              <select
                aria-label="Calendar"
                className={FIELD}
                onChange={(e) => setCalendarId(e.target.value)}
                style={CHEVRON_STYLE}
                value={calendarId}
              >
                {calendars.map((entry) => (
                  <option key={entry.id || "primary"} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </Row>
          )}

          {/* Held and shown, never made here: only the provider that minted a
              Meet link or pinned a Drive file can change one. Drawn only when
              one exists, so an ordinary event never sees it. */}
          {(event?.conference?.url || event?.attachments?.length || event?.sourceUrl) && (
            <Row icon={LinkIcon}>
              <div className="flex flex-col gap-1 rounded-lg border border-(--ui-stroke-tertiary) p-2.5 text-xs">
                {event?.conference?.url && (
                  <a className="truncate text-(--ui-learner) hover:underline" href={event.conference.url} rel="noopener noreferrer" target="_blank">
                    {event.conference.label || "Join the video call"}
                  </a>
                )}
                {event?.attachments?.map((file) => (
                  <a className="truncate text-(--ui-learner) hover:underline" href={file.fileUrl} key={file.fileUrl} rel="noopener noreferrer" target="_blank">
                    {file.title || file.fileUrl}
                  </a>
                ))}
                {event?.sourceUrl && (
                  <a className="truncate text-(--ui-text-tertiary) hover:underline" href={event.sourceUrl} rel="noopener noreferrer" target="_blank">
                    {event.sourceTitle || "Where this came from"}
                  </a>
                )}
              </div>
            </Row>
          )}

          <Row icon={FileText}>
            <Textarea
              className="min-h-16"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a description"
              value={note}
            />
          </Row>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {mode === "edit" ? (
            <Button
              onClick={() => void handleDelete()}
              variant="outline"
            >
              <Trash2 size={13} />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button disabled={!title.trim() || !date || saving} onClick={submit}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
