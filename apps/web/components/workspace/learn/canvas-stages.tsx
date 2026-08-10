"use client";

// The states the canvas becomes that are not the lesson: empty, orientation, recall, test,
// diagnosis, completion. Same page, different shape — never a different route.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { diagnose, summariseCompletion } from "@/lib/learn/canvas-diagnosis";
import { VERDICT_HEADLINE, verdictIsPass } from "@/lib/learn/canvas-judge";
import {
  CANVAS_LEVELS,
  LEVEL_LABELS,
  type CanvasChoiceQuestion,
  type CanvasFreeQuestion,
  type CanvasLevel,
  type CanvasResponse,
  type RetrievalTask,
  type LearningCanvas,
  type RecallCard,
  type RecallResult,
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
  judging,
  onAttempt,
  onReveal,
  onDone,
}: {
  cards: readonly RecallCard[];
  canvas: LearningCanvas;
  judging: string | null;
  onAttempt: (cardId: string, text: string, via: "typed" | "spoken") => void;
  onReveal: (cardId: string) => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const card = cards[index] ?? null;
  const result = canvas.recallResults.find((entry) => entry.cardId === card?.id);

  const next = () => {
    if (index + 1 >= cards.length) onDone();
    else setIndex(index + 1);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (event.key === " " || event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        // Once there is a result the card is settled, so Space moves on rather than recording
        // a second, worse piece of evidence over the top of a real one.
        if (result) next();
        else if (card) onReveal(card.id);
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

        <RecallExplain
          answer={card.back}
          judging={judging === card.id}
          key={card.id}
          onAttempt={(text, via) => onAttempt(card.id, text, via)}
          onNext={next}
          result={result ?? null}
        />

        {/* The escape hatch, not the route: quiet text rather than a button, and gone once
            there is evidence either way. */}
        {!result && (
          <div className="mt-6 text-center">
            <button
              className="text-[0.75rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={() => onReveal(card.id)}
              type="button"
            >
              Show me the answer
              <span className="ml-1.5">Space</span>
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

/** The recall answer box: the same explain-then-be-read loop as the test, at card scale. */
function RecallExplain({
  result,
  answer,
  judging,
  onAttempt,
  onNext,
}: {
  result: RecallResult | null;
  /** The reference answer, shown only when the learner asked to see it. */
  answer: string;
  judging: boolean;
  onAttempt: (text: string, via: "typed" | "spoken") => void;
  onNext: () => void;
}) {
  const [text, setText] = useState("");
  const dictation = useCanvasDictation();
  const spoke = useRef(false);
  const typedBefore = useRef("");

  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    spoke.current = true;
    setText([typedBefore.current, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  if (result) {
    return (
      <div className="mt-6">
        {result.said && (
          <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary)/50 px-4 py-3">
            <p className="mb-1 text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
              {result.via === "spoken" ? "You said" : "You wrote"}
            </p>
            <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">{result.said}</p>
          </div>
        )}

        {judging && <p className="mt-4 text-[0.875rem] text-(--ui-text-tertiary)">Reading your answer…</p>}

        {!judging && result.evaluation && (
          <div className="mt-4">
            <p
              className={cn(
                "text-[0.9375rem] font-medium",
                verdictIsPass(result.evaluation.verdict) ? "text-emerald-500" : "text-(--ui-text-primary)",
              )}
            >
              {VERDICT_HEADLINE[result.evaluation.verdict]}
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-(--ui-text-primary)">
              {result.evaluation.feedback}
            </p>
          </div>
        )}

        {/* The answer, shown because they asked for it. No self-grade follows: needing it shown
            is already the evidence, and asking "how well did you know that?" straight after
            reading it would replace a fact with a guess. */}
        {result.revealed && (
          <div className="mt-2">
            <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-primary)">{answer}</p>
            <p className="mt-2 text-[0.75rem] text-(--ui-text-quaternary)">
              Noted — Nemesis will bring this one back.
            </p>
          </div>
        )}

        {!judging && (
          <button
            className="mt-6 rounded-lg border border-(--ui-stroke-secondary) px-4 py-2 text-[0.875rem] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
            onClick={onNext}
            type="button"
          >
            Next
            <span className="ml-2 text-(--ui-text-quaternary)">Space</span>
          </button>
        )}
      </div>
    );
  }

  const submit = () => {
    const said = text.trim();
    if (!said) return;
    dictation.stop();
    onAttempt(said, spoke.current ? "spoken" : "typed");
  };

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-2.5">
        <textarea
          autoFocus
          className="max-h-48 min-h-[4.5rem] w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
          onChange={(event) => {
            setText(event.target.value);
            if (!dictation.listening) typedBefore.current = event.target.value;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={dictation.listening ? "Listening…" : "Say it back in your own words…"}
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
            Check
          </button>
        </div>
      </div>
      {dictation.error && <p className="mt-2 text-[0.75rem] text-(--ui-text-tertiary)">{dictation.error}</p>}
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
const TASK_HINT: Record<RetrievalTask, string> = {
  name: "Name it",
  define: "In your own words",
  explain: "Explain why",
  mechanism: "Walk through it, step by step",
  reconstruct: "Rebuild it from memory",
  compare: "Cover both sides",
  predict: "Say what happens, and why",
  apply: "Use it on this case",
  solve: "Work it through, showing your steps",
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
      <p className="mb-2 text-[0.75rem] text-(--ui-text-quaternary)">{TASK_HINT[question.task]}</p>
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
  const evaluation = response.evaluation ?? null;

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary)/50 px-4 py-3">
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

          <p className="mt-2 text-[0.9375rem] leading-relaxed text-(--ui-text-primary)">{evaluation.feedback}</p>

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
