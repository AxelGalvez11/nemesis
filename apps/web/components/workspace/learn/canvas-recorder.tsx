"use client";

// Recording a lecture, from the Canvas — and it lands ON the canvas.
//
// 🔴 THIS IS THE FIFTH THING §L SAYS THE COMPOSER DOES. "type a topic · ask a question · upload
// material · dictate · record where supported." The first four worked. Recording was started only
// by `RecordWorkspace`, hosted on /sessions and /notebooks — neither of which is in the sidebar —
// so the front door named a capability it did not have. The landing copy was corrected rather than
// left as a false promise; this is the other half of that repair.
//
// 🔴 IT IS NOT A RECORDING STUDIO. One panel, one Stop, one Cancel. The waveform, clock, silence
// gate and pause all come from the panel Sessions already uses, because that behaviour was hard to
// get right and every surface should get it. What is new here is only where the recording GOES.
//
// 🔴 AND THE LIMIT IS STATED, NOT DISCOVERED. Unlike /sessions, the finish is client-driven: the
// audio is safe the moment it is uploaded, but the transcript is made while this page is open. The
// learner is told that in the sentence under the panel, in the terms it will actually bite them —
// not as "transcription may fail".

import { useCallback, useMemo, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useAuth } from "@/components/AuthProvider";
import { RecordWorkspace } from "@/components/workspace/sessions/record-workspace";
import { supabase } from "@/lib/supabase";
import {
  canvasRecordingCopy,
  deliverRecordingToCanvas,
  type CanvasRecordingPhase,
} from "@/lib/workspace/canvas-recording";

interface Props {
  /** The canvas's own attach path — the same one a dropped file takes. Passed in rather than
   *  reached for, so this component never learns what a canvas is. */
  attach: (files: File[]) => Promise<void>;
  /** Leave record mode. Called on cancel, on an empty capture, and once a recording has landed. */
  onClose: () => void;
}

type Phase = { kind: "capturing" } | { kind: "working"; step: CanvasRecordingPhase } | { kind: "error"; message: string };

export function CanvasRecorder({ attach, onClose }: Props) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const uid = session?.user.id ?? null;
  const [active, setActive] = useState(true);
  const [discard, setDiscard] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "capturing" });

  const deliver = useCallback(async (blob: Blob, seconds: number) => {
    if (!accessToken || !uid) throw new Error("Sign in to save this recording.");
    try {
      const result = await deliverRecordingToCanvas(blob, seconds, {
        accessToken,
        attach: async (file) => { await attach([file]); },
        onPhase: (step) => setPhase({ kind: "working", step }),
        post: async (url, body, token) => {
          const response = await fetch(url, {
            body: JSON.stringify(body),
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            method: "POST",
          });
          return { body: await response.json().catch(() => null), ok: response.ok, status: response.status };
        },
        uid,
        upload: async (path, audio, contentType) =>
          await supabase.storage.from("recordings").upload(path, audio, { contentType, upsert: false }),
      });
      if (!result.attached) {
        // Heard nothing. Naming it is the whole point: a muted microphone and a quiet room are
        // indistinguishable to the gate, and an empty source on the canvas would read as Nemesis
        // failing to understand the lecture rather than as there being nothing to understand.
        setPhase({ kind: "error", message: "Nemesis did not hear anything in that recording, so nothing was added." });
        return;
      }
      onClose();
    } catch (caught) {
      // 🔴 THE PANEL STAYS UP ON FAILURE. `onClose` here would take the sentence away with it, and
      // the learner would be left with a canvas that silently gained nothing after they recorded a
      // whole lecture. The audio is still in storage either way.
      setPhase({ kind: "error", message: (caught as Error)?.message || "That recording could not be added to this canvas." });
    }
  }, [accessToken, attach, onClose, uid]);

  const cancel = useCallback(() => {
    // One decision, one commit — the hook reads `discard` at the moment `active` goes false, so
    // setting them apart would run the save path for a recording the learner just cancelled.
    setDiscard(true);
    setActive(false);
  }, []);

  const working = phase.kind === "working";
  const failed = phase.kind === "error";

  const limitLine = useMemo(() => (
    // 🔴 WHAT ACTUALLY HAPPENS, NOT A HEDGE. "Transcription may fail" would tell them nothing they
    // could act on. This names the one action that loses the transcript, and says in the same
    // breath what is NOT lost, because "keep this tab open" with no reason reads as superstition.
    "Keep this tab open until it finishes — your audio is saved either way, but the writing-up happens here."
  ), []);

  return (
    <div className="mx-auto w-full max-w-[770px]" data-slot="canvas-recorder">
      <RecordWorkspace
        accessToken={accessToken}
        active={active}
        className="h-[220px]"
        deliver={deliver}
        discard={discard}
        onDiscarded={onClose}
        onEmpty={onClose}
        uid={uid}
      />

      <div className="mt-3 flex items-center gap-3">
        {failed ? (
          <>
            <p className="min-w-0 flex-1 text-[0.8125rem] text-(--ui-text-secondary)">{phase.message}</p>
            <button
              className="shrink-0 rounded-full bg-(--ui-bg-tertiary) px-3.5 py-1.5 text-[0.8125rem] text-(--ui-text-primary) hover:bg-(--ui-bg-quaternary)"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </>
        ) : working ? (
          <p className="flex min-w-0 flex-1 items-center gap-2 text-[0.8125rem] text-(--ui-text-secondary)">
            <Codicon name="loading" size="14px" spinning />
            {canvasRecordingCopy(phase.step)}
          </p>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-[0.75rem] leading-relaxed text-(--ui-text-quaternary)">{limitLine}</p>
            <button
              aria-label="Cancel recording"
              className="shrink-0 px-2 py-1.5 text-[0.8125rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={cancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="shrink-0 rounded-full bg-(--ui-action) px-4 py-1.5 text-[0.8125rem] font-medium text-(--ui-bg-editor) hover:opacity-90"
              // Stop, not "save": clearing `active` without `discard` is what runs the finish path.
              onClick={() => setActive(false)}
              type="button"
            >
              Stop and add to this canvas
            </button>
          </>
        )}
      </div>
    </div>
  );
}
