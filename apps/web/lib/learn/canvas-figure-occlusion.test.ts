import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { dropCardsCoveredByFigure, figureIsUsable, pickCanvasFigure } from "./canvas-figure-occlusion";
import type { DeckFigure } from "../export/deck-plan";

const figure = (caption: string, source = "Lecture 4"): DeckFigure => ({ caption, path: `p/${caption}`, source });

test("🔴🔴 a diagram in the learner's own document wins over a lookalike found by name", () => {
  // Owner, 2026-08-30: *"diagrams should also be from uploaded documents too if its appropriate."*
  // A document caption is noisy, so the match cannot demand every word.
  const figures = [figure("Figure 4.2: the four-stroke cycle")];
  assert.equal(pickCanvasFigure("four-stroke engine", figures)?.caption, "Figure 4.2: the four-stroke cycle");
  assert.equal(pickCanvasFigure("nephron", [figure("The nephron, labelled")])?.caption, "The nephron, labelled");
});

test("🔴🔴 a near-miss is refused, because a confidently wrong diagram is worse than none", () => {
  // One shared word is not a match: handing a learner the cell MEMBRANE when they asked about the
  // cell CYCLE looks authoritative and teaches the wrong picture. The corpus fallback is right here.
  assert.equal(pickCanvasFigure("cell cycle", [figure("Diagram of the cell membrane")]), null);
  assert.equal(pickCanvasFigure("four-stroke engine", [figure("Figure 1: the cooling system")]), null);
  assert.equal(pickCanvasFigure("nephron", []), null);
});

test("🔴 the words that carry a match are structural, never subject matter", () => {
  // A stop list of topic words would scope this to one discipline, which CLAUDE.md forbids. What is
  // dropped is scaffolding a caption of ANY field carries: "figure", "diagram", "of", "the".
  assert.equal(pickCanvasFigure("the diagram of a figure", [figure("Diagram of the figure")]), null,
    "scaffolding words alone matched, so any caption would match any subject");
  // And a real subject still matches through that scaffolding.
  assert.ok(pickCanvasFigure("crankshaft assembly", [figure("Figure 7: crankshaft assembly detail")]));
});

test("🔴 the quality bar is the corpus lane's, asked rather than copied", () => {
  // `occlusion-source.ts` learned in production what makes a figure worth asking about, including
  // that a numbered-key diagram produces "which part is covered? 3 / 7 / 11". A learner's own
  // textbook figure is MORE likely to be keyed that way, not less, so the bar applies here too.
  const source = readFileSync(new URL("./canvas-figure-occlusion.ts", import.meta.url), "utf8");
  assert.match(source, /return labelQuality\(boxes\)\.usable;/, "the quality rule was copied instead of asked for");

  const numbered = [0, 1, 2, 3, 4].map((n) => ({ label: String(n + 1), x: 0.1 * n, y: 0.1 * n, w: 0.05, h: 0.05 }));
  assert.equal(figureIsUsable(numbered), false, "a numbered-key figure became cards");
});

test("🔴🔴 a learner's own figure never reaches the shared subject cache", () => {
  // `figure_occlusion_cache` is keyed by subject and shared across every learner: right for a public
  // licensed diagram, and a privacy breach for a page out of somebody's coursework. This path uses
  // the route built for a supplied picture, which has no cache — that is WHY it uses that route.
  // 🔴 COMMENTS STRIPPED: this file EXPLAINS the cache it must not touch, so a guard reading the
  // prose would fail on the very sentence that records the rule.
  const source = readFileSync(new URL("./canvas-figure-occlusion.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.match(source, /readFigureBoxes/, "the document path stopped using the uncached route");
  assert.doesNotMatch(source, /figure_occlusion_cache|findLabelledFigure/, "the document path can now write to the shared cache");
});

test("🔴 the document figure is tried FIRST and the corpus is still there behind it", () => {
  const deliverables = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(
    deliverables,
    /pickCanvasFigure\(subject, await canvasFigures\(canvas\)\)[\s\S]{0,200}?findLabelledFigure\(subject\)/,
    "the learner's own diagram is no longer preferred, or the corpus fallback is gone",
  );
});

test("🔴🔴 a written card the picture already asks is dropped, and only that one", () => {
  // The exact card a live run produced against a prompt that forbids it, and the exact reason code
  // has the last word here: pericardium is one of the parts the image cards cover.
  const labels = ["Pericardium", "Left Ventricle", "Aorta"];
  const cards = [
    { back: "The diagram of the heart labels the chambers, the four valves, the great vessels, and the pericardium.",
      front: "The diagram of the heart labels the chambers, the four valves, the great vessels, and the {{c1::pericardium}}." },
    { back: "The pericardium", front: "Which sac encloses the heart?" },
    { back: "It pumps against systemic resistance.", front: "Why does the left ventricle have the thickest wall?" },
    { back: "It holds the heart in place and reduces friction.", front: "What does the pericardium do?" },
  ];
  const kept = dropCardsCoveredByFigure(cards, labels);

  // 🔴🔴 ONLY THE CLOZE GOES. The first version dropped any card whose ANSWER was a part name and
  // cost five good cards in a live run: "which valve does blood pass from the right atrium?" answers
  // "the tricuspid valve" and asks about the path blood takes, not about where the valve sits.
  assert.deepEqual(kept.map((card) => card.front), [
    "Which sac encloses the heart?",
    "Why does the left ventricle have the thickest wall?",
    "What does the pericardium do?",
  ]);
});

test("🔴🔴 a question whose ANSWER is a part name survives, because it asks something else", () => {
  // The five cards the over-eager first version deleted. Each answers with a part the picture
  // covers, and each tests something the picture cannot: what follows what, and why.
  const labels = ["Tricuspid Valve", "Mitral Valve", "Pulmonary Artery"];
  const cards = [
    { back: "The tricuspid valve.", front: "Which valve does blood pass through from the right atrium to the right ventricle?" },
    { back: "The pulmonary artery.", front: "Which artery carries deoxygenated blood from the heart to the lungs?" },
    { back: "The mitral valve.", front: "Which valve does blood pass through from the left atrium to the left ventricle?" },
  ];
  assert.equal(dropCardsCoveredByFigure(cards, labels).length, 3, "a pathway question was mistaken for a naming card");
});

test("🔴 nothing is dropped when there is no figure, and an article is not a difference", () => {
  const cards = [{ back: "The pericardium", front: "Which sac encloses the heart?" }];
  const cloze = [{ back: "The heart sits in the pericardium.", front: "The heart sits in the {{c1::pericardium}}." }];
  assert.equal(dropCardsCoveredByFigure(cards, []).length, 1, "cards vanished with no figure to cover them");
  assert.equal(dropCardsCoveredByFigure(cards, ["Pericardium"]).length, 1, "a plain question was dropped by its answer again");
  assert.equal(dropCardsCoveredByFigure(cloze, ["pericardium"]).length, 0, "the covered cloze survived");
  assert.equal(dropCardsCoveredByFigure(cloze, ["Pericardium!"]).length, 0, "punctuation defeated the match");
  assert.equal(dropCardsCoveredByFigure(cloze, ["  The Pericardium "]).length, 0, "a leading article defeated the match");
  assert.equal(dropCardsCoveredByFigure(cloze, ["Aorta"]).length, 1, "an unrelated label dropped a good card");
});
