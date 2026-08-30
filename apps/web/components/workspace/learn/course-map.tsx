"use client";

// The course map: every chapter, and the sections inside it.
//
// 🔴🔴 IT IS A BOX, NOT A SIDEBAR, AND THAT IS THE OWNER'S SECOND CORRECTION (2026-08-29): *"I don't
// want it to be exactly a full on sidebar, I would like it to be similar to source panel that is a
// squarish circlish type of box component."* The first build docked a 296px column down the right
// edge of the window. This one hangs off its own header glyph as the same rounded panel the sources
// control uses — `CONTROL` and `PANEL` are imported from `canvas-controls.tsx` rather than restated,
// so the two boxes cannot drift apart.
//
// 🔴🔴 AND THERE ARE NO NUMBERS, WHICH IS THE FIRST CORRECTION (same day): *"So if it can't track
// mastery then can we just remove the numbers? And instead do the outline way?"* The chapter bars
// and the "1/4" fractions are gone. What is left is the outline and one small mark per section,
// which is the only claim the learner model can actually make about a row. See `lib/learn/
// course-map.ts` for why there is no percentage to print.
//
// 🔴 SO A CHAPTER'S HEADING SAYS NOTHING ABOUT PROGRESS AT ALL. That is deliberate rather than an
// omission: a chapter mark could only be a fold of its sections, and folding three-valued marks into
// one produces exactly the summary-that-looks-like-a-score this pair of instructions removed. The
// sections carry the state; the chapter carries its name.

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { Codicon } from "@/components/desktop-ui/codicon";
import { CONTROL, PANEL, useDismiss } from "./canvas-controls";

import { buildCourseMap, type CourseMapSection } from "@/lib/learn/course-map";
import type { PlanSource, PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";

/**
 * One section's standing: a short rule, solid / half / hollow.
 *
 * 🔴 FILL AND LENGTH, NEVER A SECOND COLOUR. The product's rule is that the character is the accent
 * and nothing else may disagree with it, so a green/amber/red legend is out — and a red row against
 * everything a learner has not started would be the wrong message anyway.
 *
 * 🔴 AND NOT `--ui-action` EITHER, WHICH IS THE TRAP THIS PANEL ALREADY FELL INTO ONCE. That token IS
 * the product's accent, but `desktop-ui.css` says what it is for: a filled send button, a focus
 * outline, a ring — places where it carries a dark GLYPH. Its dark value is `#f2f2f4`, so as text it
 * measured `rgb(242,242,244)` against body white. Invisible.
 */
function Mark({ mark }: { mark: CourseMapSection["mark"] }) {
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

/** What a mark means in words, for the row's tooltip. Screen readers get it through the label. */
function markWords(mark: CourseMapSection["mark"]): string {
  if (mark === "established") return "established";
  if (mark === "developing") return "still developing";
  return "not started";
}

export function CourseMapControl({
  activeLabel = null,
  credit = null,
  evidence,
  onPick,
  plan,
  title,
}: {
  /** The section the canvas is working on, so the map can say where you are. */
  activeLabel?: string | null;
  /** The one book a scaffold-built course came from. The CC BY family requires the credit
   *  wherever the work appears, and the map IS where this course appears — so it renders here,
   *  in the smallest text the panel has, which is the owner's standing rule for attribution. */
  credit?: PlanSource | null;
  evidence: readonly LearnerEvidence[];
  /** Focus the canvas on one part of the course. */
  onPick: (scope: { label: string; identityKeys: readonly string[] }) => void;
  plan: readonly PlanTerritory[];
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const holder = useDismiss(open, () => setOpen(false));
  const chapters = useMemo(() => buildCourseMap(plan, evidence), [evidence, plan]);

  /**
   * Which chapters are open.
   *
   * 🔴 THE PANEL IS TRANSIENT, SO THIS IS SEEDED EVERY TIME IT OPENS rather than remembered. A map
   * that reopened on whatever the learner last unfolded, three sessions ago, is a map they have to
   * re-read; opening on where they are is the behaviour a documentation outline has.
   */
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());
  const here = useMemo(
    () =>
      chapters.find((c) => c.label === activeLabel || c.sections.some((s) => s.label === activeLabel))?.label ??
      chapters[0]?.label ??
      null,
    [activeLabel, chapters],
  );

  // 🔴 THE WRAPPER IS NOT `relative`. The panel is positioned against the glyph ROW, so every box on
  // this header shares one right edge — see the note on `PANEL` in `canvas-controls.tsx`.
  return (
    <div className="pointer-events-auto shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Course map"
        className={CONTROL}
        onClick={() => setOpen((current) => !current)}
        title="Course map"
        type="button"
      >
        <Codicon name="list-tree" size="20px" />
      </button>

      {open && (
        <div className={cn(PANEL, "w-[21rem]")} data-course-map="">
          <p className="truncate px-2 pb-1 pt-1 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
            {title}
          </p>

          {chapters.map((chapter) => {
            const isOpen = chapter.label === here ? !shut.has(chapter.label) : shut.has(chapter.label);
            const toggle = () =>
              setShut((was) => {
                const next = new Set(was);
                if (next.has(chapter.label)) next.delete(chapter.label);
                else next.add(chapter.label);
                return next;
              });
            return (
              <div className="pb-1" key={chapter.label}>
                {/* 🔴 THE CHAPTER IS A HEADING THAT FOLDS, NOT A ROW THAT DOES TWO THINGS. A chapter
                    with no sections of its own is the exception and is pickable, because otherwise a
                    flat plan would be a column of dead controls. */}
                <button
                  aria-expanded={chapter.sections.length > 0 ? isOpen : undefined}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)"
                  onClick={() => (chapter.sections.length > 0 ? toggle() : onPick(chapter))}
                  type="button"
                >
                  {chapter.sections.length > 0 ? (
                    <Codicon
                      name={isOpen ? "chevron-down" : "chevron-right"}
                      size="11px"
                    />
                  ) : (
                    <Mark mark={chapter.mark} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">
                    {chapter.label}
                  </span>
                </button>

                {isOpen && chapter.sections.length > 0 && (
                  <ul className="grid gap-[1px]">
                    {chapter.sections.map((section) => {
                      const current = section.label === activeLabel;
                      return (
                        <li key={section.label}>
                          <button
                            aria-current={current ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg py-1.5 pl-[30px] pr-2 text-left transition-colors",
                              "text-[length:var(--canvas-text-meta)] leading-[18px] hover:bg-(--ui-bg-tertiary)",
                              // 🔴 FILL AND WEIGHT SAY "HERE", NOT A COLOUR. See `Mark` above.
                              current
                                ? "bg-(--ui-bg-tertiary) font-medium text-(--ui-text-primary)"
                                : "text-(--ui-text-secondary)",
                              // 🔴 AN UNREACHABLE SECTION IS DIMMED, NOT HIDDEN. The plan carries
                              // `reachable` as "the canvas holds no material for this node" — an
                              // honest source gap. Hiding it makes the course look shorter than it is.
                              !section.reachable && "opacity-55",
                            )}
                            onClick={() => onPick(section)}
                            title={`${section.label}: ${markWords(section.mark)}${section.reachable ? "" : ", no material yet"}`}
                            type="button"
                          >
                            <Mark mark={section.mark} />
                            <span className="min-w-0 truncate">{section.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {credit && (
            <p className="mt-1 border-t border-(--ui-stroke-tertiary) px-2 pb-1 pt-2 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-quaternary)">
              <a
                className="underline-offset-2 hover:text-(--ui-text-secondary) hover:underline"
                href={credit.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {credit.title}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
