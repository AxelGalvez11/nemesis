"use client";

// Compact artifact card rendered inside chat transcripts (Sessions and
// notebook chats). Clicking opens the shell-mounted report-style popup viewer.

import { Codicon } from "@/components/desktop-ui/codicon";
import { openOutputViewer } from "@/lib/workspace/output-viewer";
import type { SessionOutput } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const KIND_LABEL: Record<SessionOutput["kind"], string> = {
  event: "Calendar",
  flashcards: "Flashcards",
  mindmap: "Mindmap",
  note: "Library note",
  other: "Output",
  recording: "Recording",
  report: "Report",
  slides: "Slides",
  test: "Test",
};

const KIND_ICON: Record<SessionOutput["kind"], string> = {
  event: "calendar",
  flashcards: "layers",
  mindmap: "type-hierarchy-sub",
  note: "note",
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

export function outputMetaLine(output: SessionOutput): string {
  const parts: string[] = [KIND_LABEL[output.kind]];
  const duration = formatOutputDuration(output.durationSeconds);
  if (duration) parts.push(duration);
  if (output.createdAt) {
    const date = new Date(output.createdAt);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  }
  return parts.join(" · ");
}

export function OutputCard({ output }: { output: SessionOutput }) {
  const router = useRouter();
  // `polish: "pending"` means the deliverable has been started but is not
  // finished — the transcript is captured and the write-up is still running.
  // The field already existed and round-tripped to the cloud without anything
  // ever rendering it; this gives it the one meaning it is named for rather
  // than adding a second word for the same idea.
  const pending = output.polish === "pending";
  return (
    <button
      // Grey rather than the page background (owner 2026-07-30: "all artifacts
      // should be gray"). color-mix against --ui-base rather than a fixed grey
      // so the card sits a step off the surface in BOTH themes — a hardcoded
      // #f5f5f5 reads as grey in light and as a bright patch in dark.
      aria-busy={pending}
      className={cn(
        "flex w-full max-w-md items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) px-3.5 py-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-colors",
        "bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)]",
        pending
          // Not just a spinner bolted on: the whole card breathes, which is what
          // separates "this is being written" from "this is ready to open" at a
          // glance. cursor-default because there is nothing to open yet.
          ? "animate-pulse cursor-default"
          : "hover:bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)]",
      )}
      // A pending card must not open the viewer: the notes it would show do not
      // exist yet, so the student would get an empty report and conclude the
      // recording failed.
      disabled={pending}
      onClick={() => {
        if (output.url?.startsWith("/")) router.push(output.url);
        else openOutputViewer(output);
      }}
      type="button"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)] text-(--ui-text-secondary)">
        <Codicon name={pending ? "sync" : KIND_ICON[output.kind]} size="0.9rem" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium text-foreground">{output.title}</span>
        <span className="block truncate text-[0.72rem] text-(--ui-text-tertiary)">
          {pending ? "Writing up your notes…" : outputMetaLine(output)}
        </span>
      </span>
      {!pending && <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="chevron-right" size="0.8rem" />}
    </button>
  );
}
