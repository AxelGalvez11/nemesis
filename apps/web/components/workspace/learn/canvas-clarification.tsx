"use client";

// The card Nemesis puts up when one decision genuinely changes what it is about to build.
//
// 🔴🔴 IT IS NOT AN ANSWER SURFACE, AND THAT DISTINCTION IS THE WHOLE OF ITS SAFETY. The primary
// composer stays on screen underneath it and is still the one place a submission is routed from —
// see `composerIntent`, which returns `clarify` while this is up, so typing and tapping reach the
// identical handler. A card with its own text box would be a second composer, and two composers on
// one surface is how the original typed-answer defect happened: two routes, one of which nobody
// updated. These buttons are a shortcut for typing the label, nothing more.
//
// 🔴 NO PROGRESS, NO STEP COUNT, NO "1 of 3". There is exactly one pending question by construction
// (see `use-canvas-session.ts`), and chrome implying a sequence would turn a single decision into
// something that reads like onboarding — which is the thing this feature exists NOT to be.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. Nothing here knows what any option means, so a law student's
// card and a mechanical engineer's card are drawn by one component with one rule.

import { useEffect, useState } from "react";

import type { UserQuestion } from "@/lib/learn/clarify-question";

export function CanvasClarification({
  question,
  onAnswer,
  onDismiss,
}: {
  question: UserQuestion;
  /**
   * The learner answered — by tapping an option, or by writing one.
   *
   * 🔴🔴 ONE HANDLER FOR BOTH, CARRYING TEXT EITHER WAY, AND THAT IS WHAT MAKES THE SECOND BOX
   * SAFE. A tap sends the option's LABEL, which is exactly what typing that label would have sent,
   * and `readClarifyAnswer` resolves it back to the option. So the mouse route and the two keyboard
   * routes (this box, and the primary composer below) are one code path with one meaning. The
   * original canvas-wiping defect was two text surfaces reaching two DIFFERENT destinations; two
   * reaching the same function is not that, and the compiler holds it that way.
   */
  onAnswer: (text: string) => void;
  /**
   * They closed it instead.
   *
   * 🔴 CLOSING IS NOT ANSWERING, AND THE TURN IS DROPPED RATHER THAN GUESSED AT. Picking a default
   * on their behalf would be the software deciding the exact thing it just said it could not.
   */
  onDismiss: () => void;
}) {
  const [written, setWritten] = useState("");
  // 🔴 A NEW QUESTION CLEARS THE BOX. Half an answer to the previous question, left sitting under
  // the next one, is the same class of defect as a note pad outliving the prompt it was opened for
  // — see `canvas-composer.tsx`'s own `taskId` effect, which does this for exactly that reason.
  useEffect(() => setWritten(""), [question.id]);
  const ready = written.trim().length > 0;

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setWritten("");
    onAnswer(value);
  };

  return (
    <section
      aria-label={question.prompt}
      className="canvas-swap mt-5 rounded-2xl p-4 ring-1 ring-(--ui-stroke-secondary)"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[length:var(--canvas-text-body)] font-medium leading-snug text-(--ui-text-primary)">
          {question.prompt}
        </h2>
        <button
          aria-label="Dismiss this question"
          className="-mr-1 -mt-1 shrink-0 rounded-full bg-transparent px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onDismiss}
          type="button"
        >
          ✕
        </button>
      </div>

      {/* 🔴 `list-none` AND `bg-transparent` ARE EXPLICIT, NOT REDUNDANT. This app carries a
          stylesheet that gives every `button` and `li` OUTSIDE `[data-workspace]` a marketing
          treatment — a blue fill and a disc bullet — and the canvas only escapes it by being inside
          that attribute. Relying on an ancestor two components away for "buttons are not blue" is
          how a card renders correctly here and wrong the first time it is used anywhere else. */}
      <ul className="mt-3 flex list-none flex-col gap-1.5">
        {question.options.map((option) => (
          <li key={option.id}>
            <button
              className="w-full rounded-xl bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)"
              onClick={() => send(option.label)}
              type="button"
            >
              <span className="block text-[length:var(--canvas-text-body)] leading-snug text-(--ui-text-primary)">
                {option.label}
              </span>
              {/* 🔴 THE REASON TO PICK IT, NOT A RESTATEMENT OF THE LABEL. `clarify-question.ts`
                  drops a blank description rather than echoing the label into it, so an absent one
                  here means the label really was self-explaining. */}
              {option.description && (
                <span className="mt-0.5 block text-[length:var(--canvas-text-meta)] leading-snug text-(--ui-text-secondary)">
                  {option.description}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* 🔴 CONDITIONAL, BECAUSE `invitesWritten: false` MEANS THE MODEL BELIEVES THE OPTIONS ARE
          THE WHOLE SPACE. Drawing the row anyway would advertise a path it did not intend. It never
          BLOCKS prose — the primary composer below is routed to this question whatever this says,
          which is documented on `UserQuestion.invitesWritten` and is why that field is named for
          the invitation rather than for the capability. */}
      {question.invitesWritten && (
        <div className="mt-1.5 rounded-xl px-3 py-2.5">
          <span className="block text-[length:var(--canvas-text-body)] leading-snug text-(--ui-text-primary)">
            Other
          </span>
          <input
            aria-label="Write your own answer"
            // 🔴 `border`, NOT `ring`. Measured in the browser: the ring resolved to a fully transparent
            // shadow on this input, so the box had no edge at all once focused — a text field with no
            // visible boundary reads as a label, not as somewhere to type.
            className="mt-1.5 w-full rounded-lg border border-(--ui-stroke-secondary) bg-transparent px-3 py-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-stroke-primary)"
            onChange={(event) => setWritten(event.target.value)}
            // 🔴 ENTER SENDS, BECAUSE A BOX THAT SWALLOWS ENTER READS AS BROKEN. Everywhere else in
            // this product Enter submits, and a learner who types four words and presses it should
            // not have to go looking for the button.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              send(written);
            }}
            placeholder="Type your own answer here"
            value={written}
          />
        </div>
      )}

      {/* 🔴🔴 IT BELONGS TO THE WRITTEN ANSWER, NOT TO THE CARD, WHICH IS WHY IT IS NOT ALWAYS
          THERE. Tapping an option IS the submission — a card where four options need a fifth click
          to take effect makes every choice two actions and makes the button look like the only way
          to answer. Prose is the one answer with no natural moment of commitment, so it gets the
          button, and only once there is something to commit.

          🔴 AND IT IS ABSENT RATHER THAN DISABLED. A greyed-out control asks the learner to work
          out what would switch it on; nothing there asks nothing of them, and the box above is
          already the affordance. This codebase's most-repeated defect is a control that does not do
          anything. */}
      {ready && (
        <div className="mt-3 flex justify-end">
          <button
            // 🔴 THE APP'S ONE ACTION COLOUR, THE SAME PAIR THE COMPOSER'S SEND USES. The first version
            // painted this `bg-(--ui-text-primary)` over `text-(--ui-bg-primary)`, which reads like a
            // sensible inversion and is not one: `--ui-bg-primary` is a translucent tint rather than an
            // opaque colour, so in dark mode the label came out white on a white pill. Found by
            // looking at it, which is the only way that class of bug is ever found.
            className="rounded-full bg-(--ui-action) px-4 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-action-glyph) transition-opacity hover:opacity-90"
            onClick={() => send(written)}
            type="button"
          >
            Submit
          </button>
        </div>
      )}
    </section>
  );
}
