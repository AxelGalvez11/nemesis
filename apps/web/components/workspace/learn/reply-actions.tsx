"use client";

// The row of controls under an answer: copy it, hear it, and move through what you are hearing.
//
// Owner, 2026-08-20: *"add the chatgpt style icons at the end of responses for copying and also for
// voice, there should also be a control for controlling the voice speaking speed."*
// Owner, 2026-08-22: *"I do not want a large traditional audio-player card appearing under every
// Nemesis response… quiet, compact, only prominent while relevant."*
//
// 🔴 UNDER THE ANSWER, NOT IN THE HEADER, AND THAT IS THE WHOLE POINT OF THE ROW. The Canvas menu
// holds one voice decision — whether Nemesis starts reading by itself. This is the other question:
// "read me THIS", and then "no, back up ten seconds". A learner who wants one paragraph aloud
// should not have to turn a mode on, listen, and turn it off again.
//
// 🔴 IT DOES NOT APPEAR WHILE THE TURN IS STILL ARRIVING. Copying half an answer copies half an
// answer, and a play button on a sentence that is about to be replaced reads as broken.
//
// 🔴 THE PLAYBACK CONTROLS ARE A SIBLING, NOT A CARD BELOW. They live in this same 28px icon row
// and grow into it while there is audio — see `response-audio-controls.tsx` for why there is no
// border, no background and no toolbar anywhere in this feature.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import { ResponseAudioControls } from "./response-audio-controls";
import type { ResponseAudio } from "./use-response-audio";

/** How long the copy control stays acknowledged. Long enough to read, short enough not to linger. */
const COPIED_MS = 1600;

export function ReplyActions({
  audio,
  spoken,
  text,
}: {
  /**
   * This answer's audio — generation and playback both.
   *
   * 🔴 THE CONTROLLER, NOT A PILE OF CALLBACKS. The previous shape was `onSpeak`/`onStop`/`speaking`
   * plus a separate `speed` and `onCycleSpeed` that belonged to a different concept entirely
   * (synthesis rate, posted to the provider). Passing the controller keeps play, pause, seek, rate
   * and progress reading from one state rather than from five props that can disagree.
   */
  audio: ResponseAudio;
  /**
   * The answer as the MODEL wrote it, marks and all, for the synthesiser.
   *
   * 🔴 RAW ON PURPOSE, AND DIFFERENT FROM `text` ON PURPOSE. `replySpeechPlan` reads the
   * `[say: es-MX | …]` marks to route each sentence to the voice that must say it; text that was
   * flattened for the clipboard has already lost them, and the Spanish sentence would be read by
   * the English prose voice — the exact miseducation §43 exists to prevent.
   */
  spoken: string;
  /** The answer, as plain text — for the clipboard. Markdown and citation markers are the
   *  renderer's business. */
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // 🔴 A REFUSED CLIPBOARD IS SILENT, NOT AN ERROR STRIP. `writeText` rejects when the document
      // is not focused or permission is denied — neither is something the learner did, and neither
      // is worth a red line across an answer they were reading. The button simply does not confirm.
    }
  };

  const button = "flex h-[28px] shrink-0 items-center justify-center gap-1 rounded-[6px] px-1.5 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)";

  return (
    <div className="mt-2 flex w-full min-w-0 items-center gap-0.5">
      <button
        aria-label={copied ? "Copied" : "Copy"}
        className={cn(button, copied && "text-(--ui-text-secondary)")}
        onClick={() => void copy()}
        title={copied ? "Copied" : "Copy"}
        type="button"
      >
        <Codicon name={copied ? "check" : "copy"} size="15px" />
      </button>

      <ResponseAudioControls audio={audio} text={spoken} />
    </div>
  );
}
