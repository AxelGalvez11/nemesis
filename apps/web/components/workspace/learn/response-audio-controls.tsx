"use client";

// "Read this one to me" — the only voice control that still belongs to a single answer.
//
// 🔴🔴 THE TRANSPORT LEFT THIS FILE ON 2026-08-25 AND IS NOW `canvas-audio-bar.tsx`. Owner, with a
// canvas on screen: *"when user has voice to speak responses outloud could the popup be in the
// upper left either next to the upper left icons in canvas?"* — shown both edges, they chose the
// right, beside the ⚏ and ⋯ they already use.
//
// 🔴 WHY THE SPLIT FALLS HERE, AND NOT SOMEWHERE ELSE. Start is a fact about an ANSWER: "read me
// THIS paragraph" only means something while you can see which paragraph. Pause, back ten, speed
// and stop are facts about what is PLAYING, and what is playing outlives the scroll position — under
// the answer they scrolled away the moment the learner read on, so pausing meant hunting back up the
// page for the row that started it. One question each, one home each.
//
// 🔴 STILL NO CARD, NO BORDER, NO TOOLBAR (owner, 2026-08-22: *"quiet, compact, only prominent while
// relevant… the main content should remain the focus"*). This is one glyph in the same 28px row as
// Copy, and `reply-actions.test.ts` holds that.

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import type { ResponseAudio } from "./use-response-audio";

/** The control shape this row's buttons share — Copy's, exactly. */
const BUTTON =
  "flex h-[28px] shrink-0 items-center justify-center gap-1 rounded-[6px] px-1.5 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)";

/** What a failure says, in the learner's terms rather than the provider's. */
function failureCopy(failure: NonNullable<ResponseAudio["failure"]>): string {
  switch (failure) {
    case "not-signed-in":
      return "Sign in to hear this.";
    case "not-configured":
      return "Voice is not set up yet.";
    case "voice-quota":
      return "You have used this month's voice time.";
    case "playback-blocked":
      return "Press play to start the audio.";
    default:
      return "Audio unavailable.";
  }
}

export function ResponseAudioControls({ audio, text }: { audio: ResponseAudio; text: string }) {
  const open = audio.status !== "idle";

  return (
    <>
      {/* 🔴 ONE BUTTON, TWO STATES, BECAUSE START AND DISMISS ARE THE ONLY TWO WISHES THIS POSITION
          CAN CARRY. With nothing playing it is "read this to me"; with audio on screen the only
          remaining wish HERE is "put it away" — everything between the two now lives in the header
          bar, where it stays on screen while the answer scrolls. */}
      <button
        aria-label={open ? "Stop reading" : "Read aloud"}
        className={cn(BUTTON, open && "text-(--ui-text-secondary)")}
        onClick={() => (open ? audio.stop() : audio.start(text))}
        title={open ? "Stop reading" : "Read aloud"}
        type="button"
      >
        <Codicon name={open ? "close" : "unmute"} size="15px" spinning={false} />
      </button>

      {audio.failure && (
        // Named, not silent. A learner pressing play and hearing nothing needs to know the sound
        // failed rather than concluding the answer has none.
        <span className="shrink-0 pl-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          {failureCopy(audio.failure)}
        </span>
      )}
    </>
  );
}
