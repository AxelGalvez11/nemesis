"use client";

// The states the canvas becomes that are not the lesson: empty, orientation, recall, test,
// diagnosis, completion. Same page, different shape — never a different route.

import { useEffect, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { diagnose, summariseCompletion } from "@/lib/learn/canvas-diagnosis";
import {
  CANVAS_LEVELS,
  LEVEL_LABELS,
  type CanvasLevel,
  type LearningCanvas,
  type RecallCard,
} from "@/lib/learn/canvas-model";
import { cn } from "@/lib/utils";

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
      className="flex h-full items-center justify-center px-6"
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

export function CanvasOrient({
  canvas,
  onChoose,
  busy,
}: {
  canvas: LearningCanvas;
  onChoose: (level: CanvasLevel) => void;
  busy: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-[30rem]">
        {canvas.title && (
          <p className="mb-2 text-center text-[0.8125rem] text-(--ui-text-quaternary)">{canvas.title}</p>
        )}
        <h2 className="text-center text-[1.25rem] font-medium text-(--ui-text-primary)">Where should we start?</h2>
        <div className="mt-6 space-y-2">
          {CANVAS_LEVELS.map((level) => (
            <button
              className="w-full rounded-xl border border-(--ui-stroke-secondary) px-4 py-3 text-left text-[0.9375rem] text-(--ui-text-primary) transition-colors hover:border-(--ui-accent) hover:bg-(--ui-bg-tertiary) disabled:opacity-50"
              disabled={busy}
              key={level}
              onClick={() => onChoose(level)}
              type="button"
            >
              {LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
        {busy && (
          <p className="mt-6 text-center text-[0.8125rem] text-(--ui-text-tertiary)">Writing your lesson…</p>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- recall

const GRADES = [
  { grade: "again", label: "Again", hint: "1" },
  { grade: "hard", label: "Hard", hint: "2" },
  { grade: "good", label: "Good", hint: "3" },
  { grade: "easy", label: "Easy", hint: "4" },
] as const;

/** Reveal, then self-grade. Keyboard first (§11): Space reveals then grades Good, 1-4 grade.
 *  Identical to the Study tab's review session on purpose — a learner must not have to hold
 *  two sets of shortcuts in their head. */
export function CanvasRecall({
  cards,
  canvas,
  onGrade,
  onDone,
}: {
  cards: readonly RecallCard[];
  canvas: LearningCanvas;
  onGrade: (cardId: string, grade: "again" | "hard" | "good" | "easy") => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const card = cards[index] ?? null;

  const grade = (value: "again" | "hard" | "good" | "easy") => {
    if (!card) return;
    onGrade(card.id, value);
    setRevealed(false);
    setShowSource(false);
    if (index + 1 >= cards.length) onDone();
    else setIndex(index + 1);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (event.key === " " || event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        if (revealed) grade("good");
        else setRevealed(true);
        return;
      }
      const digit = event.code.startsWith("Digit") ? event.code.slice(5) : event.key;
      const match = GRADES.find((entry, position) => digit === String(position + 1));
      if (match && revealed) {
        event.preventDefault();
        grade(match.grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) return null;
  const source = card.sourceRefs?.[0]
    ? canvas.sources
        .find((entry) => entry.id === card.sourceRefs?.[0]?.sourceId)
        ?.excerpts.find((entry) => entry.id === card.sourceRefs?.[0]?.excerptId)
    : null;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-[36rem]">
        <p className="mb-6 text-center text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          Recall · {index + 1} of {cards.length}
        </p>

        <p className="text-center text-[1.25rem] leading-relaxed text-(--ui-text-primary)">{card.front}</p>

        {revealed ? (
          <div className="mt-8 border-t border-(--ui-stroke-tertiary) pt-8">
            <p className="text-center text-[1.0625rem] leading-relaxed text-(--ui-text-primary)">{card.back}</p>

            {source && (
              <div className="mt-4 text-center">
                <button
                  className="text-[0.6875rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
                  onClick={() => setShowSource((current) => !current)}
                  type="button"
                >
                  {showSource ? "Hide source" : "Source"}
                </button>
                {showSource && (
                  <p className="mx-auto mt-2 max-w-[30rem] border-l-2 border-(--ui-stroke-primary) pl-3 text-left text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)">
                    {source.text.slice(0, 400)}
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 grid grid-cols-4 gap-2">
              {GRADES.map((entry) => (
                <button
                  className="rounded-lg border border-(--ui-stroke-secondary) py-2.5 text-[0.8125rem] text-(--ui-text-primary) transition-colors hover:border-(--ui-accent) hover:bg-(--ui-bg-tertiary)"
                  key={entry.grade}
                  onClick={() => grade(entry.grade)}
                  type="button"
                >
                  {entry.label}
                  <span className="ml-1.5 text-(--ui-text-quaternary)">{entry.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-10 text-center">
            <button
              className="rounded-lg border border-(--ui-stroke-secondary) px-5 py-2.5 text-[0.875rem] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
              onClick={() => setRevealed(true)}
              type="button"
            >
              Reveal answer
              <span className="ml-2 text-(--ui-text-quaternary)">Space</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- test

export function CanvasTest({
  canvas,
  onAnswer,
  onFinish,
}: {
  canvas: LearningCanvas;
  onAnswer: (questionId: string, picked: number) => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const question = canvas.questions[index] ?? null;
  const answered = canvas.answers.find((entry) => entry.questionId === question?.id);

  if (!question) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-[38rem]">
        <p className="mb-6 text-center text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          {canvas.state === "retest" ? "Retest" : "Test"} · {index + 1} of {canvas.questions.length}
        </p>

        <p className="text-[1.0625rem] leading-relaxed text-(--ui-text-primary)">{question.q}</p>

        <div className="mt-6 space-y-2">
          {question.options.map((option, position) => {
            const chosen = answered?.picked === position;
            const isCorrect = position === question.answer;
            return (
              <button
                className={cn(
                  "w-full rounded-lg border px-4 py-3 text-left text-[0.9375rem] transition-colors",
                  !answered && "border-(--ui-stroke-secondary) text-(--ui-text-primary) hover:border-(--ui-accent) hover:bg-(--ui-bg-tertiary)",
                  answered && isCorrect && "border-emerald-500/60 bg-emerald-500/[0.07] text-(--ui-text-primary)",
                  answered && chosen && !isCorrect && "border-red-500/60 bg-red-500/[0.07] text-(--ui-text-primary)",
                  answered && !isCorrect && !chosen && "border-(--ui-stroke-tertiary) text-(--ui-text-quaternary)",
                )}
                disabled={Boolean(answered)}
                key={option}
                onClick={() => onAnswer(question.id, position)}
                type="button"
              >
                {option}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="mt-5">
            {question.why && (
              <p className="text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">{question.why}</p>
            )}
            <button
              className="mt-5 rounded-lg border border-(--ui-stroke-secondary) px-4 py-2 text-[0.875rem] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
              onClick={() => (index + 1 >= canvas.questions.length ? onFinish() : setIndex(index + 1))}
              type="button"
            >
              {index + 1 >= canvas.questions.length ? "See where I stand" : "Next"}
            </button>
          </div>
        )}
      </div>
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
    <div className="mx-auto w-full max-w-[36rem] px-6 pb-40 pt-16">
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
            className="rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor) disabled:opacity-50"
            disabled={busy}
            onClick={onRelearn}
            type="button"
          >
            {busy ? "Focusing…" : "Fix my weak spots"}
          </button>
        ) : (
          <button
            className="rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor)"
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
    <div className="flex h-full items-center justify-center px-6">
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
