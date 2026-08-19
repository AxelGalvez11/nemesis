"use client";

// What Nemesis says back, as a Canvas state rather than as a message in a list.
//
// 🔴🔴 THE WHOLE POINT IS THAT IT IS NOT A CHAT TURN (owner, 2026-08-19):
//
// > "The Canvas should not display a growing chat history… user input → DeepSeek interprets it →
// > Canvas changes… I want the visual metaphor to be closer to a teacher continuously changing a
// > whiteboard. The teacher remembers everything. The transcript stores everything. The Canvas only
// > shows what deserves attention now."
//
// So there is no learner bubble above this, nothing accumulates below it, and it does not enter
// from the bottom the way a message does. It fades in over whatever was already there, that
// material recedes behind it, and then it either leaves by itself or waits — and when it leaves,
// the lesson underneath is exactly where the learner left it. Nobody had to navigate anywhere,
// because nothing ever went away.
//
// 🔴 IT IS A COMPONENT RATHER THAN JSX INSIDE `learning-canvas.tsx` FOR ONE STRUCTURAL REASON:
// `useScreenExit`'s timer resets on MOUNT, not on a prop change, so consecutive replies with the
// same computed duration would have the second one acknowledged on its first render. Keying this
// component on the reply's own text is what makes each reply a new screen — the identical device
// `canvas-policy-view.tsx`'s `Frame` already relies on via `screenKey`. Written as a hook call up
// in the parent it would be a bug that only shows up when two replies happen to be the same
// length, which is most of the time for "Exactly." and "Correct."
//
// 🔴 AND IT DOES NOT DECIDE WHETHER IT GETS A `Continue`. `continueOwner` answers that once for the
// whole surface, so this and an unread passage can never both print one. See canvas-continue.ts.

import { hostnameOf } from "@/lib/favicon";
import { CONTINUE_LABEL } from "@/lib/learn/canvas-continue";
import type { Exposition } from "@/lib/learn/cognitive-mode";
import type { ChatWebResult } from "@/lib/workspace/chat-web-search";
import type { TurnOffer } from "@/lib/learn/turn-router";
import { Codicon } from "@/components/desktop-ui/codicon";
import { offerLine } from "./offer-copy";
import { useScreenExit } from "./use-screen-exit";

export interface CanvasReplyProps {
  /** What Nemesis said. The learner's own words are deliberately not part of this component's
   *  interface: they are not visual content (owner, 2026-08-19). */
  text: string;
  /** How this screen ends — a window it spends by itself, or `deliberate` and it waits. */
  exposition: Exposition;
  /** Puts the reply away. Wired to the timer AND to `Continue`, so both exits are the same act. */
  onDone: () => void;
  /**
   * §38's one button, when this region is the one that owns it. `null` otherwise.
   *
   * 🔴 PASSED IN RATHER THAN DERIVED. A reply that printed its own button whenever it felt like
   * material would put two "Continue"s in one viewport the moment it sat over an unread passage.
   */
  onContinue: (() => void) | null;
  /** Live pages the answer actually cited, each individually promotable to a durable source. */
  sources?: readonly ChatWebResult[];
  /** Promote one cited page into the canvas's material. */
  onKeepSource: (url: string) => void;
  /** The subject this turn named, or absent when it named none — the gate on "Learn this". */
  topic?: string;
  offer?: TurnOffer;
  onLearn: () => void;
}

export function CanvasReply({
  exposition,
  offer,
  onContinue,
  onDone,
  onKeepSource,
  onLearn,
  sources,
  text,
  topic,
}: CanvasReplyProps) {
  // 🔴 THE SAME EXIT EVERY OTHER SELF-ENDING CANVAS SCREEN USES. `blocked` is false because there is
  // nothing being written that an advance could race: a reply lands after `converse` has already
  // cleared the canvas's busy state, and putting it away writes no evidence. That is the difference
  // between this and the verdict screen, which must wait for its own evidence row.
  useScreenExit({ blocked: false, exposition, onAcknowledge: onDone });

  return (
    // 🔴 CENTRED IN THE SAME READING COLUMN AS EVERYTHING ELSE, NOT DOCKED TO AN EDGE. §46 asks the
    // canvas to read as one column; a reply pinned to a corner would be a notification, which is a
    // thing that happens ALONGSIDE what you are doing. This is the thing you are doing.
    // 🔴 `pointer-events-none` ON THE LAYER, RE-ENABLED ON THE CARD. The receded lesson behind is
    // still real text the learner may want to select or scroll while reading the answer about it;
    // an invisible full-bleed sheet swallowing those clicks is the exact failure `CanvasSurface`'s
    // own floating control strip documents.
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 pb-40 pt-[64px]">
      <div className="canvas-swap pointer-events-auto w-full max-w-(--canvas-column)">
        <p className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
          {text}
        </p>

        {/* Which live pages the answer actually used, each individually promotable. This is the
            "distinct" half of temporary-versus-durable: seeing it here is USING it for one answer;
            pressing the small `+` is the separate, explicit act of keeping it. */}
        {sources && sources.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {sources.map((source) => (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-(--ui-bg-elevated) py-0.5 pl-2.5 pr-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary) ring-1 ring-(--ui-stroke-tertiary)"
                key={source.url}
              >
                <a
                  className="hover:text-(--ui-text-primary)"
                  href={source.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {(hostnameOf(source.url) ?? source.url).replace(/^www\./, "")}
                </a>
                <button
                  aria-label={`Add ${source.url} to sources`}
                  className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={() => onKeepSource(source.url)}
                  title="Add to sources"
                  type="button"
                >
                  <Codicon name="add" size="0.625rem" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 🔴 A SUBJECT, NOT A QUESTION. This once read `aside.question`, which every turn has, so
            "Hello. What can I do for you?" came with a Learn this button that had nothing to start.
            The model says whether the turn named something worth learning; a greeting does not. */}
        {topic && (
          <div className="mt-3">
            {/* Only when Nemesis actually noticed something. A nudge on every reply is not a nudge,
                it is nagging, and the learner stops seeing it. */}
            {offerLine(offer) && (
              <p className="mb-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                {offerLine(offer)}
              </p>
            )}
            <button
              className="rounded-full px-3 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              onClick={onLearn}
              type="button"
            >
              Learn this
            </button>
          </div>
        )}

        {/* 🔴 THIS REPLACES A "Dismiss" LINK THAT WAS ON EVERY REPLY, INCLUDING "Hey." — and the
            swap is the owner's rule rather than a tidy-up: *"Trivial things vanish. Meaningful
            things wait for the learner."* A Dismiss on a greeting is housekeeping the learner has to
            do for the software; it also meant a two-word answer sat on screen until somebody
            noticed a grey link and clicked it. Now a trivial reply has NO control and leaves on its
            own, and a substantial one has the same single word every other reading requirement in
            this product has. Same label, same shape, same meaning: "I have finished with this." */}
        {onContinue && (
          <button
            className="mt-8 rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onContinue}
            type="button"
          >
            {CONTINUE_LABEL}
          </button>
        )}
      </div>
    </div>
  );
}
