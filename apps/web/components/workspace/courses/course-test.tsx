"use client";

// A test, drawn from written questions, that you can take again and again.
//
// One component serves both the section test and the chapter test, because they differ only in
// which bank they draw from and how many questions they take. Two components would be two places
// for "mark it" to behave slightly differently.

import { useCallback, useMemo, useState } from "react";

import { AnswerChoice, markFor } from "./answer-choice";
import { drawTest, scoreOf, weakFrom, type TestItem } from "@/lib/courses/lesson";

export function CourseTest({
  title,
  subtitle,
  items,
  size,
  objectiveLabel,
  onDone,
}: {
  title: string;
  subtitle: string;
  items: readonly TestItem[];
  size: number;
  /** How to name an objective the learner missed. Section tests number within a section; the
   *  chapter test has to say which section it came from, or the name means nothing. */
  objectiveLabel: (objective: number) => string | null;
  onDone?: () => void;
}) {
  const [seed, setSeed] = useState(1);
  const [weak, setWeak] = useState<readonly number[]>([]);
  const [seen, setSeen] = useState<readonly string[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [marked, setMarked] = useState(false);

  const paper = useMemo(
    () => drawTest(items, size, { avoid: seen, seed, weakObjectives: weak }),
    [items, seed, seen, size, weak],
  );

  const answered = answers.filter((a) => a !== null).length;
  const score = marked ? scoreOf(paper, answers) : 0;
  // 🔴 SAY WHEN THE BANK HAS RUN OUT. A section holds ten written questions and a paper is six, so
  // the second retake starts repeating. Repeating is right (seeing a question again is how you find
  // out you still cannot answer it) but doing it silently would look like a bug.
  const repeated = paper.filter((i) => seen.includes(i.question)).length;

  const mark = useCallback(() => {
    setMarked(true);
    setWeak(weakFrom(paper, answers));
  }, [answers, paper]);

  // 🔴 REGENERATING IS DRAWING AGAIN, NOT CALLING A MODEL AGAIN. Instant, free, and every question
  // was written and checked in advance. What the new paper is not is a reshuffle: it remembers what
  // you just saw and what you got wrong, so a retake looks at the gap.
  const again = useCallback(() => {
    setSeen((prev) => [...prev, ...paper.map((i) => i.question)]);
    setSeed((s) => s + 1);
    setAnswers([]);
    setMarked(false);
    window.scrollTo({ behavior: "smooth", top: 0 });
  }, [paper]);

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-[14px]">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col gap-[3px]">
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.01em] text-(--ui-text-primary)">{title}</h1>
          <p className="m-0 text-[14px] text-(--course-quiet)">{subtitle}</p>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-(--course-meta)">
          {marked ? `${score} of ${paper.length}` : `${answered} of ${paper.length} answered`}
        </span>
      </header>

      {repeated > 0 && !marked ? (
        <p className="m-0 text-[13px] leading-[1.5] text-(--course-quiet)">
          You have now seen every question written for this, so {repeated} of these are coming round again.
        </p>
      ) : null}

      {paper.map((item, qi) => {
        const picked = answers[qi] ?? null;
        return (
          <div
            className="rounded-[14px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[20px] py-[17px]"
            key={`${seed}-${item.question}`}
          >
            <p className="m-0 text-[15px] font-medium leading-[1.5] text-(--ui-text-primary)">
              <span className="mr-[8px] tabular-nums text-(--course-meta)">{qi + 1}</span>
              {item.question}
            </p>
            <div className="mt-[12px] flex flex-col gap-[6px]">
              {item.choices.map((choice, ci) => (
                <AnswerChoice
                  index={ci}
                  key={choice}
                  label={choice}
                  mark={markFor(ci, picked, item.answer, marked)}
                  onPick={() =>
                    setAnswers((prev) => {
                      const next = [...prev];
                      while (next.length < paper.length) next.push(null);
                      next[qi] = ci;
                      return next;
                    })
                  }
                />
              ))}
            </div>
            {marked ? (
              <p className="m-0 mt-[12px] border-t border-(--ui-stroke-tertiary) pt-[11px] text-[13px] leading-[1.6] text-(--course-quiet)">
                {item.why}
              </p>
            ) : null}
          </div>
        );
      })}

      {marked ? (
        <div className="flex flex-col gap-[12px] rounded-[14px] bg-(--ui-bg-quaternary) px-[20px] py-[17px]">
          {/* The colour is on the SCORE, not on the panel: a red wash behind the whole result reads
              as a telling-off, and a learner who got four out of six has not failed anything. */}
          <div className="text-[15px] font-medium">
            <span style={{ color: score === paper.length ? "var(--course-right)" : "var(--ui-text-primary)" }}>
              {score}
            </span>
            <span className="text-(--ui-text-primary)"> out of {paper.length}</span>
          </div>
          {/* Naming what you missed is the useful half of a score. The number says how you did; this
              says what to go back to. */}
          {weak.length > 0 ? (
            <div className="flex flex-col gap-[6px]">
              <span className="text-[13px] text-(--course-quiet)">Worth another look:</span>
              {weak.map((o) => {
                const label = objectiveLabel(o);
                return label ? (
                  <span className="flex gap-[8px] text-[13px] leading-[1.5] text-(--ui-text-primary)" key={o}>
                    <span className="text-(--course-meta)">&mdash;</span>
                    {label}
                  </span>
                ) : null;
              })}
            </div>
          ) : (
            <span className="text-[13px] text-(--course-quiet)">Everything on this paper, answered correctly.</span>
          )}
          <div className="flex gap-[10px]">
            <button
              className="h-[38px] rounded-[10px] bg-(--ui-action) px-[18px] text-[14px] font-medium text-(--ui-action-glyph)"
              onClick={again}
              type="button"
            >
              {weak.length > 0 ? "Test me again on those" : "Give me a new test"}
            </button>
            {onDone ? (
              <button
                className="h-[38px] rounded-[10px] border border-(--ui-stroke-tertiary) px-[18px] text-[14px] text-(--ui-text-primary) hover:bg-(--ui-bg-quaternary)"
                onClick={onDone}
                type="button"
              >
                Next section
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          className="h-[40px] w-fit rounded-[10px] bg-(--ui-action) px-[20px] text-[14px] font-medium text-(--ui-action-glyph) disabled:opacity-45"
          disabled={answered < paper.length}
          onClick={mark}
          type="button"
        >
          {answered < paper.length ? `${paper.length - answered} left` : "Mark it"}
        </button>
      )}
    </section>
  );
}
