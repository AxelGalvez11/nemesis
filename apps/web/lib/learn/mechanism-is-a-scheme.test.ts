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
  spokenConversation: false,
  materialContext: "",
  memory: "",
  projectInstructions: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  pinnedComments: "",
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
    { highlight: [0, [3, 4]], value: "[NH-]CCOc1ccc(cn1)[N+](=O)[O-]" },
    { value: "OCCNc1ccc(cn1)[N+](=O)[O-]" },
  ],
};

test("🔴🔴🔴 link 1: the model is TOLD a whole reaction can be one picture", () => {
  assert.match(PACKET, /"kind":"mechanism"|mechanism \{steps/, "the mechanism kind is never named");
  assert.match(PACKET, /connected scheme/i, "nothing says what makes it different from separate cards");
});

test("🔴🔴🔴 link 2: a highlight is stated as a BOND as well as an atom", () => {
  // 🔴 THE EXACT MISTAKE THAT KILLED `visuals`: a field shown empty in the contract's highest-signal
  // position arrives empty on every turn. A bond written only in prose would be a bond never
  // written, so the packet carries a real one.
  assert.match(PACKET, /"highlight":\[0,\[3,4\]\]|\\"highlight\\":\[0,\[3,4\]\]/, "the bond highlight is never shown written out");
  assert.match(PACKET, /pair of numbers is the bond|PAIR of numbers is the bond/i, "nothing says a pair of indices means a bond");
});

test("🔴🔴🔴 link 2b: the model is told IN CAPITALS not to draw electron movement", () => {
  // 🔴 THE OWNER WITHDREW THE ARROWS, 2026-08-26, AND A PROMPT THAT STILL OFFERED THEM WOULD BE
  // WORSE THAN ONE THAT NEVER HAD THEM: the model would keep emitting a field that now validates
  // away to nothing, and the turn would silently lose the only thing it said about the electrons.
  assert.match(PACKET, /NEVER DRAW ELECTRON MOVEMENT/, "the ban on drawing electron movement is gone");
  assert.match(PACKET, /no curly arrows|no lone-pair dots/i, "nothing names what was withdrawn");
  assert.match(PACKET, /own sentences|ordinary sentences/i, "nothing tells it to explain the step in words instead");
  // And the old vocabulary is not still sitting there being offered.
  assert.ok(!/"arrows":\[\{"from"/.test(PACKET), "the packet still shows an arrows example");
});

test("🔴🔴🔴 link 3: the schema accepts the owner's own reaction", () => {
  const result = validateCanvasVisual(SMILES_REARRANGEMENT);
  assert.equal(result.ok, true, "the mechanism his textbook prints is refused");
  if (!result.ok || result.visual.kind !== "mechanism") return;
  assert.equal(result.visual.steps.length, 3);
  assert.deepEqual(result.visual.steps[1]?.highlight?.[1], [3, 4], "the breaking bond was lost");
  assert.equal(result.visual.steps[1]?.highlight?.[0], 0, "the attacking atom was lost");
  assert.equal(result.visual.steps[0]?.label, "NaH", "what rides on the reaction arrow was dropped");
});

test("🔴🔴 link 3b: it refuses what it cannot draw, rather than drawing something invented", () => {
  const bad = (steps: unknown) =>
    validateCanvasVisual({ kind: "mechanism", learningGoal: "x".repeat(20), steps }).ok;
  assert.equal(bad([{ value: "CCO" }]), false, "a one-step mechanism is not a scheme");
  assert.equal(bad([]), false, "no steps");
  assert.equal(bad(Array.from({ length: 7 }, () => ({ value: "CCO" }))), false, "seven frames");
  assert.equal(bad([{ value: "CCO" }, { value: "not a smiles ((" }]), false, "an unparsable step");
  assert.equal(bad([{ value: "CCO" }, { highlight: [[1, 1]], value: "CCO" }]), false, "a bond to itself");
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
  // 🔴 `case "mechanism":` SINCE 2026-09-04. The sixteen sibling ternaries became a `switch` in
  // `drawingFor`, so the body is chosen BEFORE the frame is drawn — a kind nothing claims now
  // renders no frame at all, instead of the empty bordered box this test's own note describes.
  assert.match(SEMANTIC, /case "mechanism":/, "it draws unconditionally, or not from the visual");
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

test("🔴🔴🔴 the dots and the curly arrows are GONE, in every layer at once", () => {
  // 🔴 OWNER, 2026-08-26: *"bad mechanism arrows are worse than no arrows because they teach the
  // chemistry incorrectly."* A half-removal is the worse outcome of the two: a renderer that still
  // draws while the contract has stopped describing, or a contract that still promises while the
  // renderer has stopped drawing. So all four layers are checked in one place.
  assert.ok(!/lonePairCount|lonePairDots|drawElectronArrows|curlyArrow/.test(STRUCTURE), "the renderer still draws electrons");
  assert.ok(!/lonePairs|arrows/.test(SCHEME), "the scheme still passes electron fields down");
  assert.ok(!/"arrows"|lonePairs/.test(PACKET), "the packet still offers arrows or dots");
});

test("🔴🔴🔴 a charge reads LAST, because OH⁻ is not O⁻H", () => {
  // 🔴 OWNER, 2026-08-26: *"the electron 'OH⁻' is not correct… charges are part of normal molecular
  // depiction, not an optional mechanism feature."* The bug is in the drawer: `drawText` welds the
  // charge onto the element symbol BEFORE appending the hydrogens, so the pieces can only ever be
  // ["O⁻", "H"] and `OH⁻` is not expressible. Fixed in our own pass over the finished drawing.
  assert.match(STRUCTURE, /function chargesReadLast/, "the charge fix is gone");
  assert.match(STRUCTURE, /chargesReadLast\(element\)/, "the charge fix is never called");
});

test("🔴🔴🔴 a highlight is DRAWN BY US, because the library's own highlight paints everything", () => {
  // 🔴 MEASURED ON ASPIRIN WITH `highlight: [0, 2]`: 26 highlight circles, one per atom, in the
  // library's fallback green. `drawAtomHighlights` matches `atom.class === highlight[0]` — a SMILES
  // atom CLASS, not a position — and wants [class, colour] pairs. Bare indices made every atom
  // match `undefined === undefined`. It had never once worked.
  assert.match(STRUCTURE, /function drawHighlights/, "we stopped drawing our own highlights");
  assert.match(STRUCTURE, /drawer\.draw\(parsed, element, theme, null, false, \[\]\)/, "the library's own highlight argument is being fed again");
  assert.match(STRUCTURE, /data-highlight/, "a highlight can no longer be found in the output");
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
