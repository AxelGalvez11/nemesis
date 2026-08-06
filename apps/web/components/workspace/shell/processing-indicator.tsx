"use client";

// "1 item processing" — the one thing on screen that follows you everywhere.
//
// Mounted in the shell rather than on any surface, because the whole point is
// that it still reads correctly after you have left the chat. Someone who
// records a lecture and immediately opens the Library to keep working should be
// able to see, from anywhere, that Nemesis is still working on it — and be one
// click from the conversation it belongs to.
//
// It is also where a FAILURE surfaces. A recording that broke while the student
// was on another page has nowhere else to tell them: the chat card is on a
// screen they are not looking at, and a failure that only exists there is a
// failure they find out about days later.

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";
import { jobDetail, stageLabel, type RecordingJob } from "@/lib/workspace/recording-job";
import { sessionsStore } from "@/lib/workspace/sessions-store";
import { useRecordingJobs } from "@/lib/workspace/use-recording-jobs";

export function ProcessingIndicator() {
  // Mounting this in the shell is also what STARTS the account-wide watch, so a
  // job left running by a previous page — or created in another tab — is picked
  // up wherever the student happens to be.
  const { jobs } = useRecordingJobs();
  const [expanded, setExpanded] = useState(false);

  const processing = useMemo(() => jobs.filter((job) => job.status === "processing"), [jobs]);
  const failed = useMemo(() => jobs.filter((job) => job.status === "failed"), [jobs]);
  if (processing.length === 0 && failed.length === 0) return null;

  const label = processing.length > 0
    ? `${processing.length} item${processing.length === 1 ? "" : "s"} processing`
    : `${failed.length} recording${failed.length === 1 ? "" : "s"} need${failed.length === 1 ? "s" : ""} attention`;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-70 -translate-x-1/2">
      <div className="pointer-events-auto flex max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) p-1 shadow-[0_6px_24px_rgba(0,0,0,0.14)]">
        <button
          aria-expanded={expanded}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)]"
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          <Codicon
            className={cn(processing.length > 0 ? "animate-spin text-(--ui-text-secondary)" : "text-(--ui-text-tertiary)")}
            name={processing.length > 0 ? "sync" : "warning"}
            size="0.8rem"
          />
          <span className="truncate text-[0.75rem] text-foreground">{label}</span>
          <Codicon className="ml-auto shrink-0 text-(--ui-text-quaternary)" name={expanded ? "chevron-down" : "chevron-up"} size="0.7rem" />
        </button>
        {expanded && (
          <ul className="flex flex-col gap-0.5 px-1 pb-1">
            {[...processing, ...failed].map((job) => (
              <li key={job.id}>
                <JobRow job={job} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: RecordingJob }) {
  const router = useRouter();
  const detail = jobDetail(job);
  const body = (
    <>
      <span className="block truncate text-[0.75rem] text-foreground">{job.title ?? "Recording"}</span>
      <span className="block truncate text-[0.6875rem] text-(--ui-text-tertiary)">
        {job.status === "failed"
          ? job.error ?? "Something went wrong."
          : [stageLabel(job.stage), detail].filter(Boolean).join(" · ")}
      </span>
    </>
  );
  // A job with no conversation to go back to (the placeholder message never
  // made it up, say) still renders — it just is not clickable. Rendering nothing
  // would hide a failure the student needs to see.
  if (!job.contextId) return <span className="block rounded-lg px-2 py-1">{body}</span>;
  return (
    <button
      className="block w-full rounded-lg px-2 py-1 text-left hover:bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)]"
      // Select then navigate, the same two steps the sidebar's own resume() uses
      // — which conversation is open is store state, not a route parameter.
      onClick={() => {
        sessionsStore.select(job.contextId);
        router.push("/sessions");
      }}
      type="button"
    >
      {body}
    </button>
  );
}
