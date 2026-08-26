import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readDeckJson } from "./deck-plan";

// Chemistry on a slide (owner, 2026-08-25, after a glycolysis deck came back with no reactions).
//
// 🔴 §42 IS THE WHOLE DESIGN: the model NAMES a compound and a resolver answers. "A model asked for
// the SMILES of aspirin will produce one, fluently, and it will usually be right — which is exactly
// what makes it dangerous." A wrong plot looks wrong; a wrong molecule looks like chemistry.

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const code = (path: string): string =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

/** A deck the parser will accept, so each test states only what it is about. */
const deck = (slides: unknown[]) =>
  JSON.stringify({
    slides: [
      { layout: "cover", title: "Glycolysis" },
      ...slides,
      { layout: "closing", title: "What to remember" },
    ],
    title: "Glycolysis",
  });

/** What `structure-resolve.ts` leaves behind once PubChem has answered. */
const resolved = (name: string, value: string) => ({
  kind: "structure",
  notation: "smiles",
  resolvedFrom: { id: "5793", name, provider: "pubchem" },
  value,
});

test("a resolved compound becomes a molecule on the slide", () => {
  const plan = readDeckJson(
    deck([
      {
        layout: "bullets",
        points: ["Hexokinase phosphorylates it"],
        structure: { caption: "Glucose", from: [resolved("glucose", "OCC1OC(O)C(O)C(O)C1O")] },
        title: "Glucose enters the cell",
      },
    ]),
  );
  const slide = plan?.slides.find((s) => s.structure);
  assert.equal(slide?.structure?.notation, "smiles");
  assert.equal(slide?.structure?.value, "OCC1OC(O)C(O)C(O)C1O");
  assert.equal(slide?.structure?.resolvedFrom?.name, "glucose");
});

test("🔴🔴 reactants and products become a reaction, in that order", () => {
  // Two lists, not one: a flat list of names cannot say which side of the arrow a compound is on,
  // and a scheme that puts the product on the left is worse than no scheme.
  const plan = readDeckJson(
    deck([
      {
        layout: "bullets",
        points: ["ATP is spent here"],
        structure: {
          caption: "Hexokinase traps glucose",
          from: [resolved("glucose", "OCC1OC(O)C(O)C(O)C1O")],
          to: [resolved("glucose 6-phosphate", "OCC1OC(O)C(O)C(O)C1OP(=O)(O)O")],
        },
        title: "Step one",
      },
    ]),
  );
  const structure = plan?.slides.find((s) => s.structure)?.structure;
  assert.equal(structure?.notation, "reaction-smiles");
  assert.equal(structure?.value, "OCC1OC(O)C(O)C(O)C1O>>OCC1OC(O)C(O)C(O)C1OP(=O)(O)O");
});

test("several compounds a side join with a dot", () => {
  const plan = readDeckJson(
    deck([
      {
        layout: "bullets",
        points: ["Two three-carbon sugars"],
        structure: { caption: "The split", from: [resolved("a", "CCO"), resolved("b", "CCC")] },
        title: "Aldolase",
      },
    ]),
  );
  assert.equal(plan?.slides.find((s) => s.structure)?.structure?.value, "CCO.CCC");
});

test("🔴🔴 a compound that did not resolve loses its picture, never its slide", () => {
  // `structure-resolve.ts` drops an unresolved request, so `from` arrives empty. Falling back to a
  // model-written SMILES would run the least trustworthy path exactly when the trustworthy one
  // found nothing — which is the whole subject of §42.
  const plan = readDeckJson(
    deck([{ layout: "bullets", points: ["Still worth saying"], structure: { caption: "x", from: [] }, title: "Step" }]),
  );
  const slide = plan?.slides.find((s) => s.title === "Step");
  assert.ok(slide, "the slide went with the molecule");
  assert.equal(slide?.structure, undefined);
  assert.deepEqual(slide?.points, ["Still worth saying"]);
});

test("🔴 notation that is not SMILES is refused, part by part and assembled", () => {
  // SMILES has a small alphabet, so anything outside it is prose, a sentence, or an injection
  // attempt — never a molecule that failed.
  const plan = readDeckJson(
    deck([
      {
        layout: "bullets",
        points: ["p"],
        structure: { caption: "x", from: [{ kind: "structure", notation: "smiles", value: "not a molecule at all!" }] },
        title: "Step",
      },
    ]),
  );
  assert.equal(plan?.slides.find((s) => s.title === "Step")?.structure, undefined);
});

test("🔴 the model is told to NAME compounds, never to write SMILES", () => {
  const prompt = source("./deck-plan.ts");
  assert.match(prompt, /CHEMISTRY IS LOOKED UP, NEVER WRITTEN FROM MEMORY/);
  assert.match(prompt, /Do NOT write SMILES yourself/);
  // And the deck runs the same resolver the canvas does, rather than a second one.
  assert.match(code("../learn/canvas-deliverables.ts"), /await resolveStructures\(reply\.text\)/);
});

test("🔴 a structure becomes a FIGURE, so nothing downstream had to learn a new picture", () => {
  const download = code("./deck-download.ts");
  assert.match(download, /async function withStructures/, "structures are never drawn into the deck");
  assert.match(download, /figures\.push\(/, "a drawn structure does not join the figure list");
  assert.match(download, /slides\[index\] = \{ \.\.\.slide, figure: figures\.length \}/, "the slide never points at it");
  // 🔴 APPENDED, NEVER INSERTED. The model chose its `figure` numbers against the list it was
  // shown; inserting ahead of them would silently repoint every one.
  assert.match(download, /const figures = \[\.\.\.plan\.figures\]/, "the learner's own figures are not kept first");
});

test("🔴🔴 the exported drawing names a real font, because a CSS variable cannot survive the trip", () => {
  // A serialised SVG loaded through `new Image()` is its own document: no stylesheet, no custom
  // properties. `var(--font)` resolves to nothing, the `font` shorthand it sits in is voided, and
  // every atom label renders at a default the layout was not computed for.
  const image = code("./structure-image.ts");
  assert.ok(!/var\(--font\)/.test(image), "the export asks for a CSS variable font");
  assert.match(image, /const EXPORT_FONT = "Helvetica/, "the export has no concrete font family");
  // A transparent PNG is an invisible molecule on a dark slide: the bonds are black.
  assert.match(image, /context\.fillStyle = "#ffffff"/, "the drawing is exported without a ground");
  // Null rather than a throw: a molecule that will not draw costs its own frame and nothing else.
  assert.match(image, /return null/, "a failed drawing can take the deck down with it");
});

// ── the shared figure shelf (owner: "also pull in corpus figures") ──────────────────────────────

test("🔴🔴 a slide names a CONCEPT, and trusted code picks the licensed file", () => {
  // The same border-control rule `figure` follows. A model naming a file would be a model choosing
  // an asset, which is how an unlicensed or unrelated image reaches a slide with nothing able to
  // catch it.
  const plan = readDeckJson(
    deck([{ illustration: "the pyruvate dehydrogenase complex", layout: "bullets", points: ["p"], title: "Step" }]),
  );
  assert.equal(plan?.slides.find((s) => s.title === "Step")?.illustration, "the pyruvate dehydrogenase complex");

  const prompt = source("./deck-plan.ts");
  assert.match(prompt, /Never name a file, a URL or a source/);

  const deliverables = code("../learn/canvas-deliverables.ts");
  assert.match(deliverables, /searchCurated\(\{ concept, limit: 1 \}, REFERENCE_SHELF\)/, "the shelf is never consulted");
  // 🔴 THE CREDIT TRAVELS WITH THE PICTURE. Every shelf row was harvested with its licence read
  // through the repository API; printing one without its credit is the one way this lane could turn
  // a correctly licensed image into an incorrectly used one.
  assert.match(deliverables, /source: best\.licence/, "a shelf figure is printed without its licence");
  // Appended, never inserted — the model chose its `figure` numbers against the list it was shown.
  assert.match(deliverables, /plan\.figures\.push\(/, "a shelf figure does not join the figure list");
});

test("🔴 a concept the shelf does not hold leaves the slide alone", () => {
  // `searchCurated` needs two matching words, or most of the asked characters: it records what a
  // weak match cost — "balance sheet" matched a bathtub *balance* seat. A slide with no good figure
  // keeps its points, the same bargain an unresolved compound makes.
  const deliverables = code("../learn/canvas-deliverables.ts");
  assert.match(deliverables, /if \(!best\?\.assetPath\) continue;/, "a missing figure is not skipped cleanly");
});
