"use client";

// The states the canvas becomes that are not the lesson: empty, orientation, recall, test,
// diagnosis, completion. Same page, different shape — never a different route.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { diagnose, summariseCompletion } from "@/lib/learn/canvas-diagnosis";
import { VERDICT_HEADLINE, verdictIsPass } from "@/lib/learn/canvas-judge";
import {
  type CanvasChoiceQuestion,
  type CanvasFreeQuestion,
  type CanvasResponse,
  type LearningCanvas,
  type RecallCard,
  type RecallResult,
} from "@/lib/learn/canvas-model";
import { cn } from "@/lib/utils";

import { selectableRegion } from "./use-canvas-selection";

// --------------------------------------------------------------------- empty

export function CanvasEmpty({
  onFiles,
  onTopic,
  busy,
}: {
  onFiles: (files: FileList | File[]) => void;
  onTopic: (topic: string) => void;
  busy: boolean;
}) {
  const [over, setOver] = useState(false);
  const [topic, setTopic] = useState("");

  return (
    <div
      className="flex min-h-full items-center justify-center px-6"
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
      }}
    >
      <div className="w-full max-w-[32rem] text-center">
        <h1 className="text-[1.5rem] font-medium tracking-[-0.01em] text-(--ui-text-primary)">
          What do you want to learn?
        </h1>

        <label
          className={cn(
            "mt-8 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 transition-colors",
            over ? "border-(--ui-accent) bg-(--ui-bg-tertiary)" : "border-(--ui-stroke-primary) hover:bg-(--ui-bg-tertiary)",
          )}
        >
          <Codicon name={busy ? "loading" : "cloud-upload"} size="1.125rem" />
          <span className="text-[0.875rem] text-(--ui-text-secondary)">
            {busy ? "Reading your material…" : "Drop a lecture, slides, PDF, or other material"}
          </span>
          <span className="text-[0.75rem] text-(--ui-text-quaternary)">PDF, Word, PowerPoint, text, or an image of a page</span>
          <input
            accept=".pdf,.docx,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp,.heic"
            className="hidden"
            multiple
            onChange={(event) => event.target.files && onFiles(event.target.files)}
            type="file"
          />
        </label>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
          <span className="text-[0.75rem] text-(--ui-text-quaternary)">or</span>
          <span className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
        </div>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (topic.trim()) onTopic(topic.trim());
          }}
        >
          <input
            className="w-full rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-4 py-3 text-center text-[0.9375rem] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)"
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Teach me something…"
            value={topic}
          />
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- orientation

/* 🔴 `CanvasOrient` LIVED HERE AND HAS BEEN DELETED, NOT DISABLED.
 *
 * It asked "Where should we start?" and offered four labels — Start from fundamentals / I know the
 * basics / Advanced / Exam-focused — before Nemesis had used a single thing it already knew. It was
 * a static mode selector wearing a question mark, and it was the six-stage machine's defect at a
 * different scale: a route chosen before anything about the learner had been established.
 *
 * It was also a poor input. Two people who pick "I know the basics" know completely different
 * things, and the answer names no concept, no demonstrated capability, no misconception and nothing
 * that has decayed. A learner can be wrong about their own level; what they DO is evidence, and
 * what they say about themselves is a self-report.
 *
 * 🔴 DO NOT REPLACE IT WITH THREE STATIC QUESTIONS. "How familiar are you?" / "What's your goal?" /
 * "When is your exam?" is the same form with more steps. Ask only what genuinely cannot be
 * inferred, and prefer a task that REVEALS the learner over a question ABOUT them: "Which ion
 * carries phase 0?" produces evidence, "Are you familiar with cardiac action potentials?" produces
 * a guess. Where real ambiguity remains ("teach me World War II"), the composer can ask in words —
 * it does not need a permanent four-button taxonomy.
 */

// -------------------------------------------------------------------- recall

/** Retrieval by producing something, and being read for what you meant (§31).
 *
 *  This used to be reveal-then-self-grade. Two things changed and both matter:
 *
 *  The grade now comes from what the learner actually produced, not from what they claim they
 *  knew after seeing the answer — self-assessment straight after reading the answer is the
 *  weakest signal in the loop.
 *
 *  🔴 And revealing no longer asks for a grade at all. Needing the answer shown IS the evidence:
 *  we did not obtain a retrieval, which is a fact, and asking "how well did you know that?"
 *  immediately afterwards would replace that fact with a guess. The four grade buttons are gone
 *  from this surface entirely. */
export function CanvasRecall({
  cards,
  canvas,
  index,
  judging,
  onDone,
  onNext,
  onUnknown,
}: {
  cards: readonly RecallCard[];
  canvas: LearningCanvas;
  /** Owned by the session, not by this component — the persistent composer needs to know which
   *  card is being asked, and it is a sibling of this stage. */
  index: number;
  judging: string | null;
  onDone: () => void;
  onNext: () => void;
  onUnknown: () => void;
}) {
  const card = cards[index] ?? null;
  const result = canvas.recallResults.find((entry) => entry.cardId === card?.id);

  if (!card) return null;
  const source = card.sourceRefs?.[0]
    ? canvas.sources
        .find((entry) => entry.id === card.sourceRefs?.[0]?.sourceId)
        ?.excerpts.find((entry) => entry.id === card.sourceRefs?.[0]?.excerptId)
    : null;

  return (
    // See the note in CanvasTest: the composer floats over the bottom of the page, so this
    // stage reserves the space rather than centring its controls into the fade.
    <div className="flex min-h-full flex-col items-center justify-center px-6 pb-40 pt-4">
      <div className="w-full max-w-(--canvas-column)">
        <p className="mb-6 text-center text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          Recall · {index + 1} of {cards.length}
        </p>

        {/* §27: text interaction is a canvas PRIMITIVE, not a reading-stage feature. A learner
            stuck on a word inside the question is exactly as stuck as one inside the lesson.
            Not rewritable — a question is not a document block, and "Simpler" would have
            nowhere to write. */}
        <p
          className="text-center text-[1.25rem] leading-relaxed text-(--ui-text-primary)"
          {...selectableRegion(`recall:${card.id}`)}
        >
          {card.front}
        </p>

        {/* 🔴 NO ANSWER BOX HERE. The question is the canvas state; the persistent composer at
            the bottom of the page is where it gets answered, in every state, by typing or by
            speaking. This stage used to grow its own textarea, its own microphone and its own
            Check button, which put two composers on one screen. */}

        <RecallOutcome
          answer={card.back}
          judging={judging === card.id}
          key={card.id}
          onNext={() => (index + 1 >= cards.length ? onDone() : onNext())}
          result={result ?? null}
        />

        {/* 🔴 The reveal-the-answer control and its space bar shortcut are GONE from this
            surface and must not come back in any form. (Deliberately not quoting the old label
            here — `canvas-shell.test.ts` greps this file for it, and a comment that names it
            would satisfy the guard while the control itself crept back.)
            A one-key reveal makes the cheapest path through a retrieval prompt the one that
            produces no retrieval: think vaguely, press space, read the answer, feel informed.
            That is the flashcard behaviour the canvas exists to replace.
            "I don't know" is not the same control. It is the learner reporting their state,
            which is a fact worth recording — and it is deliberately quiet, because producing
            something has to stay the obvious move. */}
        {!result && !judging && (
          <div className="mt-10 text-center">
            <button
              className="text-[0.75rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={onUnknown}
              type="button"
            >
              I don&rsquo;t know
            </button>
          </div>
        )}

        {result && source && (
          <div className="mt-6 text-center">
            <details>
              <summary className="cursor-pointer text-[0.6875rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)">
                Where this came from
              </summary>
              <p className="mx-auto mt-2 max-w-[30rem] border-l-2 border-(--ui-stroke-primary) pl-3 text-left text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)">
                {source.text.slice(0, 400)}
              </p>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

/** What the attempt showed. Feedback only — the answering happens in the composer. */
function RecallOutcome({
  result,
  answer,
  judging,
  onNext,
}: {
  result: RecallResult | null;
  /** The reference answer, shown only once there is a result. */
  answer: string;
  judging: boolean;
  onNext: () => void;
}) {
  if (judging) return <p className="mt-6 text-center text-[0.875rem] text-(--ui-text-tertiary)">Reading your answer…</p>;
  if (!result) return null;

  return (
    <div className="mt-8">
      {result.said && (
        <div className="rounded-[18px] bg-(--ui-bg-tertiary)/40 px-4 py-3">
          <p className="mb-1 text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
            {result.via === "spoken" ? "You said" : "You wrote"}
          </p>
          <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">{result.said}</p>
        </div>
      )}

      {result.evaluation && (
        <div className="mt-4">
          <p
            className={cn(
              "text-[0.9375rem] font-medium",
              verdictIsPass(result.evaluation.verdict) ? "text-emerald-500" : "text-(--ui-text-primary)",
            )}
          >
            {VERDICT_HEADLINE[result.evaluation.verdict]}
          </p>
          <p
            className="mt-2 text-[0.9375rem] leading-relaxed text-(--ui-text-primary)"
            {...selectableRegion(`feedback:${result.cardId}`)}
          >
            {result.evaluation.feedback}
          </p>
        </div>
      )}

      {/* Shown because no retrieval was obtained — they said so. No self-grade follows: someone
          who has just read the answer is the worst judge of whether they could have produced it. */}
      {result.revealed && (
        <div className="mt-4">
          <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-primary)">{answer}</p>
          <p className="mt-2 text-[0.75rem] text-(--ui-text-quaternary)">
            Noted — Nemesis will bring this one back.
          </p>
        </div>
      )}

      <button
        className="mt-6 rounded-full px-4 py-2 text-[0.875rem] text-(--ui-text-primary) ring-1 ring-(--ui-stroke-secondary) hover:bg-(--ui-bg-tertiary)"
        onClick={onNext}
        type="button"
      >
        Next
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------- test

export function CanvasTest({
  canvas,
  index,
  judging,
  onAnswer,
  onNext,
  onFinish,
  onUnknown,
}: {
  canvas: LearningCanvas;
  index: number;
  judging: string | null;
  onAnswer: (questionId: string, picked: number) => void;
  onNext: () => void;
  onFinish: () => void;
  onUnknown: () => void;
}) {
  const question = canvas.questions[index] ?? null;
  const answered = canvas.answers.find((entry) => entry.questionId === question?.id);
  const responded = canvas.responses.find((entry) => entry.questionId === question?.id);

  if (!question) return null;

  const done = question.format === "choice" ? Boolean(answered) : Boolean(responded);
  const last = index + 1 >= canvas.questions.length;

  return (
    // 🔴 `pb-40` is not decoration, and removing it has broken this surface twice. The composer
    // floats over the bottom of the page behind a tall gradient, so a vertically centred column
    // pushes its own primary action under that fade the moment the content grows — and the
    // teaching loop grows it every single turn. `min-h-full` rather than `h-full` for the same
    // reason: past a viewport of content the stage must grow and scroll the page, not clip.
    <div className="flex min-h-full flex-col items-center justify-center px-6 pb-40 pt-4">
      <div className="w-full max-w-(--canvas-column)">
        <p className="mb-6 text-center text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          {canvas.state === "retest" ? "Retest" : "Test"} · {index + 1} of {canvas.questions.length}
        </p>

        <p
          className="text-[1.0625rem] leading-relaxed text-(--ui-text-primary)"
          {...selectableRegion(`question:${question.id}`)}
        >
          {question.q}
        </p>

        {/* Multiple choice keeps its options: picking one IS the answer, and there is nothing
            for a text composer to do. Free response has no box here at all — the composer is
            the answer surface. */}
        {question.format === "choice" && (
          <ChoiceAnswer onAnswer={onAnswer} picked={answered?.picked ?? null} question={question} />
        )}

        {question.format === "free" && judging === question.id && (
          <p className="mt-6 text-[0.875rem] text-(--ui-text-tertiary)">Reading your answer…</p>
        )}

        {question.format === "free" && responded && (
          <Judged judging={false} question={question} response={responded} />
        )}

        {question.format === "free" && !responded && judging !== question.id && (
          <div className="mt-10">
            <button
              className="text-[0.75rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={onUnknown}
              type="button"
            >
              I don&rsquo;t know
            </button>
          </div>
        )}

        {done && (
          <div className="mt-5">
            {/* The model answer is shown for a choice question, where "why B is right" is the
                whole explanation. A judged free answer already carries something better: a
                correction written about what THIS learner actually said. */}
            {question.format === "choice" && question.why && (
              <p className="text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">{question.why}</p>
            )}
            <button
              className="mt-5 rounded-full px-4 py-2 text-[0.875rem] text-(--ui-text-primary) ring-1 ring-(--ui-stroke-secondary) hover:bg-(--ui-bg-tertiary)"
              onClick={() => (last ? onFinish() : onNext())}
              type="button"
            >
              {/* When the canvas taught something and asked again, "Next" undersells it — the
                  next prompt is the point of the correction, not the thing after it. */}
              {responded?.followUpQuestionId ? "Try it now" : last ? "See where I stand" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceAnswer({
  question,
  picked,
  onAnswer,
}: {
  question: CanvasChoiceQuestion;
  picked: number | null;
  onAnswer: (questionId: string, position: number) => void;
}) {
  const answered = picked !== null;
  return (
    <div className="mt-6 space-y-2">
      {question.options.map((option, position) => {
        const chosen = picked === position;
        const isCorrect = position === question.answer;
        return (
          <button
            className={cn(
              "w-full rounded-lg border px-4 py-3 text-left text-[0.9375rem] transition-colors",
              !answered &&
                "border-(--ui-stroke-secondary) text-(--ui-text-primary) hover:border-(--ui-accent) hover:bg-(--ui-bg-tertiary)",
              answered && isCorrect && "border-emerald-500/60 bg-emerald-500/[0.07] text-(--ui-text-primary)",
              answered && chosen && !isCorrect && "border-red-500/60 bg-red-500/[0.07] text-(--ui-text-primary)",
              answered && !isCorrect && !chosen && "border-(--ui-stroke-tertiary) text-(--ui-text-quaternary)",
            )}
            disabled={answered}
            key={option}
            onClick={() => onAnswer(question.id, position)}
            type="button"
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** What the learner said, and what it showed.
 *
 *  §20: never "Incorrect. The answer is B." What they got right is named first — including on a
 *  wrong answer, because a partial answer usually contains real understanding and burying it
 *  under a correction teaches someone that explaining is punished. */
function Judged({
  question,
  response,
  judging,
}: {
  question: CanvasFreeQuestion;
  response: CanvasResponse;
  judging: boolean;
}) {
  const evaluation = response.evaluation ?? null;

  return (
    <div className="mt-5 space-y-4">
      {/* The learner's own words DO keep a container — a message bubble is a meaningful object,
          not decoration around prose. No border though: the fill alone is enough, and an
          outline on top of it is the "study app" weight the surface is moving away from. */}
      <div className="rounded-[18px] bg-(--ui-bg-tertiary)/40 px-4 py-3">
        <p className="mb-1 text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          {response.via === "spoken" ? "You said" : "You wrote"}
        </p>
        <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">{response.text}</p>
      </div>

      {judging && <p className="text-[0.875rem] text-(--ui-text-tertiary)">Reading your answer…</p>}

      {!judging && !evaluation && (
        // Not framed as the learner's failure: they answered, we could not read it. The answer
        // is kept, and the diagnosis simply has one less piece of evidence.
        <p className="text-[0.875rem] leading-relaxed text-(--ui-text-tertiary)">
          Nemesis couldn&rsquo;t assess that one. Your answer is saved — here&rsquo;s the full version:{" "}
          <span className="text-(--ui-text-secondary)">{question.why}</span>
        </p>
      )}

      {evaluation && (
        <div>
          {/* §9: the rich reading is for the engine. The learner gets the frame and the one
              concrete thing they were missing — `demonstrated`, `missing`, `confidence` and
              `errorType` are what the teaching policy reads, not what the page prints. */}
          <p
            className={cn(
              "text-[0.9375rem] font-medium",
              verdictIsPass(evaluation.verdict) ? "text-emerald-500" : "text-(--ui-text-primary)",
            )}
          >
            {VERDICT_HEADLINE[evaluation.verdict]}
          </p>

          <p
            className="mt-2 text-[0.9375rem] leading-relaxed text-(--ui-text-primary)"
            {...selectableRegion(`feedback:${response.questionId}`)}
          >
            {evaluation.feedback}
          </p>

          {/* What the canvas taught in response to THIS answer. It also went into the document,
              but it belongs here too: the correction is about what they just said, and sending
              them off to find it in the page would break the moment it exists for.
              🔴 NOT A CARD. Teaching is the most important prose on the screen, and boxing it
              demotes it to a widget — the correction reads as something the app produced rather
              than something being explained. Whitespace and weight carry it. */}
          {response.taught && (
            <p
              className="mt-4 whitespace-pre-line text-[0.9375rem] leading-relaxed text-(--ui-text-primary)"
              {...selectableRegion(`taught:${response.questionId}`)}
            >
              {response.taught}
            </p>
          )}

          {/* The full answer, but only where the refinement cannot stand alone. On a partial
              answer the refinement supplies exactly the missing piece, which is better than the
              whole model answer — it is about what THEY said. On an answer that did not get
              there, a correction with no complete version to compare against leaves the learner
              knowing they were wrong and not what right looks like. */}
          {!verdictIsPass(evaluation.verdict) && evaluation.verdict !== "partial" && question.why && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[0.8125rem] text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)">
                See the full answer
              </summary>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">{question.why}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- diagnosis

/** §13: not a percentage. The output that matters is which ideas are blocking mastery. */
export function CanvasDiagnosis({
  canvas,
  onRelearn,
  onFinish,
  busy,
}: {
  canvas: LearningCanvas;
  onRelearn: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  const result = diagnose(canvas);

  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40 pt-6">
      {result.understood.length > 0 && (
        <>
          <h2 className="text-[0.75rem] uppercase tracking-wide text-(--ui-text-quaternary)">What you understand</h2>
          <ul className="mt-3 space-y-1.5">
            {result.understood.map((concept) => (
              <li className="flex items-start gap-2.5 text-[0.9375rem] text-(--ui-text-primary)" key={concept.id}>
                <span className="mt-0.5 text-emerald-500">✓</span>
                {concept.label}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.weak.length > 0 && (
        <>
          <h2 className="mt-10 text-[0.75rem] uppercase tracking-wide text-(--ui-text-quaternary)">What needs work</h2>
          <ul className="mt-3 space-y-1.5">
            {result.weak.map((concept) => (
              <li className="flex items-start gap-2.5 text-[0.9375rem] text-(--ui-text-primary)" key={concept.id}>
                <span className="mt-0.5 text-amber-500">!</span>
                {concept.label}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.untested.length > 0 && (
        <p className="mt-10 text-[0.8125rem] text-(--ui-text-quaternary)">
          {result.untested.length} idea{result.untested.length === 1 ? "" : "s"} in this lesson
          {result.untested.length === 1 ? " was" : " were"} not assessed:{" "}
          {result.untested.map((concept) => concept.label).join(", ")}.
        </p>
      )}

      <div className="mt-12">
        {result.weak.length > 0 ? (
          <button
            className="rounded-full bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor) disabled:opacity-50"
            disabled={busy}
            onClick={onRelearn}
            type="button"
          >
            {busy ? "Focusing…" : "Fix my weak spots"}
          </button>
        ) : (
          <button
            className="rounded-full bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor)"
            onClick={onFinish}
            type="button"
          >
            Finish
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- completion

export function CanvasComplete({ canvas, onReset }: { canvas: LearningCanvas; onReset: () => void }) {
  const summary = summariseCompletion(canvas);

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-[26rem]">
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">{canvas.title}</p>
        <h2 className="mt-1 text-[1.5rem] font-medium tracking-[-0.01em] text-(--ui-text-primary)">Mastered</h2>
        <dl className="mt-8 space-y-2 text-[0.9375rem] text-(--ui-text-secondary)">
          <div>
            {summary.conceptsUnderstood} concept{summary.conceptsUnderstood === 1 ? "" : "s"} understood
          </div>
          <div>
            {summary.weakAreasCorrected} weak area{summary.weakAreasCorrected === 1 ? "" : "s"} corrected
          </div>
          <div>{summary.activeMinutes} min active learning</div>
        </dl>
        <button
          className="mt-10 text-[0.8125rem] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
          onClick={onReset}
          type="button"
        >
          Start another canvas
        </button>
      </div>
    </div>
  );
}
