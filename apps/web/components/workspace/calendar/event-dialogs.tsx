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
  type CalendarEventKind,
  type EventAttendee,
  type EventReminders,
  isAllDay,
} from "@/lib/workspace/calendar-model";
import type { Calendar } from "@/lib/workspace/calendars";
import { EVENT_COLORS } from "@/lib/workspace/event-colors";
import { formatRecurrenceLines, parseRecurrenceLines, specFromLegacy, specToLegacy } from "@/lib/workspace/rrule";
import { Bell, Check, Clock, FileText, Palette, Pin, RefreshCw, Trash2, Users } from "@/lib/workspace/icons";
import { controlVariants } from "@/components/desktop-ui/control";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";
import { clockOf, minutesOf, SNAP_MINUTES } from "./time-grid";
import { KIND_META, KIND_ORDER } from "./kind-meta";
import { type GuestPermissions, GuestsEditor } from "./guests-editor";
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

const FIELD = cn(controlVariants(), "h-8 cursor-pointer appearance-none pr-7");

/**
 * Date and time inputs, with the platform's own glyph turned down.
 *
 * `::-webkit-calendar-picker-indicator` is the little calendar and clock the
 * browser draws inside these fields. It cannot be replaced, only dimmed, and at
 * full strength it is the loudest thing in the row — two saturated blue-grey
 * glyphs against type this size. It still opens the picker on click.
 */
const DATE_FIELD = "h-8 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-35 [&::-webkit-calendar-picker-indicator]:hover:opacity-70";

/**
 * 🔴 THE WHOLE BACKGROUND SHORTHAND GOES INLINE, not just the image.
 *
 * `bg-[right_0.5rem_center]` and `bg-[length:0.75rem]` do not compile: Tailwind
 * reads a bare `bg-[…]` as a colour or an image, never as a position or a size,
 * so the arrow kept its natural size and TILED — six chevrons marching across
 * the timezone field. Setting `backgroundImage` inline and leaving the rest to
 * classes is the trap, because the half that silently failed is the half that
 * makes one arrow one arrow.
 */
const CHEVRON_STYLE: React.CSSProperties = {
  backgroundImage: CHEVRON,
  backgroundPosition: "right 0.5rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "0.75rem",
};

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
    <div className="grid grid-cols-[1.125rem_minmax(0,1fr)] items-start gap-x-3">
      <div className="grid h-8 place-items-center text-(--ui-text-tertiary)">{Icon ? <Icon size={15} /> : null}</div>
      <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
        {label ? (
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-(--ui-text-tertiary)">{label}</span>
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
  kind?: CalendarEventKind;
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
  const [timeZone, setTimeZone] = useState(
    event?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [colorId, setColorId] = useState(event?.colorId ?? "");
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? "");
  const [attendees, setAttendees] = useState<EventAttendee[]>(event?.attendees ?? []);
  const [reminders, setReminders] = useState<EventReminders | undefined>(event?.reminders);
  const [permissions, setPermissions] = useState<GuestPermissions>({
    invite: event?.guestsCanInviteOthers,
    modify: event?.guestsCanModify,
    seeOthers: event?.guestsCanSeeOtherGuests,
  });
  const [status, setStatus] = useState<NonNullable<CalendarEvent["status"]>>(event?.status ?? "confirmed");
  const [busy, setBusy] = useState(event?.transparency !== "transparent");
  const [visibility, setVisibility] = useState<NonNullable<CalendarEvent["visibility"]>>(event?.visibility ?? "default");
  const [rrule, setRrule] = useState<string[] | undefined>(
    event?.rrule ?? (event?.recurrence ? formatRecurrenceLines(specFromLegacy(event.recurrence)) : undefined),
  );
  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? draft?.kind ?? "assignment");
  const [course, setCourse] = useState(event?.course ?? "");
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
      kind,
      source: "manual",
    };
    if (!allDay && time) built.time = time;
    if (!allDay && endTime) built.endTime = endTime;
    built.allDay = allDay;
    if (endDate && endDate > date) built.endDate = endDate;
    // Only worth storing when it differs from the reader's own zone: writing the
    // browser's zone onto every event would make a student's whole calendar look
    // like it came from somewhere, and pin it there if they moved.
    if (!allDay && timeZone && timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) {
      built.timeZone = timeZone;
    }
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
    if (location.trim()) built.location = location.trim();
    if (colorId) built.colorId = colorId;
    // Empty means the primary calendar, which is what null means in the database
    // and what every event written before calendars existed already is.
    if (calendarId) built.calendarId = calendarId;
    if (attendees.length > 0) built.attendees = attendees;
    if (reminders?.overrides?.length) built.reminders = reminders;
    // Only when there is somebody for them to apply to: three booleans on a
    // solo event are three columns recording nothing.
    if (attendees.length > 0) {
      if (permissions.modify !== undefined) built.guestsCanModify = permissions.modify;
      if (permissions.invite !== undefined) built.guestsCanInviteOthers = permissions.invite;
      if (permissions.seeOthers !== undefined) built.guestsCanSeeOtherGuests = permissions.seeOthers;
    }
    // Carried through untouched: Nemesis can hold and show these, and only the
    // provider that made them can change them.
    if (event?.conference) built.conference = event.conference;
    if (event?.attachments) built.attachments = event.attachments;
    if (event?.eventType) built.eventType = event.eventType;
    if (event?.sourceTitle) built.sourceTitle = event.sourceTitle;
    if (event?.sourceUrl) built.sourceUrl = event.sourceUrl;
    // Only stored when it is not the default: writing "confirmed", "opaque" and
    // "default" onto every row would fill three columns with the absence of a
    // decision, and absent already means exactly that everywhere that reads them.
    if (status !== "confirmed") built.status = status;
    if (!busy) built.transparency = "transparent";
    if (visibility !== "default") built.visibility = visibility;
    if (course.trim()) built.course = course.trim();
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
          {/* The title carries the dialog, so it is set like a title rather than
              like the eleventh field. Borderless until focused, which is what
              Google does and what stops the form opening on a row of boxes. */}
          <input
            aria-label="Title"
            autoFocus
            className="mb-1 w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[1.0625rem] font-medium text-foreground outline-none placeholder:text-(--ui-text-quaternary) hover:border-(--ui-stroke-tertiary) focus:border-(--ui-stroke-secondary)"
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-(--ui-text-secondary)">
                <input checked={allDay} className="accent-(--ui-text-primary)" onChange={(e) => setAllDay(e.target.checked)} type="checkbox" />
                All day
              </label>
              {!allDay && (
                <select
                  aria-label="Timezone"
                  className={cn(FIELD, "flex-1")}
                  onChange={(e) => setTimeZone(e.target.value)}
                  style={CHEVRON_STYLE}
                  value={timeZone}
                >
                  {TIME_ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              )}
            </div>
          </Row>

          <Row icon={RefreshCw}>
            <RepeatEditor onChange={setRrule} startDate={date} value={rrule} />
          </Row>

          <Row icon={Pin}>
            <Input className="h-8" onChange={(e) => setLocation(e.target.value)} placeholder="Add a location" value={location} />
            {calendars.length > 1 && (
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
            )}
          </Row>

          {/* 🔴 ONE ROW OF COLOURS, NOT TWO. Owner 2026-09-01: "you can choose
              colors for events, but it's not consistent, like there's different
              buttons for the colors ... why are they so bland?"
              He was looking at two rows of identical unlabelled dots that
              answered different questions — the first was the event's TYPE
              (exam, assignment), the second its colour. Both are still here,
              because "it is an exam" is not a matter of taste and Nemesis
              filters on it, but they no longer wear the same clothes: type is
              named chips, colour is swatches, and each row says what it is.

              And the swatches are at FULL STRENGTH now. Every unselected one
              carried `opacity-70` (the types, `opacity-45`), which is exactly
              what "bland" was — the palette itself is Google's own, and its
              Tomato is #d50000. */}
          <Row icon={Palette} label="Colour">
            <div className="flex flex-wrap items-center gap-2" role="group">
              <button
                aria-label="Use the type colour"
                aria-pressed={colorId === ""}
                className={cn(
                  "grid size-[1.375rem] place-items-center rounded-full border border-dashed border-(--ui-stroke-primary) text-[0.625rem] text-(--ui-text-tertiary) transition-transform hover:scale-110",
                  colorId === "" && "ring-2 ring-(--ui-text-secondary) ring-offset-2 ring-offset-(--ui-bg-elevated)",
                )}
                onClick={() => setColorId("")}
                title="Use the type colour"
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

          <Row label="Type">
            <div className="flex flex-wrap gap-1.5" role="group">
              {KIND_ORDER.map((option) => (
                <button
                  aria-pressed={kind === option}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors",
                    kind === option
                      ? "border-(--ui-stroke-primary) bg-(--ui-control-hover-background) font-medium text-foreground"
                      : "border-(--ui-stroke-tertiary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)",
                  )}
                  key={option}
                  onClick={() => setKind(option)}
                  type="button"
                >
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", KIND_META[option].dot)} />
                  {KIND_META[option].label}
                </button>
              ))}
            </div>
          </Row>

          <Row icon={Check} label="Shows as">
            <div className="flex flex-wrap gap-1.5">
              <select
                aria-label="Status"
                className={cn(FIELD, "flex-1")}
                onChange={(e) => setStatus(e.target.value as NonNullable<CalendarEvent["status"]>)}
                style={CHEVRON_STYLE}
                value={status}
              >
                <option value="confirmed">Confirmed</option>
                <option value="tentative">Tentative</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                aria-label="Shows you as"
                className={cn(FIELD, "flex-1")}
                onChange={(e) => setBusy(e.target.value === "busy")}
                style={CHEVRON_STYLE}
                value={busy ? "busy" : "free"}
              >
                <option value="busy">Busy</option>
                <option value="free">Free</option>
              </select>
              <select
                aria-label="Visibility"
                className={cn(FIELD, "flex-1")}
                onChange={(e) => setVisibility(e.target.value as NonNullable<CalendarEvent["visibility"]>)}
                style={CHEVRON_STYLE}
                value={visibility}
              >
                <option value="default">Default</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="confidential">Confidential</option>
              </select>
            </div>
          </Row>

          <Row icon={Users}>
            <GuestsEditor
              attendees={attendees}
              onAttendees={setAttendees}
              onPermissions={setPermissions}
              onReminders={setReminders}
              permissions={permissions}
              reminders={reminders}
            />
          </Row>

          {/* Held and shown, never made here: only the provider that minted a
              Meet link or pinned a Drive file can change one. */}
          {(event?.conference?.url || event?.attachments?.length || event?.sourceUrl) && (
            <Row icon={Bell}>
              <div className="flex flex-col gap-1 rounded-lg border border-(--ui-stroke-tertiary) p-2.5 text-xs">
                {event?.conference?.url && (
                  <a
                    className="truncate text-(--ui-learner) hover:underline"
                    href={event.conference.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {event.conference.label || "Join the video call"}
                  </a>
                )}
                {event?.attachments?.map((file) => (
                  <a
                    className="truncate text-(--ui-learner) hover:underline"
                    href={file.fileUrl}
                    key={file.fileUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {file.title || file.fileUrl}
                  </a>
                ))}
                {event?.sourceUrl && (
                  <a
                    className="truncate text-(--ui-text-tertiary) hover:underline"
                    href={event.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {event.sourceTitle || "Where this came from"}
                  </a>
                )}
              </div>
            </Row>
          )}

          <Row icon={FileText}>
            <Input className="h-8" onChange={(e) => setCourse(e.target.value)} placeholder="Course (optional)" value={course} />
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
