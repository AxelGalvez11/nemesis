"use client";

// The recording panel (owner decision 2026-07-27: "Drop live transcript
// entirely, one live high quality pass").
//
// This used to be two panes — a scrolling live transcript and a column of AI
// notes written every 45 seconds. Both are gone. Nothing is transcribed while
// you speak, so there is nothing to show; what replaces them is an honest
// statement of what is happening and what will exist when you stop.

import { useEffect } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";
import { isCapturing, isFinishing, recordingStatusCopy } from "@/lib/workspace/recording-capture";
import type { RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";

import { RecordingWaveform } from "./recording-waveform";
import { useRecordingSession } from "./use-recording";

/** The recorder's own pause/resume, handed up so the composer can host the
 *  Pause/Continue button while the hook stays down here with the microphone. */
export interface RecordControls {
  pause: () => void;
  resume: () => void;
}

interface RecordWorkspaceProps {
  accessToken?: string | null;
  active?: boolean;
  className?: string;
  /** Set in the same commit that clears `active` to cancel instead of save. */
  discard?: boolean;
  uid?: string | null;
  onFinished?: (draft: RecordingArtifactDraft) => void;
  onDiscarded?: () => void;
  /** Told whenever the student's own pause flips, so the composer's control
   *  can read Continue while the panel reads Paused — one source of truth. */
  onPausedChange?: (paused: boolean) => void;
  /** Told while a finished recording is still uploading/transcribing. The
   *  parent MUST keep this panel mounted while true — unmounting mid-flight
   *  loses the recording silently (finish() checks mountedRef). */
  onBusyChange?: (busy: boolean) => void;
  /** Hands pause/resume up on mount and null on unmount. */
  registerControls?: (controls: RecordControls | null) => void;
}


/** Recording canvas for Sessions and active Notebook recordings. The controls
 *  live on the COMPOSER now (owner 2026-08-03: Start → Pause/Continue there,
 *  ✕ ends) — this panel is the display: waveform, clock, and state. */
export function RecordWorkspace({
  accessToken = null,
  active = false,
  className,
  discard = false,
  uid = null,
  onDiscarded,
  onFinished,
  onPausedChange,
  onBusyChange,
  registerControls,
}: RecordWorkspaceProps) {
  const recording = useRecordingSession({ accessToken, active, discard, onComplete: onFinished, onDiscarded, uid });
  const capturing = isCapturing(recording.status);
  const finishing = isFinishing(recording.status);

  useEffect(() => {
    onPausedChange?.(recording.paused);
  }, [onPausedChange, recording.paused]);

  useEffect(() => {
    onBusyChange?.(finishing);
  }, [finishing, onBusyChange]);

  useEffect(() => {
    registerControls?.({ pause: recording.pause, resume: recording.resume });
    return () => registerControls?.(null);
  }, [recording.pause, recording.resume, registerControls]);

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
          {/* The pulsing dot is the universal "live" sign, so it must stop
              pulsing when the recording is not live. */}
          {capturing && (
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                recording.paused ? "bg-(--ui-text-quaternary)" : "animate-pulse bg-[var(--theme-primary)]",
              )}
            />
          )}
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
              <RecordingWaveform active={recording.gateOpen && !recording.paused} bars={recording.waveformRef} />
            </div>
            <p className="font-mono text-2xl tabular-nums text-foreground">{recording.elapsedLabel}</p>
            {/* The paragraph that used to sit under this explained the silence
                gate and the one-pass transcription in four lines. Removed
                (owner 2026-07-28) — the waveform and this one label already say
                whether audio is going in, which is the only thing a student
                needs while the room is quiet. The behaviour is unchanged. */}
            {/* Three states, not two. "Paused" is the student's own decision and
                has to look different from the app skipping a quiet room by
                itself, or pressing pause looks like it did nothing. */}
            <p className={cn(
              "mt-2 text-[0.6875rem] font-medium transition-colors",
              recording.paused
                ? "text-(--ui-text-secondary)"
                : recording.gateOpen
                  ? "text-[var(--theme-primary)]"
                  : "text-(--ui-text-quaternary)",
            )}>
              {recording.paused ? "Paused" : recording.gateOpen ? "Picking up audio" : "Quiet — skipping"}
            </p>
            {/* The Pause/Stop row that lived here moved to the COMPOSER (owner
                2026-08-03: Start → Pause/Continue there, ✕ ends). The panel
                keeps the waveform, the clock, and the state — display only. */}
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
