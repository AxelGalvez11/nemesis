"use client";

// The recording panel (owner decision 2026-07-27: "Drop live transcript
// entirely, one live high quality pass").
//
// This used to be two panes — a scrolling live transcript and a column of AI
// notes written every 45 seconds. Both are gone. Nothing is transcribed while
// you speak, so there is nothing to show; what replaces them is an honest
// statement of what is happening and what will exist when you stop.

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";
import { formatLiveDuration } from "@/lib/workspace/recording-note";
import { isCapturing, isFinishing, recordingStatusCopy } from "@/lib/workspace/recording-capture";
import type { RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";

import { RecordingWaveform } from "./recording-waveform";
import { useRecordingSession } from "./use-recording";

interface RecordWorkspaceProps {
  accessToken?: string | null;
  active?: boolean;
  className?: string;
  uid?: string | null;
  onFinished?: (draft: RecordingArtifactDraft) => void;
}


/** Recording canvas for Sessions and active Notebook recordings. */
export function RecordWorkspace({
  accessToken = null,
  active = false,
  className,
  uid = null,
  onFinished,
}: RecordWorkspaceProps) {
  const recording = useRecordingSession({ accessToken, active, onComplete: onFinished, uid });
  const capturing = isCapturing(recording.status);
  const finishing = isFinishing(recording.status);
  const used = recording.usage?.usedSeconds ?? 0;
  const limit = recording.usage?.limitSeconds ?? 0;

  return (
    <section
      aria-label="Recording"
      className={cn(
        "record-workspace-enter flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_94%,transparent)] shadow-lg backdrop-blur-xl",
        className,
      )}
      data-slot="record-workspace"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-tertiary) px-5 py-3.5">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Recording</h2>
        <div className={cn("ml-auto flex items-center gap-2.5 text-(--ui-text-quaternary)", (capturing || finishing) && "text-foreground")}>
          {capturing && <span aria-hidden className="size-2 animate-pulse rounded-full bg-[var(--theme-primary)]" />}
          <span className="text-[0.6875rem]">{recordingStatusCopy(recording.status)}</span>
          <span className="min-w-10 text-right font-mono text-[0.6875rem] tabular-nums">{recording.elapsedLabel}</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center px-6 py-8" aria-live="polite">
        {recording.error ? (
          <div className="max-w-sm text-center">
            <Codicon className="mx-auto mb-3 text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
            <p className="text-sm leading-relaxed text-(--ui-text-secondary)">{recording.error}</p>
            {recording.status === "quota" && (
              <a className="mt-3 inline-block text-xs text-[var(--theme-primary)] underline underline-offset-4" href="/pricing">View plans</a>
            )}
          </div>
        ) : finishing ? (
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-5 h-16 w-full opacity-50">
              <RecordingWaveform active={false} bars={recording.waveformRef} />
            </div>
            <p className="text-sm font-medium text-foreground">{recordingStatusCopy(recording.status)}</p>
            <p className="mt-2 text-xs leading-relaxed text-(--ui-text-quaternary)">
              Nemesis is transcribing the whole recording in one pass, then writing your notes. This takes a moment and is worth
              more than a running transcript would have been.
            </p>
          </div>
        ) : capturing ? (
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-5 h-16 w-full">
              <RecordingWaveform active={recording.gateOpen} bars={recording.waveformRef} />
            </div>
            <p className="font-mono text-2xl tabular-nums text-foreground">{recording.elapsedLabel}</p>
            <p className={cn(
              "mt-2 text-[0.6875rem] font-medium transition-colors",
              recording.gateOpen ? "text-[var(--theme-primary)]" : "text-(--ui-text-quaternary)",
            )}>
              {recording.gateOpen ? "Picking up audio" : "Quiet — paused"}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-(--ui-text-quaternary)">
              Quiet stretches are skipped, so only real audio is recorded and transcribed. Nothing is transcribed until you stop —
              then the whole lecture is read in one high-quality pass and your notes are written from all of it at once.
            </p>
          </div>
        ) : (
          <div className="max-w-sm text-center">
            <Codicon className="mx-auto mb-3 text-(--ui-text-quaternary)" name="mic" size="1.25rem" />
            <p className="text-xs leading-relaxed text-(--ui-text-quaternary)">Press record to begin.</p>
          </div>
        )}
      </div>

      {recording.usage && limit > 0 && (
        <footer className="shrink-0 border-t border-(--ui-stroke-tertiary) px-5 py-2.5 text-[0.6875rem] text-(--ui-text-quaternary)">
          {formatLiveDuration(used)} of {formatLiveDuration(limit)} used this month · {recording.usage.plan}
        </footer>
      )}
    </section>
  );
}
