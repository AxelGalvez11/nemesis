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

import { validateStructure } from "./chem-notation";

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
export interface StructureVisual extends CanvasVisualBase {
  kind: "structure";
  /** Which canonical form `value` is written in. Today only SMILES is owned. */
  notation: "smiles";
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
}

export type CanvasVisualRequest = EquationVisual | FlowVisual | PlotVisual | StructureVisual;

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
  /** An edge polarity naming something no renderer draws. */
  | "malformed-polarity";

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
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 40) {
        return refuse("point-count", `series "${label}" needs 2–40 points, received ${countOf(item.points)}`);
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
      if (totalPoints > 80) return refuse("payload-too-large", "a plot carries at most 80 points across all series");
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
    const resolved = resolvedFrom(value.resolvedFrom);
    if (resolved === "malformed") {
      return refuse("malformed-structure", "resolvedFrom must carry a provider, an id and the name that was looked up");
    }
    return {
      ok: true,
      visual: {
        ...common,
        kind: "structure",
        notation: "smiles",
        value: structure.value,
        ...(resolved ? { resolvedFrom: resolved } : {}),
      },
    };
  }

  return refuse("unknown-kind", `no trusted renderer owns ${JSON.stringify(value.kind)}`);
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
