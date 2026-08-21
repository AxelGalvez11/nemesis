"use client";

// What Nemesis says it is doing, and the working behind it.
//
// 🔴🔴 TWO CHANNELS, AND THE WHOLE DESIGN IS THAT THEY ARE NOT THE SAME KIND OF THING. Owner,
// 2026-08-21: *"show the plan and hide internal thoughts."*
//
//   · THE PLAN is a commitment. The model states, before it works, what it is about to do — and
//     `readTurnDecision` refuses one that claims a step this turn did not ask for. It is short, it
//     is in the learner's language, and it is on screen without being asked for.
//   · THE THOUGHTS are `reasoning_content`: guesses, contradictions, branches the model abandoned.
//     They are genuinely useful to somebody checking the working and genuinely misleading printed
//     as prose, because a discarded branch and a conclusion look identical in plain text. So they
//     sit behind a control, collapsed, labelled as thinking.
//
// 🔴 THE ASYMMETRY IS THE POINT. A product that showed both the same way would be claiming its
// half-formed guesses are answers; one that showed neither would be the shimmer that told the
// owner nothing for months. What earns a place on screen unasked is the claim that can be checked.
//
// 🔴 AND NOTHING HERE NARRATES. `thinking-phases.ts` rules that a caption is only ever the name of
// a step that is genuinely executing — "a caption that walked 'Mapping what you know → Finding the
// next gap' on a 900ms interval would look exactly like a system thinking". This file has no
// clock, no list and no progress: the plan is a string the model wrote, and the working is a
// string the model streamed. If neither exists, nothing renders.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";

export function CanvasReasoning({
  plan = null,
  thinking = "",
  working = false,
}: {
  /** The model's stated intention for this turn, already checked against what ran. */
  plan?: string | null;
  /** The reasoner's raw output. Empty on every turn the cheap model answered. */
  thinking?: string;
  /**
   * The turn is still in flight.
   *
   * 🔴 IT DECIDES WHETHER THE PLAN IS STILL A PROMISE. "Checking the current guidance, then
   * comparing it with your notes" is worth reading while you wait and is noise once the answer is
   * sitting underneath it — at that point the learner can see what was done. So the plan is
   * transient and the working is not: one is about the wait, the other is about the answer.
   */
  working?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const showPlan = working && Boolean(plan);
  const showThinking = !working && thinking.trim().length > 0;
  if (!showPlan && !showThinking) return null;

  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6">
      {showPlan && (
        // 🔴 LIT LEFT TO RIGHT, LIKE EVERY OTHER "SOMETHING IS HAPPENING" IN THIS PRODUCT. §20 asks
        // for one motion system, and the plan is the same claim the thinking caption makes with
        // more words in it — a second treatment would read as a second kind of event.
        <p aria-live="polite" className="canvas-thinking-word text-[length:var(--canvas-text-small)]" role="status">
          {plan}
        </p>
      )}
      {showThinking && (
        <div>
          {/* 🔴 A BUTTON, CLOSED BY DEFAULT, AND THE DEFAULT IS THE DECISION. Open by default would
              put a model's abandoned branches above its answer on every single turn, which is the
              failure mode this whole split exists to avoid. */}
          <button
            aria-expanded={open}
            className="flex items-center gap-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:text-(--ui-text-secondary)"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <Codicon name={open ? "chevron-down" : "chevron-right"} size="12px" />
            {open ? "Hide thinking" : "Show thinking"}
          </button>
          {open && (
            // 🔴 LABELLED AS WHAT IT IS, IN THE SAME BREATH AS SHOWING IT. Somebody who opens this
            // is looking for the working, and the one thing they must not conclude is that these
            // sentences are what Nemesis decided — a model talks itself out of things in here.
            <div className="mt-2 rounded-(--radius-md) bg-(--ui-bg-tertiary) px-3 py-2.5">
              <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                Nemesis&rsquo;s working. Not its answer, and not checked.
              </p>
              {/* `whitespace-pre-wrap` because the reasoner writes in paragraphs and reflowing them
                  into one block loses the shape of the argument it was making. */}
              <p className="mt-1.5 whitespace-pre-wrap text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-tertiary)">
                {thinking.trim()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
