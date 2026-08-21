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

import { computePlots, type PlotComputeDeps } from "./plot-compute";
import { resolveStructures, type StructureLookupDeps } from "./structure-lookup";

export interface AnswerDeps {
  readonly plots?: PlotComputeDeps;
  readonly structures?: StructureLookupDeps;
}

/** Model text in, model text out — with every formula and every named compound resolved. */
export async function prepareAnswer(text: string, deps: AnswerDeps = {}, signal?: AbortSignal): Promise<string> {
  const resolved = await resolveStructures(text, deps.structures, signal);
  return computePlots(resolved, deps.plots, signal);
}
