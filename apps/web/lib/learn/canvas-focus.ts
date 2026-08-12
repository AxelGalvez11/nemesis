// Which territory the learner is working in.
//
// 🔴 THE LEARNER SELECTS THE TERRITORY; NEMESIS MANAGES THE PATH THROUGH IT
// (canvas-cognitive-runtime.md §11). Selecting "RAAS" sets a SCOPE. It does not select an
// operation, a difficulty, or a kind of card. The policy still decides what to do inside the
// scope — it may answer "you already retrieve these names quickly; your causal explanation is
// weak, start there".
//
// So this filters the CANDIDATE LIST and stops. `decideNext` receives fewer objectives and is
// otherwise untouched: it still arbitrates, still stateless, still free to choose. A scope that
// reached into the decision would be a curriculum wearing a Minimap's clothes (§14.7).
//
// 🔴 SESSION-LOCAL, NEVER PERSISTED. Where a learner was looking is not a fact about what they
// know. Storing it would put a UI preference inside the learner model, and the next reader could
// not tell it from evidence.
//
// PURE. No React, no I/O.

import type { ResolvedObjective } from "./canvas-knowledge";

/**
 * A territory.
 *
 * 🔴 TWO MEMBERS, AND THE MISSING THIRD IS A BRAIN CONTRACT, NOT AN OVERSIGHT. §11 asks for
 * "focus a parent topic" and "focus a child topic". Knowledge objects converge by `identityKey`
 * (knowledge-identity.ts) and carry NO parent/child relation; there is no territory entity
 * anywhere in the system. See `MISSING_TERRITORY_CONTRACT` below for exactly what is needed and
 * why deriving one from document headings would be worse than the gap.
 */
export type FocusScope =
  /** The whole canvas. Also what "clear focus" and "return to the recommended path" produce —
   *  they are the same state, because the adaptive path IS the unfiltered one. */
  | { kind: "canvas" }
  /** A named selection of knowledge the learner picked out of what this canvas actually holds. */
  | { kind: "selection"; label: string; identityKeys: readonly string[] };

export const WHOLE_CANVAS: FocusScope = { kind: "canvas" };

/**
 * 🔴 WHAT IS MISSING FROM THE BRAIN, STATED SO IT CANNOT BE QUIETLY INVENTED HERE.
 *
 * A hierarchical Minimap needs a relation between knowledge objects and named territories:
 * either a `territory` grouping on `KnowledgeObject` carrying a parent link, or a separate
 * territory entity with membership. It must also say whether one knowledge object may belong to
 * several territories, and whether the relation is derived per-canvas or converges across canvases
 * the way `identityKey` does.
 *
 * The tempting substitute is the document's heading path. It must not be used: a heading records
 * where text SAT, not what depends on what. "RAAS" as a slide title and "RAAS" as a causal
 * territory are different claims, and once a tree rendered from headings is on screen, its
 * wrongness is invisible — it looks exactly like a correct one.
 *
 * Until the contract exists, `selection` over objectives this canvas genuinely has is the honest
 * ceiling: it names real knowledge, and it invents no structure between the names.
 */
export const MISSING_TERRITORY_CONTRACT =
  "territory ↔ knowledge relation (parent/child, membership cardinality, per-canvas vs converged)";

/**
 * Narrow the candidates the policy will arbitrate over.
 *
 * 🔴 A FILTER THAT EMPTIES THE LIST RETURNS EVERYTHING INSTEAD. A scope naming knowledge this
 * canvas no longer holds — material detached, a stale selection, an identity that moved — would
 * otherwise produce zero candidates, and `decideNext` would answer `null`, and the surface would
 * say "nothing to practise here" about a canvas full of practisable material. Falling back to the
 * whole canvas is the same call `decideNext` already makes about `actedOn`: being shown something
 * outside your focus is a far smaller failure than a blank surface with no way forward.
 */
export function applyFocus(
  objectives: readonly ResolvedObjective[],
  scope: FocusScope,
): readonly ResolvedObjective[] {
  if (scope.kind === "canvas") return objectives;
  const wanted = new Set(scope.identityKeys);
  const inScope = objectives.filter((entry) => wanted.has(entry.objective.identityKey));
  return inScope.length > 0 ? inScope : objectives;
}

/** Whether a scope is actually narrowing anything — what the surface needs to say "focused". */
export function isFocused(scope: FocusScope): boolean {
  return scope.kind === "selection" && scope.identityKeys.length > 0;
}

/**
 * The territories a learner can choose between, built from what this canvas actually holds.
 *
 * 🔴 DERIVED FROM THE KNOWLEDGE, NOT FROM A TAXONOMY. There is no territory entity to read, so the
 * Minimap offers exactly what exists: the whole canvas, plus each distinct knowledge object the
 * policy could act on. That is flat, and it is honestly flat — it does not imply a hierarchy the
 * system cannot back up.
 */
export function availableTerritories(
  objectives: readonly ResolvedObjective[],
): readonly { label: string; identityKeys: readonly string[] }[] {
  const byLabel = new Map<string, string[]>();
  for (const entry of objectives) {
    // The knowledge object's own statement is what the learner recognises — it is the thing the
    // document said, not a name minted here.
    const label = entry.knowledge.statement;
    const keys = byLabel.get(label);
    if (keys) keys.push(entry.objective.identityKey);
    else byLabel.set(label, [entry.objective.identityKey]);
  }
  return [...byLabel].map(([label, identityKeys]) => ({ identityKeys, label }));
}
