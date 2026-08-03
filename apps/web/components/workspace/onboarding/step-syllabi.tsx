"use client";

// Step two: add a syllabus, see what we read, keep what is right.
//
// This is the step that earns the product's keep on day one — the same
// capability a competitor charges ninety-nine dollars a year for — so it gets
// the honest treatment rather than the impressive one.
//
// THE REVIEW IS NOT A FORMALITY. The dates come from a language model. Every
// row is shown with the sentence it was read from, every row can be unticked,
// and NOTHING reaches the calendar until the student presses the button. A
// confidently wrong exam date is worse than no exam date, and the only person
// who can tell them apart is holding the syllabus.
//
// Fields we extracted are labelled as extracted. A student should never have to
// guess which parts of their own semester a machine invented.

import { useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { FileText, Loader2, Upload, X } from "@/lib/workspace/icons";
import { describeMeeting, meetingToAnchorEvent, type VerifiedSyllabus } from "@/lib/workspace/syllabus";
import { readSyllabus } from "@/lib/workspace/syllabus-import";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "../calendar/format";
import { KIND_META } from "../calendar/kind-meta";

const ACCEPT = ".pdf,.docx,.pptx";

/** One syllabus the student has read in, plus which of its rows they still
 *  want. Kept per file so adding a second syllabus never disturbs the first. */
export interface ReadFile {
  id: string;
  fileName: string;
  result: VerifiedSyllabus;
  chosen: Set<string>;
}

interface StepSyllabiProps {
  uid: string | null;
  files: ReadFile[];
  onChange: (files: ReadFile[]) => void;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The events a read file contributes, honouring what is still ticked. Meetings
 *  become their first occurrence, exactly as the calendar's own importer does. */
export function eventsFrom(file: ReadFile): CalendarEvent[] {
  const events = file.result.events.filter((event) => file.chosen.has(event.id));
  for (const [index, meeting] of file.result.meetings.entries()) {
    if (!file.chosen.has(`meeting-${index}`)) continue;
    const anchor = meetingToAnchorEvent(meeting, newId(), file.result.course);
    if (anchor) events.push(anchor);
  }
  return events;
}

export function StepSyllabi({ files, onChange, uid }: StepSyllabiProps) {
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || !uid) return;
    setError(null);
    for (const file of Array.from(list)) {
      setReading(file.name);
      try {
        const result = await readSyllabus({ file, uid });
        // Everything starts ticked: the common case is that the reading is
        // right, and making a student tick twenty boxes to accept a good import
        // pushes them to click through without looking at any of them.
        const chosen = new Set(result.events.map((event) => event.id));
        for (const [index] of result.meetings.entries()) chosen.add(`meeting-${index}`);
        onChange([...files, { chosen, fileName: file.name, id: newId(), result }]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `Could not read ${file.name}.`);
      } finally {
        setReading(null);
      }
    }
  }

  function toggle(fileId: string, rowId: string) {
    onChange(
      files.map((file) => {
        if (file.id !== fileId) return file;
        const chosen = new Set(file.chosen);
        if (chosen.has(rowId)) chosen.delete(rowId);
        else chosen.add(rowId);
        return { ...file, chosen };
      }),
    );
  }

  const total = files.reduce((count, file) => count + file.chosen.size, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Add your syllabus</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nemesis reads the dates out of it. You will see everything it found, next to the sentence it came
          from, before any of it goes on your calendar.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-(--ui-danger)/40 bg-(--ui-danger)/10 px-3 py-2 text-xs text-(--ui-danger)">
          {error}
        </p>
      )}

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-6 text-center">
        {reading ? (
          <>
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
            <p className="text-xs text-muted-foreground">Reading {reading}…</p>
          </>
        ) : (
          <>
            <FileText className="text-muted-foreground" size={20} />
            <p className="max-w-sm text-xs text-muted-foreground">PDF, Word, or PowerPoint. One per course.</p>
            <input
              accept={ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => void handleFiles(event.target.files)}
              ref={inputRef}
              type="file"
            />
            <Button disabled={!uid} onClick={() => inputRef.current?.click()} size="sm" type="button">
              <Upload size={14} /> Choose a file
            </Button>
            {!uid && <p className="text-[0.6875rem] text-muted-foreground">Sign in to read a syllabus.</p>}
          </>
        )}
      </div>

      {files.map((file) => (
        <ReadFileReview
          file={file}
          key={file.id}
          onRemove={() => onChange(files.filter((other) => other.id !== file.id))}
          onToggle={(rowId) => toggle(file.id, rowId)}
        />
      ))}

      {total > 0 && (
        <p className="text-[0.6875rem] text-muted-foreground">
          {total} {total === 1 ? "item" : "items"} will be added when you continue.
        </p>
      )}
    </div>
  );
}

interface ReadFileReviewProps {
  file: ReadFile;
  onToggle: (rowId: string) => void;
  onRemove: () => void;
}

function ReadFileReview({ file, onRemove, onToggle }: ReadFileReviewProps) {
  const { result } = file;
  const nothing = result.events.length === 0 && result.meetings.length === 0;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{file.fileName}</p>
          <p className="text-[0.6875rem] text-muted-foreground">
            {[result.course, result.term].filter(Boolean).join(" · ") || "No course name found"}
            {" — "}
            <span className="italic">read from your syllabus, unconfirmed</span>
          </p>
        </div>
        <button
          aria-label={`Remove ${file.fileName}`}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-(--ui-bg-tertiary) hover:text-foreground"
          onClick={onRemove}
          type="button"
        >
          <X size={14} />
        </button>
      </header>

      {nothing && <p className="py-3 text-center text-xs text-muted-foreground">{result.note}</p>}

      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {result.events.map((event) => (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2 transition-opacity",
              !file.chosen.has(event.id) && "opacity-50",
            )}
            key={event.id}
          >
            <input
              checked={file.chosen.has(event.id)}
              className="mt-0.5"
              onChange={() => onToggle(event.id)}
              type="checkbox"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
              {/* The sentence this row came from. "Trust me" is not something a
                  student can check; a quote is. */}
              {event.note && <span className="text-[0.6875rem] italic text-(--ui-text-tertiary)">{event.note}</span>}
            </span>
          </label>
        ))}

        {result.meetings.map((meeting, index) => {
          const rowId = `meeting-${index}`;
          return (
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2 transition-opacity",
                !file.chosen.has(rowId) && "opacity-50",
              )}
              key={rowId}
            >
              <input
                checked={file.chosen.has(rowId)}
                className="mt-0.5"
                onChange={() => onToggle(rowId)}
                type="checkbox"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[0.625rem] font-medium", KIND_META.class.chip)}>
                    Class
                  </span>
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
      </div>

      {result.dropped.length > 0 && (
        <p className="text-[0.6875rem] text-muted-foreground">
          {result.dropped.length} {result.dropped.length === 1 ? "item was" : "items were"} left out because they
          could not be matched to a date in the file. They are not offered rather than guessed at.
        </p>
      )}
    </section>
  );
}
