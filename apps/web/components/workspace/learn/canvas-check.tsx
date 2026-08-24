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
// 🔴🔴 ANSWERS FIRST, MARKING AFTERWARDS — OWNER, 2026-08-24: *"I need that to just be one where
// the user does not immediately get feedback until the end. That way they can just go over what
// they missed after that. And that way it's not just like friction every time you click the
// answer."* The first version marked each tap on the spot and then demanded a second press on
// "Next question" to move on, so a five-question test cost ten presses and broke its own rhythm
// nine times. Now one tap answers and advances, and every verdict is held back to `CheckResult`.
//
// 🔴 THIS IS NOT A LOSS OF FEEDBACK, IT IS A MOVE OF IT. The review at the end says of EVERY
// question what the old card said of one: the prompt, what they picked, what was right, and the
// grounded sentence naming which competing model they acted on. Nothing that was shown before is
// gone; it arrives when they can act on the whole pattern rather than one question at a time.
//
// 🔴 AND A MIS-TAP IS RECOVERABLE, WHICH IT DID NOT HAVE TO BE BEFORE. While a tap was answered
// instantly the learner saw at once that they had hit the wrong row. Deferring the marking takes
// that away, so `Back` exists to give it back — it re-opens the previous question with their pick
// still selected and changeable. Without it, deferring feedback would have quietly made a slip
// permanent and invisible until the results.
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
  const last = index === run.questions.length - 1;

  if (done) {
    const score = scoreTestRun(run, picks);
    return <CheckResult making={making} onDismiss={onDismiss} onMakeCards={onMakeCards} picks={picks} run={run} score={score} />;
  }

  if (!question) return null;

  /**
   * One tap answers this question and moves on.
   *
   * 🔴 THE ADVANCE IS IN THE SAME HANDLER AS THE PICK, NOT IN AN EFFECT WATCHING `picks`. An
   * effect would also fire when `Back` re-selects an existing answer, bouncing the learner
   * straight forward again and making the back button impossible to use.
   */
  const answer = (text: string) => {
    setPicks((was) => Object.assign([...was], { [index]: text }));
    if (last) setDone(true);
    else setIndex((was) => was + 1);
  };

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
          // 🔴 NOTHING HERE KNOWS WHICH OPTION IS CORRECT, AND THAT IS THE POINT OF THE CHANGE.
          // `option.correct` is deliberately not read on this screen: styling that varies with it
          // is exactly the immediate feedback the owner asked to remove, and it leaks through
          // hover, opacity and ring just as loudly as a sentence would. The only state a row
          // shows is whether it is the one currently selected.
          const isPick = option.text === picked;
          return (
            <li key={option.text}>
              <button
                aria-pressed={isPick}
                className={[
                  "w-full rounded-xl px-3 py-2.5 text-left transition-colors bg-transparent hover:bg-(--ui-bg-tertiary)",
                  isPick ? "bg-(--ui-bg-tertiary) ring-1 ring-(--ui-stroke-primary)" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => answer(option.text)}
                type="button"
              >
                <span className="block text-[length:var(--canvas-text-body)] leading-snug text-(--ui-text-primary)">
                  {option.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 🔴 THE ONLY OTHER CONTROL, AND IT ONLY EXISTS ONCE THERE IS SOMETHING BEHIND. Deferring
          the marking is what makes this necessary — see the header. */}
      {index > 0 && (
        <button
          className="mt-3 rounded-xl bg-transparent px-3 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
          onClick={() => setIndex((was) => Math.max(0, was - 1))}
          type="button"
        >
          Back
        </button>
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
  // 🔴 NO SENTENCE HERE POINTS AT "THE MARKED OPTION" ANY MORE, AND THAT IS NOT TIDYING. Two of
  // them said so while this text sat under a list where the answer was highlighted; the review
  // screen now PRINTS the answer on its own line directly above, so the old wording described a
  // marking that is no longer on screen. Each branch says only what the answer line cannot: which
  // kind of wrong this was.
  switch (ground?.kind) {
    case "held_misconception":
      return "Not quite, and this one has come up before.";
    case "neighbouring_class":
      return "Not quite. That is the neighbouring case your material sets this one against.";
    case "sibling_answer":
      return "Not quite. That is the answer to a different question of the same shape.";
    default:
      return "Not quite.";
  }
}

/**
 * The score, and then the marking for every question in the run.
 *
 * 🔴🔴 THIS SCREEN CARRIES THE FEEDBACK THAT USED TO INTERRUPT EACH TAP (owner, 2026-08-24). It
 * is therefore NOT a summary: it repeats each prompt, says what they picked, says what was right,
 * and — on a miss — gives the same grounded sentence naming the competing model they acted on.
 * A results card that only reported "3 out of 5" would have deleted the teaching rather than
 * moved it, which is the one way this change could have made the product worse.
 *
 * 🔴 CORRECT ANSWERS ARE LISTED TOO, QUIETLY. The owner's words were *"they can just go over what
 * they missed"*, and the misses are what lead the list and what earn cards — but a learner who
 * guessed right still does not know they guessed, and hiding the questions they got right would
 * hide that. They are shown without the marking chrome the misses get.
 */
function CheckResult({
  score,
  run,
  picks,
  onDismiss,
  onMakeCards,
  making,
}: {
  score: TestScore;
  run: TestRun;
  picks: readonly (string | null)[];
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

      <ol className="mt-4 flex list-none flex-col gap-3 border-t border-(--ui-stroke-tertiary) pt-4">
        {run.questions.map((question, index) => {
          const picked = picks[index] ?? null;
          const verdict = picked === null ? null : verdictFor(question, picked);
          const right = Boolean(verdict?.correct);
          return (
            <li key={`${question.objectiveIdentityKey}:${index}`}>
              <p className="text-[length:var(--canvas-text-small)] font-medium leading-snug text-(--ui-text-primary)">
                <span className="text-(--ui-text-quaternary)">{index + 1}. </span>
                {question.prompt}
              </p>
              {right ? (
                <p className="mt-0.5 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
                  Correct: {verdict?.chosen?.text}
                </p>
              ) : (
                <div className="mt-1 flex flex-col gap-0.5">
                  {/* 🔴 AN UNANSWERED QUESTION IS SAID TO BE UNANSWERED, NOT SHOWN AS A WRONG PICK.
                      `scoreTestRun` counts silence as missed, and a learner who backed out of a
                      question deserves to see that rather than a blank quotation. */}
                  <p className="text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
                    {picked === null ? "You did not answer this one." : `You picked: ${picked}`}
                  </p>
                  <p className="text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-primary)">
                    The answer: {verdict?.answer?.text}
                  </p>
                  {picked !== null && (
                    <p className="text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
                      {groundedMiss(verdict?.chosen?.ground)}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
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
