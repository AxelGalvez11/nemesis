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
import { EVENT_COLORS, eventColorOf } from "@/lib/workspace/event-colors";
import { noteToText } from "@/lib/workspace/calendar-note";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/desktop-ui/popover";
import { formatRecurrenceLines, parseRecurrenceLines, specFromLegacy, specToLegacy } from "@/lib/workspace/rrule";
import { Clock, FileText, Layers3, LinkIcon, RefreshCw, Trash2 } from "@/lib/workspace/icons";
import { CHEVRON_STYLE, CONTROL_HEIGHT, FIELD, SOFT_FIELD } from "./field-chrome";
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
    //
    // 🔴 THE PADDING CAME OFF THE ROW AND WENT BETWEEN THE ROWS (2026-09-03).
    // `py-[0.25rem]` inside every row plus a flat stack outside meant the air was
    // spent where nobody sees it — around each control — instead of between the
    // things a reader is telling apart. The parent now sets a 20px gap and this
    // draws nothing of its own.
    // 🔴 `items-start`, AND `items-center` BROKE IT. Centring looks identical
    // while every row holds one control, and lands the icon halfway down the
    // repeat row the moment its panel opens — beside the day chips instead of
    // beside the line it belongs to. The icon cell is a full control tall and
    // centres within itself, so start-aligned it meets a 45px control exactly.
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-[18px]">
      <div className={cn("grid place-items-center text-(--ui-text-tertiary)", CONTROL_HEIGHT)}>
        {Icon ? <Icon size={17} /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {label ? (
          <span className="-mb-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-(--ui-text-tertiary)">{label}</span>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/**
 * The pill IS the picker button.
 *
 * 🔴 THE PLATFORM'S OWN GLYPH IS HIDDEN NOW (see `SOFT_FIELD`), so something has
 * to open the calendar and clock overlays. `showPicker()` is that something, and
 * it THROWS rather than returning false — on a browser that lacks it, and on a
 * call the browser does not consider user-driven. Swallowing that is correct: the
 * field is still a real date input, so typing into it works either way, and a
 * thrown error must never stop a click.
 */
function openPicker(event: { currentTarget: HTMLInputElement }) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    /* not supported here; the field still accepts typing */
  }
}

/**
 * The event's colour, as the dot beside its name.
 *
 * 🔴🔴 IT WAS A LABELLED ROW OF TWELVE CIRCLES, and that row cost a heading, a
 * line of swatches and the air around both — for a decision most events never
 * make. Owner, 2026-09-03: the editor is *"a bit too close together"* and *"a bit
 * big"*. The palette is unchanged and still one press away; what went is a
 * permanent row spent on an occasional choice.
 *
 * 🔴 THE DOT SHOWS THE ANSWER, so the control is not a door onto a mystery: the
 * colour you picked is the thing you press to change it. Unset draws a dashed
 * ring rather than a grey fill, because "no override" is not a colour — the event
 * takes its calendar's, and a filled grey dot would claim otherwise.
 */
function ColourDot({ colorId, onPick }: { colorId: string; onPick: (id: string) => void }) {
  const chosen = eventColorOf(colorId);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Colour: ${chosen?.name ?? "the calendar's own"}`}
          className="grid size-[1.375rem] shrink-0 place-items-center rounded-full transition-transform hover:scale-110"
          title={`Colour: ${chosen?.name ?? "the calendar's own"}`}
          type="button"
        >
          <span
            // 🔴 UNSET NEEDS ITS OWN GROUND OR IT IS INVISIBLE. A dashed hairline
            // ring alone measured as almost nothing against the dialog: it is the
            // only door to the palette, so it has to read as a target even while
            // it is deliberately not claiming a colour.
            className={cn(
              "block size-[0.8125rem] rounded-full",
              !chosen && "border border-dashed border-(--ui-stroke-primary) bg-[color-mix(in_srgb,var(--ui-base)_6%,transparent)]",
            )}
            style={chosen ? { backgroundColor: chosen.hex, boxShadow: `0 0 0 3px color-mix(in srgb, ${chosen.hex} 18%, transparent)` } : undefined}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5">
        <div aria-label="Event colour" className="grid grid-cols-6 gap-2" role="group">
          <button
            aria-label="The calendar's own colour"
            aria-pressed={colorId === ""}
            className={cn(
              "grid size-[1.375rem] place-items-center rounded-full border border-dashed border-(--ui-stroke-primary) text-[0.625rem] text-(--ui-text-tertiary) transition-transform hover:scale-110",
              colorId === "" && "ring-2 ring-(--ui-text-secondary) ring-offset-2 ring-offset-(--ui-bg-elevated)",
            )}
            onClick={() => onPick("")}
            title="The calendar's own colour"
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
              onClick={() => onPick(color.id)}
              style={{ backgroundColor: color.hex }}
              title={color.name}
              type="button"
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  /**
   * The description, as text a plain box can show.
   *
   * 🔴🔴 IT WAS PRINTING ITS OWN TAGS. Google Calendar's `description` is an HTML
   * field, and this is a `<textarea>` — so an event that came from Google read
   * `<p>Bench 4×6–8; …</p>`, literally, in the owner's own screenshot on
   * 2026-09-03.
   *
   * 🔴 THE ORIGINAL IS KEPT, AND THAT IS THE HALF THAT IS EASY TO MISS. Showing
   * the text and then saving the text would mean opening a Google event and
   * pressing Save without touching anything quietly stripped its links and line
   * breaks. So: the box shows text, and the save below writes plain text only
   * once the visible text has actually changed.
   */
  const noteSource = event?.note ?? "";
  const [note, setNote] = useState(() => noteToText(noteSource));
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
    // Untouched keeps whatever arrived — markup included; edited becomes what
    // the learner actually typed. See `noteSource` above.
    if (note.trim()) built.note = note.trim() === noteToText(noteSource).trim() ? noteSource : note.trim();

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
      {/* 🔴🔴 480 WIDE AND 26 IN, AGAINST 504 AND 18 (2026-09-03). The owner asked
          for two things that fight each other — *"not so bunched up, something
          that is easier on the eyes"* and *"a bit smaller"* — and the only
          resolution is to show LESS at once rather than to space more out. The
          repeat rule collapsed to a line and the colour row became the dot beside
          the title; what those two gave back paid for the padding, the 20px
          between rows and 15px controls, and the box still measures about 390px
          tall against 624.

          🔴 `bodyClassName`, NOT `className`. With an error banner the children
          live in an inner scroller that carries its own `p-4`, which `className`
          never reaches — so the dialog used to tighten by 8px the moment a save
          failed. */}
      <DialogContent
        banner={error || undefined}
        bannerTone="error"
        bodyClassName="gap-0 p-[26px]"
        className="sm:max-w-[480px]"
      >
        {/* 🔴 THE HEADING IS SPOKEN, NOT DRAWN. "Edit event" over a field holding
            the event's name said the same thing twice, and the sentence under it
            ("Change anything here, or delete the event") explained a dialog whose
            two buttons already say so. Radix still needs both for the accessible
            name and description, and a screen reader still hears them. */}
        <DialogHeader className="sr-only">
          <DialogTitle>{mode === "edit" ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            {mode === "edit" ? "Change anything here, or delete the event." : "Everything but a title is optional."}
          </DialogDescription>
        </DialogHeader>

        {/* 🔴 `pr-[26px]` KEEPS THE NAME OFF THE CLOSE BUTTON. `DialogContent`
            draws its ✕ absolutely at `right-2.5`, so a title that filled the row
            ran underneath it. */}
        <div className="flex items-center gap-[11px] pr-[26px]">
          <ColourDot colorId={colorId} onPick={setColorId} />
          <input
            aria-label="Title"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[25px] font-medium leading-[34px] tracking-[-0.01em] text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a title"
            value={title}
          />
        </div>

        <div className="my-[22px] h-px shrink-0 bg-(--ui-stroke-tertiary)" />

        {/* 🔴 FOUR FIELDS. Owner 2026-09-01: *"I just need a way to map events
            onto a calendar… maybe changing events calendars, repeating maybe, and
            the title… maybe a description for it, that's about it."*

            Gone with that: the type picker (assignment/exam/rotation — "too
            specific to school", and this product is field-agnostic), guests,
            reminders, location, course, status, free/busy, visibility and the
            timezone picker. Every one is still CARRIED on save (see `built`
            above) — removing a control is not the same as deleting the column,
            and an editor that silently erased a location would be a worse bug
            than the clutter it replaced. */}
        <div className="flex flex-col gap-[20px]">
          <Row icon={Clock}>
            {/* 🔴 A GRID, NOT A WRAPPING FLEX, AND THREE REAL PILLS WILL NOT FIT
                WITHOUT ONE. Measured at 480 wide: the content column is 428px and
                a `<input type="date">` needs ~175 at 15px, so date + start + end
                overflowed and the "All day" toggle wrapped to a ragged second
                line at the right. The tracks are the original's, kept. */}
            <div className="grid grid-cols-[minmax(0,1fr)_6.75rem_6.75rem] gap-[9px]">
              <input
                aria-label="Date"
                className={SOFT_FIELD}
                onChange={(e) => setDate(e.target.value)}
                onClick={openPicker}
                type="date"
                value={date}
              />
              {allDay ? (
                <input
                  aria-label="Last day"
                  className={cn(SOFT_FIELD, "col-span-2")}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                  onClick={openPicker}
                  placeholder="Last day"
                  type="date"
                  value={endDate}
                />
              ) : (
                <>
                  <input
                    aria-label="Start time"
                    className={SOFT_FIELD}
                    onChange={(e) => moveStart(e.target.value)}
                    onClick={openPicker}
                    type="time"
                    value={time}
                  />
                  <input
                    aria-label="End time"
                    className={SOFT_FIELD}
                    onChange={(e) => moveEnd(e.target.value)}
                    onClick={openPicker}
                    type="time"
                    value={endTime}
                  />
                </>
              )}
            </div>
            {/* 🔴 ITS OWN LINE, LEFT-ALIGNED, which is where it was before and
                where it belongs: pushed to the right of a full row it read as a
                stray control belonging to the end time. */}
            <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-(--ui-text-secondary)">
              <input checked={allDay} className="accent-(--ui-text-primary)" onChange={(e) => setAllDay(e.target.checked)} type="checkbox" />
              All day
            </label>
          </Row>

          <Row icon={RefreshCw}>
            <RepeatEditor onChange={setRrule} startDate={date} value={rrule} />
          </Row>

          {calendars.length > 1 && (
            <Row icon={Layers3}>
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
              <div className="flex flex-col gap-1 rounded-[0.75rem] bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] p-2.5 text-xs">
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
            {/* 🔴 BORDERLESS, AND IT GROWS. A bordered 72px box drawn under every
                event announced an empty field as loudly as a full one. */}
            <textarea
              aria-label="Description"
              className="min-h-[1.5rem] w-full resize-y bg-transparent py-[0.5rem] text-[15px] leading-[22px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a description"
              rows={note ? 3 : 1}
              value={note}
            />
          </Row>
        </div>

        <div className="mt-[22px] h-px shrink-0 bg-(--ui-stroke-tertiary)" />
        <DialogFooter className="mt-[18px] flex-wrap gap-2 sm:justify-between">
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
