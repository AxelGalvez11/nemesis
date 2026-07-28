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

      {/* flex, not `grid place-items-center`: justify-items:center shrink-wraps
          the item, so `w-full` on the waveform resolved to the width of the
          paragraph under it rather than the panel. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8" aria-live="polite">
        {recording.error ? (
          <div className="max-w-sm text-center">
            <Codicon className="mx-auto mb-3 text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
            <p className="text-sm leading-relaxed text-(--ui-text-secondary)">{recording.error}</p>
            {recording.status === "quota" && (
              <a className="mt-3 inline-block text-xs text-[var(--theme-primary)] underline underline-offset-4" href="/pricing">View plans</a>
            )}
          </div>
        ) : finishing ? (
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto mb-5 h-20 w-full opacity-50">
              <RecordingWaveform active={false} bars={recording.waveformRef} />
            </div>
            {/* The waveform is frozen once capture stops, so on its own this
                screen looked identical to a stall. The sweep is the only thing
                telling a student the work is still happening. */}
            <div aria-hidden className="record-processing-track mx-auto mb-4 h-1 w-40" />
            <p className="text-sm font-medium text-foreground">{recordingStatusCopy(recording.status)}</p>
            <p className="mt-2 text-xs leading-relaxed text-(--ui-text-quaternary)">
              Nemesis is transcribing the whole recording in one pass, then writing your notes.
            </p>
          </div>
        ) : capturing ? (
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto mb-5 h-20 w-full">
              <RecordingWaveform active={recording.gateOpen} bars={recording.waveformRef} />
            </div>
            <p className="font-mono text-2xl tabular-nums text-foreground">{recording.elapsedLabel}</p>
            {/* The paragraph that used to sit under this explained the silence
                gate and the one-pass transcription in four lines. Removed
                (owner 2026-07-28) — the waveform and this one label already say
                whether audio is going in, which is the only thing a student
                needs while the room is quiet. The behaviour is unchanged. */}
            <p className={cn(
              "mt-2 text-[0.6875rem] font-medium transition-colors",
              recording.gateOpen ? "text-[var(--theme-primary)]" : "text-(--ui-text-quaternary)",
            )}>
              {recording.gateOpen ? "Picking up audio" : "Quiet — paused"}
            </p>
          </div>
        ) : (
          <div className="max-w-sm text-center">
            <Codicon className="mx-auto mb-3 text-(--ui-text-quaternary)" name="mic" size="1.25rem" />
            <p className="text-xs leading-relaxed text-(--ui-text-quaternary)">Press record to begin.</p>
          </div>
        )}
      </div>

      {/* The footer strip ("1:20 of 46:00 used this month · pro") is gone —
          owner 2026-07-28 asked for both the usage line and the strip itself.
          The allowance still exists and is still enforced server-side; when a
          student actually runs out, /api/transcription/submit answers 429 and
          the error branch above says so with a link to plans. Metering a
          student while they record was telling them a number they could do
          nothing with. `recording.usage` is still read by the hook. */}
    </section>
  );
}
