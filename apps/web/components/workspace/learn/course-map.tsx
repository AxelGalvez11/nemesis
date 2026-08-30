"use client";

// The course map: chapters, their sections, and how each one stands.
//
// 🔴🔴 THE DESIGN IS THE OWNER'S PICK FROM FOUR, 2026-08-29 — *"Let's go mastery outline."* Its
// distinguishing move is that every chapter carries a thin bar, so "where should I go next" is
// answerable at a glance without reading a word. The three rejected options are recorded in the
// artifact that was published with them; the reason this one won is the bar.
//
// 🔴🔴 THE BAR IS FILLED BY A COUNT, NOT BY A SCORE, AND THAT CORRECTS THE MOCK. The mock showed
// chapters at 100 / 62 / 25 percent. `territoryMark` has three values and no number — see the long
// note in `lib/learn/course-map.ts`. A percentage would have to be invented, so the bar is drawn
// from how many SECTIONS are established and how many are underway, and the label beside it is a
// fraction. Nothing in this file prints a percent.
//
// 🔴 IT DOCKS, IT DOES NOT FLOAT, AND THE MACHINERY FOR THAT ALREADY EXISTED. `useDeclareSidePanel`
// pushes the canvas by exactly this width, collapses the left sidebar to its rail without touching
// the learner's stored preference, and — the part that matters here — `CanvasHistoryRail` already
// hides itself while a panel is docked (`inset > 0`). So the map and the history rail never fight
// for the right edge, and neither had to learn about the other.
//
// 🔴 PORTALLED TO THE BODY, WITH `data-workspace` RESTAMPED. `position: fixed` inside the canvas
// resolves against the canvas's own transformed ancestor rather than the viewport; and leaving the
// workspace scope hands every button in here to `globals.css`'s acid-green fallback. Both are
// recorded in `output-preview.tsx`, which hit them first.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { cn } from "@/lib/utils";

import { barWidths, buildCourseMap, courseProgress, type CourseMapChapter } from "@/lib/learn/course-map";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";

/**
 * How wide the map stands.
 *
 * 🔴🔴 A FIXED WIDTH, NOT `useDockWidth`, AND THE FIRST VERSION GOT THIS WRONG. Reusing the
 * reader's hook opened the map at **980 of 1470** — two thirds of the window for an outline — and
 * tied it to whatever width the learner had dragged a DOCUMENT to. That hook's own note explains
 * why it is shared ("two docked readers that resized differently would be two objects"), and the
 * reasoning is sound for two readers; a course outline is not a reader. Its floor is 0.3 of the
 * viewport besides, so a map could never have been narrow enough anyway.
 *
 * 296 is the number the owner approved on the model sheet, and it is within a few pixels of what
 * the reference gives its own chapter list. Truncated titles carry their full text in a tooltip, so
 * the width does not have to grow to stay readable, which is why there is no drag handle here.
 */
const COURSE_MAP_WIDTH = 296;

/**
 * How a section's standing is drawn: a short tick, solid / half / hollow.
 *
 * 🔴 FILL AND LENGTH, NEVER A SECOND COLOUR. The product's standing rule is that the character is
 * the accent and nothing else may disagree with it (#28fb2c8), so a green/amber/red legend is out —
 * and a red row against everything a learner has not started yet would be the wrong message anyway.
 */
function Tick({ mark }: { mark: "established" | "developing" | null }) {
  return (
    <i
      aria-hidden
      className={cn(
        "block h-[2px] w-[14px] shrink-0 rounded-full",
        mark === "established" && "bg-(--ui-text-primary)",
        mark === "developing" && "bg-gradient-to-r from-(--ui-text-primary) from-50% to-(--ui-stroke-secondary) to-50%",
        mark === null && "bg-(--ui-stroke-secondary)",
      )}
    />
  );
}

/** What a mark means, in words, for the row's accessible name and its tooltip. */
function markWords(mark: "established" | "developing" | null): string {
  if (mark === "established") return "established";
  if (mark === "developing") return "still developing";
  return "not started";
}

function Chapter({
  chapter,
  onPick,
  open,
  onToggle,
  activeLabel,
}: {
  chapter: CourseMapChapter;
  onPick: (section: { label: string; identityKeys: readonly string[] }) => void;
  open: boolean;
  onToggle: () => void;
  activeLabel: string | null;
}) {
  const width = barWidths(chapter);
  return (
    <div className="mb-[2px]">
      <button
        aria-expanded={chapter.sections.length > 0 ? open : undefined}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-[10px] gap-y-[4px] rounded-[7px] px-[8px] py-[7px] text-left transition-colors hover:bg-(--ui-bg-tertiary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--ui-stroke-primary)"
        onClick={() => (chapter.sections.length > 0 ? onToggle() : onPick(chapter))}
        type="button"
      >
        <span className="min-w-0 truncate text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">
          {chapter.label}
        </span>
        {/* 🔴 A FRACTION, NEVER A PERCENT — see the file header and `course-map.ts`. */}
        <span className="mono shrink-0 text-[length:var(--canvas-text-meta)] tabular-nums text-(--ui-text-tertiary)">
          {chapter.total > 0 ? `${chapter.established}/${chapter.total}` : markWords(chapter.mark)}
        </span>
        {/* Two segments in one track: what is established, then what is underway. */}
        <span className="col-span-2 flex h-[3px] overflow-hidden rounded-full bg-(--ui-stroke-tertiary)">
          {/* 🔴 THE BAR MEANS PROGRESS, NOT LOCATION. It briefly swapped to the accent for the
              chapter you are in, which put two unrelated facts in one mark. Where you are is said by
              the row below being filled and set in the primary ink. */}
          <i className="block h-full rounded-full bg-(--ui-text-primary)" style={{ width: `${width.established}%` }} />
          <i className="block h-full bg-(--ui-text-tertiary) opacity-40" style={{ width: `${width.developing}%` }} />
        </span>
      </button>

      {open && chapter.sections.length > 0 && (
        <ul className="mt-[4px] mb-[10px] grid gap-[1px] pl-[8px]">
          {chapter.sections.map((section) => {
            const current = section.label === activeLabel;
            return (
              <li key={section.label}>
                <button
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-[8px] rounded-[6px] px-[8px] py-[5px] text-left text-[length:var(--canvas-text-meta)] leading-[18px] transition-colors",
                    "hover:bg-(--ui-bg-tertiary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--ui-stroke-primary)",
                    // 🔴🔴 NO COLOUR MARKS THE CURRENT ROW, AND `--ui-action` WAS THE WRONG READ OF THE
                    // RULE. That token IS the product's accent, but `desktop-ui.css` says what it is
                    // FOR: a filled send button, a focus outline, a ring — places where it carries a
                    // dark glyph. Its dark value is `#f2f2f4`, so as TEXT it measured
                    // `rgb(242,242,244)` against body white: invisible, and only visible in light
                    // mode by accident. Fill and weight say "here" in both themes, and they leave the
                    // panel with no second colour system at all, which is the standing rule.
                    current
                      ? "bg-(--ui-bg-tertiary) font-medium text-(--ui-text-primary)"
                      : "text-(--ui-text-secondary)",
                    // 🔴 AN UNREACHABLE SECTION IS DIMMED, NOT HIDDEN. The plan carries `reachable`
                    // as "the canvas holds no material for this node" — an honest source gap. Hiding
                    // it would make the course look shorter than it is.
                    !section.reachable && "opacity-55",
                  )}
                  onClick={() => onPick(section)}
                  title={`${section.label}: ${markWords(section.mark)}${section.reachable ? "" : ", no material yet"}`}
                  type="button"
                >
                  <Tick mark={section.mark} />
                  <span className="min-w-0 truncate">{section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CourseMap({
  activeLabel = null,
  evidence,
  onClose,
  onPick,
  plan,
  title,
}: {
  /** The section the canvas is working on, so the map can say where you are. */
  activeLabel?: string | null;
  evidence: readonly LearnerEvidence[];
  onClose: () => void;
  /** Focus the canvas on one part of the course. */
  onPick: (scope: { label: string; identityKeys: readonly string[] }) => void;
  plan: readonly PlanTerritory[];
  title: string;
}) {
  useDeclareSidePanel(COURSE_MAP_WIDTH);

  const chapters = useMemo(() => buildCourseMap(plan, evidence), [evidence, plan]);
  const progress = useMemo(() => courseProgress(chapters), [chapters]);

  // 🔴 OPEN CHAPTERS ARE DERIVED, NOT REMEMBERED. The one you are working in is open and the rest
  // are shut, which is what a documentation map does — and it means arriving at the map never
  // requires a press to see where you are. A learner opening others is transient state below.
  const initiallyOpen = useMemo(() => {
    const set = new Set<string>();
    for (const c of chapters) {
      if (c.label === activeLabel || c.sections.some((s) => s.label === activeLabel)) set.add(c.label);
    }
    // Nothing active yet: open the first chapter that is not finished, so the map opens on work.
    if (set.size === 0) {
      const next = chapters.find((c) => c.established < (c.total || 1)) ?? chapters[0];
      if (next) set.add(next.label);
    }
    return set;
  }, [activeLabel, chapters]);

  // 🔴 A LEARNER'S OWN OPENING SURVIVES, AND THE MAP STILL FOLLOWS THE CANVAS. Seeded once, then
  // the active chapter is MERGED IN whenever the canvas moves — never replaced. Replacing would
  // shut a chapter the learner had deliberately opened; not merging at all would leave them looking
  // at a closed chapter with the active row hidden inside it.
  const [opened, setOpened] = useState<Set<string>>(initiallyOpen);
  useEffect(() => {
    if (!activeLabel) return;
    const chapter = chapters.find((c) => c.label === activeLabel || c.sections.some((s) => s.label === activeLabel));
    if (!chapter) return;
    setOpened((was) => (was.has(chapter.label) ? was : new Set(was).add(chapter.label)));
  }, [activeLabel, chapters]);

  // Escape closes, same as every transient surface on the canvas.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 🔴 THE SERVER HAS NO `document` TO PORTAL INTO. `OutputPreview` gets away without this guard
  // only because it can never be in the first render — it opens on a click; a surface that opened
  // the map by default would hit a hydration mismatch instead.
  //
  // 🔴 AND THE WIDTH IS KNOWN AT RENDER NOW, which it was not while this used `useDockWidth`. That
  // hook starts at `viewport: 0` deliberately (the server has no window width), so the panel's
  // first frame was genuinely 0px and jumped to its width one frame later — a docked panel that
  // pops, which is the exact complaint this week has been about. A constant has no such frame.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-label={`Course map: ${title}`}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)",
        "reader-dock-in",
      )}
      data-course-map=""
      data-workspace
      role="dialog"
      style={{ width: COURSE_MAP_WIDTH }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-(--ui-stroke-tertiary) px-[18px] py-[14px]">
        <div className="min-w-0">
          <h2 className="truncate text-[length:var(--canvas-text-body)] font-medium text-(--ui-text-primary)">{title}</h2>
          {/* 🔴 A SENTENCE SOMEBODY CAN CHECK AGAINST THE ROWS BELOW IT, which a percentage is not. */}
          <p className="mt-[2px] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            {progress.established} of {progress.total} established
            {progress.developing > 0 ? ` · ${progress.developing} underway` : ""}
          </p>
        </div>
        <button
          aria-label="Close the course map"
          className="-mr-[6px] -mt-[2px] flex size-[28px] shrink-0 items-center justify-center rounded-md text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onClose}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height={14} viewBox="0 0 14 14" width={14}>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth={1.6} />
          </svg>
        </button>
      </header>

      <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto px-[10px] py-[12px]">
        {chapters.map((chapter) => (
          <Chapter
            activeLabel={activeLabel}
            chapter={chapter}
            key={chapter.label}
            onPick={onPick}
            onToggle={() =>
              setOpened((was) => {
                const next = new Set(was);
                if (next.has(chapter.label)) next.delete(chapter.label);
                else next.add(chapter.label);
                return next;
              })
            }
            open={opened.has(chapter.label)}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
