"use client";

// "Nemesis is processing this recording" — inside the note itself.
//
// The note exists in the Library from the second the microphone closes, which
// is the point: a lecture you just recorded should be somewhere you can find it
// immediately, not appear out of nowhere several minutes later. But a note whose
// body is a single placeholder sentence, with nothing to explain it, reads like
// a bug. This is the explanation, and it disappears by itself when the real
// notes are written in underneath.
//
// It reads the same account-wide job watch the chat card and the shell indicator
// use, so all three say the same thing at the same time without any of them
// owning the work.

import { Codicon } from "@/components/desktop-ui/codicon";
import { jobDetail, stageLabel } from "@/lib/workspace/recording-job";
import { retryRecordingJob } from "@/lib/workspace/recording-jobs-store";
import { useRecordingJobs } from "@/lib/workspace/use-recording-jobs";
import { useState } from "react";

export function RecordingNoteBanner({ noteId }: { noteId: string }) {
  const jobs = useRecordingJobs();
  const [retrying, setRetrying] = useState(false);
  // Finished jobs are not watched, so a note that is done simply has no job and
  // renders nothing — no "complete" state to dismiss, and no flag to clear.
  const job = jobs.find((entry) => entry.libraryDocumentId === noteId);
  if (!job) return null;

  const failed = job.status === "failed";
  return (
    <div
      className="mt-3 flex items-start gap-2.5 rounded-xl border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] px-3 py-2.5"
      role="status"
    >
      <Codicon
        className={failed ? "mt-0.5 text-(--ui-text-tertiary)" : "mt-0.5 animate-spin text-(--ui-text-secondary)"}
        name={failed ? "warning" : "sync"}
        size="0.85rem"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] text-foreground">
          {failed
            ? "Nemesis stopped part way through this recording."
            : "Nemesis is processing this recording."}
        </p>
        <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
          {failed
            ? job.error ?? "Something went wrong."
            // The stage and what was counted. The note updates itself when each
            // stage lands, so there is nothing to refresh and nothing to click.
            : [stageLabel(job.stage), jobDetail(job)].filter(Boolean).join(" · ")}
        </p>
        {failed && (
          <button
            className="mt-1 rounded-lg px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary) hover:bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)] disabled:opacity-60"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try { await retryRecordingJob(job.id); } catch { setRetrying(false); }
            }}
            type="button"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}
