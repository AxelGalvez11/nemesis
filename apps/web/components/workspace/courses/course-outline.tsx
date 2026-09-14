"use client";

// The chapter outline down the left of a course, and everything the chapter contains.
//
// Owner, 2026-09-04: *"each unit, like subunit, should be collapsible so that it can show the
// individual sections and also where things are located maybe like flashcards or tests"* and
// *"there should be a way to collapse both sidebars"*.
//
// So a section is a folder now rather than a link. Open one and it shows the three things that
// section actually holds: the lesson, its deck, its test. The chapter's own test sits at the foot
// of the list, outside every section, because it is not part of any of them.
//
// 🔴 NOTHING HERE CLAIMS PROGRESS. No ticks, no percentages, no "3 of 7 done". The only state it
// draws is WHERE YOU ARE, which is true because the reader put you there. Every other mark would be
// an invention until evidence actually lands, and a study surface that quietly overstates what you
// have done is worse than one that says nothing.

import { useCallback, useState } from "react";

import { type LessonHeading } from "@/lib/courses/lesson";
import { splitTitle, type CourseView, type ReadingChapter } from "@/lib/courses/reading";

function Caret({ direction }: { direction: "left" | "right" | "down" }) {
  const d =
    direction === "left" ? "M9.5 3.5 5 8l4.5 4.5" : direction === "right" ? "M6.5 3.5 11 8l-4.5 4.5" : "M3.5 6.5 8 11l4.5-4.5";
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d={d} />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 18 18" width="16">
      <rect height="13" rx="3" width="15" x="1.5" y="2.5" />
      <path d="M7 2.5v13" />
    </svg>
  );
}

const PRACTICE: readonly { view: CourseView; label: string }[] = [
  { label: "Flashcards", view: "cards" },
  { label: "Test", view: "test" },
];

/**
 * The only grey in the rail, and it lasts exactly as long as the finger does.
 *
 * 🔴 BOTH HALVES ARE TRANSIENT BY CONSTRUCTION, WHICH IS THE POINT. `hover` says what is under the
 * pointer and `active` says the press landed; neither can survive the mouse leaving the row, so
 * neither can quietly grow back into the persistent box that was taken out. Anything that marks a
 * PLACE has to be written in ink, not in background.
 */
const TOUCH = "transition-colors duration-[90ms] hover:bg-(--ui-bg-quaternary) active:bg-(--ui-bg-tertiary)";

/**
 * One section in the rail, and everything inside it.
 *
 * 🔴🔴 GREY IS A TOUCH, NOT A PLACE. Owner, 2026-09-04, with the row circled: *"remove the
 * persistent gray box here, it should only show when clicking."* Nothing in this rail keeps a
 * background any more. The grey appears under the pointer and deepens while a row is held down,
 * and then it is gone — it answers "what would this press do", which is a question about the
 * mouse, not about the page.
 *
 * WHERE YOU ARE IS SAID BY THE INK. The current row goes to the primary text colour at weight 550
 * while everything around it stays secondary at 400. That was already true underneath the box; the
 * box was a second voice saying the same thing louder, and it was the loud one you noticed. This
 * is the third signal removed from these rows in two days — the black bar went yesterday for the
 * same reason.
 */
function SectionRow({
  section,
  headings,
  open,
  current,
  currentView,
  onToggle,
  onOpen,
  onJump,
}: {
  section: ReadingChapter["sections"][number];
  headings: readonly LessonHeading[];
  open: boolean;
  current: boolean;
  currentView: CourseView;
  onToggle: () => void;
  onOpen: (view: CourseView) => void;
  onJump: (headingId: string) => void;
}) {
  return (
    <div>
      <button
        className={`${TOUCH} flex w-full items-start gap-[8px] rounded-[9px] px-[10px] py-[7px] text-left`}
        onClick={onToggle}
        type="button"
      >
        <span className="shrink-0 pt-[2px] text-(--course-meta)">
          <Caret direction={open ? "down" : "right"} />
        </span>
        {section.number ? (
          <span className="shrink-0 pt-[1px] text-[12px] tabular-nums text-(--course-meta)" style={{ minWidth: "26px" }}>
            {section.number}
          </span>
        ) : null}
        <span
          className="text-[13px] leading-[1.45]"
          style={{
            color: current ? "var(--ui-text-primary)" : "var(--course-quiet)",
            fontWeight: current ? 550 : 400,
          }}
        >
          {section.title}
        </span>
      </button>

      {/* 🔴 THE HEIGHT IS ANIMATED WITH A GRID TRACK, NOT max-height. The usual trick is a max-height
          guess large enough for the biggest section, and it makes every SHORT section animate at a
          different speed than a long one, because the transition runs over a distance the content
          never uses. `grid-template-rows: 0fr` to `1fr` interpolates the content's OWN height, so a
          three-heading section and a nine-heading one take exactly the same time. The child needs
          `min-h-0` or it refuses to shrink below its content. */}
      <div
        className="grid transition-[grid-template-rows] duration-[180ms] ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        {/* 🔴 A FOLDED SECTION MUST LEAVE THE TAB ORDER, AND THE ANIMATION IS WHY. The old build
            unmounted the contents when closed, so a hidden row simply did not exist. Animating the
            height means every row stays in the DOM at zero height, and without `inert` a keyboard
            user tabs through seven invisible Flashcards buttons and a screen reader reads a
            chapter's worth of rows nobody can see. Caught by a test runner finding seven identical
            buttons where the screen showed one. */}
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="ml-[30px] flex flex-col gap-[1px] pb-[6px]">
          {/* The section's own headings ARE the contents. They jump within the lesson rather than
              navigating, so the passage keeps its place and its answered questions. */}
          {headings.map((heading) => (
            <button
              className={`${TOUCH} rounded-[8px] px-[10px] py-[5px] text-left text-[13px] leading-[1.4] text-(--course-quiet) hover:text-(--ui-text-primary)`}
              key={heading.id}
              onClick={() => onJump(heading.id)}
              type="button"
            >
              {heading.text}
            </button>
          ))}

          {PRACTICE.map((piece) => {
            const here = current && currentView === piece.view;
            return (
              <button
                className={`${TOUCH} rounded-[8px] px-[10px] py-[5px] text-left text-[13px]`}
                key={piece.view}
                onClick={() => onOpen(piece.view)}
                style={{
                  color: here ? "var(--ui-text-primary)" : "var(--course-quiet)",
                  fontWeight: here ? 550 : 400,
                  marginTop: headings.length > 0 && piece.view === "cards" ? "6px" : undefined,
                }}
                type="button"
              >
                {piece.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CourseOutline({
  courseTitle,
  chapter,
  chapterIndex,
  chapterCount,
  currentOrdinal,
  currentView,
  collapsed,
  headingsFor,
  onCollapse,
  onOpen,
  onJump,
  onStepChapter,
  onLeave,
}: {
  courseTitle: string;
  chapter: ReadingChapter;
  chapterIndex: number;
  chapterCount: number;
  currentOrdinal: number;
  currentView: CourseView;
  collapsed: boolean;
  /** The headings inside a section's written lesson. Empty for a section not yet written. */
  headingsFor: (ordinal: number) => readonly LessonHeading[];
  onCollapse: (collapsed: boolean) => void;
  onOpen: (ordinal: number, view: CourseView) => void;
  onJump: (ordinal: number, headingId: string) => void;
  onStepChapter: (delta: number) => void;
  onLeave: () => void;
}) {
  // The section you are in opens itself; everything else stays folded until asked for.
  const [open, setOpen] = useState<Set<number>>(() => new Set([currentOrdinal]));

  /**
   * 🔴 A SECTION ROW ONLY FOLDS WHEN YOU ARE ALREADY READING THAT SECTION. Everywhere else it takes
   * you to the lesson, because the click has to do the obvious thing: from another section, from
   * the flashcards, or from the chapter test, pressing a section means "take me there". Folding
   * instead would leave you on a screen you were trying to leave, with its contents now hidden.
   */
  const press = useCallback(
    (ordinal: number) => {
      const reading = ordinal === currentOrdinal && currentView === "lesson";
      setOpen((prev) => {
        const next = new Set(prev);
        if (reading && next.has(ordinal)) next.delete(ordinal);
        else next.add(ordinal);
        return next;
      });
      if (!reading) onOpen(ordinal, "lesson");
    },
    [currentOrdinal, currentView, onOpen],
  );

  const unit = chapter.unit ? splitTitle(chapter.unit) : null;
  const heading = splitTitle(chapter.title);

  return (
    /* 🔴🔴 BOTH STATES ARE MOUNTED AT ONCE, WHICH IS THE ONLY WAY THIS CAN ANIMATE. Until now the
       component RETURNED A DIFFERENT `<nav>` when collapsed — 48px with a vertical label — so
       React swapped one element for another and there was never a width to interpolate. Owner,
       2026-09-04: *"add animation for collapsing the right and left sidebars"*.
       The model is ChatGPT's own, measured on 2026-09-01: the frame is `overflow-hidden` and holds
       the full panel and the narrow strip together; they trade opacity while the frame's width
       travels. See `sidebar-opens-by-growing` for the reading. */
    <nav
      aria-label="Chapter outline"
      className="course-pane relative h-full shrink-0 overflow-hidden rounded-[16px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)"
      style={{ width: collapsed ? "48px" : "286px" }}
    >
      {/* 🔴 HELD AT ITS FULL 286px WHILE THE FRAME NARROWS. Letting this shrink with its parent
          would re-wrap every section title through the whole 238px of travel, which reads as the
          text thrashing rather than as a panel closing. */}
      <div
        className="flex h-full w-[286px] flex-col transition-opacity duration-150 ease-linear motion-reduce:transition-none"
        inert={collapsed}
        style={{ opacity: collapsed ? 0 : 1 }}
      >
      <div className="flex h-[44px] shrink-0 items-center gap-[4px] pl-[12px] pr-[8px]">
        <button
          className="flex min-w-0 grow items-center gap-[6px] text-left text-(--course-quiet) hover:text-(--ui-text-primary)"
          onClick={onLeave}
          type="button"
        >
          <Caret direction="left" />
          <span className="truncate text-[13px]">{courseTitle}</span>
        </button>
        <button
          aria-label="Hide the outline"
          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-(--course-meta) hover:bg-(--ui-bg-quaternary) hover:text-(--ui-text-primary)"
          onClick={() => onCollapse(true)}
          type="button"
        >
          <PanelIcon />
        </button>
      </div>

      <div className="min-h-0 grow overflow-y-auto px-[12px] pb-[14px]">
        {unit ? (
          <div className="mb-[6px] text-[11px] uppercase tracking-[0.06em] text-(--course-meta)">
            {unit.label ? `${unit.label} · ` : ""}
            {unit.name}
          </div>
        ) : null}

        <h2 className="m-0 text-[17px] font-semibold leading-[1.25] tracking-[-0.005em] text-(--ui-text-primary)">
          {heading.name}
        </h2>

        <div className="mt-[14px] flex flex-col gap-[1px]">
          {chapter.sections.map((section) => (
            <SectionRow
              current={section.ordinal === currentOrdinal}
              currentView={currentView}
              headings={headingsFor(section.ordinal)}
              key={section.ordinal}
              onJump={(id) => onJump(section.ordinal, id)}
              onOpen={(view) => onOpen(section.ordinal, view)}
              onToggle={() => press(section.ordinal)}
              open={open.has(section.ordinal)}
              section={section}
            />
          ))}
        </div>

        {/* 🔴 THE CHAPTER TEST SITS OUTSIDE EVERY SECTION, because that is what it is: it draws from
            all of them at once. Nesting it under the last section would say it belongs to that one. */}
        <div className="mt-[12px] border-t border-(--ui-stroke-tertiary) pt-[12px]">
          <button
            className={`${TOUCH} w-full rounded-[9px] px-[10px] py-[8px] text-left text-[13px]`}
            onClick={() => onOpen(currentOrdinal, "chapter")}
            style={{
              color: currentView === "chapter" ? "var(--ui-text-primary)" : "var(--course-quiet)",
              fontWeight: currentView === "chapter" ? 550 : 400,
            }}
            type="button"
          >
            Chapter test
          </button>
        </div>
      </div>

      <div className="flex h-[44px] shrink-0 items-center justify-between border-t border-(--ui-stroke-tertiary) px-[8px]">
        <button
          aria-label="Previous chapter"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-(--course-quiet) hover:bg-(--ui-bg-quaternary) disabled:opacity-35"
          disabled={chapterIndex === 0}
          onClick={() => onStepChapter(-1)}
          type="button"
        >
          <Caret direction="left" />
        </button>
        <span className="text-[12px] tabular-nums text-(--course-meta)">
          {heading.label ?? `Chapter ${chapterIndex + 1}`} of {chapterCount}
        </span>
        <button
          aria-label="Next chapter"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-(--course-quiet) hover:bg-(--ui-bg-quaternary) disabled:opacity-35"
          disabled={chapterIndex >= chapterCount - 1}
          onClick={() => onStepChapter(1)}
          type="button"
        >
          <Caret direction="right" />
        </button>
      </div>
      </div>

      {/* 🔴🔴 THE STRIP CUTS, IT DOES NOT FADE, and the easing is the whole reason. Measured on the
          reference: the narrow rail switches with `steps(1, start)` closing and `steps(1, end)`
          opening, so the leftmost 48px is painted opaquely for the entire travel in both
          directions. A plain cross-fade there lets the panel's own left edge show through the
          half-transparent strip for 150ms, which reads as a flicker rather than as a fold. It is
          `absolute`, so it paints OVER the panel and needs its own ground to hide it. */}
      <div
        className="absolute inset-y-0 left-0 flex w-[48px] flex-col items-center gap-[10px] bg-(--ui-bg-elevated) py-[10px] motion-reduce:transition-none"
        inert={!collapsed}
        style={{
          opacity: collapsed ? 1 : 0,
          transition: `opacity 150ms ${collapsed ? "steps(1, start)" : "steps(1, end)"}`,
        }}
      >
        <button
          aria-label="Show the outline"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-(--course-quiet) hover:bg-(--ui-bg-quaternary)"
          onClick={() => onCollapse(false)}
          type="button"
        >
          <PanelIcon />
        </button>
        {/* Vertical, so the strip still tells you where you are without being wide enough to read. */}
        <span
          className="mt-[6px] text-[11px] tabular-nums tracking-[0.08em] text-(--course-meta)"
          style={{ writingMode: "vertical-rl" }}
        >
          {heading.label ?? `Chapter ${chapterIndex + 1}`}
        </span>
      </div>
    </nav>
  );
}
