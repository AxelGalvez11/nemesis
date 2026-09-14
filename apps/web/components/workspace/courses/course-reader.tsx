"use client";

// Reading a course: the outline on the left, one of the course's surfaces in the middle, Nemesis on
// the right when you want it.
//
// 🔴 A COURSE NO LONGER HANDS OFF TO A CHAT. Owner, 2026-09-04: *"courses should remain in the
// courses section. They shouldn't really open up a chat."* Starting a course used to push to
// `/learn?course=…`, which left the Courses section entirely and became an ordinary canvas. This is
// where a course lives instead, and it settles the third-canvas-type question too: a course is NOT
// a canvas. It is its own surface, with its own furniture, that a canvas never sees.
//
// 🔴 BOTH RAILS ARE PANELS, NOT WALLS. Owner, same day: they were "too boxy", and both had to
// collapse. So each is a rounded card floating on the page ground rather than a full-height column
// with a hard edge, and each has its own control to fold away. The middle column is the page.

import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseCards } from "./course-cards";
import { CourseChat } from "./course-chat";
import { CourseOutline } from "./course-outline";
import { CourseTest } from "./course-test";
import { LessonBody } from "./lesson-body";
import { LessonDeck } from "./lesson-deck";
import { getCourse, listSections, type CourseSection, type CourseSummary } from "@/lib/courses/catalogue";
import { loadCardMemory, memoryKey, type CardMemory } from "@/lib/courses/card-memory";
import { headingsOf, listLessons, pageOfId, poolForChapter, type Lesson, type LessonHeading } from "@/lib/courses/lesson";
import { chapterHolding, chaptersOf, splitTitle, type CourseView } from "@/lib/courses/reading";

const SECTION_TEST = 6;
const CHAPTER_TEST = 15;


/**
 * Put a heading at the top of the reading column.
 *
 * 🔴 SMOOTH SCROLLING CAN SILENTLY DO NOTHING, AND IT DID. Measured on this build: the same call
 * with `behavior: "auto"` moved the column 1,927px and with `behavior: "smooth"` moved it zero.
 * Smooth scrolling is driven by the compositor, so a throttled or hidden context never runs the
 * animation and never lands either. A table of contents whose links do nothing is worse than one
 * that jumps, so the animation is attempted and then CHECKED: if the column has not moved shortly
 * after, it is set outright. Nobody who can see the animation ever notices the guard.
 */
function scrollToHeading(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const column = el.closest<HTMLElement>(".course-reading-column");
  if (!column) {
    el.scrollIntoView({ block: "start" });
    return;
  }
  const gentle = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const target = Math.max(0, column.scrollTop + el.getBoundingClientRect().top - column.getBoundingClientRect().top - 12);
  const before = column.scrollTop;
  column.scrollTo({ behavior: gentle ? "smooth" : "auto", top: target });
  if (!gentle) return;
  window.setTimeout(() => {
    if (Math.abs(column.scrollTop - before) < 4) column.scrollTop = target;
  }, 350);
}

function Objectives({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[20px] py-[17px]">
      <div className="text-[12px] uppercase tracking-[0.06em] text-(--course-meta)">
        What you should be able to do
      </div>
      <div className="mt-[11px] flex flex-col gap-[8px]">
        {items.map((objective) => (
          <div className="flex gap-[10px] text-[14px] leading-[1.5] text-(--ui-text-primary)" key={objective}>
            <span className="text-(--course-meta)">&mdash;</span>
            <span>{objective}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 🔴 THE END OF A LESSON IS A DOOR, NOT AN EDGE. Owner, 2026-09-04: *"once a user finishes reading
 * the section, there should be like a way to continue into the tests."* Before this the passage
 * simply stopped and the only way to practise was to find the rail. Reading and being tested are
 * one movement, so the page has to carry you from one into the other.
 */
function WhatNext({ cards, onCards, onTest }: { cards: number; onCards: () => void; onTest: () => void }) {
  return (
    <div className="flex flex-col gap-[14px] rounded-[14px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-[22px] py-[20px]">
      <div>
        <div className="text-[15px] font-medium text-(--ui-text-primary)">That is the section read.</div>
        <p className="m-0 mt-[4px] text-[14px] leading-[1.55] text-(--course-quiet)">
          Reading it once is not knowing it. Try to bring it back instead.
        </p>
      </div>
      <div className="flex flex-wrap gap-[10px]">
        <button
          className="h-[40px] rounded-[10px] bg-(--ui-action) px-[20px] text-[14px] font-medium text-(--ui-action-glyph)"
          onClick={onTest}
          type="button"
        >
          Take the test
        </button>
        {cards > 0 ? (
          <button
            className="h-[40px] rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[20px] text-[14px] text-(--ui-text-primary) hover:bg-(--ui-bg-quaternary)"
            onClick={onCards}
            type="button"
          >
            Study the {cards} flashcards
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 🔴 ALWAYS MOUNTED, FADED OUT WHILE THE PANEL IS OPEN. Removing it on open and adding it back on
 * close popped a button into existence at the exact moment the panel finished collapsing, which is
 * the one frame a person is already watching. It cross-fades with the panel instead.
 */
function AskButton({ hidden, onOpen }: { hidden: boolean; onOpen: () => void }) {
  return (
    <button
      aria-hidden={hidden}
      className="fixed bottom-[26px] right-[26px] z-30 flex h-[44px] items-center gap-[9px] rounded-[22px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) pl-[16px] pr-[18px] text-[14px] font-medium text-(--ui-text-primary) shadow-[0_6px_22px_rgba(0,0,0,0.12)] transition-opacity duration-150 ease-linear motion-reduce:transition-none"
      onClick={onOpen}
      style={{ opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : undefined }}
      tabIndex={hidden ? -1 : undefined}
      type="button"
    >
      <svg fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 18 18" width="17">
        <path d="M15.5 11.5a1.8 1.8 0 0 1-1.8 1.8H6.2L2.5 16.5V4.3a1.8 1.8 0 0 1 1.8-1.8h9.4a1.8 1.8 0 0 1 1.8 1.8Z" />
      </svg>
      Ask
    </button>
  );
}

export function CourseReader({
  slug,
  at,
  view,
  userId,
  onMove,
  onLeave,
}: {
  slug: string;
  at: number | null;
  view: CourseView;
  userId: string | null;
  onMove: (ordinal: number, view: CourseView) => void;
  onLeave: () => void;
}) {
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [lessons, setLessons] = useState<Map<number, Lesson>>(new Map());
  const [memories, setMemories] = useState<Map<string, CardMemory>>(new Map());
  const [railOpen, setRailOpen] = useState(true);
  const [asking, setAsking] = useState(false);
  const [missing, setMissing] = useState(false);
  // Which way the lesson reads. Deck is the default; "Read it as one page" switches, and moving to
  // another section puts it back, so a learner who wanted the whole page once is not stuck in the
  // scroll view for the rest of the book.
  const [deck, setDeck] = useState(true);
  /** A page the rail asked the deck for. The token makes the same row clickable twice. */
  const [jumpTo, setJumpTo] = useState<{ page: number; token: number } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const found = await getCourse(slug);
      if (!live) return;
      if (!found) {
        setMissing(true);
        return;
      }
      setCourse(found);
      // All three at once: the outline cannot draw without the sections, the lesson is the reason
      // the page exists, and the deck counts are wrong until the memory arrives. Serially would
      // show the page and then reflow it twice.
      const [rows, written, memory] = await Promise.all([
        listSections(found.id),
        listLessons(found.id),
        loadCardMemory(userId, found.id),
      ]);
      if (!live) return;
      setSections(rows);
      setLessons(written);
      setMemories(memory);
    })();
    return () => {
      live = false;
    };
  }, [slug, userId]);

  const chapters = useMemo(() => chaptersOf(sections), [sections]);

  // Where to open when nothing said: the first section that actually teaches something, which is
  // not always ordinal 0, because books put prefaces and chapter introductions in front of it.
  const start = useMemo(
    () => (sections.find((s) => s.objectives.length > 0) ?? sections[0])?.ordinal ?? null,
    [sections],
  );
  const here = at ?? start;

  const chapter = useMemo(() => (here === null ? null : chapterHolding(chapters, here)), [chapters, here]);
  const chapterIndex = chapter ? chapters.findIndex((c) => c.key === chapter.key) : -1;
  const section = here === null ? null : (sections.find((s) => s.ordinal === here) ?? null);
  const lesson = here === null ? null : (lessons.get(here) ?? null);

  const pool = useMemo(
    () => (chapter ? poolForChapter(chapter.sections, lessons) : { items: [], labels: [] }),
    [chapter, lessons],
  );

  // Moving to another section puts the deck back. Switching to the whole page is a thing you do to
  // ONE lesson, usually to find a paragraph again; carrying it forward would quietly turn the
  // course back into the textbook the deck exists to replace.
  useEffect(() => setDeck(true), [here]);

  const stepChapter = useCallback(
    (delta: number) => {
      const first = chapters[chapterIndex + delta]?.sections[0];
      if (first) onMove(first.ordinal, "lesson");
    },
    [chapterIndex, chapters, onMove],
  );

  const nextSection = useCallback(() => {
    if (!chapter || !section) return;
    const at = chapter.sections.findIndex((s) => s.ordinal === section.ordinal);
    const next = chapter.sections[at + 1];
    if (next) onMove(next.ordinal, "lesson");
    else onMove(section.ordinal, "chapter");
  }, [chapter, onMove, section]);

  const headingsFor = useCallback(
    (ordinal: number): readonly LessonHeading[] => {
      const written = lessons.get(ordinal);
      return written ? headingsOf(written, ordinal) : [];
    },
    [lessons],
  );

  /**
   * 🔴 A HEADING JUMPS, IT DOES NOT NAVIGATE. Re-rendering the lesson to reach a heading inside the
   * lesson you are already reading would throw away every check you had answered on the way down.
   * When the jump is into ANOTHER section the move has to happen first, so the anchor is retried
   * once the new passage has painted.
   */
  const jump = useCallback(
    (ordinal: number, headingId: string) => {
      // In the deck the other pages are not in the document, so there is nothing to scroll to. The
      // rail asks for a page number instead and the deck moves to the screen holding it.
      const page = pageOfId(headingId);
      const intoDeck = deck && page !== null;
      if (ordinal === here && view === "lesson") {
        if (intoDeck) setJumpTo({ page, token: Date.now() });
        else scrollToHeading(headingId);
        return;
      }
      onMove(ordinal, "lesson");
      if (intoDeck) {
        setJumpTo({ page, token: Date.now() });
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToHeading(headingId)));
    },
    [deck, here, onMove, view],
  );

  const remember = useCallback((memory: CardMemory) => {
    setMemories((prev) => new Map(prev).set(memoryKey(memory.sectionOrdinal, memory.cardIndex), memory));
  }, []);

  if (missing) {
    return (
      <div className="flex h-full items-center justify-center bg-(--ui-bg-editor) text-[14px] text-(--course-quiet)">
        That course is not on the shelf.
      </div>
    );
  }

  if (!course || !chapter || !section) {
    return (
      <div className="flex h-full items-center justify-center bg-(--ui-bg-editor) text-[14px] text-(--course-quiet)">
        Opening…
      </div>
    );
  }

  const heading = splitTitle(chapter.title);

  const middle = (() => {
    if (view === "chapter") {
      return (
        <CourseTest
          items={pool.items}
          objectiveLabel={(o) => pool.labels[o] ?? null}
          size={CHAPTER_TEST}
          subtitle={`Everything in ${heading.name}, drawn from all ${chapter.sections.length} sections.`}
          title="Chapter test"
        />
      );
    }
    if (view === "cards" && lesson) {
      return (
        <CourseCards
          courseId={course.id}
          lesson={lesson}
          memories={memories}
          onFinish={() => onMove(section.ordinal, "test")}
          onRemember={remember}
          sectionOrdinal={section.ordinal}
          sectionTitle={`${section.number ? `${section.number} ` : ""}${section.title}`}
          userId={userId}
        />
      );
    }
    if (view === "test" && lesson) {
      return (
        <CourseTest
          items={lesson.items}
          objectiveLabel={(o) => section.objectives[o] ?? null}
          onDone={nextSection}
          size={SECTION_TEST}
          subtitle={`${section.number ? `${section.number} ` : ""}${section.title}`}
          title="Test yourself"
        />
      );
    }
    return (
      <>
        <header className="flex flex-col gap-[8px]">
          <div className="flex items-center gap-[10px] text-[12px] uppercase tracking-[0.06em] text-(--course-meta)">
            {heading.label ? <span>{heading.label}</span> : null}
            {lesson ? <span className="tabular-nums normal-case tracking-normal">{lesson.minutes} min read</span> : null}
          </div>
          <h1 className="m-0 text-[30px] font-semibold leading-[1.2] tracking-[-0.015em] text-(--ui-text-primary)">
            {section.number ? <span className="tabular-nums text-(--course-quiet)">{section.number} </span> : null}
            {section.title}
          </h1>
        </header>

        {/* In the deck the objectives ride on the opening screen instead, so they are read once. */}
        {deck && lesson ? null : <Objectives items={section.objectives} />}

        {lesson ? (
          // 🔴 A DECK BY DEFAULT, A PAGE ON REQUEST. Owner, 2026-09-07: a textbook reads as boring
          // and a Duolingo-shaped course does not. wondering.app ships both views too (their own
          // default constant is `scroll`); ours is the deck, because the scroll view is what he was
          // reacting against. The choice is per learner and does not survive the session on purpose:
          // it is a reading preference, not a setting worth a row in a table.
          deck ? (
            <LessonDeck
              jumpTo={jumpTo}
              lesson={lesson}
              objectives={section.objectives}
              onFinish={() => onMove(section.ordinal, "test")}
              onScrollInstead={() => setDeck(false)}
              sectionOrdinal={section.ordinal}
            />
          ) : (
            <>
              <LessonBody lesson={lesson} sectionOrdinal={section.ordinal} />
              <WhatNext
                cards={lesson.flashcards.length}
                onCards={() => onMove(section.ordinal, "cards")}
                onTest={() => onMove(section.ordinal, "test")}
              />
            </>
          )
        ) : (
          // 🔴 IT NAMES NO CHAPTER, AND IT USED TO. The line read "Chapter 1 is written", which was
          // true for one day and is a promise this file cannot keep: lessons are written a book at a
          // time by a background job, so any count or chapter number here is stale the moment it
          // runs. Says what is true and carries no button, because a control that does nothing yet
          // is worse than a sentence.
          <div className="rounded-[12px] border border-dashed border-(--ui-stroke-tertiary) px-[20px] py-[17px] text-[14px] leading-[1.6] text-(--course-quiet)">
            This section has its outline. The lesson for it is still being written.
          </div>
        )}
      </>
    );
  })();

  return (
    /* 🔴 NO `gap` ON THE ROW, AND THAT IS NOT TIDINESS. A flex gap is paid even by a child of zero
       width, so with the chat closed the page would carry 12px of gap plus 12px of page padding on
       the right and 12px on the left — a visible lopsidedness that appears only in the closed
       state. Each panel carries its own edge instead: the rail an `mr`, the chat an `ml` INSIDE its
       clipping frame, where a closed frame hides it along with everything else. */
    <div className="flex h-full min-h-0 bg-(--ui-bg-editor) p-[12px] pt-[calc(var(--titlebar-height)+12px)]">
      <CourseOutline
        chapter={chapter}
        chapterCount={chapters.length}
        chapterIndex={chapterIndex}
        collapsed={!railOpen}
        courseTitle={course.title}
        currentOrdinal={section.ordinal}
        currentView={view}
        headingsFor={headingsFor}
        onCollapse={(collapsed) => setRailOpen(!collapsed)}
        onJump={jump}
        onLeave={onLeave}
        onOpen={onMove}
        onStepChapter={stepChapter}
      />

      {/* 🔴 THE SCROLL CONTAINER IS KEYED ON WHAT IT HOLDS so moving anywhere starts at the top.
          Without the key React reuses the node, keeps its scrollTop, and drops you into the middle
          of something you have not read a word of. */}
      <div className="course-reading-column ml-[12px] min-w-0 grow overflow-y-auto" key={`${section.ordinal}:${view}`}>
        <div className="mx-auto flex w-full flex-col gap-[26px] px-[28px] pt-[22px] pb-[110px]" style={{ maxWidth: "720px" }}>
          {middle}
        </div>
      </div>

      {/* 🔴🔴 THE CHAT IS NEVER UNMOUNTED. Two reasons, and the second one is the better one.
          It is what gives the width something to animate between — a component that appears cannot
          slide in. And it means closing the panel no longer throws the conversation away: reopen it
          and the questions you already asked are still there, which is what anyone would expect of
          a panel with a close button on it.
          The frame clips; the panel inside keeps its own 384px and its own 12px of separation, so
          nothing inside it reflows during the 220ms. */}
      <div className="course-pane h-full shrink-0 overflow-hidden" style={{ width: asking ? "396px" : "0px" }}>
        <CourseChat
          courseTitle={course.title}
          lesson={lesson}
          objectives={section.objectives}
          onClose={() => setAsking(false)}
          open={asking}
          sectionTitle={section.title}
          userId={userId}
        />
      </div>
      <AskButton hidden={asking} onOpen={() => setAsking(true)} />
    </div>
  );
}
