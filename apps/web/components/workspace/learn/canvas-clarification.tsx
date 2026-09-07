"use client";

// The question Nemesis asks when one decision genuinely changes what it is about to build.
//
// 🔴🔴 IT LIVES INSIDE THE COMPOSER NOW, AS CHATGPT WORK'S DOES (owner 2026-09-06: *"pay attention
// to how it asks user questions too"*; his answer to the question of the countdown: *"Same look, no
// countdown"*). Measured off his screenshot (docs/chatgpt-work-chat-reference.md §4): the composer
// card keeps its width and radius; a header row with the question and an X; one row per option,
// 46px tall, a 32px round number with a hairline ring, then the label; the LAST row is the
// composer's own text field carrying the next number and "Or describe something else", with a
// Skip pill at its right. Theirs counts down 35s and proceeds alone; ours waits.
//
// 🔴 THIS FILE DRAWS THE HEADER AND THE OPTIONS ONLY. The text row is the composer's textarea and
// the Skip pill is in the composer's control row (canvas-composer.tsx), so a typed answer, a
// tapped option and a skip all leave through `onClarify`, one route (see composer-intent.ts).
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

import { Codicon } from "@/components/desktop-ui/codicon";

import type { UserQuestion } from "@/lib/learn/clarify-question";

export function CanvasClarification({
  question,
  onAnswer,
  onDismiss,
}: {
  question: UserQuestion;
  /**
   * The learner answered by tapping an option. A tap sends the option's LABEL, which is exactly
   * what typing that label into the composer would have sent, and `readClarifyAnswer` resolves it
   * back to the option: the mouse route and the keyboard route are one code path with one meaning.
   */
  onAnswer: (text: string) => void;
  /**
   * They closed it instead. Closing is not answering, and the turn is dropped rather than guessed
   * at; picking a default on their behalf would be the software deciding the exact thing it just
   * said it could not. (Skip, in the composer's row, is the learner SAYING "use your judgment".)
   */
  onDismiss: () => void;
}) {
  return (
    <div className="px-[12px] pt-[12px]" data-composer-question="">
      <div className="flex items-start gap-[8px] pl-[12px]">
        <h2 className="min-w-0 flex-1 py-[6px] text-[length:var(--canvas-text-body)] font-medium leading-[24px] text-(--ui-text-primary)">{question.prompt}</h2>
        <button
          aria-label="Dismiss this question"
          className="flex size-[36px] shrink-0 items-center justify-center rounded-[8px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onDismiss}
          type="button"
        >
          <Codicon name="close" size="20px" />
        </button>
      </div>
      {/* 🔴 `list-none` AND `bg-transparent` ARE EXPLICIT, NOT REDUNDANT. This app carries a
          stylesheet that gives every `button` and `li` OUTSIDE `[data-workspace]` a marketing
          treatment, and the canvas only escapes it by being inside that attribute. */}
      <ul className="m-0 mt-[4px] flex list-none flex-col p-0">
        {question.options.map((option, index) => (
          <li key={option.id}>
            <button
              className="flex h-[46px] w-full items-center gap-[16px] rounded-[23px] bg-transparent px-[8px] text-left transition-colors hover:bg-(--ui-bg-tertiary)"
              onClick={() => onAnswer(option.label)}
              title={option.description || undefined}
              type="button"
            >
              <QuestionNumber n={index + 1} />
              <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-body)] leading-[24px] text-(--ui-text-primary)">{option.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The 32px round number every row carries, hairline ring, the composer's text row included. */
export function QuestionNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)"
      data-question-number=""
    >
      {n}
    </span>
  );
}
