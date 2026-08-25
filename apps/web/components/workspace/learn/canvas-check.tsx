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
// rule that a test never becomes an artifact.
//
// 🔴🔴 ANSWERS FIRST, MARKING AFTERWARDS — OWNER, 2026-08-24: *"I need that to just be one where
// the user does not immediately get feedback until the end. That way they can just go over what
// they missed after that. And that way it's not just like friction every time you click the
// answer."* The first version marked each tap on the spot and then demanded a second press on
// "Next question" to move on, so a five-question test cost ten presses and broke its own rhythm
// nine times. Now one tap answers and advances, and nothing is marked while the run is live.
//
// 🔴🔴🔴 AND THE MARKING IS NOT A SCREEN, IT IS A REPLY — the same owner, an hour later, on the
// results card this file used to end with: *"at the end it shouldn't show anything… it's just up
// to DeepSeek to report the results in its own words, not some kind of screen. I just want it to
// say, okay, you got four out of five right, and here's the one you missed and why. That's more
// natural."* So the last tap ends this component. `describeAttempt` writes down what happened, the
// canvas sends it as the learner's turn, and Nemesis answers in the conversation — where it can
// tie a miss back to what it taught two turns ago, and be argued with. Neither of those is
// something a card printing "4 out of 5" could ever do.
//
// 🔴 THIS IS NOT A LOSS OF FEEDBACK, IT IS A MOVE OF IT — twice over. Everything the inline
// verdict said, and everything the results card said, is in the account handed to the model:
// the score, every prompt, what they picked, what was right, and which ones they skipped.
//
// 🔴 AND A MIS-TAP IS RECOVERABLE, WHICH IT DID NOT HAVE TO BE BEFORE. While a tap was answered
// instantly the learner saw at once that they had hit the wrong row. Deferring the marking takes
// that away, so `Back` exists to give it back — it re-opens the previous question with their pick
// still selected and changeable. Without it, deferring feedback would have quietly made a slip
// permanent and invisible until the reply.
//
// 🔴 `list-none` AND `bg-transparent` ARE EXPLICIT, NOT REDUNDANT — this app's stylesheet gives
// every `button` and `li` outside `[data-workspace]` a blue marketing fill and a disc bullet.
// Same reason `canvas-clarification.tsx` states them.

import { useEffect, useRef, useState } from "react";

// 🔴 `groundedMiss` MOVED TO `test-run.ts` AS `groundNote` WHEN THE RESULTS SCREEN WENT. It named
// which competing model a wrong tap acted on — the whole reason multiple choice is permitted here —
// and its only reader was that screen. Rather than leave it exported with nothing rendering it, it
// now writes the same fact into the account `describeAttempt` hands the model.
import { describeAttempt, type TestRun } from "@/lib/learn/test-run";
import { OcclusionCardView } from "@/components/workspace/study/occlusion-card";

export function CanvasCheck({
  run,
  onDismiss,
  onFinished,
}: {
  run: TestRun;
  /** They closed the test. Nothing is scored and nothing is kept. */
  onDismiss: () => void;
  /**
   * They answered the last question. The card is done; the conversation takes it from here.
   *
   * 🔴🔴 THIS REPLACED A RESULTS SCREEN — OWNER, 2026-08-24: *"at the end it shouldn't show
   * anything… it's just up to DeepSeek to report the results in its own words, not some kind of
   * screen."* The card used to print "4 out of 5", list every answer, and offer a button that made
   * a deck from the misses. All of it was a report the product wrote ABOUT the conversation while
   * sitting outside it — and none of it could do the thing that actually helps, which is to
   * connect a miss to what was taught two turns ago and then be argued with.
   *
   * `describeAttempt` writes what happened; the caller sends it as the learner's turn and Nemesis
   * answers. The deck-from-misses button went with the screen: a learner who wants cards can ask
   * for them in words, which is the same rule §38 applies to everything else here.
   */
  onFinished: (account: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>([]);

  // A different run is a different test. Without this, opening a second test after a first would
  // resume halfway through the old one's answers.
  useEffect(() => {
    setIndex(0);
    setPicks([]);
  }, [run]);

  const question = run.questions[index];
  const picked = picks[index] ?? null;
  const last = index === run.questions.length - 1;

  if (!question) return null;

  /**
   * One tap answers this question and moves on.
   *
   * 🔴 THE ADVANCE IS IN THE SAME HANDLER AS THE PICK, NOT IN AN EFFECT WATCHING `picks`. An
   * effect would also fire when `Back` re-selects an existing answer, bouncing the learner
   * straight forward again and making the back button impossible to use.
   */
  const answer = (text: string) => {
    const answered = Object.assign([...picks], { [index]: text }) as (string | null)[];
    setPicks(answered);
    // 🔴 THE ACCOUNT IS BUILT FROM `answered`, NOT FROM `picks`. `setPicks` does not update the
    // value this closure captured, so reading state here would describe the run as it was BEFORE
    // the last tap — reporting the final question as skipped, every time.
    if (last) onFinished(describeAttempt(run, answered));
    else setIndex((was) => was + 1);
  };

  /**
   * The first question comes into view by itself.
   *
   * 🔴🔴🔴 OWNER, 2026-08-25: *"when the quiz is created, it should fit the canvas… that way users
   * do not have to scroll down."* The check renders BELOW the turn's answer, so a quiz arrived off
   * the bottom of the screen behind whatever Nemesis had just written, and the learner had to go
   * looking for the thing they had asked for.
   *
   * 🔴 THE ANSWER IS NOT HIDDEN TO MAKE ROOM FOR THIS, and that was the first thing I tried. See
   * `checkOwnsSurface` in `learning-canvas.tsx`: suppressing the prose reproduces a defect this
   * codebase already has on record, where "teach me X then quiz me" showed the quiz and not the
   * lesson. Moving the VIEW costs a scroll nobody has to make; hiding the prose costs the lesson.
   *
   * 🔴 ONCE, ON ARRIVAL, NOT ON EVERY QUESTION. Scrolling the page under someone between question
   * three and question four is the surface grabbing them mid-answer, which is worse than the thing
   * being fixed. The dependency list is deliberately empty.
   *
   * 🔴 IT HONOURS `prefers-reduced-motion`, because a smooth scroll is motion and somebody asked
   * the browser not to do that.
   */
  const frame = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    frame.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <section
      aria-label={`Question ${index + 1} of ${run.questions.length}`}
      className="canvas-swap mt-5 rounded-2xl p-4 ring-1 ring-(--ui-stroke-secondary)"
      ref={frame}
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

      {/* 🔴🔴 THE PICTURE IS THE QUESTION, SO IT SITS ABOVE THE PROMPT (owner 2026-08-25: image
          occlusion "as part of its testing tools… similar to the multiple choice chip"). "Which
          part is covered?" means nothing before the learner has seen which part is covered.

          🔴 `revealed={false}`, ALWAYS, AND IT IS NOT A PROP THIS CARD COULD PASS DIFFERENTLY.
          The owner's own rule for this component is that nothing is marked while the run is live
          — *"the user does not immediately get feedback until the end"* — and a revealed mask IS
          the answer. The reveal happens where every other verdict now happens: in the reply, from
          `describeAttempt`. `FigureOcclusion` states the same rule for the course lane: revealing
          before the learner commits turns retrieval into recognition.

          🔴 IT IS `OcclusionCardView`, THE STUDY DECK'S OWN RENDERER, NOT A SECOND ONE. The
          diagram a learner meets in a check and the diagram they meet in the deck afterwards are
          the same picture with the same box on it, drawn by one component from one payload. */}
      {question.figure && (
        <div className="mt-3">
          <OcclusionCardView className="max-h-72" payload={question.figure} revealed={false} />
        </div>
      )}

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
