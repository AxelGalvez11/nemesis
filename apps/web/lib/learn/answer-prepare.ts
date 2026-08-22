// The one thing that happens to a model's answer before anything parses it.
//
// 🔴 TWO PASSES, ONE SEAM, AND THE ORDER MATTERS. Structures resolve first, then plots compute,
// because resolving a name REWRITES the prose — `[compound: aspirin]` becomes `[smiles: CC(=O)…]` —
// and running the plot pass over the already-rewritten text keeps there being exactly one version of
// the answer at every point. Two seams in two files would have meant two chances for a caller to
// wire one and forget the other, which is the failure that left both of these layers unreachable for
// days after they were built.
//
// 🔴🔴 BOTH PASSES ARE FREE WHEN THERE IS NOTHING TO DO. Each begins with a substring test over the
// raw text, before any `JSON.parse` and before any network call, so a greeting, a correction, a
// flashcard and a lesson with neither a formula nor a compound in it pay two `String.includes` and
// nothing else. That is what made it safe to put this in the shared helper every canvas call goes
// through, rather than in the handful of paths somebody guessed would need it.
//
// 🔴 AND NEITHER PASS CAN FAIL A TURN. Both return the text they were given when anything goes
// wrong — no route, no network, bad JSON, a mismatched response. The picture is lost; the
// explanation that came with it is not.

import { collectComputedSeries, mightComputePlot } from "./computed-plot";
import { computePlots, type PlotComputeDeps } from "./plot-compute";
import { resolveStructures, type StructureLookupDeps } from "./structure-lookup";
import { collectCompoundNames, mightResolveStructure } from "./structure-resolve";

export interface AnswerDeps {
  readonly plots?: PlotComputeDeps;
  readonly structures?: StructureLookupDeps;
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

/** Model text in, model text out — with every formula and every named compound resolved. */
export async function prepareAnswer(
  text: string,
  deps: AnswerDeps = {},
  signal?: AbortSignal,
  onStep?: AnswerStep,
): Promise<string> {
  // 🔴 THE COUNTS COME FROM THE ANSWER ITSELF, NOT FROM A GUESS. `pendingStructures` and
  // `pendingPlots` are the same substring-then-walk the two passes already run, so a label saying
  // "three structures" is saying what is genuinely about to be looked up.
  const structures = onStep ? pendingStructures(text) : 0;
  if (structures > 0) onStep?.(structures === 1 ? "Looking up the structure" : `Looking up ${structures} structures`);
  const resolved = await resolveStructures(text, deps.structures, signal);
  if (structures > 0) onStep?.(null);

  const plots = onStep ? pendingPlots(resolved) : 0;
  if (plots > 0) onStep?.(plots === 1 ? "Working out the curve" : `Working out ${plots} curves`);
  const computed = await computePlots(resolved, deps.plots, signal);
  if (plots > 0) onStep?.(null);
  return computed;
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
