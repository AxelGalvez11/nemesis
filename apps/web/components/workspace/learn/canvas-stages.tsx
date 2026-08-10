"use client";

// The states the canvas becomes that are not the lesson: empty, orientation, recall, test,
// diagnosis, completion. Same page, different shape — never a different route.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { diagnose, summariseCompletion } from "@/lib/learn/canvas-diagnosis";
import { VERDICT_HEADLINE } from "@/lib/learn/canvas-judge";
import {
  CANVAS_LEVELS,
  LEVEL_LABELS,
  type CanvasChoiceQuestion,
  type CanvasFreeQuestion,
  type CanvasLevel,
  type CanvasResponse,
  type FreePromptKind,
  type LearningCanvas,
  type RecallCard,
} from "@/lib/learn/canvas-model";
import { cn } from "@/lib/utils";

import { useCanvasDictation } from "./use-canvas-dictation";

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
  judging,
  onAnswer,
  onRespond,
  onFinish,
}: {
  canvas: LearningCanvas;
  judging: string | null;
  onAnswer: (questionId: string, picked: number) => void;
  onRespond: (questionId: string, text: string, via: "typed" | "spoken", tookMs?: number) => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const question = canvas.questions[index] ?? null;
  const answered = canvas.answers.find((entry) => entry.questionId === question?.id);
  const responded = canvas.responses.find((entry) => entry.questionId === question?.id);

  if (!question) return null;

  const done = question.format === "choice" ? Boolean(answered) : Boolean(responded);
  const last = index + 1 >= canvas.questions.length;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-[38rem]">
        <p className="mb-6 text-center text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          {canvas.state === "retest" ? "Retest" : "Test"} · {index + 1} of {canvas.questions.length}
        </p>

        <p className="text-[1.0625rem] leading-relaxed text-(--ui-text-primary)">{question.q}</p>

        {question.format === "choice" ? (
          <ChoiceAnswer onAnswer={onAnswer} picked={answered?.picked ?? null} question={question} />
        ) : (
          <FreeAnswer
            judging={judging === question.id}
            key={question.id}
            onRespond={onRespond}
            question={question}
            response={responded ?? null}
          />
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
              className="mt-5 rounded-lg border border-(--ui-stroke-secondary) px-4 py-2 text-[0.875rem] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
              onClick={() => (last ? onFinish() : setIndex(index + 1))}
              type="button"
            >
              {last ? "See where I stand" : "Next"}
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

/** What the prompt is asking for, said in one line above the box. Structural, so it reads the
 *  same for a statute, a signalling pathway or a weld. */
const KIND_HINT: Record<FreePromptKind, string> = {
  define: "In your own words",
  explain: "Explain why",
  mechanism: "Walk through it, step by step",
  compare: "Cover both sides",
  apply: "Say what follows, and why",
  recall: "From memory",
};

function FreeAnswer({
  question,
  response,
  judging,
  onRespond,
}: {
  question: CanvasFreeQuestion;
  response: CanvasResponse | null;
  judging: boolean;
  onRespond: (questionId: string, text: string, via: "typed" | "spoken", tookMs?: number) => void;
}) {
  const [text, setText] = useState("");
  const dictation = useCanvasDictation();
  const startedAt = useRef(Date.now());
  // Which way the words arrived. Set the moment the microphone is used, because §23 reads time
  // differently for speech and typing and a mislabelled answer would be read against the wrong
  // baseline.
  const spoke = useRef(false);

  // Dictation appends to whatever has been typed rather than replacing it, so switching between
  // talking and the keyboard mid-answer does not throw away either half.
  const typedBefore = useRef("");
  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    spoke.current = true;
    const base = typedBefore.current;
    setText([base, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  if (response) {
    return <Judged judging={judging} question={question} response={response} />;
  }

  const submit = () => {
    const said = text.trim();
    if (!said) return;
    dictation.stop();
    onRespond(question.id, said, spoke.current ? "spoken" : "typed", Date.now() - startedAt.current);
  };

  return (
    <div className="mt-5">
      <p className="mb-2 text-[0.75rem] text-(--ui-text-quaternary)">{KIND_HINT[question.kind]}</p>
      <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-2.5">
        <textarea
          autoFocus
          className="max-h-64 min-h-[6rem] w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
          onChange={(event) => {
            setText(event.target.value);
            if (!dictation.listening) typedBefore.current = event.target.value;
          }}
          onKeyDown={(event) => {
            // Enter submits; the answers here are a few sentences, not an essay. Shift+Enter
            // still breaks a line for anyone laying out steps.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={dictation.listening ? "Listening…" : "Answer in your own words…"}
          value={text}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          {dictation.supported ? (
            <button
              aria-label={dictation.listening ? "Stop dictation" : "Answer out loud"}
              aria-pressed={dictation.listening}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.75rem] transition-colors",
                dictation.listening
                  ? "bg-(--ui-accent)/12 text-(--ui-accent)"
                  : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
              )}
              onClick={() => {
                if (dictation.listening) {
                  dictation.stop();
                  return;
                }
                // Reset before starting again. The hook keeps everything it heard, so without
                // this a second burst of talking would re-append the first burst on top of the
                // text it had already been merged into, and the answer would say itself twice.
                typedBefore.current = text;
                dictation.reset();
                dictation.start();
              }}
              type="button"
            >
              <Codicon name={dictation.listening ? "circle-filled" : "mic"} size="0.75rem" />
              {dictation.listening ? "Listening" : "Say it"}
            </button>
          ) : (
            <span />
          )}
          <button
            className="rounded-lg bg-(--ui-accent) px-3.5 py-1.5 text-[0.8125rem] font-medium text-(--ui-accent-contrast) disabled:opacity-40"
            disabled={!text.trim()}
            onClick={submit}
            type="button"
          >
            Answer
          </button>
        </div>
      </div>
      {dictation.error && (
        <p className="mt-2 text-[0.75rem] text-(--ui-text-tertiary)">{dictation.error}</p>
      )}
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
  const judgement = response.judgement ?? null;

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary)/50 px-4 py-3">
        <p className="mb-1 text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
          {response.via === "spoken" ? "You said" : "You wrote"}
        </p>
        <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">{response.text}</p>
      </div>

      {judging && <p className="text-[0.875rem] text-(--ui-text-tertiary)">Reading your answer…</p>}

      {!judging && !judgement && (
        // Not framed as the learner's failure: they answered, we could not read it. The answer
        // is kept, and the diagnosis simply has one less piece of evidence.
        <p className="text-[0.875rem] leading-relaxed text-(--ui-text-tertiary)">
          Nemesis couldn&rsquo;t assess that one. Your answer is saved — here&rsquo;s the full version:{" "}
          <span className="text-(--ui-text-secondary)">{question.why}</span>
        </p>
      )}

      {judgement && (
        <div>
          <p
            className={cn(
              "text-[0.9375rem] font-medium",
              judgement.verdict === "understood" ? "text-emerald-500" : "text-(--ui-text-primary)",
            )}
          >
            {VERDICT_HEADLINE[judgement.verdict]}
          </p>

          {judgement.got.length > 0 && (
            <ul className="mt-2 space-y-1">
              {judgement.got.map((point) => (
                <li className="flex gap-2 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)" key={point}>
                  <Codicon className="mt-1 shrink-0 text-emerald-500" name="check" size="0.6875rem" />
                  {point}
                </li>
              ))}
            </ul>
          )}

          {judgement.misconception && (
            <p className="mt-3 border-l-2 border-amber-500/60 py-0.5 pl-3 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">
              {judgement.misconception}
            </p>
          )}

          <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-primary)">{judgement.refinement}</p>
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
