// The one thing that happens to a model's answer before anything parses it.
//
// 🔴 SIX PASSES, ONE SEAM, AND THE ORDER MATTERS ONLY WHERE STATED. Structures resolve first,
// then plots and surfaces compute, because resolving a name REWRITES the prose — `[compound:
// aspirin]` becomes `[smiles: CC(=O)…]` — and running the computing passes over the already-
// rewritten text keeps there being exactly one version of the answer at every point. Figures and
// macromolecules rewrite only their own `visual` objects and touch no prose, so they run after, in
// a fixed order chosen once. Six seams in six files would have meant six chances for a caller
// to wire some and forget the rest, which is the failure that left the first two layers
// unreachable for days after they were built.
//
// 🔴🔴 EVERY PASS IS FREE WHEN THERE IS NOTHING TO DO. Each begins with a substring test over the
// raw text, before any `JSON.parse` and before any network call, so a greeting, a correction, a
// flashcard and a lesson with none of these in it pay four `String.includes` and nothing else.
// That is what made it safe to put this in the shared helper every canvas call goes through,
// rather than in the handful of paths somebody guessed would need it.
//
// 🔴 AND NO PASS CAN FAIL A TURN. All return the text they were given when anything goes wrong —
// no route, no network, bad JSON, a mismatched response. The picture is lost; the explanation
// that came with it is not.

import { collectComputedSeries, mightComputePlot } from "./computed-plot";
import { collectSurfaceRequests, mightComputeSurface } from "./computed-surface";
import { computePlots, type PlotComputeDeps } from "./plot-compute";
import { computeSurfaces, type SurfaceComputeDeps } from "./surface-compute";
import { resolveFigures, type FigureLookupDeps } from "./figure-lookup";
import { collectFigureSubjects, mightResolveFigure } from "./figure-resolve";
import { resolveMacromolecules, type MacromoleculeLookupDeps } from "./macromolecule-lookup";
import { collectMacromoleculeNames, mightResolveMacromolecule } from "./macromolecule-resolve";
import { resolveStructures, type StructureLookupDeps } from "./structure-lookup";
import { collectCompoundNames, mightResolveStructure } from "./structure-resolve";

export interface AnswerDeps {
  readonly figures?: FigureLookupDeps;
  readonly macromolecules?: MacromoleculeLookupDeps;
  readonly plots?: PlotComputeDeps;
  readonly structures?: StructureLookupDeps;
  readonly surfaces?: SurfaceComputeDeps;
}

/**
 * What is running right now, or null when this pass is over.
 *
 * 🔴🔴 THESE STEPS WERE ALWAYS REAL AND ALWAYS INVISIBLE. A turn that draws aspirin makes a round
 * trip to PubChem; a turn that plots a curve makes one to our own evaluator. Both can take seconds,
 * and for the whole of them the learner saw the same word they saw while the model was writing —
 * so the product looked slower than it was and gave no clue what it was waiting on.
 *
 * 🔴 AND THEY ARE ALLOWED TO SAY SO PRECISELY BECAUSE THEY ARE RUNNING. `thinking-phases.ts` bans a
 * caption that is not the name of an executing step; that is a rule against invented sequences, not
 * against reporting. Each label below is emitted immediately before its own `await` and cleared
 * immediately after, so it cannot outlive the work it names.
 */
export type AnswerStep = (label: string | null) => void;

/**
 * Where the decision JSON sits inside a conversational turn.
 *
 * 🔴🔴 THE SAME PATTERN AS `turn-router.ts`'s OWN, AND IT HAS TO STAY THAT WAY. That file reads the
 * decision out of this block; this one has to hand the passes the identical bytes, or a turn gets
 * resolved in one shape and parsed in another. `answer-prepare.test.ts` holds the two together.
 */
const DECISION_BLOCK = /```json\s*\n?([\s\S]*?)```/;

/**
 * Model text in, model text out — with every formula, compound, figure and accession resolved.
 *
 * 🔴🔴🔴 THE FENCE IS UNWRAPPED FIRST, AND NOT DOING SO SILENTLY DISABLED ALL SIX PASSES IN EVERY
 * CONVERSATION. Each pass below is `JSON.parse(text)`-or-give-up, which was exactly right while a
 * turn WAS a JSON envelope. Then the contract changed so a conversational turn is a fenced ```json
 * block FOLLOWED BY PROSE — the change that let the model write `$$\frac{x^3}{3}$$` without JSON
 * escaping mangling it. From that moment `JSON.parse` threw on every conversational turn, each pass
 * took its "nothing to walk means nothing to do" branch, and the answer came back unchanged.
 *
 * Nothing errored. Three layers each did the safe thing: the passes returned the text untouched,
 * the validator then refused the unresolved figures ("a surface draws only from a computed grid,
 * and this one has none"), and the marker stayed in the prose so the learner could see something
 * was meant to be there. The visible result was `[figure 1]` and no picture — measured on
 * production 2026-08-24 for a plot, a circuit and the anatomy atlas, every one of which draws
 * correctly the moment the passes can see the JSON.
 *
 * 🔴🔴 AND THE PROSE GOES THROUGH THE PASSES TOO, WHICH THE FIRST VERSION OF THIS FIX MISSED. Two
 * of the six resolve MARKERS WRITTEN IN THE PROSE — `[compound: aspirin]` becomes `[smiles: …]`,
 * `[macromolecule: 2DN2]` becomes a viewer — and they find them by walking every string in the
 * parsed value. That worked while the prose lived INSIDE the object as `say`. It moved outside in
 * the same contract change, so walking only the block leaves those markers exactly as unresolved as
 * walking nothing did: measured on production, "show me aspirin" printed the literal text
 * `[compound: aspirin]`.
 *
 * So both halves are handed to the passes together, as one value they can walk — `{decision, prose}`
 * — and split back apart afterwards. Every pass already walks anything ("the same shape arrives
 * inside three different envelopes"), so this is a fourth envelope and needs no change in any of
 * them. Nothing is rewritten that a pass did not deliberately rewrite: when the passes change
 * nothing, the ORIGINAL text is returned byte-for-byte.
 */
export async function prepareAnswer(
  text: string,
  deps: AnswerDeps = {},
  signal?: AbortSignal,
  onStep?: AnswerStep,
): Promise<string> {
  const block = DECISION_BLOCK.exec(text);
  if (block) {
    let decision: unknown;
    try {
      decision = JSON.parse(block[1] ?? "");
    } catch {
      // An unparseable block is not ours to repair; `readTurnDecision` will refuse it too. Fall
      // through and let each pass's own guard decide, exactly as before.
      return prepareJson(text, deps, signal, onStep);
    }
    const before = text.slice(0, block.index);
    const after = text.slice(block.index + block[0].length);
    const bundled = JSON.stringify({ decision, prose: [before, after] });
    const prepared = await prepareJson(bundled, deps, signal, onStep);
    // 🔴 UNCHANGED MEANS UNTOUCHED. Re-serialising a turn nothing happened to would reformat the
    // model's own block for no reason, and every byte of this text is read by something.
    if (prepared === bundled) return text;
    try {
      const done = JSON.parse(prepared) as { decision: unknown; prose: [string, string] };
      return `${done.prose[0]}\`\`\`json\n${JSON.stringify(done.decision)}\n\`\`\`${done.prose[1]}`;
    } catch {
      return text;
    }
  }
  // A lesson job answers with bare JSON, and a rescued turn answers with prose. Both are handled
  // below exactly as before — the second by each pass's own parse guard.
  return prepareJson(text, deps, signal, onStep);
}

/** The six passes, over text that is expected to BE the JSON. */
async function prepareJson(
  text: string,
  deps: AnswerDeps,
  signal: AbortSignal | undefined,
  onStep: AnswerStep | undefined,
): Promise<string> {
  // 🔴 THE COUNTS COME FROM THE ANSWER ITSELF, NOT FROM A GUESS. Each is the same
  // substring-then-walk its pass already runs, so a label saying "three structures" is saying what
  // is genuinely about to be looked up.
  const structures = onStep ? pendingStructures(text) : 0;
  if (structures > 0) onStep?.(structures === 1 ? "Looking up the structure" : `Looking up ${structures} structures`);
  const resolved = await resolveStructures(text, deps.structures, signal);
  if (structures > 0) onStep?.(null);

  const plots = onStep ? pendingPlots(resolved) : 0;
  if (plots > 0) onStep?.(plots === 1 ? "Working out the curve" : `Working out ${plots} curves`);
  const flat = await computePlots(resolved, deps.plots, signal);
  if (plots > 0) onStep?.(null);

  const surfaces = onStep ? pendingSurfaces(flat) : 0;
  if (surfaces > 0) onStep?.(surfaces === 1 ? "Working out the surface" : `Working out ${surfaces} surfaces`);
  const computed = await computeSurfaces(flat, deps.surfaces, signal);
  if (surfaces > 0) onStep?.(null);

  const figures = onStep ? pendingFigures(computed) : 0;
  if (figures > 0) onStep?.(figures === 1 ? "Finding a licensed picture" : `Finding ${figures} licensed pictures`);
  const pictured = await resolveFigures(computed, deps.figures, signal);
  if (figures > 0) onStep?.(null);

  const molecules = onStep ? pendingMacromolecules(pictured) : 0;
  if (molecules > 0) {
    onStep?.(molecules === 1 ? "Looking up the 3D structure" : `Looking up ${molecules} 3D structures`);
  }
  const shaped = await resolveMacromolecules(pictured, deps.macromolecules, signal);
  if (molecules > 0) onStep?.(null);

  return shaped;
}

/** How many compounds this answer asks to have looked up. Cheap, and exact. */
function pendingStructures(text: string): number {
  if (!mightResolveStructure(text)) return 0;
  try {
    return collectCompoundNames(JSON.parse(text)).length;
  } catch {
    return 0;
  }
}

/** How many curves this answer asks to have computed. */
function pendingPlots(text: string): number {
  if (!mightComputePlot(text)) return 0;
  try {
    return collectComputedSeries(JSON.parse(text)).length;
  } catch {
    return 0;
  }
}

/** How many surfaces this answer asks to have computed. */
function pendingSurfaces(text: string): number {
  if (!mightComputeSurface(text)) return 0;
  try {
    return collectSurfaceRequests(JSON.parse(text)).length;
  } catch {
    return 0;
  }
}

/** How many licensed pictures this answer asks to have found. */
function pendingFigures(text: string): number {
  if (!mightResolveFigure(text)) return 0;
  try {
    return collectFigureSubjects(JSON.parse(text)).length;
  } catch {
    return 0;
  }
}

/** How many macromolecules this answer asks to have looked up. */
function pendingMacromolecules(text: string): number {
  if (!mightResolveMacromolecule(text)) return 0;
  try {
    return collectMacromoleculeNames(JSON.parse(text)).length;
  } catch {
    return 0;
  }
}
