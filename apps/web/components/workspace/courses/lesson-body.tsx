"use client";

// The lesson itself: the passage, its figures, the words you can click, and the questions sitting
// between the beats.
//
// 🔴 THIS IS THE SCROLL VIEW, AND IT IS NO LONGER THE DEFAULT. Owner, 2026-09-07: *"people think
// of textbooks like something boring... having a course like Duolingo is a little bit more engaging
// for the vast majority of people."* `lesson-deck.tsx` is what a learner opens now; this file is
// what they switch to.
//
// The argument this file used to make for scrolling is kept, because two thirds of it were right
// and the deck had to answer them rather than ignore them. It said: a chat panel beside the lesson
// is useless if the thing it is discussing keeps being replaced; comprehensive content in
// click-next becomes twenty-five screens; and a student revising at 11pm has to find the paragraph
// again. The answers are that this view still exists and is one click away (which is also what
// wondering.app does, whose own default is `scroll`), and that a deck page is ~60 words rather than
// a whole beat, so a lesson is five screens rather than twenty-five.

import { useState } from "react";

import { AnswerChoice, markFor } from "./answer-choice";

import { headingId, pagesOf, splitOnTerms, type Lesson, type LessonBlock } from "@/lib/courses/lesson";

/* ------------------------------------------------------------------ vocabulary */

export function TermChip({ term, definition }: { term: string; definition: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        aria-expanded={open}
        className="cursor-pointer border-b border-dotted border-(--course-meta) font-medium text-(--ui-text-primary) hover:border-(--ui-text-primary)"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {term}
      </button>
      {open ? (
        // Positioned above the word so it never covers the sentence you are reading. `w-max` with a
        // max keeps a short definition short instead of padding every popover to one fixed width.
        <span
          className="absolute bottom-[calc(100%+8px)] left-0 z-20 block w-max max-w-[300px] rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[13px] py-[10px] text-[13px] font-normal leading-[1.5] text-(--course-quiet) shadow-[0_6px_20px_rgba(0,0,0,0.10)]"
          role="tooltip"
        >
          <span className="mb-[3px] block text-[12px] font-semibold text-(--ui-text-primary)">{term}</span>
          {definition}
        </span>
      ) : null}
    </span>
  );
}

export function Passage({ text, lesson }: { text: string; lesson: Lesson }) {
  return (
    <p className="m-0 text-[16px] leading-[1.72] text-(--ui-text-primary)">
      {splitOnTerms(text, lesson.terms).map((segment, i) =>
        segment.kind === "term" ? (
          <TermChip definition={segment.definition} key={i} term={segment.text} />
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

/* ------------------------------------------------------------------ figures */

export function Figure({ block, lesson }: { block: Extract<LessonBlock, { kind: "figure" }>; lesson: Lesson }) {
  const figure = lesson.figures[block.fig];
  // 🔴 A MISSING FIGURE DRAWS NOTHING. Not a broken image, not a grey box saying a picture failed:
  // the owner's standing rule is that a learner is never told what is absent
  // (`no-picture-counts-for-learners`). The passage reads perfectly well without it.
  if (!figure) return null;
  return (
    <figure className="m-0 flex flex-col gap-[10px]">
      <div className="overflow-hidden rounded-[12px] border border-(--ui-stroke-tertiary) bg-white p-[14px]">
        <img alt={figure.alt} className="mx-auto block h-auto max-w-full" src={figure.url} />
      </div>
      <figcaption className="text-[13px] leading-[1.55] text-(--course-quiet)">
        {block.caption}
        <span className="ml-[6px] text-(--course-meta)">{figure.credit}</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ the stop */

/**
 * One practice question in the reading path.
 *
 * It answers immediately and explains either way, because the explanation is the teaching. Nothing
 * is recorded and nothing is scored: this is a stop to think, and putting a mark on it would turn
 * reading into an exam and make people stop clicking.
 */
export function Check({ block }: { block: Extract<LessonBlock, { kind: "check" }> }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const right = picked === block.answer;

  return (
    <div className="rounded-[14px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-[20px] py-[18px]">
      <div className="text-[12px] uppercase tracking-[0.06em] text-(--course-meta)">Check yourself</div>
      <p className="m-0 mt-[8px] text-[15px] font-medium leading-[1.5] text-(--ui-text-primary)">{block.question}</p>
      <div className="mt-[14px] flex flex-col gap-[7px]">
        {block.choices.map((choice, i) => (
          <AnswerChoice
            index={i}
            key={choice}
            label={choice}
            mark={markFor(i, picked, block.answer, answered)}
            onPick={() => setPicked(i)}
          />
        ))}
      </div>
      {answered ? (
        <div className="mt-[14px] border-t border-(--ui-stroke-tertiary) pt-[12px] text-[14px] leading-[1.6] text-(--course-quiet)">
          <span className="font-semibold" style={{ color: right ? "var(--course-right)" : "var(--course-wrong)" }}>
            {right ? "That is right. " : "Not quite. "}
          </span>
          {block.why}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ the lesson */

export function LessonBody({ lesson, sectionOrdinal }: { lesson: Lesson; sectionOrdinal: number }) {
  // 🔴 BOTH VIEWS READ `pagesOf`, AND THEY HAVE TO. A lesson that authors `pages` also still carries
  // the older `blocks` it was written as, and rendering `blocks` here meant the scroll view showed
  // one version of the prose while the deck showed another, with the outline rail naming headings
  // from whichever it happened to read. Pages are the lesson; a page break is simply ignored here.
  return (
    <div className="flex flex-col gap-[22px]">
      {pagesOf(lesson).map((page, p) => (
        <div className="flex flex-col gap-[22px]" key={p}>
          {page.heading ? (
            <h2
              className="m-0 mt-[10px] scroll-mt-[24px] text-[20px] font-semibold leading-[1.3] tracking-[-0.01em] text-(--ui-text-primary)"
              id={headingId(sectionOrdinal, p)}
            >
              {page.heading}
            </h2>
          ) : null}
          {page.blocks.map((block, i) => {
            switch (block.kind) {
              case "text":
                return <Passage key={i} lesson={lesson} text={block.text} />;
              case "figure":
                return <Figure block={block} key={i} lesson={lesson} />;
              case "check":
                return <Check block={block} key={i} />;
              case "heading":
                return null;
            }
          })}
        </div>
      ))}
    </div>
  );
}
