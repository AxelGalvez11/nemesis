// Every link from "the model may ask for a mechanism" to "the learner sees one connected scheme".
//
// 🔴🔴🔴 THE OWNER SENT A TEXTBOOK MECHANISM AND ASKED WHY OURS DID NOT LOOK LIKE IT, 2026-08-25.
// I put his exact reaction through the live app the same day. Nemesis worked out the three arrows
// for the key step correctly and then typed them as a BULLETED LIST:
//
//     Amide lone pair → C2 (forms new N-C bond)
//     C2-Cl σ bond → Cl (leaving group forms Cl⁻)
//     π electrons delocalize to C3, C4, C5
//
// Not one of those fitted the vocabulary. The first needed a lone pair as a source, the second a
// BOND, the third a delocalisation. So it drew nothing, described the picture in words, and then
// reached for a stock diagram of a DIFFERENT reaction to fill the hole. A model describing a
// picture it could have drawn is the failure `canvas-prompts.ts` already forbids in capitals; it
// was not disobeying, it had nothing to say.
//
// This file walks the same chain `occlusion-is-a-tool.test.ts` walks, for the same reason: this
// codebase's most expensive recurring defect is a finished capability nobody can reach.
//
//   1. named to the model            (the contract, both packets)
//   2. its shape stated FILLED IN    (never as an empty array)
//   3. the schema accepts it         (and refuses what it cannot draw)
//   4. the router carries it         (a representation of its own)
//   5. IT RENDERS                    (the link that killed `figure` for weeks)
//   6. it is one SCHEME, not a stack (which is the whole point of the kind)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { validateCanvasVisual } from "./canvas-visual";
import { turnRouterMessages, type TurnContext } from "./turn-router";
import { routeVisual } from "./visual-route";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (file: string) => strip(readFileSync(new URL(file, import.meta.url), "utf8"));

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 25 August 2026",
  webContext: "",
};

const PACKET = turnRouterMessages({ context: EMPTY, utterance: "show me the SNAr mechanism" })
  .map((message) => message.content)
  .join("\n\n");
const SEMANTIC = read("../../components/workspace/learn/semantic-visual.tsx");
const SCHEME = read("../../components/workspace/learn/mechanism-scheme.tsx");
const STRUCTURE = read("../../components/workspace/learn/chemical-structure.tsx");

/** The owner's own reaction, as the contract now lets it be written. */
const SMILES_REARRANGEMENT = {
  caption: "The tether swaps oxygen for nitrogen.",
  kind: "mechanism",
  learningGoal: "The nitrogen attacks the ring carbon as the oxygen leaves.",
  steps: [
    { label: "NaH", value: "NCCOc1ccc(cn1)[N+](=O)[O-]" },
    { arrows: [{ from: 0, to: 4 }, { from: [3, 4], to: 3 }], value: "[NH-]CCOc1ccc(cn1)[N+](=O)[O-]" },
    { value: "OCCNc1ccc(cn1)[N+](=O)[O-]" },
  ],
};

test("🔴🔴🔴 link 1: the model is TOLD a whole reaction can be one picture", () => {
  assert.match(PACKET, /"kind":"mechanism"|mechanism \{steps/, "the mechanism kind is never named");
  assert.match(PACKET, /connected scheme/i, "nothing says what makes it different from separate cards");
});

test("🔴🔴🔴 link 2: an arrow end is stated as a BOND as well as an atom", () => {
  // 🔴 THE EXACT MISTAKE THAT KILLED `visuals`: a field shown empty in the contract's highest-signal
  // position arrives empty on every turn. A bond end shown only in prose would be a bond end never
  // written, so the packet carries a real one.
  assert.match(PACKET, /\{"from":\[3,4\],"to":3\}|\\"from\\":\[3,4\]/, "the bond-tailed arrow is never shown written out");
  assert.match(PACKET, /lone pair/i, "nothing says a bare index means the lone pair");
});

test("🔴🔴🔴 link 3: the schema accepts the owner's own reaction", () => {
  const result = validateCanvasVisual(SMILES_REARRANGEMENT);
  assert.equal(result.ok, true, "the mechanism his textbook prints is refused");
  if (!result.ok || result.visual.kind !== "mechanism") return;
  assert.equal(result.visual.steps.length, 3);
  assert.deepEqual(result.visual.steps[1]?.arrows?.[1], { from: [3, 4], to: 3 }, "the bond tail was lost");
  assert.equal(result.visual.steps[1]?.lonePairs, true, "the dots did not come on with the arrows");
  assert.equal(result.visual.steps[0]?.label, "NaH", "what rides on the reaction arrow was dropped");
});

test("🔴🔴 link 3b: it refuses what it cannot draw, rather than drawing something invented", () => {
  const bad = (steps: unknown) =>
    validateCanvasVisual({ kind: "mechanism", learningGoal: "x".repeat(20), steps }).ok;
  assert.equal(bad([{ value: "CCO" }]), false, "a one-step mechanism is not a scheme");
  assert.equal(bad([]), false, "no steps");
  assert.equal(bad(Array.from({ length: 7 }, () => ({ value: "CCO" }))), false, "seven frames");
  assert.equal(bad([{ value: "CCO" }, { value: "not a smiles ((" }]), false, "an unparsable step");
  assert.equal(bad([{ value: "CCO" }, { arrows: [{ from: [1, 1], to: 0 }], value: "CCO" }]), false, "a bond to itself");
});

test("🔴🔴 link 4: the router carries it as its own representation", () => {
  const result = validateCanvasVisual(SMILES_REARRANGEMENT);
  assert.ok(result.ok);
  if (!result.ok) return;
  const route = routeVisual({ request: SMILES_REARRANGEMENT });
  assert.equal(route.decision, "render", `a valid mechanism did not route: ${route.decision}`);
  assert.equal(route.representation, "mechanism");
});

test("🔴🔴🔴 link 5: IT RENDERS — the link that killed `figure` for weeks", () => {
  // `SemanticVisual` had no `figure` branch for weeks. The asset resolved, the marker parsed, and
  // the learner got an empty bordered box 38 pixels tall. Nothing failed, because nothing looked.
  assert.match(SEMANTIC, /<MechanismScheme/, "a mechanism renders nothing at all");
  assert.match(SEMANTIC, /visual\.kind === "mechanism" \?/, "it draws unconditionally, or not from the visual");
});

test("🔴🔴🔴 link 6: it is one SCHEME, and every frame is the SAME renderer", () => {
  // 🔴 A SECOND MOLECULE RENDERER WOULD BE A SECOND PLACE FOR "WHAT DOES A MECHANISM LOOK LIKE" TO
  // DRIFT, and this lane is where the drift would go unnoticed longest.
  assert.match(SCHEME, /<ChemicalStructure compact/, "the scheme grew its own molecule renderer");
  // 🔴 AND IT MUST FLOW, NOT STACK. Frames drawn at their own scale fill the column and wrap to one
  // per line, which is the four-separate-pictures failure this kind exists to fix.
  assert.match(SCHEME, /flex flex-wrap/, "the scheme stopped wrapping");
  assert.match(SCHEME, /maxWidth: FRAME_MAX_WIDTH/, "a frame is free to fill the column again, so the scheme is a column");
  // The reaction arrow between frames is not an electron arrow, and carries the step's label.
  assert.match(SCHEME, /step\.label \?/, "what is written on the reaction arrow was dropped");
});

test("🔴🔴 the dots are COUNTED, never asked of the model", () => {
  // A model stating dot counts would be a model drawing, and it would be confidently wrong on
  // exactly the charged intermediates that matter.
  assert.match(STRUCTURE, /lonePairCount\(\{/, "the lone pairs stopped being counted from the graph");
  assert.ok(!/lonePairCount: /.test(PACKET), "the packet started asking the model for dot counts");
  assert.match(STRUCTURE, /countImplicitHydrogens/, "the hydrogens are no longer counted, so carbons will sprout pairs");
});

test("🔴🔴🔴 a molecule is LINE ART, not a rainbow", () => {
  // Owner, 2026-08-25, looking at a mechanism: *"im talking about the style and design, it looks
  // janky."* The cause was the theme we asked for. Passing the APP's theme name selects the
  // library's own `light`/`dark` palette, which colours oxygen red, nitrogen blue and bromine
  // orange AND SPLITS EVERY BOND DOWN THE MIDDLE, so a C-O line is half black and half red.
  //
  // 🔴 IT WAS ALSO THE ONLY RAINBOW IN THE PRODUCT. `surface-plot.tsx` states the house rule in its
  // own comment: this product is deliberately monochrome. Colour is kept for the two things that
  // MEAN something, the electron arrows and the cover over the part being asked about.
  assert.match(STRUCTURE, /const MONOCHROME = Object\.fromEntries\(/, "the element colours came back");
  assert.match(STRUCTURE, /themes: \{ dark: \{ \.\.\.MONOCHROME/, "the library's own palette is being used again");
});

test("🔴🔴🔴 a frame's height follows its width, or every narrow one letterboxes", () => {
  // 🔴 MEASURED IN A SCHEME WITH FRAMES CAPPED AT 236px: content 237x124, box 236x200. An inline
  // height beats `max-w-full`, so the width shrank to fit the column and the height stayed, leaving
  // 77 pixels of nothing under every frame. Stacked, that was the band of white between two rows.
  assert.match(STRUCTURE, /element\.style\.height = "auto"/, "the frame height is pinned again");
  assert.match(STRUCTURE, /element\.style\.aspectRatio = /, "the aspect is left to be inferred from a viewBox that was just rewritten");
});

test("🔴🔴🔴 the scheme prints no notation at a learner", () => {
  // Owner, 2026-08-25, with a screenshot of it: *"remove this."* It printed four raw SMILES strings
  // joined by arrows, plus a sentence explaining what an arrow is, under a picture showing both.
  //
  // 🔴 THE SINGLE-STRUCTURE CARD LEARNED THIS IN AUGUST. He circled its provenance line too. The
  // fact underneath is real (a structure a model wrote and one a resolver returned look identical
  // and only one can be checked), so it moved to a TOOLTIP rather than being deleted. Same here.
  assert.ok(!/arrows show where the electrons move/.test(SCHEME), "the scheme is explaining its own arrows again");
  assert.ok(!/<span>\{visual\.steps\.map/.test(SCHEME), "the scheme is printing its SMILES again");
  assert.match(SCHEME, /title=\{`\$\{visual\.steps\.map/, "the notation stopped being checkable at all");
});

console.log("mechanism-is-a-scheme.test.ts OK");
