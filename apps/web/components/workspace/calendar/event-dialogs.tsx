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
import { type CalendarEvent, type CalendarEventKind, isAllDay } from "@/lib/workspace/calendar-model";
import { formatRecurrenceLines, parseRecurrenceLines, specFromLegacy, specToLegacy } from "@/lib/workspace/rrule";
import { Trash2 } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";
import { KIND_META, KIND_ORDER } from "./kind-meta";
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
  onClose: () => void;
  onSave: (event: CalendarEvent) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function EventFormDialog({ mode, draft, event, onClose, onSave, onDelete }: EventFormDialogProps) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(event?.title ?? draft?.title ?? "");
  const [date, setDate] = useState(event?.date ?? draft?.date ?? "");
  const [time, setTime] = useState(event?.time ?? draft?.time ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? draft?.endTime ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  // Undefined on an existing row means "guess from the time", which is what the
  // whole product did before there was a flag — so the box starts where the
  // guess would have landed and the student can disagree with it.
  const [allDay, setAllDay] = useState(event ? isAllDay(event) : !(draft?.time));
  const [timeZone, setTimeZone] = useState(
    event?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  );
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
          <DialogDescription>Assignment, exam, rotation, class — anything with a due date.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="Title" value={title} />
          <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-2">
            <Input onChange={(e) => setDate(e.target.value)} type="date" value={date} />
            {allDay ? (
              <Input
                aria-label="Last day"
                className="col-span-2"
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Last day"
                type="date"
                value={endDate}
              />
            ) : (
              <>
                <Input aria-label="Start time" onChange={(e) => setTime(e.target.value)} type="time" value={time} />
                <Input aria-label="End time" onChange={(e) => setEndTime(e.target.value)} type="time" value={endTime} />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)">
              <input checked={allDay} onChange={(e) => setAllDay(e.target.checked)} type="checkbox" />
              All day
            </label>
            {!allDay && (
              <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-(--ui-text-tertiary)">
                <span className="shrink-0">Timezone</span>
                <select
                  className="h-8 min-w-0 flex-1 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-xs text-foreground"
                  onChange={(e) => setTimeZone(e.target.value)}
                  value={timeZone}
                >
                  {TIME_ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </label>
            )}
          </div>
          <RepeatEditor onChange={setRrule} startDate={date} value={rrule} />
          {/* Colour dots, not a labeled type dropdown (owner 2026-08-04:
              "remove the 'assignment,exam etc.' picker and replace with color
              selectors") — the same row the quick-create card uses. The name
              survives as the tooltip and accessible label. */}
          <div aria-label="Event color" className="flex flex-wrap gap-1.5 px-0.5" role="group">
            {KIND_ORDER.map((option) => (
              <button
                aria-label={KIND_META[option].label}
                aria-pressed={kind === option}
                className={cn(
                  "size-5 rounded-full transition-opacity",
                  KIND_META[option].dot,
                  kind === option
                    ? "ring-2 ring-(--ui-text-secondary) ring-offset-2 ring-offset-(--ui-bg-elevated)"
                    : "opacity-45 hover:opacity-100",
                )}
                key={option}
                onClick={() => setKind(option)}
                title={KIND_META[option].label}
                type="button"
              />
            ))}
          </div>
          <Input onChange={(e) => setCourse(e.target.value)} placeholder="Course (optional)" value={course} />
          <Textarea
            className="min-h-16"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes (optional)"
            value={note}
          />
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
