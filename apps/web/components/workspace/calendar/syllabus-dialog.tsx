"use client";

// Syllabus import — pick a file, read it, then REVIEW before anything is
// written. The review step is the point of this dialog, not a formality: the
// dates come from a language model, and the student is the only one who can
// tell a correctly-read deadline from a confidently-wrong one. Every row is
// shown with the sentence it was read from, and every row can be unticked.
//
// Nothing reaches the calendar until "Add to calendar" is pressed, and what
// gets written is source:'manual' — the student's own events, editable and
// deletable afterwards (see the note in syllabus.ts meetingToAnchorEvent).

import { useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { FileText, Loader2, Upload } from "@/lib/workspace/icons";
import { describeMeeting, meetingToAnchorEvent, type VerifiedSyllabus } from "@/lib/workspace/syllabus";
import { readSyllabus } from "@/lib/workspace/syllabus-import";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";
import { KIND_META } from "./kind-meta";

const ACCEPT = ".pdf,.docx,.pptx";

interface SyllabusDialogProps {
  uid: string | null;
  onClose: () => void;
  /** Writes one event. Reused from the calendar's own save path so imported
   *  events go through exactly the same validation as hand-made ones. */
  onImport: (events: CalendarEvent[]) => Promise<void>;
}

type Stage =
  | { name: "pick" }
  | { name: "reading"; fileName: string }
  | { name: "review"; result: VerifiedSyllabus; chosen: Set<string> }
  | { name: "saving" };

function newAnchorId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SyllabusDialog({ uid, onClose, onImport }: SyllabusDialogProps) {
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file || !uid) return;
    setError(null);
    setStage({ name: "reading", fileName: file.name });
    try {
      const result = await readSyllabus({ file, uid });
      // Everything starts ticked: the common case is that the reading is
      // right, and making the student tick 20 boxes to accept a good import
      // would push them to click through without looking at all.
      const chosen = new Set(result.events.map((event) => event.id));
      for (const [index] of result.meetings.entries()) chosen.add(`meeting-${index}`);
      setStage({ name: "review", result, chosen });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that file.");
      setStage({ name: "pick" });
    }
  }

  function toggle(id: string) {
    setStage((prev) => {
      if (prev.name !== "review") return prev;
      const chosen = new Set(prev.chosen);
      if (chosen.has(id)) chosen.delete(id);
      else chosen.add(id);
      return { ...prev, chosen };
    });
  }

  async function confirm() {
    if (stage.name !== "review") return;
    const { result, chosen } = stage;
    const events = result.events.filter((event) => chosen.has(event.id));
    for (const [index, meeting] of result.meetings.entries()) {
      if (!chosen.has(`meeting-${index}`)) continue;
      const anchor = meetingToAnchorEvent(meeting, newAnchorId(), result.course);
      if (anchor) events.push(anchor);
    }
    if (events.length === 0) {
      onClose();
      return;
    }
    setStage({ name: "saving" });
    try {
      await onImport(events);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't add those to your calendar.");
      setStage({ name: "review", chosen, result });
    }
  }

  const selectedCount =
    stage.name === "review" ? stage.chosen.size : 0;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent banner={error || undefined} bannerTone="error" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a syllabus</DialogTitle>
          <DialogDescription>
            {stage.name === "review"
              ? "Check these against your syllabus before they go in. Untick anything that looks wrong."
              : "Add a PDF, Word, or PowerPoint syllabus and Nemesis will pull out the dates."}
          </DialogDescription>
        </DialogHeader>

        {(stage.name === "pick" || stage.name === "reading") && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            {stage.name === "reading" ? (
              <>
                <Loader2 className="animate-spin text-muted-foreground" size={20} />
                <p className="text-xs text-muted-foreground">Reading {stage.fileName}…</p>
              </>
            ) : (
              <>
                <FileText className="text-muted-foreground" size={20} />
                <p className="max-w-sm text-xs text-muted-foreground">
                  Deadlines, exams, and class times get pulled out. You will see everything before it is added.
                </p>
                <input
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? undefined)}
                  ref={inputRef}
                  type="file"
                />
                <Button disabled={!uid} onClick={() => inputRef.current?.click()} size="sm">
                  <Upload size={14} /> Choose a file
                </Button>
                {!uid && <p className="text-[0.6875rem] text-muted-foreground">Sign in to import a syllabus.</p>}
              </>
            )}
          </div>
        )}

        {stage.name === "review" && <ReviewList onToggle={toggle} chosen={stage.chosen} result={stage.result} />}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <span className="text-[0.6875rem] text-muted-foreground">
            {stage.name === "review" && `${selectedCount} selected`}
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            {stage.name === "review" && (
              <Button disabled={selectedCount === 0} onClick={() => void confirm()}>
                Add to calendar
              </Button>
            )}
            {stage.name === "saving" && (
              <Button disabled>
                <Loader2 className="animate-spin" size={14} /> Adding…
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReviewListProps {
  result: VerifiedSyllabus;
  chosen: Set<string>;
  onToggle: (id: string) => void;
}

function ReviewList({ result, chosen, onToggle }: ReviewListProps) {
  const nothing = result.events.length === 0 && result.meetings.length === 0;

  return (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
      {(result.course || result.term) && (
        <p className="text-xs text-muted-foreground">
          {[result.course, result.term].filter(Boolean).join(" · ")}
        </p>
      )}

      {nothing && <p className="py-6 text-center text-xs text-muted-foreground">{result.note}</p>}

      {result.events.map((event) => (
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-2.5 transition-opacity",
            !chosen.has(event.id) && "opacity-50",
          )}
          key={event.id}
        >
          <input
            checked={chosen.has(event.id)}
            className="mt-0.5"
            onChange={() => onToggle(event.id)}
            type="checkbox"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[0.625rem] font-medium", KIND_META[event.kind].chip)}>
                {KIND_META[event.kind].label}
              </span>
              <span className="text-xs font-medium text-foreground">{event.title}</span>
            </span>
            <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
              {formatEventDate(event.date)}
              {event.time ? ` · ${formatEventTime(event.time)}` : ""}
            </span>
            {/* The sentence this row came from. Shown because "trust me" is not
                a thing a student can check, and a quote is. */}
            {event.note && <span className="text-[0.6875rem] italic text-(--ui-text-tertiary)">{event.note}</span>}
          </span>
        </label>
      ))}

      {result.meetings.map((meeting, index) => {
        const id = `meeting-${index}`;
        return (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-2.5 transition-opacity",
              !chosen.has(id) && "opacity-50",
            )}
            key={id}
          >
            <input checked={chosen.has(id)} className="mt-0.5" onChange={() => onToggle(id)} type="checkbox" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-[0.625rem] font-medium", KIND_META.class.chip)}>Class</span>
                <span className="text-xs font-medium text-foreground">{meeting.title}</span>
              </span>
              <span className="text-[0.6875rem] tabular-nums text-muted-foreground">{describeMeeting(meeting)}</span>
              <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
                Added as the first meeting only — repeating events are not supported yet.
              </span>
            </span>
          </label>
        );
      })}

      {result.dropped.length > 0 && (
        <div className="rounded-lg border border-border bg-(--ui-bg-quaternary)/40 p-2.5">
          <p className="text-[0.6875rem] font-semibold text-foreground">
            {result.dropped.length} {result.dropped.length === 1 ? "item was" : "items were"} left out
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            These could not be matched to a date in the file, so they are not offered rather than guessed at.
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {result.dropped.slice(0, 8).map((item, index) => (
              <li className="text-[0.6875rem] text-muted-foreground" key={`${item.title}-${index}`}>
                {item.title} — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
