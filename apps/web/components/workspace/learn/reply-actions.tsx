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

import { useEffect, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import { timeSince } from "./answer-time";
import { ResponseAudioControls } from "./response-audio-controls";
import type { ResponseAudio } from "./use-response-audio";

/** How long the copy control stays acknowledged. Long enough to read, short enough not to linger. */
const COPIED_MS = 1600;

export function ReplyActions({
  at,
  audio,
  onRetry,
  spoken,
  text,
}: {
  /**
   * When this answer arrived, for the "5 minutes ago" the reference carries at the end of the row.
   *
   * 🔴 OPTIONAL, AND ABSENT MEANS NO TIMESTAMP. The live answer has no recorded time until its
   * moment is written; printing "just now" for it would be a fact the surface invented.
   */
  at?: string;
  /** Re-asks the question that produced this answer. Absent when there is no question to re-ask. */
  onRetry?: () => void;
  /**
   * This answer's audio — generation and playback both.
   *
   * 🔴 THE CONTROLLER, NOT A PILE OF CALLBACKS. The previous shape was `onSpeak`/`onStop`/`speaking`
   * plus a separate `speed` and `onCycleSpeed` that belonged to a different concept entirely
   * (synthesis rate, posted to the provider). Passing the controller keeps play, pause, seek, rate
   * and progress reading from one state rather than from five props that can disagree.
   *
   * 🔴🔴 OPTIONAL SINCE 2026-08-26, AND THAT IS WHAT LET THIS BECOME THE ONE ROW. A turn in the
   * thread has no audio controller — the speech lane is keyed to the single reply on screen — so
   * before this it could not use this component at all, and a SECOND row got written for it. The
   * owner saw both under one answer: *"each output has double the action toolbar items at the
   * bottom."* With `audio` optional there is one row, and the playback half is simply absent for a
   * turn that cannot play.
   */
  audio?: ResponseAudio;
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
  /**
   * 🔴 READ ONCE PER MOUNT, NOT ON A TICKING CLOCK — a thread can hold eighty of these, and eighty
   * timers re-rendering every second to move "3 minutes" to "4 minutes" is a real cost for a fact
   * nobody is watching. It refreshes whenever the thread does, which is whenever anything happens.
   *
   * 🔴 AND IN AN EFFECT, because `Date.now()` during render differs between the server and the
   * client and React discards the tree for it.
   */
  const [since, setSince] = useState("");
  useEffect(() => {
    if (at) setSince(timeSince(at, Date.now()));
  }, [at]);

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

  // 🔴 A 32px SQUARE WITH A 20px GLYPH, MEASURED, NOT A 28px PILL WITH A 15px ONE. Read off the
  // reference in the owner's account 2026-08-31: every action under an answer is 32x32 with an 8px
  // radius and a 20px icon, and they sit FLUSH — the 6px of padding around each glyph is the only
  // thing between them, which is what makes the row read as one strip rather than separate chips.
  // 🔴 12px UNDER THE LAST LINE, AND THE STRIP HANGS 10px LEFT OF THE TEXT. Both measured. The
  // overhang is not a mistake: a 20px glyph centred in a 32px box needs the box to start left of
  // the column for the GLYPH to line up with the prose above it. `mt-2` was 18px here (112.5%
  // root) against their 12, and `gap-0.5` put 2px between boxes that theirs leaves touching.
  const button = "flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)";

  return (
    <div className="-ml-[10px] mt-[12px] flex w-full min-w-0 items-center gap-0">
      <button
        aria-label={copied ? "Copied" : "Copy"}
        className={cn(button, copied && "text-(--ui-text-secondary)")}
        onClick={() => void copy()}
        title={copied ? "Copied" : "Copy"}
        type="button"
      >
        <Codicon name={copied ? "check" : "copy"} size="20px" />
      </button>

      {audio && <ResponseAudioControls audio={audio} text={spoken} />}

      {onRetry && (
        <button aria-label="Retry" className={cn(button)} onClick={onRetry} title="Retry" type="button">
          <Codicon name="refresh" size="20px" />
        </button>
      )}

      {/* 🔴 11px, MEASURED off claude.ai (2026-08-26), and it sits AFTER the controls rather than
          opposite them. §46.3-exempt: measured value from the reference. */}
      {since && <span className="ml-2 shrink-0 text-[11px] leading-none text-(--ui-text-quaternary)">{since}</span>}
    </div>
  );
}
