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

const doc = (id: string, title: string, excerpts: number, librarySourceId?: string): CanvasSource => ({
  excerpts: Array.from({ length: excerpts }, (_, index) => ({
    id: `${id}:e${index}`,
    label: `Slide ${index + 1}`,
    text: "…",
  })),
  id,
  kind: "pdf",
  librarySourceId,
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
  // 🔴 THREE OF THESE POINT AT REAL LIBRARY FIXTURES, so the docked reader opens an actual document
  // here rather than the "wasn't filed to your Library" sentence. It is the only way to check the
  // panel end to end — highlight, mark an area, and watch what the action sends —
  // without an account and a real upload. One of each renderer that behaves differently: a PDF
  // whose pages can be cut out, a Word file of flowing text that cannot, a deck of rebuilt slides,
  // and a workbook that is a grid.
  doc("d1", "Contracts_II_Consideration_and_Promissory_Estoppel.pdf", 12, "preview-src-conlaw-slides"),
  doc("d2", "Supplemental_Beam Deflection Comparisons.pdf", 4),
  doc("d3", "STUDENT_Thermodynamics_Second_Law_notes.pdf", 9),
  doc("d4", "Reformation and Counter-Reformation lecture notes.pdf", 1, "preview-src-brief"),
  doc("d5", "Nursing Pharmacokinetics Slides Chapter 4.pptx", 7, "preview-src-deck"),
  doc("d6", "MAT3_Linear_Algebra_Practice_Questions.pdf", 3),
  doc("d7", "Okonkwo_Statutory_Interpretation_and_Purpose.pdf", 5),
  doc("d8", "Okonkwo_Fluid_Mechanics_Boundary_Layers.pdf", 6),
  doc("d9", "10. Welding Symbols and Joint Prep.pdf", 2),
  doc("d10", "9. Art History - Quattrocento Perspective.pdf", 8),
  doc("d11", "Study_hours_by_week.xlsx", 2, "preview-src-hours"),
];

const SOURCES: CanvasSource[] = [
  page("w1", "Electrical conduction system of the heart", "https://en.wikipedia.org/wiki/Electrical_conduction_system_of_the_heart"),
  page("w2", "Commerce Clause", "https://www.law.cornell.edu/wex/commerce_clause"),
];

const DOC_MARKDOWN = `# Promissory estoppel, compared

## Where it applies

A promise is enforceable without consideration when the promisor should reasonably expect it to
induce action, and injustice can be avoided only by enforcement.

- Reliance must be actual
- Reliance must be reasonable
- The remedy may be limited as justice requires

## Order of analysis

1. Was there a promise?
2. Was reliance foreseeable?
3. Is enforcement the only way to avoid injustice?
`;

const OUTPUTS = [
  { createdAt: "", id: "o1", kind: "flashcards", title: "Consideration — 24 cards", deckId: "deck-1" },
  { createdAt: "", id: "o2", kind: "note", notePath: "Research/estoppel.md", title: "Promissory estoppel, compared" },
  { createdAt: "", id: "o3", kind: "report", notePath: "Research/boundary-layers.md", title: "Boundary layer separation: a review" },
  // The three artifact kinds, so the card that opens them can be looked at without a model call.
  { createdAt: "", id: "o4", kind: "document", markdown: DOC_MARKDOWN, title: "Promissory estoppel, compared" },
  { createdAt: "", id: "o5", kind: "pdf", markdown: DOC_MARKDOWN, title: "Estoppel — one-pager" },
  {
    createdAt: "",
    id: "o6",
    kind: "sheet",
    sheet: {
      columns: ["Case", "Year", "Held"],
      rows: [
        ["Ricketts v Scothorn", "1898", "Promise enforced, note paid"],
        ["Feinberg v Pfeiffer", "1959", 'Pension enforced — "reliance"'],
        ["Hoffman v Red Owl", "1965", "Reliance damages, no contract"],
      ],
    },
    title: "Estoppel cases",
  },
];

type Shelf = "everything" | "empty" | "no-sources";

export default function SourcesPanelPreview() {
  const [shelf, setShelf] = useState<Shelf>("everything");
  /** The last thing the open document asked, printed below — the canvas would send this as a turn. */
  const [asked, setAsked] = useState<{ prompt: string; files: string[] } | null>(null);
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
      {/* 🔴 THE BUTTON SITS WHERE THE PANEL HAS ROOM, AND THE FIRST TRY GOT THIS WRONG. The panel
          opens `-right-2 top-full` off its own button, so a button at the page's left edge throws
          it off screen entirely — which is exactly what the first version of this harness did at
          800px, and it read as a broken panel rather than a badly-placed button. A fixed
          `pr-[22rem]` only moved the failure to a different width. `ml-auto` on a box the panel's
          own width keeps the whole thing on screen at any size, which is what the real canvas gets
          for free by putting this control in its top-right strip. */}
      <div className="ml-auto w-[21rem]">
        <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
          <SourcesControl
            canvas={canvas}
            modelKnowledge
            onFiles={() => {}}
            onSendToChat={(prompt, files) => setAsked({ files: files.map((file) => `${file.name} · ${file.type} · ${file.size} bytes`), prompt })}
          />
        </WorkspacePreviewProvider>
      </div>

      {/* What the canvas would send. Printed rather than swallowed, because the words and the
          attachment are the whole feature: a marked area whose picture did not travel produces a
          message that reads perfectly and is answered from nothing. */}
      {asked && (
        <div className="mt-8 rounded-xl bg-(--ui-bg-elevated) p-4 ring-1 ring-(--ui-stroke-tertiary)" data-testid="sources-panel-asked">
          <p className="text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">Sent to the canvas</p>
          <p className="mt-2 whitespace-pre-wrap text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">{asked.prompt}</p>
          <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
            {asked.files.length === 0 ? "No attachment" : asked.files.join(", ")}
          </p>
        </div>
      )}
    </main>
  );
}
