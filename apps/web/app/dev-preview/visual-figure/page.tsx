"use client";

// DEV-ONLY PREVIEW — the designed figures, in both themes.
//
// Owner, 2026-09-07: *"our visualizations look pretty much bland, black and white"*, holding his own
// Wondering chat beside ours. Measured there the same day (docs/canvas-workspace-reference.md §11):
// a header chip is a SATURATED fill inside a 2px ink border, and every cell under it wears the same
// 2px ink on paper. Ours was an 18% wash with a hairline in the tint's own colour.
//
// This page exists so the difference is looked at rather than argued about.

import { VisualFigure } from "@/components/workspace/visual-figure";
import type { VisualSpec } from "@/lib/workspace/visual-block";

const COMPARISON: VisualSpec = {
  kind: "comparison",
  title: "Pharmacokinetic comparison of insulins",
  rows: ["Class", "Onset", "Peak", "Duration"],
  items: [
    { label: "Insulin aspart", lines: ["Rapid acting", "10 to 20 minutes", "1 to 3 hours", "3 to 5 hours"] },
    { label: "Insulin glargine", lines: ["Long acting", "1 to 2 hours", "None (flat profile)", "24 hours"] },
    { label: "Insulin degludec", lines: ["Ultra long acting", "30 to 60 minutes", "None (ultra flat)", "Beyond 42 hours"] },
  ],
  footer: { label: "All three", text: "Injected under the skin, used in diabetes mellitus" },
};

const SEQUENCE: VisualSpec = {
  kind: "sequence",
  title: "How an exacerbation is managed",
  items: [
    { label: "Oxygen", at: "First", lines: ["Target 88 to 92 percent saturation"] },
    { label: "Bronchodilators", at: "Then", lines: ["Short acting beta agonist plus anticholinergic"] },
    { label: "Corticosteroids", at: "Then", lines: ["Oral or intravenous, shortens recovery"] },
  ],
};

const SET: VisualSpec = {
  kind: "set",
  title: "What makes up the RAAS pathway",
  items: [
    { label: "Renin", lines: ["Released by the kidney when pressure falls"] },
    { label: "Angiotensin II", lines: ["Constricts vessels"] },
    { label: "Aldosterone", lines: ["Retains salt and water"] },
  ],
};

export default function VisualFigurePreview() {
  return (
    <main className="min-h-screen p-10" data-workspace="">
      <p className="mb-6 max-w-2xl text-sm text-(--ui-text-secondary)">
        The three designed figures. A header chip carries its colour at full strength inside a 2px ink
        border; every cell wears the same ink on paper. Switch the system theme to check both.
      </p>
      <div className="flex max-w-[520px] flex-col">
        <VisualFigure spec={COMPARISON} />
        <VisualFigure spec={SEQUENCE} />
        <VisualFigure spec={SET} />
      </div>
    </main>
  );
}
