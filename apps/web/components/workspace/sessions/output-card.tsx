"use client";

// Compact artifact card rendered inside chat transcripts (Sessions and
// notebook chats). Clicking opens the shell-mounted report-style popup viewer.

import { Codicon } from "@/components/desktop-ui/codicon";
import { openOutputViewer } from "@/lib/workspace/output-viewer";
import { jobDetail, stageLabel, transcriptReady } from "@/lib/workspace/recording-job";
import { retryRecordingJob } from "@/lib/workspace/recording-jobs-store";
import type { SessionOutput } from "@/lib/workspace/sessions-store";
import { useRecordingJobs } from "@/lib/workspace/use-recording-jobs";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const jobs = useRecordingJobs();
  // THE CARD OBSERVES A JOB; IT DOES NOT RUN ONE.
  //
  // Until 2026-08-05 this card pulsed and said "Writing up your notes…" for as
  // long as it took, because the work was happening inside the page and the card
  // was the only thing that knew about it — which also meant that leaving the
  // page ended the work. Now the pipeline is a row (recording_jobs) and this
  // reads it: a card rendered on a page opened ten minutes later shows exactly
  // the same stage, because both are reading the same record.
  //
  // Matching by artifact id rather than a job id stored on the message: the
  // artifact is created with the job and is what every surface already keys on,
  // so a message that predates this feature still finds its job.
  const job = jobs.find((entry) => entry.artifactId === output.id) ?? null;
  // `polish: "pending"` is the fallback for a card with no live job — an older
  // recording that finished before the page loaded, or one whose job row has
  // aged out of the watch.
  const pending = job ? job.status === "processing" : output.polish === "pending";
  const failed = job?.status === "failed";
  // Results appear progressively. The transcript exists from the moment
  // transcription finishes, so the card opens THEN — the student can read what
  // was said while the notes are still being written, rather than waiting for
  // everything. The viewer reads the artifact row directly, so what it shows is
  // whatever exists at the moment it opens, and it grows as later stages land.
  const openable = job ? transcriptReady(job) : !pending;

  if (failed && job) return <FailedRecordingCard error={job.error} jobId={job.id} title={output.title} />;

  return (
    <button
      // Grey rather than the page background (owner 2026-07-30: "all artifacts
      // should be gray"). color-mix against --ui-base rather than a fixed grey
      // so the card sits a step off the surface in BOTH themes — a hardcoded
      // #f5f5f5 reads as grey in light and as a bright patch in dark.
      aria-busy={pending}
      // CHIP-SCALE, not billboard (owner 2026-08-03: "the chat artifacts are
      // too big"). Sized to sit alongside the PDF attachment chips rather than
      // spanning the prose column.
      className={cn(
        "flex w-full max-w-xs items-center gap-2.5 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-colors",
        "bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)]",
        openable
          ? "hover:bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)]"
          // NO PULSE once there is a real stage to read. The breathing card was
          // the only signal this card had when the page owned the work, and it
          // said nothing except "wait". A named stage that changes on its own is
          // both more informative and calmer to sit next to; the pulse is kept
          // only for the case with no job to read, where there genuinely is
          // nothing to say.
          : job ? "cursor-default" : "animate-pulse cursor-default",
      )}
      disabled={!openable}
      onClick={() => {
        if (output.url?.startsWith("/")) router.push(output.url);
        else openOutputViewer(output);
      }}
      type="button"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)] text-(--ui-text-secondary)">
        <Codicon
          className={cn(pending && "animate-spin")}
          name={pending ? "sync" : KIND_ICON[output.kind]}
          size="0.85rem"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-medium text-foreground">{job?.title ?? output.title}</span>
        <span className="block truncate text-[0.6875rem] text-(--ui-text-tertiary)">
          {job && job.status === "processing"
            // The stage, and then only what was actually counted — the
            // recording's length, the words that came back, the sections that
            // were written. No percentage and no estimate: neither is known.
            ? [stageLabel(job.stage), jobDetail(job)].filter(Boolean).join(" · ")
            : pending
              ? "Writing up your notes…"
              : outputMetaLine(output)}
        </span>
      </span>
      {openable && <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="chevron-right" size="0.75rem" />}
    </button>
  );
}

/**
 * A recording that stopped part way, and the button that starts it again from
 * exactly where it stopped.
 *
 * A failure has to be visible and actionable HERE, in the conversation, because
 * that is where the student is looking for their lecture. It also survives a
 * refresh — the failure is on the job row, not in this component's state — which
 * is the difference between "it broke and I can fix it" and "it vanished".
 */
function FailedRecordingCard({ error, jobId, title }: { error: string | null; jobId: string; title: string }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="flex w-full max-w-xs flex-col gap-1.5 rounded-xl border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
      <span className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)] text-(--ui-text-secondary)">
          <Codicon name="warning" size="0.85rem" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-medium text-foreground">{title}</span>
          <span className="block text-[0.6875rem] text-(--ui-text-tertiary)">{error ?? "Something went wrong."}</span>
        </span>
      </span>
      <button
        className="self-start rounded-lg px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary) hover:bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)] disabled:opacity-60"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          // Deliberately not reset on success: the job row leaves the failed
          // state and this card is replaced by the running one, so clearing the
          // flag would only ever flash the button back for a frame.
          try { await retryRecordingJob(jobId); } catch { setRetrying(false); }
        }}
        type="button"
      >
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
