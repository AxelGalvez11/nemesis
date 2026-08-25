"use client";

// A mechanism as one connected scheme, the way a textbook prints it.
//
// 🔴🔴🔴 THE OWNER SENT A TEXTBOOK MECHANISM AND ASKED WHY OURS DID NOT LOOK LIKE IT, 2026-08-25.
// His picture is ONE diagram: several structures flowing across the page, wrapping onto the next
// line, each reaction arrow carrying what changes. Ours drew five separate framed cards stacked
// down the page with paragraphs between them, which reads as five pictures of five molecules and
// never as one reaction going somewhere.
//
// 🔴 THIS ADDS LAYOUT AND NOTHING ELSE. Every frame is `ChemicalStructure`, the same component the
// single-structure card mounts, with the same counted lone pairs and the same electron-pushing
// arrows over it. A second molecule renderer would be a second place for "what does a mechanism
// look like" to drift, and the drift would show up first in exactly this lane.
//
// 🔴 THE ARROWS BETWEEN FRAMES ARE NOT ELECTRON ARROWS. A curly arrow inside a frame says where a
// pair moved; the straight arrow between frames says the reaction moved on. Drawing them alike
// would merge two different statements into one symbol, so this one is straight, plain, and
// carries the step's label above it.

import { ChemicalStructure } from "./chemical-structure";
import type { MechanismVisual, StructureVisual } from "@/lib/learn/canvas-visual";

/**
 * How wide one frame may draw, in pixels.
 *
 * 🔴 CHOSEN SO TWO FRAMES AND THE ARROW BETWEEN THEM FIT ACROSS THE CANVAS COLUMN. Smaller and a
 * substituted ring stops being readable; larger and the scheme is a column again.
 */
const FRAME_MAX_WIDTH = 236;

/** One step, as the structure card's own request shape. */
function frameOf(step: MechanismVisual["steps"][number], learningGoal: string): StructureVisual {
  return {
    kind: "structure",
    learningGoal,
    notation: "smiles",
    value: step.value,
    ...(step.arrows ? { arrows: step.arrows } : {}),
    ...(step.carbons ? { carbons: step.carbons } : {}),
    ...(step.lonePairs === undefined ? {} : { lonePairs: step.lonePairs }),
  };
}

export function MechanismScheme({ visual }: { visual: MechanismVisual }) {
  return (
    <div>
      {/* 🔴 WRAPPING, NOT SCROLLING. A four-step mechanism is wider than the column, and a sideways
          scrollbar hides the end of the reaction behind a gesture nobody makes on a page they are
          reading. Wrapping puts the later steps on the next line, which is what the printed page
          the owner sent does with exactly the same problem. */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-1 gap-y-3"
        title={`${visual.steps.map((step) => step.value).join("  →  ")}\nwritten from the model's own knowledge, not looked up in a database`}
      >
        {visual.steps.map((step, index) => (
          <div className="flex items-center gap-x-1" key={`${index}-${step.value}`}>
            {/* 🔴🔴 A FRAME IN A SCHEME IS SMALLER THAN A FRAME ON ITS OWN, AND WITHOUT THIS IT IS
                NOT A SCHEME AT ALL. `ChemicalStructure` draws at its own scale and fills the column,
                so four of them wrapped to one per line and the reaction read as four separate
                pictures stacked downward: the exact thing this kind exists to stop. Capped here,
                two frames and their arrow fit across an ordinary column and the reaction flows. */}
            <div className="min-w-0 shrink" style={{ maxWidth: FRAME_MAX_WIDTH }}>
              <ChemicalStructure compact visual={frameOf(step, visual.learningGoal)} />
            </div>
            {index < visual.steps.length - 1 && (
              /* 🔴 THE LABEL RIDES ABOVE THE ARROW, which is where a reagent or a condition is
                 written on paper, and it is why the arrow is a column rather than a character. */
              <div className="flex shrink-0 flex-col items-center px-1">
                {step.label ? (
                  <span className="whitespace-nowrap text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                    {step.label}
                  </span>
                ) : null}
                <svg aria-hidden="true" className="block" height="12" viewBox="0 0 34 12" width="34">
                  <path
                    d="M 1 6 L 29 6 M 24 2 L 29 6 L 24 10"
                    fill="none"
                    stroke="var(--ui-text-tertiary)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.2"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* 🔴🔴🔴 NO NOTATION LINE, AND MINE WAS THE WORST VERSION OF ONE THIS PRODUCT HAS SHIPPED.
          Owner, 2026-08-25, with a screenshot of it: *"remove this."* It printed four raw SMILES
          strings joined by arrows, plus a sentence explaining what an arrow is, under a picture that
          already shows both.

          🔴 THE SINGLE-STRUCTURE CARD LEARNED THIS IN AUGUST AND I DID NOT READ IT. He circled that
          card's provenance line too and asked why it was there; the answer was that a structure a
          model wrote and one a resolver returned look identical and only one can be checked. That
          fact is real, so it moved to a TOOLTIP rather than being deleted. A scheme carries the same
          fact, so it goes the same place: checkable on hover, not printed at a learner. */}
    </div>
  );
}
