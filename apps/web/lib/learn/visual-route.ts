// WHICH representation makes this idea land — or none at all (§41).
//
// 🔴 THIS IS THE ROUTER §41 ASKED FOR, AND ITS ABSENCE WAS THE GAP. The renderers existed
// (`semantic-visual.tsx`), the validated spec existed (`canvas-visual.ts`), and the source-figure
// interaction existed (`figure-occlusion.tsx`) — but NOTHING CHOSE BETWEEN THEM. A block carrying a
// `visual` was drawn because it carried one, and a figure was occluded because a component-local
// function in `canvas-policy-view.tsx` said so. Two visual systems, no decision, which is exactly
// what §41 names: *"a second, parallel visual system is how one product ends up with two of
// everything."* The occlusion rule now lives here, and that component asks this file.
//
// 🔴 "PROSE" IS A FIRST-CLASS ANSWER AND IS MEANT TO BE THE COMMON ONE. §41: *"Text is a renderer
// too, and often the right one. The question is never 'which library' — it is 'what representation
// makes this idea land', with 'prose' as a legitimate answer."* Most knowledge in most material
// needs no picture, so a router that finds a visual for everything has misunderstood the job. Every
// rule below that returns `prose` is doing the work, not failing to.
//
// 🔴 AND `prose` IS NOT `refused`. Both put nothing on screen and that is where the resemblance
// ends: `prose` means a visual would not have helped, `refused` means a request was malformed or
// unsafe. Collapsing them would make "the boundary rejected something" indistinguishable from "we
// chose words", so nothing could ever count how often the boundary is actually being probed. The
// same distinction `canvas-visual.ts` draws between a reason and a silence, one layer up.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. There is no list of fields, topics or keywords in this file
// and there must never be one. "If anatomy → diagram" is the rule the owner forbids by name, and it
// would be wrong on its own terms: a law student's burden-of-proof threshold is quantitative and a
// mechanical engineer's stress-strain curve is quantitative for the SAME structural reason — real
// numbers over a real range. What routes is the SHAPE of the knowledge: does a picture of it exist
// in the learner's own material, how many things stand in relation, are there values.
//
// PURE. No React, no I/O, no model call. Deciding is separable from drawing, which is what makes
// every rule here a test rather than a promise.

import { validateCanvasVisual, type CanvasVisualRequest, type VisualRefusal } from "./canvas-visual";
import { isOccludable, type FigureLabel } from "./figure-labels";
import type { CognitiveOperation, FigureKnowledge, KnowledgeObject } from "./knowledge-types";
import type { ObjectiveCapability } from "./learning-objective";

/**
 * What the learner is being asked to do, in whichever vocabulary the caller holds.
 *
 * 🔴 TWO UNIONS, DELIBERATELY, BECAUSE THIS CODEBASE GENUINELY HAS TWO AND THEY ARE NOT NESTED.
 * `CognitiveOperation` is what a knowledge TYPE opens with (`retrieve`, `distinguish`, `locate`, …);
 * `ObjectiveCapability` is what a stored OBJECTIVE claims (`recall`, `discriminate`, `locate`, …).
 * They overlap without one containing the other — `retrieve`/`recall` and `distinguish`/`discriminate`
 * are the same ideas under different names. Picking one would have forced the other caller to
 * translate at the boundary, and a translation table between two near-identical enums is where the
 * next silent mismatch comes from.
 *
 * 🔴 AND ONLY ONE VALUE IS ACTUALLY READ: `locate`, which means the same thing in both, which is
 * exactly why this works. The router asks one question of this field — "is the learner being asked
 * to find something in a picture?" — and both vocabularies answer it with the same word.
 */
export type VisualOperation = CognitiveOperation | ObjectiveCapability;

/**
 * Which trusted renderer owns the pixels.
 *
 * 🔴 A SEMANTIC CLASS, NEVER A LIBRARY NAME, and the distinction is §41's load-bearing one. Calling
 * this `katex | vega | mermaid` would put the library in the vocabulary of everything upstream, and
 * replacing one later would then be a change to the interface rather than to a single renderer.
 * `equation` says what is being shown; which package draws it is `semantic-visual.tsx`'s business.
 */
export type VisualRepresentation =
  /**
   * A figure from the learner's OWN material, with one named part covered.
   *
   * 🔴 PREFERRED OVER EVERY SYNTHETIC ROUTE, WHICH IS THE OWNER'S OWN ORDERING. The source already
   * contains the right picture: it is what the learner will see in the exam, what their lecturer
   * drew on, and it is evidence-backed rather than something we invented. A generated diagram of
   * the same thing is a worse copy of material they already have.
   */
  | "source_figure"
  /** Mathematical notation, which prose genuinely cannot set. */
  | "equation"
  /** Things standing in relation to one another — a mechanism, a hierarchy, a flow. */
  | "relationship"
  /** Values over a range. */
  | "quantitative";

/** Why no visual was chosen, when nothing was wrong. */
export type ProseReason =
  /** Nothing was requested and the knowledge carries no picture of its own. */
  | "nothing-to-show"
  /**
   * The knowledge is an arbitrary mapping, so there is no structure to draw.
   *
   * 🔴 STRAIGHT OUT OF `knowledge-types.ts`, NOT INVENTED HERE: an association is *"arbitrary or
   * semi-arbitrary mappings. There is usually nothing to explain — the work is making the link
   * retrievable."* A picture of a two-sided mapping is the mapping with a box drawn round it.
   */
  | "association-has-no-structure"
  /**
   * Too few things stand in relation for a diagram to beat a sentence.
   *
   * 🔴 TWO BOXES AND AN ARROW IS A SENTENCE WITH EXTRA STEPS. "A causes B" is already the clearest
   * possible rendering of "A causes B"; drawing it costs the learner a context switch and returns
   * nothing. This is also why a single `causal` knowledge object — one edge, by construction —
   * never gets a diagram: the mechanism becomes worth drawing when edges JOIN, which is the whole
   * reason `CausalRelation` stores one edge at a time.
   */
  | "too-few-relations"
  /** A figure exists but ingestion kept no pixels, so there is nothing to show. */
  | "figure-has-no-asset"
  /** A figure exists but names too few parts to be occluded — see `MIN_LABELS_FOR_SPATIAL`. */
  | "figure-not-occludable"
  /** The objective names a part this figure does not carry, so the two have drifted. */
  | "label-not-in-figure"
  /** The learner is not being asked to locate anything, so an occluded diagram answers no question. */
  | "operation-is-not-spatial"
  /** Every point sits at one x, so there is no range to plot along. */
  | "plot-has-no-range";

/**
 * One routing decision.
 *
 * 🔴 EVERY BRANCH CARRIES `because`, THE SAME DISCIPLINE `TeachingAction` HOLDS. "Why did Nemesis
 * show me this picture?" — and, more often, "why did it not?" — has to have an answer better than
 * "it felt like it".
 */
export type VisualRoute =
  | {
      decision: "render";
      representation: Exclude<VisualRepresentation, "source_figure">;
      spec: CanvasVisualRequest;
      because: string;
    }
  | {
      decision: "render";
      representation: "source_figure";
      /** The picture, and the one part being asked about. Handed straight to `FigureOcclusion`. */
      figure: FigureKnowledge;
      hidden: FigureLabel;
      because: string;
    }
  | { decision: "prose"; reason: ProseReason; because: string }
  | { decision: "refused"; reason: VisualRefusal; detail: string; because: string };

export interface VisualRouteInput {
  /**
   * What is being learned, when the caller knows.
   *
   * 🔴 OPTIONAL, AND THAT IS A FACT ABOUT THE CALLERS RATHER THAN A SOFTENING. `canvas-policy-view`
   * holds a full `KnowledgeObject`; `canvas-document` holds a `CanvasBlock`, which carries
   * `sourceRefs`, `conceptIds`, `terms` and `visual` and NO knowledge object at all. Making this
   * required would have left the document layer either fabricating one or quietly running with its
   * knowledge rules disabled — and the second is the shape of every silent-degradation bug in this
   * repo. Absent means "not known", never "the knowledge said no": a valid request still renders.
   */
  readonly knowledge?: KnowledgeObject;
  /** What the learner is being asked to DO. Absent when the caller is laying out teaching text. */
  readonly operation?: VisualOperation;
  /**
   * The model's request. **Untrusted data, validated here, never executed anywhere.**
   *
   * `unknown` deliberately: this arrives from a model reply and typing it as a
   * `CanvasVisualRequest` at the boundary would assert exactly what has not been checked yet.
   */
  readonly request?: unknown;
  /**
   * Which part of a figure the objective is asking about, normalised the way identity normalises.
   *
   * 🔴 THE OBJECTIVE'S OWN KEY, NEVER A ROUND COUNTER OR A CHOICE MADE HERE. Which label is hidden
   * is part of WHAT WAS ASKED, so choosing it at render time would let the screen and the evidence
   * disagree about which part was covered — the learner marked on a question nobody recorded.
   */
  readonly labelKey?: string;
  /** How a label's text becomes a key, so the caller's identity rules stay the caller's. */
  readonly normalizeLabel?: (text: string) => string;
}

/**
 * How many things must stand in relation before a diagram beats a sentence.
 *
 * 🔴 THREE, AND THE THRESHOLD IS THE RULE. At two, a graph draws one arrow and the learner reads a
 * sentence rendered as furniture. At three the reader has to hold a shape — a chain, a fork, a
 * cycle — and that is the first point at which the picture is doing work prose was doing badly.
 */
export const MIN_DIAGRAM_NODES = 3;

/**
 * Choose a representation, or choose none.
 *
 * The order of the branches IS the owner's priority: the learner's own material first, then a
 * validated request, then silence.
 */
export function routeVisual(input: VisualRouteInput): VisualRoute {
  // ── 1. The learner's own material, before anything we could draw ──────────────────────────
  //
  // 🔴 THIS RUNS BEFORE THE REQUEST IS EVEN LOOKED AT, AND THE ORDER IS THE DECISION. If a figure
  // in the source already shows this and the learner is being asked to locate a part of it, a
  // generated diagram of the same thing is a worse copy of material they already hold. A model
  // request arriving alongside it is discarded, not merged — two pictures for one question is the
  // dashboard §41 forbids.
  const figureRoute = sourceFigureRoute(input);
  if (figureRoute) return figureRoute;

  // ── 2. Nothing requested ──────────────────────────────────────────────────────────────────
  //
  // 🔴 THE MOST COMMON OUTCOME, AND IT IS CORRECT. The router invents nothing from a knowledge
  // object alone beyond the source figure above. Deriving a diagram from, say, a classification's
  // sibling classes would be the router deciding pedagogy from a payload shape, which is
  // `teaching-policy.ts`'s job and not this file's.
  if (input.request === undefined || input.request === null) {
    return {
      because: "no visual was requested and the material carries no figure of its own — prose is the representation",
      decision: "prose",
      reason: "nothing-to-show",
    };
  }

  // ── 3. A request must be well formed and safe ─────────────────────────────────────────────
  //
  // 🔴 REFUSED, NOT QUIETLY REPLACED. Substituting a different visual for a malformed one would
  // hide the fact that something upstream is producing bad requests — and substituting one for an
  // UNSAFE one would hide a probe at the security boundary. The caller renders its teaching text
  // either way; only the record differs, and the record is the point.
  //
  // 🔴 DEFENCE IN DEPTH TODAY, NOT THE LIVE REFUSAL PATH, AND THE DIFFERENCE IS WORTH STATING. A
  // stored `block.visual` has ALREADY been through this validator twice: `canvas-parse` drops an
  // invalid one rather than storing it, and `canvas-ops` refuses the whole op that would write one.
  // So `canvas-document` cannot hand this an invalid request, and the named refusals a model
  // actually receives come from `canvas-ops`, not from here. This branch exists for the caller that
  // does not yet exist and for the day one of those two filters is changed — which is exactly when
  // nobody will be looking.
  const validation = validateCanvasVisual(input.request);
  if (!validation.ok) {
    return {
      because: `the request was refused before anything was drawn: ${validation.detail}`,
      decision: "refused",
      detail: validation.detail,
      reason: validation.reason,
    };
  }
  const spec = validation.visual;

  // ── 4. A valid request must still EARN its place ──────────────────────────────────────────
  //
  // 🔴 VALID IS NOT THE SAME AS WORTH DRAWING, AND THIS IS THE HALF A VALIDATOR CANNOT DO. A
  // two-node graph and a single-x plot both pass every bound in `canvas-visual.ts` and both are
  // decoration. §41: *"A picture that cannot be answered against is decoration, and decoration
  // competes with the material for the attention §19 reserves for it."*
  // 🔴🔴 UNREACHABLE WITH TODAY'S CALLERS, AND SAID SO RATHER THAN COUNTED AS A WORKING RULE.
  // Reaching this needs a `request` AND a `knowledge` in the same call, and neither caller supplies
  // both: `canvas-policy-view` passes knowledge and no request (an `Exposition` is `{ mode }` and
  // deliberately carries no material), while `canvas-document` passes a request and has no
  // knowledge object to pass — a `CanvasBlock` carries `conceptIds`, which name COARSE objectives,
  // and one concept holds knowledge of several types at once. Picking one to call "this block's
  // knowledge" would invent a fact rather than read one.
  //
  // It stays because it is the right rule and the interface already admits it: the day a teaching
  // action carries a visual, this fires with no further change. What it must not do is appear in a
  // report as a routing rule that runs. `teaching-policy.ts` marks its provisional branch the same
  // way — "UNREACHABLE ON TODAY'S DATA, AND SAID SO RATHER THAN COUNTED AS COVERAGE" — and the
  // failure it guards against is this repo's most repeated one: implemented, merged, deployed, dead.
  if (input.knowledge?.type === "association") {
    return {
      because: `this is an arbitrary mapping, so there is no structure a picture could show — the work is making the link retrievable, not illustrating it`,
      decision: "prose",
      reason: "association-has-no-structure",
    };
  }

  if (spec.kind === "relationship" && spec.nodes.length < MIN_DIAGRAM_NODES) {
    return {
      because: `only ${spec.nodes.length} things stand in relation here, which a sentence states more directly than a diagram of it`,
      decision: "prose",
      reason: "too-few-relations",
    };
  }

  if (spec.kind === "quantitative" && !hasRange(spec)) {
    // 🔴 SPECIFICALLY THE UNDRAWABLE CASE, NOT AN OPINION ABOUT THE DATA. A flat line is refused
    // nowhere here: a value that does not change across a range is exactly the point of a
    // saturation curve or a rule that holds regardless of input. What cannot be drawn is a plot
    // where every point shares one x — the renderer's `(xMax - xMin || 1)` fallback would silently
    // stack the whole series on one vertical line and call it a chart.
    return {
      because: "every point sits at the same position on the x axis, so there is no range to plot along",
      decision: "prose",
      reason: "plot-has-no-range",
    };
  }

  return {
    because: `the request states what the learner should take from it and the ${spec.kind} renderer owns every pixel of it`,
    decision: "render",
    representation: spec.kind,
    spec,
  };
}

/**
 * The source-figure route, absorbed from `canvas-policy-view.tsx` (§41).
 *
 * Returns null when this route does not apply at all — no figure, no knowledge — so the caller
 * falls through to the rest of the router. Returns a `prose` decision when a figure IS present but
 * cannot host the interaction, because that is a different and more interesting fact: something was
 * available and specifically could not be used.
 */
function sourceFigureRoute(input: VisualRouteInput): VisualRoute | null {
  const figure = input.knowledge?.figure;
  if (!figure) return null;

  // 🔴 ONLY A `locate` OPERATION. Occluding a diagram asks "which part is this?" — if the learner
  // is being asked to explain a mechanism or produce a name, covering part of a picture answers a
  // question nobody asked. `openingOperation("spatial")` is `locate`, so this is the operation the
  // knowledge type mints; anything else means the objective moved on to a different demand.
  if (input.operation !== "locate") {
    return {
      because: `this knowledge carries a diagram, but the learner is being asked to ${input.operation ?? "do something else"} rather than locate a part of it`,
      decision: "prose",
      reason: "operation-is-not-spatial",
    };
  }

  // 🔴 NO PICTURE, NO OCCLUSION. `imageRef` names the figure inside its original container
  // (`ppt/media/image3.png`) and is not a URL; handing it to an `<img src>` — which an earlier
  // version of this rule did — makes the browser request a path from this application that has
  // never existed, so the learner got a broken image in the middle of a question.
  if (!figure.assetPath) {
    return {
      because: "this figure was parsed before its pixels were kept, so there is nothing to put on screen",
      decision: "prose",
      reason: "figure-has-no-asset",
    };
  }

  // A picture with a single named part is an illustration: cover its only label and the question
  // collapses to "what is this picture called", which is an association and is served by that lane.
  if (!isOccludable(figure.labels)) {
    return {
      because: "this figure names too few parts to ask where anything sits relative to anything else",
      decision: "prose",
      reason: "figure-not-occludable",
    };
  }

  const normalize = input.normalizeLabel ?? ((text: string) => text);
  const wanted = input.labelKey;
  const hidden = wanted === undefined
    ? undefined
    : figure.labels.find((label) => normalize(label.text) === wanted);

  // 🔴 NO FALLBACK TO "THE FIRST LABEL". If the objective names a part this figure does not have,
  // the two have drifted — a reparse, a better vision pass — and covering an arbitrary label would
  // ask a question the evidence will attribute to a different one. Showing the picture uncovered is
  // wrong too, so this renders no diagram at all and the prompt stands on its own.
  if (!hidden) {
    return {
      because: "the objective names a part this figure does not carry, so covering any other one would ask a question the evidence attributes elsewhere",
      decision: "prose",
      reason: "label-not-in-figure",
    };
  }

  return {
    because: `the source already contains the right picture, and hiding "${hidden.text}" turns the learner's own material into the retrieval`,
    decision: "render",
    figure,
    hidden,
    representation: "source_figure",
  };
}

/** Does this plot span any distance along x? */
function hasRange(spec: Extract<CanvasVisualRequest, { kind: "quantitative" }>): boolean {
  const xs = spec.series.flatMap((series) => series.points.map((point) => point.x));
  return new Set(xs).size > 1;
}
