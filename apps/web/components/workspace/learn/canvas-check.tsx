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
    // 🔴🔴 THE CHROME IS CLAUDE'S, MEASURED (owner 2026-08-26: *"they should both bring up a proper
    // component like in Claude code or like in Claude dot AI did"*, with a screenshot). Read off a
    // live Learning-guidance quiz at a 1470px viewport: card radius 8px, 1px hairline, 28px of
    // padding; question 22px/500 on a 28px line; option rows 46px tall, 8px apart, each with a
    // radio circle; progress as numbered pips rather than a sentence.
    //
    // 🔴 WHAT IS DELIBERATELY *NOT* COPIED IS THEIR `Next` BUTTON. The owner's 2026-08-24 rule
    // stands: one tap answers AND advances, because "it's not just like friction every time you
    // click the answer". Their card needs Next because it marks as you go; ours marks at the end.
    <section
      aria-label={`Question ${index + 1} of ${run.questions.length}`}
      className="canvas-swap mt-5 rounded-[8px] p-[28px] ring-1 ring-(--ui-stroke-tertiary)"
      ref={frame}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 🔴 PIPS, NOT A SENTENCE. "Question 3 of 8" is the same fact, and the row of numbers is
            also the way BACK: the old card grew a separate "Back" button once you were past the
            first question, which is a second control for something the progress display can simply
            be. Answered questions are filled; the rest are outlines. */}
        <ol className="flex list-none flex-wrap items-center gap-[6px]">
          {run.questions.map((q, at) => {
            // 🔴 `picks` IS POSITIONAL, and a question has no id of its own — `TestQuestion` carries
            // an `objectiveIdentityKey`, which two questions in one run may share. The index is the
            // key, and it is stable because `run` is replaced wholesale rather than edited.
            const done = typeof picks[at] === "string";
            const here = at === index;
            return (
              <li key={`${at}-${q.objectiveIdentityKey}`}>
                <button
                  aria-current={here ? "step" : undefined}
                  aria-label={`Question ${at + 1}${done ? ", answered" : ""}`}
                  className={[
                    "flex size-[26px] items-center justify-center rounded-full text-[length:var(--canvas-text-meta)] tabular-nums transition-colors",
                    here
                      ? "bg-(--ui-bg-primary) text-(--ui-text-primary)"
                      : done
                        ? "bg-(--ui-bg-tertiary) text-(--ui-text-secondary) hover:bg-(--ui-bg-secondary)"
                        : "text-(--ui-text-quaternary)",
                    // 🔴 ONLY BACKWARDS. Jumping ahead would let a learner see question eight
                    // before answering one, which is not a navigation preference, it is a way to
                    // read the whole test before committing to any of it.
                    at < index ? "cursor-pointer" : "cursor-default",
                  ].join(" ")}
                  disabled={at >= index}
                  onClick={() => setIndex(at)}
                  type="button"
                >
                  {at + 1}
                </button>
              </li>
            );
          })}
        </ol>
        <button
          // 🔴 NEITHER "TEST" NOR "QUIZ" IN THE LABEL. Owner 2026-08-26: *"the term quiz and test
          // should be similar"*. They already reach the same component; the label was the last
          // place the product still called it one of the two.
          aria-label="Stop this"
          className="-mr-2 -mt-2 shrink-0 rounded-full bg-transparent px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
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

      {/* 🔴 22px ON A 28px LINE, MEASURED. It was `--canvas-text-body` (16px), the same size as the
          options under it, so the question read as the first item in a list of five rather than as
          the thing being asked. §46.3 exempt: this is a measured value from the reference.
          §46.3-exempt: measured off claude.ai, 2026-08-26. */}
      <h2 className="mt-[18px] text-[22px] font-medium leading-[28px] text-(--ui-text-primary)">
        {question.prompt}
      </h2>

      <ul className="mt-[18px] flex list-none flex-col gap-[8px]">
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
                  // 46px tall and a hairline round the row, both measured. A bare hover-fill row
                  // reads as a menu item; a bordered row reads as a thing you choose.
                  "flex min-h-[46px] w-full items-center gap-3 rounded-[8px] px-[14px] py-[10px] text-left transition-colors",
                  "bg-transparent ring-1 hover:bg-(--ui-bg-quaternary)",
                  isPick ? "bg-(--ui-bg-tertiary) ring-(--ui-stroke-primary)" : "ring-(--ui-stroke-tertiary)",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => answer(option.text)}
                type="button"
              >
                {/* 🔴 A RADIO, AND IT SAYS "PICK ONE" BEFORE ANYTHING IS PICKED. The old row had no
                    mark at all, so an untouched card gave no clue that the rows were choices rather
                    than links. It is decoration for the mouse and nothing else: `aria-pressed` on
                    the button is what a screen reader reads. */}
                <span
                  aria-hidden="true"
                  className={[
                    "flex size-[18px] shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                    isPick ? "ring-(--ui-text-primary)" : "ring-(--ui-stroke-primary)",
                  ].join(" ")}
                >
                  {isPick ? <span className="size-[9px] rounded-full bg-(--ui-text-primary)" /> : null}
                </span>
                <span className="block text-[length:var(--canvas-text-small)] leading-normal text-(--ui-text-primary)">
                  {option.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 🔴 THE "Back" BUTTON IS GONE, AND ITS JOB MOVED UP. It appeared once you were past the
          first question and did one thing: step back one. The numbered pips in the header do that
          and also say where you are, which is the same control doing two jobs instead of two
          controls doing one and a half. */}
    </section>
  );
}
