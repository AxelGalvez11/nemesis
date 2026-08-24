"use client";

// The test the learner clicks through, in the chat, one question at a time.
//
// 🔴🔴 NAMED `CanvasCheck`, AND NOT `CanvasTest`, BECAUSE THAT NAME IS BANNED. `<CanvasTest` was
// one of the six-stage machine's answer surfaces; `canvas-runtime-branch.test.ts` forbids it and
// three siblings from ever appearing in `learning-canvas.tsx` again, because each REPLACED the
// page and claimed the composer, and two of them on one screen meant two rivals for one input.
// This card is a different species — it composes on top of the material and collects answers by
// TAP ONLY — but reusing the banned name would make that guard ambiguous forever and bury the
// history. The contract's own word for what the learner asked for is "checked", so: check.
//
// Owner 2026-08-24: *"The 'tests' are supposed to be in chat chips for users to click through."*
//
// 🔴🔴 A SEPARATE COMPONENT FROM `CanvasClarification`, AND THE PROGRESS COUNT IS EXACTLY WHY.
// That card's header forbids a step count in the strongest terms — *"NO PROGRESS, NO STEP COUNT,
// NO '1 of 3'"* — because there is exactly one pending question by construction and chrome
// implying a sequence would make a single decision read like onboarding. A test IS a sequence.
// Knowing there are four questions left is the difference between answering and wondering how
// long this goes on. So the two cards share a visual language and disagree about this one thing,
// which is a reason to have two components rather than one with a `showProgress` flag: the
// clarification card's rule stays absolute where it applies.
//
// 🔴🔴 IT IS NOT AN ANSWER SURFACE FOR THE COMPOSER, AND THAT DISTINCTION IS INHERITED. Tapping
// an option answers THIS question and nothing else; the composer below is untouched and still
// routes wherever it normally would. A test does not capture the learner's typing.
//
// 🔴 NOTHING HERE IS KEPT. The run lives in this component's state and dies with it — owner's
// rule that a test never becomes an artifact. The ONLY thing that outlives it is a deck made
// from the misses, and that is an explicit press, not an automatic write.
//
// 🔴 `list-none` AND `bg-transparent` ARE EXPLICIT, NOT REDUNDANT — this app's stylesheet gives
// every `button` and `li` outside `[data-workspace]` a blue marketing fill and a disc bullet.
// Same reason `canvas-clarification.tsx` states them.

import { useEffect, useState } from "react";

import type { DistractorGround } from "@/lib/learn/choice-set";
import { missedObjectives, scoreTestRun, verdictFor, type TestRun, type TestScore } from "@/lib/learn/test-run";

export function CanvasCheck({
  run,
  onDismiss,
  onMakeCards,
  making = false,
}: {
  run: TestRun;
  /** They closed the test. Nothing is scored and nothing is kept. */
  onDismiss: () => void;
  /**
   * Make a deck from the objectives they missed.
   *
   * 🔴 THE ONLY WAY ANYTHING SURVIVES A TEST, AND IT IS A PRESS. Writing a deck automatically at
   * the end would put a Library artifact in front of someone who just wanted to check themselves,
   * which is the thing "tests stay in the chat" rules out.
   */
  onMakeCards: (objectiveKeys: readonly string[]) => void;
  /** A deck is being made right now. */
  making?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const [done, setDone] = useState(false);

  // A different run is a different test. Without this, opening a second test after a first would
  // resume halfway through the old one's answers.
  useEffect(() => {
    setIndex(0);
    setPicks([]);
    setDone(false);
  }, [run]);

  const question = run.questions[index];
  const picked = picks[index] ?? null;
  const verdict = question && picked !== null ? verdictFor(question, picked) : null;
  const last = index === run.questions.length - 1;

  if (done) {
    const score = scoreTestRun(run, picks);
    return <CheckResult making={making} onDismiss={onDismiss} onMakeCards={onMakeCards} score={score} />;
  }

  if (!question) return null;

  return (
    <section
      aria-label={`Question ${index + 1} of ${run.questions.length}`}
      className="canvas-swap mt-5 rounded-2xl p-4 ring-1 ring-(--ui-stroke-secondary)"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[length:var(--canvas-text-meta)] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">
          Question {index + 1} of {run.questions.length}
        </p>
        <button
          aria-label="Stop this test"
          className="-mr-1 -mt-1 shrink-0 rounded-full bg-transparent px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onDismiss}
          type="button"
        >
          ✕
        </button>
      </div>

      <h2 className="mt-2 text-[length:var(--canvas-text-body)] font-medium leading-snug text-(--ui-text-primary)">
        {question.prompt}
      </h2>

      <ul className="mt-3 flex list-none flex-col gap-1.5">
        {question.options.map((option) => {
          // 🔴 AFTER THE TAP THE RIGHT ANSWER IS ALWAYS MARKED, NOT ONLY WHEN THEY MISSED IT. A
          // learner who guessed correctly still needs to see WHICH one was right to learn anything
          // from it, and marking it only on failure would make the marking itself the verdict.
          const answered = picked !== null;
          const isAnswer = option.correct;
          const isPick = option.text === picked;
          return (
            <li key={option.text}>
              <button
                aria-pressed={isPick}
                className={[
                  "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                  answered ? "cursor-default" : "bg-transparent hover:bg-(--ui-bg-tertiary)",
                  answered && isAnswer ? "bg-(--ui-bg-tertiary) ring-1 ring-(--ui-stroke-primary)" : "",
                  answered && isPick && !isAnswer ? "bg-(--ui-bg-tertiary) opacity-70" : "",
                  answered && !isAnswer && !isPick ? "bg-transparent opacity-45" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={answered}
                onClick={() => setPicks((was) => Object.assign([...was], { [index]: option.text }))}
                type="button"
              >
                <span className="block text-[length:var(--canvas-text-body)] leading-snug text-(--ui-text-primary)">
                  {option.text}
                </span>
                {answered && isAnswer && (
                  <span className="mt-0.5 block text-[length:var(--canvas-text-meta)] leading-snug text-(--ui-text-secondary)">
                    The answer
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {verdict && (
        <div className="mt-3 border-t border-(--ui-stroke-tertiary) pt-3">
          <p className="text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-primary)">
            {verdict.correct ? "Correct." : groundedMiss(verdict.chosen?.ground)}
          </p>
          <button
            className="mt-3 rounded-xl bg-(--ui-bg-tertiary) px-3.5 py-2 text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary) transition-colors hover:bg-(--ui-control-hover-background)"
            onClick={() => (last ? setDone(true) : setIndex((was) => was + 1))}
            type="button"
          >
            {last ? "See how you did" : "Next question"}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * What to say about a wrong tap.
 *
 * 🔴🔴 THE GROUND IS THE WHOLE REASON MULTIPLE CHOICE IS ALLOWED HERE. `choice-set.ts` mints every
 * distractor from a named competing model, so a wrong tap is a belief stated in advance rather
 * than a guess — and `canvas-model.ts`'s standing objection to multiple choice (*"you cannot
 * detect a misconception from which of four options someone clicked"*) is answered by exactly
 * that. Saying which KIND of wrong it was is the visible half of that answer.
 *
 * 🔴 AND IT NEVER QUOTES THE BELIEF BACK AS THOUGH IT WERE TRUE. "You think X" is a sentence this
 * card has no standing to write; naming the shape of the confusion does the same work honestly.
 *
 * 🔴 STRUCTURAL, NEVER SUBJECT-MATTER — nothing here reads a word of any field (CLAUDE.md).
 */
export function groundedMiss(ground: DistractorGround | undefined): string {
  // 🔴 A `switch` OVER THE UNION, NOT AN `if` CHAIN ON STRINGS, AND THAT IS NOT STYLE. The first
  // draft of this function tested for `"same_output_role"`, a kind that does not exist — the real
  // one is `sibling_answer` — so that branch was dead and every sibling miss silently fell through
  // to the generic sentence. Typing the parameter as the union is what makes the compiler catch
  // the next such typo, and `groundSentences` below is what makes a NEW kind impossible to ignore.
  switch (ground?.kind) {
    case "held_misconception":
      return "Not quite, and this one has come up before. The marked option is the answer.";
    case "neighbouring_class":
      return "Not quite. That is the neighbouring case your material sets this one against.";
    case "sibling_answer":
      return "Not quite. That is the answer to a different question of the same shape.";
    default:
      return "Not quite. The marked option is the answer.";
  }
}

function CheckResult({
  score,
  onDismiss,
  onMakeCards,
  making,
}: {
  score: TestScore;
  onDismiss: () => void;
  onMakeCards: (objectiveKeys: readonly string[]) => void;
  making: boolean;
}) {
  const missed = missedObjectives(score);
  return (
    <section aria-label="How you did" className="canvas-swap mt-5 rounded-2xl p-4 ring-1 ring-(--ui-stroke-secondary)">
      <h2 className="text-[length:var(--canvas-text-body)] font-medium leading-snug text-(--ui-text-primary)">
        {score.correct} out of {score.total}
      </h2>
      <p className="mt-1 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)">
        {missed.length === 0
          ? "Nothing missed. Nothing to turn into cards."
          : `You missed ${missed.length} ${missed.length === 1 ? "thing" : "things"}. Cards for exactly those will come back until they stick.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* 🔴 ABSENT RATHER THAN DISABLED WHEN THERE IS NOTHING TO MAKE. A greyed-out button asks
            the learner to work out what would switch it on; this codebase's most-repeated defect
            is a control that does not do anything. */}
        {missed.length > 0 && (
          <button
            className="rounded-xl bg-(--ui-bg-tertiary) px-3.5 py-2 text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary) transition-colors hover:bg-(--ui-control-hover-background) disabled:opacity-60"
            disabled={making}
            onClick={() => onMakeCards(missed)}
            type="button"
          >
            {making ? "Making cards…" : "Make cards from what I missed"}
          </button>
        )}
        <button
          className="rounded-xl bg-transparent px-3.5 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
          onClick={onDismiss}
          type="button"
        >
          Done
        </button>
      </div>
    </section>
  );
}
