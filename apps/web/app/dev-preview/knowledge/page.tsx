"use client";

// DEV-ONLY PREVIEW — the real Knowledge map, against a hand-written learner.
//
// 🔴 THE WORLD IS SCRIPTED BECAUSE THE REAL ONE IS PRIVATE. `learner_courses` and
// `learner_evidence` are owner-only by RLS, so a signed-out page can only ever draw an empty map —
// which cannot show whether the map works. The component is the shipped one; only the nodes are
// hand-written, and they are written to exercise all four states including the one that matters
// most: `unreadable`, which must never look like a learner failure.

import { KnowledgePage } from "@/components/workspace/knowledge/knowledge-page";
import type { KnowledgeNode } from "@/lib/knowledge/graph";

const node = (
  id: string,
  label: string,
  region: string,
  weight: number,
  state: KnowledgeNode["state"],
  can: string[] = [],
  needs: string[] = [],
): KnowledgeNode => ({ id, label, region, weight, state, can, needs });

const NODES: KnowledgeNode[] = [
  // A region the learner mostly holds.
  node("cv-1", "Heart chambers and valves", "The cardiovascular system", 4, "solid",
    ["Name the four chambers and trace blood through them"]),
  node("cv-2", "The conduction system", "The cardiovascular system", 5, "solid",
    ["Order the events of one cardiac cycle"]),
  node("cv-3", "Cardiac output and preload", "The cardiovascular system", 3, "solid"),
  node("cv-4", "Renin-angiotensin system", "The cardiovascular system", 5, "developing",
    ["Name the major drug classes", "Predict that potassium rises on an ARB"],
    ["Explain why blocking AT1 raises potassium, step by step", "Apply it to combined therapy"]),
  node("cv-5", "Capillary exchange", "The cardiovascular system", 3, "unshown", [],
    ["Explain how hydrostatic and oncotic pressure decide net movement"]),
  node("cv-6", "Blood pressure regulation", "The cardiovascular system", 4, "unreadable", [],
    ["The tables in week 6 could not be read, so this has not been mapped"]),

  node("re-1", "Gas exchange at the alveolus", "The respiratory system", 4, "solid"),
  node("re-2", "Ventilation and perfusion", "The respiratory system", 4, "developing",
    ["Describe what a mismatch does to oxygenation"], ["Work through a shunt versus dead space case"]),
  node("re-3", "Control of breathing", "The respiratory system", 3, "unshown", [],
    ["Explain how central chemoreceptors respond to CO2"]),

  node("ct-1", "The plasma membrane", "Cells and tissues", 4, "solid"),
  node("ct-2", "Epithelial tissue", "Cells and tissues", 3, "solid"),
  node("ct-3", "Connective tissue", "Cells and tissues", 3, "solid"),

  node("st-1", "Sampling distributions", "Sampling and estimation", 4, "developing",
    ["State what the central limit theorem promises"], ["Apply it to a small, skewed sample"]),
  node("st-2", "Confidence intervals", "Sampling and estimation", 4, "unshown", [],
    ["Interpret an interval without saying the parameter is random"]),
  node("st-3", "Standard error", "Sampling and estimation", 2, "unshown"),

  node("ht-1", "Null and alternative hypotheses", "Hypothesis testing", 3, "unshown"),
  node("ht-2", "Type I and Type II error", "Hypothesis testing", 3, "unshown"),
];

// 🔴 `data-workspace` IS LOAD-BEARING, NOT DECORATION. `globals.css` styles every button on the
// marketing side with `button:where(:not([data-workspace] *))` — a 999px pill with its own colours —
// and the workspace escapes it by stamping this attribute on an ancestor. Without it this preview
// draws the real component wearing landing-page buttons, which is a lie about what shipped.
export default function KnowledgePreview() {
  return (
    <div className="h-screen" data-workspace>
      <KnowledgePage nodes={NODES} userId="preview" />
    </div>
  );
}
