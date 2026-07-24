"use client";

// Compact artifact card rendered inside chat transcripts (Sessions and
// notebook chats). Clicking opens the shell-mounted report-style popup viewer.

import { Codicon } from "@/components/desktop-ui/codicon";
import { openOutputViewer } from "@/lib/workspace/output-viewer";
import { spokenRecordingDuration } from "@/lib/workspace/recording-title";
import type { SessionOutput } from "@/lib/workspace/sessions-store";

const KIND_LABEL: Record<SessionOutput["kind"], string> = {
  flashcards: "Flashcards",
  mindmap: "Mindmap",
  other: "Output",
  recording: "Recording",
  report: "Report",
  slides: "Slides",
  test: "Test",
};

const KIND_ICON: Record<SessionOutput["kind"], string> = {
  flashcards: "layers",
  mindmap: "type-hierarchy-sub",
  other: "file",
  recording: "mic",
  report: "file",
  slides: "preview",
  test: "checklist",
};

export function formatOutputDuration(durationSeconds: number | undefined): string | null {
  if (!durationSeconds || durationSeconds <= 0) return null;
  if (durationSeconds < 90) return `${Math.round(durationSeconds)}s`;
  return `${Math.round(durationSeconds / 60)} min`;
}

/** "Jul 23" for a card subline or the recording viewer's header — or null when
 *  the timestamp is missing or unparseable. */
export function formatOutputDate(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function outputMetaLine(output: SessionOutput): string {
  // Recordings read in plain spoken English (owner item 3): the AI title is the
  // card's headline, so the subline is just how long it ran and when.
  if (output.kind === "recording") {
    return [spokenRecordingDuration(output.durationSeconds ?? 0), formatOutputDate(output.createdAt)]
      .filter(Boolean)
      .join(" · ");
  }
  const parts: string[] = [KIND_LABEL[output.kind]];
  const duration = formatOutputDuration(output.durationSeconds);
  if (duration) parts.push(duration);
  const date = formatOutputDate(output.createdAt);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export function OutputCard({ output }: { output: SessionOutput }) {
  return (
    <button
      className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-background px-3.5 py-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-colors hover:bg-(--ui-control-hover-background)"
      onClick={() => openOutputViewer(output)}
      type="button"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] text-(--ui-text-secondary)">
        <Codicon name={KIND_ICON[output.kind]} size="0.9rem" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium text-foreground">{output.title}</span>
        <span className="block truncate text-[0.72rem] text-(--ui-text-tertiary)">{outputMetaLine(output)}</span>
      </span>
      <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="chevron-right" size="0.8rem" />
    </button>
  );
}
