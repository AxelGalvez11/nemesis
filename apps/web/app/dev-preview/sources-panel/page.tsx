"use client";

// DEV-ONLY PREVIEW — the canvas's sources panel, on its own, with every shelf filled.
//
// 🔴 IT EXISTS BECAUSE THIS PANEL IS THE HARDEST THING IN THE CANVAS TO REACH. Seeing it with a
// website, a document, model knowledge AND several outputs at once means running a real lesson that
// searched, attaching real files, and asking for a deliverable. Nobody does that to check a
// heading, so nobody checked, and it shipped with filenames clipping off the right edge.
//
// The long list is deliberate: ten inputs is what makes the "Show 4 more" tail visible, and the
// tail is the part that replaced the fold.

import { useState } from "react";

import { SourcesControl } from "@/components/workspace/learn/canvas-controls";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import type { CanvasSource, LearningCanvas } from "@/lib/learn/canvas-model";
import { lessonSeed } from "@/lib/learn/canvas-preview-fixture";

const doc = (id: string, title: string, excerpts: number): CanvasSource => ({
  excerpts: Array.from({ length: excerpts }, (_, index) => ({
    id: `${id}:e${index}`,
    label: `Slide ${index + 1}`,
    text: "…",
  })),
  id,
  kind: "pdf",
  title,
});

const page = (id: string, title: string, url: string): CanvasSource => ({
  excerpts: [{ id: `${id}:e1`, label: "Overview", text: "…" }],
  id,
  kind: "page",
  sourceUrl: url,
  title,
});

// Long, real-shaped filenames: the clipping this preview was built to catch only shows on names
// that genuinely do not fit.
//
// 🔴 THE FIELDS ARE MIXED ON PURPOSE, AND `field-agnostic.test.ts` CAUGHT ME NOT DOING IT. The
// first draft of this list was ten pharmacy PDFs copied straight off the reference screenshot, and
// the guard reddened on the fourth line. A fixture is a surface: whoever opens this preview next
// reads it as what Nemesis is for. CLAUDE.md's test — would this work for a law student and a
// mechanical engineering student — applies to the sample data too.
const INPUTS: CanvasSource[] = [
  doc("d1", "Contracts_II_Consideration_and_Promissory_Estoppel.pdf", 12),
  doc("d2", "Supplemental_Beam Deflection Comparisons.pdf", 4),
  doc("d3", "STUDENT_Thermodynamics_Second_Law_notes.pdf", 9),
  doc("d4", "Reformation and Counter-Reformation lecture notes.pdf", 1),
  doc("d5", "Nursing Pharmacokinetics Slides Chapter 4.pptx", 7),
  doc("d6", "MAT3_Linear_Algebra_Practice_Questions.pdf", 3),
  doc("d7", "Okonkwo_Statutory_Interpretation_and_Purpose.pdf", 5),
  doc("d8", "Okonkwo_Fluid_Mechanics_Boundary_Layers.pdf", 6),
  doc("d9", "10. Welding Symbols and Joint Prep.pdf", 2),
  doc("d10", "9. Art History - Quattrocento Perspective.pdf", 8),
];

const SOURCES: CanvasSource[] = [
  page("w1", "Electrical conduction system of the heart", "https://en.wikipedia.org/wiki/Electrical_conduction_system_of_the_heart"),
  page("w2", "Commerce Clause", "https://www.law.cornell.edu/wex/commerce_clause"),
];

const OUTPUTS = [
  { createdAt: "", id: "o1", kind: "flashcards", title: "Consideration — 24 cards", deckId: "deck-1" },
  { createdAt: "", id: "o2", kind: "note", notePath: "Research/estoppel.md", title: "Promissory estoppel, compared" },
  { createdAt: "", id: "o3", kind: "report", notePath: "Research/boundary-layers.md", title: "Boundary layer separation: a review" },
];

type Shelf = "everything" | "empty" | "no-sources";

export default function SourcesPanelPreview() {
  const [shelf, setShelf] = useState<Shelf>("everything");
  const seed = lessonSeed();
  const canvas: LearningCanvas = {
    ...seed,
    outputs: shelf === "empty" ? [] : OUTPUTS,
    sources: shelf === "empty" ? [] : shelf === "no-sources" ? INPUTS.slice(0, 3) : [...INPUTS, ...SOURCES],
  };

  return (
    // 🔴 `data-workspace` OR THE GLOBAL BUTTON RULE LIES TO YOU — globals.css paints every button
    // outside the stamp as the same filled pill. See dev-preview/research-plan for the full note.
    <main data-workspace className="min-h-dvh bg-(--ui-bg-editor) p-8">
      <div className="mb-8 flex items-center gap-2">
        {(["everything", "no-sources", "empty"] as const).map((name) => (
          <button
            className={
              shelf === name
                ? "rounded-full bg-(--ui-action) px-3 py-1 text-[length:var(--canvas-text-small)] text-(--ui-bg-editor)"
                : "rounded-full px-3 py-1 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)"
            }
            key={name}
            onClick={() => setShelf(name)}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      {/* Right-aligned, because the panel opens `-right-2 top-full` off its own button — pinned to
          the left of a wide page it hangs off the edge and looks like a bug it does not have. */}
      <div className="flex justify-end pr-[22rem]">
        <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
          <SourcesControl canvas={canvas} modelKnowledge onFiles={() => {}} />
        </WorkspacePreviewProvider>
      </div>
    </main>
  );
}
