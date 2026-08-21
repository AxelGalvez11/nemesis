"use client";

// The row of controls under an answer: copy it, hear it, choose how fast.
//
// Owner, 2026-08-20: *"add the chatgpt style icons at the end of responses for copying and also for
// voice, there should also be a control for controlling the voice speaking speed."*
//
// 🔴 UNDER THE ANSWER, NOT IN THE HEADER, AND THAT IS THE WHOLE POINT OF ADDING IT. Voice already
// had a header toggle — a mode for the whole session. This is the other question: "read me THIS."
// A learner who wants one paragraph aloud should not have to turn a mode on, listen, and turn it
// off again, and the header control cannot express "this one".
//
// 🔴 IT DOES NOT APPEAR WHILE THE TURN IS STILL ARRIVING. Copying half an answer copies half an
// answer, and a play button on a sentence that is about to be replaced reads as broken.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { VoiceSpeed } from "@/lib/learn/voice-preferences";
import { cn } from "@/lib/utils";

/** How long the copy control stays acknowledged. Long enough to read, short enough not to linger. */
const COPIED_MS = 1600;

export function ReplyActions({
  onCycleSpeed,
  onSpeak,
  onStop,
  speaking,
  speed,
  text,
}: {
  onCycleSpeed: () => void;
  onSpeak: (text: string) => void;
  onStop: () => void;
  speaking: boolean;
  speed: VoiceSpeed;
  /** The answer, as plain text. Markdown and citation markers are the renderer's business. */
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

  const button = "flex h-[28px] items-center justify-center gap-1 rounded-[6px] px-1.5 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)";

  return (
    <div className="mt-2 flex items-center gap-0.5">
      <button
        aria-label={copied ? "Copied" : "Copy"}
        className={cn(button, copied && "text-(--ui-text-secondary)")}
        onClick={() => void copy()}
        title={copied ? "Copied" : "Copy"}
        type="button"
      >
        <Codicon name={copied ? "check" : "copy"} size="15px" />
      </button>

      {/* 🔴 ONE BUTTON, TWO STATES, BECAUSE THEY ARE ONE INTENTION. A separate stop control would be
          dead on every answer that is not currently playing — this codebase's most-repeated defect
          is a control that does nothing. */}
      <button
        aria-label={speaking ? "Stop" : "Read aloud"}
        className={cn(button, speaking && "text-(--ui-text-secondary)")}
        onClick={() => (speaking ? onStop() : onSpeak(text))}
        title={speaking ? "Stop" : "Read aloud"}
        type="button"
      >
        <Codicon name={speaking ? "debug-stop" : "unmute"} size="15px" />
      </button>

      {/* 🔴 THE SPEED SHOWS ITS VALUE RATHER THAN AN ICON. A gauge glyph would say "speed exists";
          "1.5×" says what it is set to now, which is the only thing worth knowing at a glance —
          and it is why this control needs no open state, no menu and no second click. */}
      <button
        aria-label={`Reading speed ${speed}×. Press to change.`}
        className={cn(button, "text-[length:var(--canvas-text-meta)] tabular-nums", speed !== 1 && "text-(--ui-text-secondary)")}
        onClick={onCycleSpeed}
        title={`Reading speed ${speed}×`}
        type="button"
      >
        {speed}×
      </button>
    </div>
  );
}
