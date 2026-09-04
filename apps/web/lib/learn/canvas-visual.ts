// A constrained semantic request for a teaching visual.
//
// The model says what relationship should be made visible. It never supplies HTML, SVG, Mermaid,
// JavaScript, or renderer configuration. Trusted code below this boundary owns all drawing.
//
// 🔴 A REFUSAL NOW CARRIES A NAMED REASON, AND THE BARE `null` IT REPLACES WAS A REAL GAP. Every
// rejection below — a dangling edge, an eighteen-node graph, a `\href` smuggled into an equation —
// used to arrive at the caller as the same empty value, so `canvas-ops.ts` could only say
// *"Malformed or unsupported semantic visual."* to a model that had made one specific mistake it
// was never told about. Worse, a SAFETY refusal and a SIZE refusal were indistinguishable: nothing
// downstream could count how often the boundary was actually being probed, because the boundary
// did not say. `validateCanvasVisual` names the reason; `parseCanvasVisual` remains for the callers
// that genuinely only need to know whether anything survived.

import { validateStructure, type ChemNotation } from "./chem-notation";
import { allowedAssetUrl } from "./reference-images";
import type { CandidateAsset } from "./visual-provenance";
import {
  SUBJECT_KINDS,
  validateSubjectVisual,
  type CircuitComponent,
  type CircuitGroup,
  type CircuitPart,
  type CircuitVisual,
  type CodeVisual,
  type ConstructionVisual,
  type ScoreVisual,
  type SubjectVisual,
  type SurfaceVisual,
  type TableVisual,
  type TimelineVisual,
  type VectorsVisual,
} from "./subject-visuals";

/** Every polarity a trusted renderer draws. */
const POLARITIES: readonly EdgePolarity[] = ["increases", "decreases", "plain"];

export interface CanvasVisualBase {
  /** What the learner should understand after seeing this visual. */
  learningGoal: string;
  caption?: string;
}

export interface EquationVisual extends CanvasVisualBase {
  kind: "equation";
  latex: string;
}

/**
 * How one thing acts on the next.
 *
 * 🔴 POLARITY, NOT A PATHWAY VOCABULARY, AND THE DISTINCTION IS THE FIELD-AGNOSTIC RULE. The
 * question a diagram of relations has to answer is whether the arrow means MORE or LESS, and that
 * question is general: a signalling cascade inhibits, a control loop damps, a precedent is
 * distinguished, a subsidy suppresses demand. What is NOT here — and must never be — is
 * `phosphorylates`, `transcribes`, or any other domain verb. Those belong in the edge LABEL, which
 * is free text and already exists.
 *
 * 🔴 IT EXISTS BECAUSE THE RENDERER COULD NOT SAY "LESS". Measured before adding it: every edge
 * drew the same arrowhead, so an inhibition could only be expressed by writing the word on the
 * line, and a learner scanning a mechanism reads shape long before they read edge labels.
 */
export type EdgePolarity = "increases" | "decreases" | "plain";

export interface FlowVisual extends CanvasVisualBase {
  kind: "relationship";
  nodes: readonly { id: string; label: string }[];
  edges: readonly { from: string; to: string; label?: string; polarity?: EdgePolarity }[];
}

export interface PlotVisual extends CanvasVisualBase {
  kind: "quantitative";
  xLabel?: string;
  yLabel?: string;
  series: readonly {
    label: string;
    points: readonly { x: number; y: number }[];
  }[];
}

/**
 * A molecule, named by its canonical notation rather than drawn (§42).
 *
 * 🔴 THE SAME SHAPE AS `EquationVisual`, AND THAT IS THE POINT. `latex` in, KaTeX draws; `value`
 * in, a chemical depiction library draws. The model supplies notation and never geometry, so a
 * structure cannot arrive with atoms in the wrong places — the depiction is computed from the
 * string, and the string is kept so anybody can check what was asked for.
 */
/**
 * One thing a step can point at: an atom, or the bond between two atoms.
 *
 * 🔴🔴🔴 THIS VOCABULARY OUTLIVED THE ARROWS IT WAS BUILT FOR, ON THE OWNER'S CALL, 2026-08-26:
 * *"bad mechanism arrows are worse than no arrows, because they teach the chemistry incorrectly
 * while also consuming engineering time."* Curly arrows and lone-pair dots are gone until there is a
 * renderer that can be trusted with them. What survives is the useful half: naming the part of a
 * structure a step is ABOUT, so the picture can point while the prose does the explaining.
 *
 * A bare number is an atom. A pair is the bond between those two atoms. Both count heavy atoms from
 * zero in the notation.
 */
export type HighlightTarget = number | readonly [number, number];

/** The highest heavy-atom index a highlight may name. */
const MAX_ATOM_INDEX = 300;

const atomIndex = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_ATOM_INDEX ? value : null;

/**
 * Read one highlight target, or null when it is neither an atom nor a bond.
 *
 * 🔴 BOUNDS DISCIPLINE, because these indices are handed to a renderer that will look them up in
 * somebody else's graph. A bond naming one atom twice is not a bond.
 */
function highlightTarget(value: unknown): HighlightTarget | null {
  const single = atomIndex(value);
  if (single !== null) return single;
  if (!Array.isArray(value) || value.length !== 2) return null;
  const from = atomIndex(value[0]);
  const to = atomIndex(value[1]);
  if (from === null || to === null || from === to) return null;
  return [from, to] as const;
}

/**
 * Read a whole `highlight` array, or say why it is not one.
 *
 * 🔴 SHARED BY `structure` AND `mechanism` BECAUSE A STEP IS A STRUCTURE. Two copies of this would
 * be two places for what a highlight may say to drift apart, and the mechanism lane is exactly
 * where a divergence would go unnoticed longest.
 */
function readHighlight(value: unknown): { highlight: HighlightTarget[] } | { detail: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) {
    return { detail: "highlight must be 1–40 atoms or bonds when present" };
  }
  const highlight: HighlightTarget[] = [];
  for (const item of value) {
    const target = highlightTarget(item);
    // 🔴 `null`, NOT FALSY. Atom 0 is a real atom and `!0` is true, so the obvious check refuses
    // every highlight on the first atom in the notation. An existing test caught this once already.
    if (target === null) {
      return { detail: "every highlight is a heavy-atom index 0 to 300, or a bond written as a pair of them" };
    }
    highlight.push(target);
  }
  return { highlight };
}

export interface StructureVisual extends CanvasVisualBase {
  kind: "structure";
  /** Which canonical form `value` is written in. A molecule, or a reaction scheme. */
  notation: ChemNotation;
  /** The canonical string itself. Shown beside the drawing, never hidden behind it. */
  value: string;
  /**
   * Where the notation came from, when it was resolved rather than asserted.
   *
   * 🔴 OPTIONAL, AND ITS ABSENCE IS A REAL FACT ABOUT THE STRUCTURE. Present means a resolver was
   * asked for this name and returned this string; absent means a model wrote it. Both may be
   * correct and they are not equally trustworthy, and a surface that could not tell them apart
   * would present a remembered SMILES exactly like a looked-up one.
   */
  resolvedFrom?: { name: string; provider: "pubchem"; id: string };
  /**
   * Atoms and bonds to pick out, counting heavy atoms from zero in the notation.
   *
   * 🔴 INDICES, NOT COLOURS OR SHAPES. The model says WHICH parts matter; trusted code decides how
   * "matters" looks, exactly as it decides where every bond goes. A `highlight` carrying a hex
   * colour would be the model supplying rendering instructions, which is the one thing §41 forbids
   * across every representation.
   *
   * 🔴 THIS IS WHAT MAKES A STRUCTURE ANSWERABLE-AGAINST. Without it a drawn molecule can only be
   * looked at; with it a lesson can ask "which part of aspirin is the ester?" and mark the answer,
   * which is the difference §41 draws between a learning object and decoration.
   *
   * 🔴🔴🔴 AND SINCE 2026-08-26 IT CARRIES THE WEIGHT THE ARROWS USED TO. With curly arrows dropped,
   * this is how a mechanism step points: highlight the attacking atom and the bond that breaks,
   * and say in prose what moves where. A pair of indices is the BOND between them, which the
   * depiction library cannot mark at all and which a step almost always needs.
   */
  highlight?: readonly HighlightTarget[];
  /**
   * Whether carbon atoms are labelled.
   *
   * 🔴 A TEACHING CHOICE THAT CHANGES WHAT THE PICTURE TEACHES, WHICH IS WHY IT IS IN THE SPEC
   * RATHER THAN IN A THEME. Skeletal notation — bare corners for carbon — is the convention every
   * exam uses and is unreadable to somebody in their first week, who needs to see that the corners
   * ARE carbons before the shorthand means anything. Defaults to `skeletal`, because that is what
   * the learner will be shown everywhere else.
   */
  carbons?: "all" | "skeletal";
  /**
   * Text above and below the reaction arrow — conditions, reagents, a name.
   *
   * Ignored for a single molecule. Reaction conditions are prose ("H+, heat", "reflux 2h") rather
   * than notation, which is why they are separate fields instead of being smuggled into the string.
   */
  conditions?: string;
  reactionLabel?: string;
}

/**
 * 🔴🔴🔴 THERE IS NO `arrows` AND NO `lonePairs`, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 * Both shipped on 2026-08-25 and were withdrawn by the owner the next day:
 *
 *   *"bad mechanism arrows are worse than no arrows because they teach the chemistry incorrectly
 *    while also consuming engineering time like a small electrical fire… I'd rather have superb
 *    explanations plus clean structures plus highlighting than a mediocre ChemDraw imitation."*
 *
 * The measured state at withdrawal, on the live page: two of six lone-pair dots on a bromine sat
 * INSIDE the letters, because the clearance was computed as one radius in every direction while an
 * atom's label is a rectangle up to two and a half times wider than it is tall. That is fixable.
 * What is not cheaply fixable is that nothing else in the ecosystem solves it either: the one
 * library that models curly arrows as real objects, Kekule.js, stores them as raw coordinates a
 * human drags into place, so it hands over the vocabulary and none of the geometry.
 *
 * 🔴 SO A MECHANISM IS NOW TAUGHT THE WAY THE OWNER SPECIFIED: clean structures, the reaction arrow
 * and its conditions between them, `highlight` pointing at the atoms and bonds that change, and the
 * electron movement stated EXPLICITLY IN PROSE beside the picture. Do not restore arrows or dots
 * without a renderer that can be trusted with them.
 */

/**
 * A REAL picture, retrieved from an openly licensed repository — §42's rung three, as a request.
 *
 * 🔴 THE MODEL NAMES A SUBJECT AND STOPS THERE, exactly as `structure` names a compound. What may
 * actually be shown is decided below this boundary: `figure-resolve.ts` strips any `asset` a model
 * wrote, `app/api/learn/reference-image` asks the curated registry and the live providers, and
 * `chooseAsset` in `visual-provenance.ts` refuses anything whose licence or credit was not kept.
 * A subject that resolves to nothing loses its picture and never the prose.
 */
export interface FigureVisual extends CanvasVisualBase {
  kind: "figure";
  /** What must be visible, as a short noun phrase — the model's own words, kept for the record. */
  subject: string;
  /**
   * The chosen picture with its licence, stamped by the reference resolver.
   *
   * 🔴 TRUSTED CALLERS SET IT; NOTHING FROM A MODEL KEEPS IT — the same rule as `resolvedFrom` on a
   * structure. The validator still bounds it (https, an allow-listed host, a licence object),
   * because stored blocks are re-validated long after the resolve pass ran and defence in depth is
   * cheaper than an incident.
   */
  asset?: CandidateAsset;
}


export type CanvasVisualRequest =
  | EquationVisual
  | FigureVisual
  | FlowVisual
  | MacromoleculeVisual
  | MechanismVisual
  | PlotVisual
  | StructureVisual
  | SubjectVisual;

/**
 * A mechanism as one connected scheme: several frames, joined by reaction arrows.
 *
 * 🔴🔴🔴 THE OWNER SENT A TEXTBOOK MECHANISM AND ASKED WHY OURS DID NOT LOOK LIKE IT, 2026-08-25.
 * His picture is ONE diagram: five structures flowing across the page and wrapping onto the next
 * line, each arrow carrying the change. Ours was five separate framed cards stacked down the page
 * with paragraphs between them, which reads as five pictures of five molecules rather than as one
 * reaction going somewhere.
 *
 * 🔴 A STEP IS A `structure`, NOT A NEW DRAWING LANE. Each frame is the same SMILES the same drawer
 * already draws. The only thing this kind adds is the LAYOUT: what sits beside what, and what is
 * written on the arrow between them. Anything else would be a second renderer for molecules, and
 * two of those is two places for "what does a mechanism look like" to drift apart.
 *
 * 🔴🔴🔴 WHAT THE ELECTRONS DO IS SAID IN PROSE, NOT DRAWN. Owner, 2026-08-26. The frames show the
 * species, `highlight` points at the atom being attacked and the bond that breaks, and the turn's
 * own text says "the oxygen lone pair attacks the carbonyl carbon; the pi electrons move onto
 * oxygen". See the note on `StructureVisual` for why, and for what would have to exist first.
 *
 * 🔴 THE MODEL STILL NEVER DRAWS. It names the species at each step and which atoms and bonds
 * matter; every coordinate on screen is computed here.
 */
export interface MechanismVisual extends CanvasVisualBase {
  kind: "mechanism";
  steps: readonly {
    /** The species at this step, as SMILES. Dot-separated for several molecules in one frame. */
    value: string;
    /** The atoms and bonds THIS step is about, in this step's own index space. */
    highlight?: readonly HighlightTarget[];
    /** What is written on the reaction arrow LEAVING this step: a reagent, a condition, a name. */
    label?: string;
    carbons?: "skeletal" | "all";
  }[];
}

/**
 * A macromolecule — a protein, a nucleic acid — named by its structure-database accession (§42).
 *
 * 🔴 THE SAME SHAPE AS `StructureVisual`, ONE DATABASE UP. `value` in, a depiction library draws;
 * `accession` in, an embedded structure viewer draws from the worldwide Protein Data Bank's own
 * data. The model supplies an identifier and never geometry, and the identifier is shown beside the
 * viewer so anybody can check what was asked for.
 *
 * 🔴 A MODEL NEVER WRITES THE ACCESSION EITHER. Four opaque characters are exactly the remembered-
 * SMILES danger with fewer chances to notice: `1HHO` and `1HH0` are both plausible and different
 * structures. So the request vocabulary takes a NAME (`{"kind":"macromolecule","molecule":"…"}`),
 * `macromolecule-resolve.ts` looks it up through RCSB's own search, and the accession that reaches
 * this spec was stamped by that resolver together with `resolvedFrom`.
 */
export interface MacromoleculeVisual extends CanvasVisualBase {
  kind: "macromolecule";
  /** A PDB entry id — one digit, then three letters or digits. Uppercased on the way through. */
  accession: string;
  /** The entry's own title, from the structure database — what the accession actually is. */
  title?: string;
  /** Present when a resolver was asked for a name and returned this accession. See `StructureVisual`. */
  resolvedFrom?: { name: string; provider: "rcsb"; id: string };
}

export type {
  CircuitComponent,
  CircuitGroup,
  CircuitPart,
  CircuitVisual,
  CodeVisual,
  ConstructionVisual,
  ScoreVisual,
  SubjectVisual,
  SurfaceVisual,
  TableVisual,
  TimelineVisual,
  VectorsVisual,
};

/**
 * Why a request was refused. **A name, never a sentence** — the prose belongs in `detail`.
 *
 * 🔴 EACH ONE IS SOMETHING DIFFERENT WENT WRONG, WHICH IS THE ENTIRE VALUE OF THE LIST. "the graph
 * had eighteen nodes" and "the equation contained `\href`" are a budget problem and a SECURITY
 * probe, and a system that reports both as "malformed" can never notice the second is happening.
 */
export type VisualRefusal =
  /** Not an object — a string, a list, null, a number. */
  | "not-a-request"
  /** No `kind`, or a `kind` naming something no trusted renderer owns. */
  | "unknown-kind"
  /** Text absent, empty, or past its bound. `detail` names the field. */
  | "text-out-of-bounds"
  /**
   * A LaTeX escape hatch that leaves mathematics — `\href`, `\url`, `\includegraphics`, the `\html*`
   * family, or a macro definition.
   *
   * 🔴 KaTeX ALREADY BLOCKS THE FIRST GROUP UNDER `trust: false`, AND REFUSING THEM HERE IS STILL
   * THE IMPROVEMENT — measured, not assumed. `trust: false` emits no anchor, but it does not throw
   * either: it prints the literal `\href{https://evil.test}{click me}`, URL and all, in red where
   * the equation should be. So the render-time defence holds the security line and hands the
   * learner a red blob containing a model-chosen URL, with no reason attached to anything a human
   * reads. Refusing at the spec layer means the one interesting event in this whole file — a model
   * reaching for a link or an external image inside a teaching equation — has a NAME, and the
   * teaching text stands on its own instead.
   *
   * 🔴 MACRO DEFINITIONS ARE HERE FOR A DIFFERENT REASON: EXPANSION, NOT ESCAPE. `\def\x{\x\x}` is
   * bounded only by KaTeX's `maxExpand`, and a teaching equation has no legitimate use for defining
   * a macro it then uses once. Refusing is free; relying on a renderer limit is a promise.
   */
  | "unsafe-latex"
  /** Too few or too many nodes for a graph a learner can read at a glance. */
  | "node-count"
  /** Too few or too many edges. */
  | "edge-count"
  /** A node that is not an object, has no usable id or label, or repeats an id already claimed. */
  | "malformed-node"
  /**
   * An edge naming a node the graph does not contain.
   *
   * 🔴 ITS OWN REASON BECAUSE IT IS THE ONE THAT WOULD CRASH THE RENDERER. `Relationship` reads
   * `positions.get(edge.from)!` — a non-null assertion — so a dangling edge is not a cosmetic flaw,
   * it is an exception thrown mid-render in front of the learner.
   */
  | "dangling-edge"
  /** An edge that is not an object, or whose endpoints are not usable text. */
  | "malformed-edge"
  /** Too few or too many series. */
  | "series-count"
  /** A series with too few points to draw a line, or more than the plot's budget. */
  | "point-count"
  /** More points across all series than one plot may carry. */
  | "payload-too-large"
  /** A coordinate that is not a finite number — NaN, Infinity, a string, a missing field. */
  | "non-finite-number"
  /** A series that is not an object, or carries no usable label. */
  | "malformed-series"
  /**
   * A chemical structure that is not usable notation. `detail` carries the specific reason.
   *
   * 🔴 ONE REASON RATHER THAN SIX, DELIBERATELY, AND THE SIX STILL EXIST. `ChemRefusal` in
   * `chem-notation.ts` distinguishes prose-instead-of-notation from an unclosed ring from a
   * runaway length, and `detail` carries that text verbatim. What this union must not become is a
   * place where every notation Nemesis ever supports adds five members — the visual boundary cares
   * that a structure was unusable, and the chemistry module owns why.
   */
  | "malformed-structure"
  /**
   * A reference-figure request that is not usable. `detail` carries the specific reason.
   *
   * 🔴 THE INTERESTING CASE INSIDE IT IS AN ASSET NOBODY STAMPED. A `figure` whose `asset` names a
   * host outside the allow list, or carries no licence object, is either a stored row from before a
   * rule tightened or a model trying to hand the renderer a URL — and both must refuse rather than
   * render, because the refusal is the only place the second one becomes visible.
   */
  | "malformed-figure"
  /** A macromolecule request without a usable accession. `detail` names the field. */
  | "malformed-macromolecule"
  /**
   * An anatomy request that is not usable. `detail` carries the specific reason.
   *
   * 🔴 THE INTERESTING CASE IS AN UNRESOLVED ONE — a request no resolver stamped, which means the
   * resolve pass never ran or the atlas had no such structure. Refusing it here is what keeps the
   * registry the only door to the mesh files, exactly as a gridless surface refuses.
   */
  /** An edge polarity naming something no renderer draws. */
  | "malformed-polarity"
  /**
   * A §44 subject representation that is not well formed. `detail` names which and why.
   *
   * 🔴 ONE MEMBER FOR FIVE SHAPES, THE SAME CHOICE `malformed-structure` MADE FOR CHEMISTRY. The
   * specific reasons live in `subject-visuals.ts` and travel in `detail`; what this union must not
   * become is a place where every representation the Canvas ever learns adds five members.
   */
  | "malformed-subject"
  /**
   * The structure was fine and the ARITHMETIC was not — a total that does not sum, a balance that
   * does not balance, an angle that disagrees with its own coordinates, forces that do not cancel.
   *
   * 🔴 THE MOST IMPORTANT REFUSAL ADDED SINCE `unsafe-latex`, AND FOR THE SAME KIND OF REASON.
   * `unsafe-latex` exists so a security probe has a name; this exists so a REASONING failure has
   * one. A model that produces a plausible table with a wrong total is failing at the thing it is
   * being trusted to do, and reporting that as "malformed" would make it invisible.
   */
  | "failed-verification";

export type VisualValidation =
  | { ok: true; visual: CanvasVisualRequest }
  | { ok: false; reason: VisualRefusal; detail: string };

function refuse(reason: VisualRefusal, detail: string): VisualValidation {
  return { detail, ok: false, reason };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/**
 * Commands that leave mathematics, and the macro definitions that make expansion unbounded.
 *
 * 🔴 A DENY LIST HERE IS SOUND BECAUSE THE RENDERER IS ALSO LOCKED. This is not the only thing
 * standing between a model and the DOM — `trust: false` refuses the whole trust-gated family
 * whether or not it is named here, and `maxExpand` bounds expansion whether or not `\def` is
 * caught. This list exists to give those refusals a NAME before anything is drawn, which is a
 * different job from being the defence.
 */
const UNSAFE_LATEX = /\\(href|url|includegraphics|html(?:Class|Id|Style|Data)|[gex]?def|newcommand|renewcommand|providecommand)\b/i;

function base(value: Record<string, unknown>): VisualValidation | CanvasVisualBase {
  const learningGoal = boundedText(value.learningGoal, 240);
  // 🔴 A VISUAL WITH NO STATED GOAL IS DECORATION BY DEFINITION, and §41 is explicit that
  // decoration competes with the material for the attention §19 reserves for it. This is the one
  // field whose absence is a pedagogy refusal rather than a formatting one.
  if (!learningGoal) return refuse("text-out-of-bounds", "learningGoal must be 1–240 characters");
  const caption = value.caption === undefined ? null : boundedText(value.caption, 240);
  if (value.caption !== undefined && !caption) {
    return refuse("text-out-of-bounds", "caption must be 1–240 characters when present");
  }
  return { learningGoal, ...(caption ? { caption } : {}) };
}

function isRefusal(value: VisualValidation | CanvasVisualBase): value is VisualValidation {
  return "ok" in value;
}

/**
 * Validate and bound a model request, naming the reason when it is refused.
 *
 * 🔴 THE ORDER OF THE CHECKS IS THE ORDER OF THE REASONS. Whichever fires first is the one
 * reported, so the cheapest and most specific checks come first — a caller acting on
 * `dangling-edge` should not have been told `node-count` because both were true.
 */
/**
 * Shapes the model may no longer ask for, and that no renderer draws.
 *
 * 🔴🔴 THE INTERACTIVE 3D PAIR, WITHDRAWN BY THE OWNER ON 2026-09-04: *"let's just skip the
 * interactive visual, honestly it's mostly fluff. It's more of a gimmick than anything … what
 * matters most is that we have visuals, bottom line … it used an image visual for that. I think
 * that's pretty much how we should do it."*
 *
 * He said it holding the production answer to "show me how a dna structure works in 3d". The
 * prompt named "a double helix" as the case for the rotatable viewer, so the model asked for a
 * `macromolecule`; Mol* never loaded — no <canvas> on the page, the library never fetched — and the
 * answer rendered an EMPTY BORDERED BOX with the prose either side of it saying "here is a
 * rotatable model … drag it around" and then "try this: rotate it so you are looking straight down
 * the axis". Meanwhile `REFERENCE_SHELF` answers "DNA double helix" with the National Human Genome
 * Research Institute's own labelled diagram, public domain, credited.
 *
 * 🔴 WITHDRAWN AT TWO PLACES, AND DELIBERATELY NOT AT THE VALIDATOR. A kind is gone when nothing
 * OFFERS it (`turn-router.ts`, `canvas-prompts.ts`) and nothing DRAWS it (`drawingFor` in
 * `semantic-visual.tsx` has no case, and a visual with no body now renders no frame at all). Both
 * are asserted. Parsing is left alone on purpose: the type, the resolver and the computed-grid
 * checks are correct code with their own tests, and a canvas saved before today still has to open.
 * One that slips through anyway renders NOTHING, which is the safe degradation — the empty frame
 * was the defect, not the kind.
 *
 * 🔴 ONE SOURCE OF TRUTH. `visuals-are-told.test.ts` and `every-kind-renders.test.ts` both import
 * this rather than restating it, because a second copy is how the prompt half and the render half
 * drift apart — which is the whole failure `every-kind-renders.test.ts` exists to catch.
 */
export const WITHDRAWN_VISUAL_KINDS: readonly string[] = ["macromolecule", "surface"];

export function validateCanvasVisual(value: unknown): VisualValidation {
  if (!record(value)) return refuse("not-a-request", `expected an object, received ${typeof value}`);
  const common = base(value);
  if (isRefusal(common)) return common;


  if (value.kind === "equation") {
    const latex = boundedText(value.latex, 500);
    if (!latex) return refuse("text-out-of-bounds", "latex must be 1–500 characters");
    const unsafe = UNSAFE_LATEX.exec(latex);
    if (unsafe) return refuse("unsafe-latex", `latex contains ${unsafe[0]}`);
    return { ok: true, visual: { ...common, kind: "equation", latex } };
  }

  if (value.kind === "relationship") {
    if (!Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > 8) {
      return refuse("node-count", `a relationship needs 2–8 nodes, received ${countOf(value.nodes)}`);
    }
    if (!Array.isArray(value.edges) || value.edges.length < 1 || value.edges.length > 12) {
      return refuse("edge-count", `a relationship needs 1–12 edges, received ${countOf(value.edges)}`);
    }
    const nodes: Array<{ id: string; label: string }> = [];
    for (const item of value.nodes) {
      if (!record(item)) return refuse("malformed-node", "a node is not an object");
      const id = boundedText(item.id, 40);
      const label = boundedText(item.label, 100);
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
        return refuse("malformed-node", "a node id must be 1–40 characters of A–Z, 0–9, _ or -");
      }
      if (!label) return refuse("malformed-node", `node ${id} needs a label of 1–100 characters`);
      if (nodes.some((node) => node.id === id)) return refuse("malformed-node", `node id ${id} is used twice`);
      nodes.push({ id, label });
    }
    const ids = new Set(nodes.map((node) => node.id));
    const edges: Array<{ from: string; to: string; label?: string }> = [];
    for (const item of value.edges) {
      if (!record(item)) return refuse("malformed-edge", "an edge is not an object");
      const from = boundedText(item.from, 40);
      const to = boundedText(item.to, 40);
      if (!from || !to) return refuse("malformed-edge", "an edge needs both a from and a to");
      if (!ids.has(from)) return refuse("dangling-edge", `edge names ${from}, which is not a node`);
      if (!ids.has(to)) return refuse("dangling-edge", `edge names ${to}, which is not a node`);
      const label = item.label === undefined ? null : boundedText(item.label, 80);
      if (item.label !== undefined && !label) {
        return refuse("text-out-of-bounds", "an edge label must be 1–80 characters when present");
      }
      // Absent means `plain`, and absent is what every request written before polarity existed
      // sends. A missing polarity is not an unknown one.
      if (item.polarity !== undefined && !POLARITIES.includes(item.polarity as EdgePolarity)) {
        return refuse("malformed-polarity", `an edge polarity must be one of ${POLARITIES.join(", ")}`);
      }
      const polarity = (item.polarity as EdgePolarity | undefined) ?? undefined;
      edges.push({ from, to, ...(label ? { label } : {}), ...(polarity && polarity !== "plain" ? { polarity } : {}) });
    }
    return { ok: true, visual: { ...common, edges, kind: "relationship", nodes } };
  }

  if (value.kind === "quantitative") {
    if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 4) {
      return refuse("series-count", `a plot needs 1–4 series, received ${countOf(value.series)}`);
    }
    const series: Array<{ label: string; points: Array<{ x: number; y: number }> }> = [];
    let totalPoints = 0;
    for (const item of value.series) {
      if (!record(item)) return refuse("malformed-series", "a series is not an object");
      const label = boundedText(item.label, 80);
      if (!label) return refuse("malformed-series", "a series needs a label of 1–80 characters");
      // 🔴 400, RAISED FROM 40 WHEN COMPUTED CURVES ARRIVED (§45). Forty was right for points a
      // model lists by hand — past that it is a runaway — but a curve computed from an expression
      // is generated by trusted code, and forty points across a sine wave draws a visible polygon.
      // Raised for everyone rather than made conditional: a validator cannot tell a computed series
      // from a claimed one, and the risk of a large point count is payload size, not correctness.
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 400) {
        return refuse("point-count", `series "${label}" needs 2–400 points, received ${countOf(item.points)}`);
      }
      const points: Array<{ x: number; y: number }> = [];
      for (const point of item.points) {
        if (!record(point)) return refuse("non-finite-number", `a point in "${label}" is not an object`);
        const { x, y } = point;
        if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
          return refuse("non-finite-number", `a point in "${label}" has a non-finite x or y`);
        }
        points.push({ x, y });
      }
      totalPoints += points.length;
      if (totalPoints > 1200) return refuse("payload-too-large", "a plot carries at most 1200 points across all series");
      series.push({ label, points });
    }
    const xLabel = value.xLabel === undefined ? null : boundedText(value.xLabel, 80);
    const yLabel = value.yLabel === undefined ? null : boundedText(value.yLabel, 80);
    if ((value.xLabel !== undefined && !xLabel) || (value.yLabel !== undefined && !yLabel)) {
      return refuse("text-out-of-bounds", "an axis label must be 1–80 characters when present");
    }
    return {
      ok: true,
      visual: {
        ...common,
        kind: "quantitative",
        series,
        ...(xLabel ? { xLabel } : {}),
        ...(yLabel ? { yLabel } : {}),
      },
    };
  }

  if (value.kind === "structure") {
    // 🔴 THE NOTATION IS CHECKED BEFORE THE VALUE, so "we do not own InChI" is never reported as
    // "that InChI is malformed" — one is a capability gap worth counting and the other is a typo.
    const structure = validateStructure(value.notation, value.value);
    if (!structure.ok) return refuse("malformed-structure", `${structure.reason}: ${structure.detail}`);
    const notation = value.notation as ChemNotation;
    const resolved = resolvedFrom(value.resolvedFrom);
    if (resolved === "malformed") {
      return refuse("malformed-structure", "resolvedFrom must carry a provider, an id and the name that was looked up");
    }

    // 🔴 BOUNDED AND INTEGER, because these indices are handed to a renderer that will look them
    // up. A negative, fractional or absurd index is not a highlight that misses — it is an array
    // access in somebody else's library on a number a model chose.
    let highlight: HighlightTarget[] | null = null;
    if (value.highlight !== undefined) {
      // 🔴 A BOND HIGHLIGHT NEEDS ONE FRAME, exactly as an arrow did. Dot-separated species inside a
      // single `smiles` value share one index space; `reaction-smiles` lays out several sub-drawings
      // with per-molecule indices, so a pair of numbers there would be a guess about which molecule
      // was meant. Atom highlights are fine either way, so only the bond form is refused.
      const read = readHighlight(value.highlight);
      if ("detail" in read) return refuse("malformed-structure", read.detail);
      if (notation !== "smiles" && read.highlight.some((target) => Array.isArray(target))) {
        return refuse(
          "malformed-structure",
          "a bond highlight needs one frame: use dot-separated species in a single smiles value",
        );
      }
      highlight = read.highlight;
    }

    const carbons = value.carbons === undefined ? null : value.carbons;
    if (carbons !== null && carbons !== "all" && carbons !== "skeletal") {
      return refuse("malformed-structure", 'carbons must be "skeletal" or "all"');
    }

    const conditions = value.conditions === undefined ? null : boundedText(value.conditions, 60);
    const reactionLabel = value.reactionLabel === undefined ? null : boundedText(value.reactionLabel, 60);
    if ((value.conditions !== undefined && !conditions) || (value.reactionLabel !== undefined && !reactionLabel)) {
      return refuse("text-out-of-bounds", "reaction arrow text must be 1–60 characters when present");
    }

    return {
      ok: true,
      visual: {
        ...common,
        kind: "structure",
        notation,
        value: structure.value,
        ...(resolved ? { resolvedFrom: resolved } : {}),
        ...(highlight ? { highlight } : {}),
        ...(carbons && carbons !== "skeletal" ? { carbons } : {}),
        ...(conditions ? { conditions } : {}),
        ...(reactionLabel ? { reactionLabel } : {}),
      },
    };
  }

  if (value.kind === "mechanism") {
    // 🔴 A STEP IS A STRUCTURE, so everything a structure refuses, a step refuses in the same words.
    if (!Array.isArray(value.steps) || value.steps.length < 2 || value.steps.length > 6) {
      return refuse("malformed-structure", "a mechanism is 2–6 steps: one frame each, joined by arrows");
    }
    const steps: MechanismVisual["steps"][number][] = [];
    for (const item of value.steps) {
      if (!record(item)) return refuse("malformed-structure", "a step is not an object");
      const structure = validateStructure("smiles", item.value);
      if (!structure.ok) return refuse("malformed-structure", `${structure.reason}: ${structure.detail}`);

      let highlight: HighlightTarget[] | null = null;
      if (item.highlight !== undefined) {
        const read = readHighlight(item.highlight);
        if ("detail" in read) return refuse("malformed-structure", read.detail);
        highlight = read.highlight;
      }

      // What rides on the reaction arrow LEAVING this step: a reagent, a condition, a name.
      const label = item.label === undefined ? null : boundedText(item.label, 60);
      if (item.label !== undefined && !label) {
        return refuse("text-out-of-bounds", "a step label must be 1–60 characters when present");
      }
      const carbons = item.carbons === undefined ? null : item.carbons;
      if (carbons !== null && carbons !== "all" && carbons !== "skeletal") {
        return refuse("malformed-structure", 'carbons must be "skeletal" or "all"');
      }

      steps.push({
        value: item.value as string,
        ...(highlight ? { highlight } : {}),
        ...(label ? { label } : {}),
        ...(carbons && carbons !== "skeletal" ? { carbons: carbons as "all" } : {}),
      });
    }

    return { ok: true, visual: { ...common, kind: "mechanism", steps } };
  }

  if (value.kind === "figure") {
    const subject = boundedText(value.subject, 120);
    if (!subject) return refuse("text-out-of-bounds", "subject must be 1–120 characters");
    const asset = figureAsset(value.asset);
    if (typeof asset === "string") return refuse("malformed-figure", asset);
    return { ok: true, visual: { ...common, kind: "figure", subject, ...(asset ? { asset } : {}) } };
  }

  if (value.kind === "macromolecule") {
    // 🔴 ONE DIGIT THEN THREE ALPHANUMERICS — the PDB's own format, and the bound that makes this
    // field an identifier rather than a string a renderer interpolates into a URL.
    const accession = boundedText(value.accession, 8);
    if (!accession || !/^[0-9][A-Za-z0-9]{3}$/.test(accession)) {
      return refuse("malformed-macromolecule", "accession must be a PDB id: one digit then three letters or digits");
    }
    const title = value.title === undefined ? null : boundedText(value.title, 200);
    if (value.title !== undefined && !title) {
      return refuse("text-out-of-bounds", "title must be 1–200 characters when present");
    }
    const resolved = macromoleculeResolvedFrom(value.resolvedFrom);
    if (resolved === "malformed") {
      return refuse("malformed-macromolecule", "resolvedFrom must carry a provider, an id and the name that was looked up");
    }
    return {
      ok: true,
      visual: {
        ...common,
        accession: accession.toUpperCase(),
        kind: "macromolecule",
        ...(title ? { title } : {}),
        ...(resolved ? { resolvedFrom: resolved } : {}),
      },
    };
  }

  if (typeof value.kind === "string" && SUBJECT_KINDS.includes(value.kind)) {
    // 🔴 DELEGATED, NOT REIMPLEMENTED, AND THE BOUNDARY STAYS HERE. `subject-visuals.ts` owns the
    // five shapes' rules and their arithmetic; this switch stays the one place a model request is
    // admitted, so there is never a second front door.
    const result = validateSubjectVisual(value.kind, value, common);
    if (result.ok) return { ok: true, visual: result.visual };
    return result.reason === "failed-verification"
      ? refuse("failed-verification", result.detail)
      : refuse("malformed-subject", `${result.reason}: ${result.detail}`);
  }

  return refuse("unknown-kind", `no trusted renderer owns ${JSON.stringify(value.kind)}`);
}

/**
 * The stamped asset on a figure: a `CandidateAsset` when usable, an error detail when present and
 * broken, null when absent.
 *
 * 🔴 EVERY RULE HERE IS DEFENCE IN DEPTH BEHIND `figure-resolve.ts` AND `chooseAsset`, and each one
 * still earns its place: the strip runs only on text arriving from a model, and the licence gate
 * runs only at routing time — a stored block travels between those two moments, and this is what
 * checks it there.
 */
function figureAsset(value: unknown): CandidateAsset | string | null {
  if (value === undefined || value === null) return null;
  if (!record(value)) return "asset must be an object when present";
  const assetPath = boundedText(value.assetPath, 500);
  if (!assetPath || !allowedAssetUrl(assetPath)) {
    return "assetPath must be an https URL on a host the reference lane allows";
  }
  // A figure is rung three by definition. Rung four travels a different route (`visual-route.ts`
  // receives it as a candidate, never as a request), so provenance here is one value, stated.
  if (value.provenance !== "reference_image") return "a figure's asset must carry reference_image provenance";
  const caption = value.caption === undefined ? null : boundedText(value.caption, 300);
  if (value.caption !== undefined && !caption) return "asset caption must be 1–300 characters when present";
  if (!record(value.licence)) return "a reference asset must carry its licence object";
  const licence = boundedText(value.licence.licence, 60);
  const source = boundedText(value.licence.source, 80);
  if (!licence || !source) return "a licence must name its identifier and its source repository";
  const attribution = value.licence.attribution === undefined ? null : boundedText(value.licence.attribution, 200);
  if (value.licence.attribution !== undefined && !attribution) {
    return "attribution must be 1–200 characters when present";
  }
  const url = value.licence.url === undefined ? null : boundedText(value.licence.url, 400);
  if (url && !/^https:\/\//.test(url)) return "a licence url must be https when present";
  return {
    assetPath,
    ...(caption ? { caption } : {}),
    licence: {
      ...(attribution ? { attribution } : {}),
      licence,
      source,
      ...(url ? { url } : {}),
    },
    provenance: "reference_image",
  };
}

/** The provenance stamp on a resolved macromolecule, mirroring `resolvedFrom` one database up. */
function macromoleculeResolvedFrom(
  value: unknown,
): MacromoleculeVisual["resolvedFrom"] | "malformed" | null {
  if (value === undefined || value === null) return null;
  if (!record(value)) return "malformed";
  const name = boundedText(value.name, 120);
  const id = boundedText(value.id, 12);
  if (!name || !id || value.provider !== "rcsb") return "malformed";
  return { id, name, provider: "rcsb" };
}

/** The provenance stamp on a resolved structure, or `malformed` when it is present and broken. */
function resolvedFrom(value: unknown): StructureVisual["resolvedFrom"] | "malformed" | null {
  if (value === undefined || value === null) return null;
  if (!record(value)) return "malformed";
  const name = boundedText(value.name, 120);
  const id = boundedText(value.id, 40);
  if (!name || !id || value.provider !== "pubchem") return "malformed";
  return { id, name, provider: "pubchem" };
}

function countOf(value: unknown): string {
  return Array.isArray(value) ? String(value.length) : "none";
}

/** Validate and bound a model request. Malformed visuals disappear; the teaching text survives.
 *
 *  Kept for callers that only need to know whether anything survived. When the caller can act on
 *  WHY — a check that reports back to a model, a log that should distinguish a safety probe from a
 *  typo — use `validateCanvasVisual` instead. */
export function parseCanvasVisual(value: unknown): CanvasVisualRequest | null {
  const result = validateCanvasVisual(value);
  return result.ok ? result.visual : null;
}
