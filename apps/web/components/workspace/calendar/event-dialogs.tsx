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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/desktop-ui/select";
import { Textarea } from "@/components/desktop-ui/textarea";
import type { CalendarEvent, CalendarEventKind } from "@/lib/workspace/calendar-model";
import { Trash2 } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";
import { KIND_META, KIND_ORDER } from "./kind-meta";

const newEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ── Add / Edit form ──────────────────────────────────────────────────────────

interface EventFormDialogProps {
  mode: "add" | "edit";
  initialDate?: string;
  event?: CalendarEvent;
  onClose: () => void;
  onSave: (event: CalendarEvent) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function EventFormDialog({ mode, initialDate, event, onClose, onSave, onDelete }: EventFormDialogProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? initialDate ?? "");
  const [time, setTime] = useState(event?.time ?? "");
  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? "assignment");
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
    if (time) built.time = time;
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
    if (!window.confirm(`Are you sure you want to delete “${title || "this event"}”? This can't be undone.`)) return;
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
          <div className="flex gap-2">
            <Input className="flex-1" onChange={(e) => setDate(e.target.value)} type="date" value={date} />
            <Input className="w-32" onChange={(e) => setTime(e.target.value)} type="time" value={time} />
          </div>
          <Select onValueChange={(value) => setKind(value as CalendarEventKind)} value={kind}>
            <SelectTrigger aria-label="Event type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_ORDER.map((option) => (
                <SelectItem key={option} value={option}>
                  <span className={cn("size-1.5 rounded-full", KIND_META[option].dot)} />
                  {KIND_META[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
