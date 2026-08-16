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
import { semanticRelationsOf } from "./semantic-relations";

export type FocusScope =
  /** The whole canvas. Also what "clear focus" and "return to the recommended path" produce —
   *  they are the same state, because the adaptive path IS the unfiltered one. */
  | { kind: "canvas" }
  /** A named selection of knowledge the learner picked out of what this canvas actually holds. */
  | { kind: "selection"; label: string; identityKeys: readonly string[] };

export const WHOLE_CANVAS: FocusScope = { kind: "canvas" };

/** A recursive Minimap row. Children exist only when explicit semantic structure supports them. */
export interface AvailableTerritory {
  label: string;
  identityKeys: readonly string[];
  children?: readonly AvailableTerritory[];
}

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
 * A territory label, safe to paint on the Minimap.
 *
 * 🔴 THE LABEL IS SANITISED; THE STATEMENT UNDERNEATH IT IS NOT, AND THAT DIFFERENCE IS DELIBERATE.
 * A knowledge object built without a source header joins its two sides with an em dash —
 * `knowledge-extraction.ts` and `knowledge-territory.ts` both write `${left} — ${right}` when
 * nothing named the columns — and `entry.knowledge.statement` is also what
 * `knowledgeIdentityKey` (knowledge-identity.ts) hashes. Editing the dash out of the statement
 * itself would change that hash for every knowledge object of this shape ever extracted, which is
 * an identity migration, not a copy fix. So only the string actually painted here is touched.
 */
function displaySafe(label: string): string {
  return label.replace(/\s*[—–]\s*/g, ", ");
}

/**
 * The territories a learner can choose between, built from what this canvas actually holds.
 *
 * 🔴 DERIVED FROM KNOWLEDGE RELATIONS, NEVER DOCUMENT LAYOUT. Distinct knowledge objects are
 * leaves. A parent is introduced only when two or more leaves explicitly name the same parent,
 * category, or whole in the semantic substrate. Unsupported material therefore remains honestly
 * flat rather than acquiring a plausible-looking tree from headings.
 */
export function availableTerritories(objectives: readonly ResolvedObjective[]): readonly AvailableTerritory[] {
  const byLabel = new Map<string, { identityKeys: string[]; entries: ResolvedObjective[] }>();
  for (const entry of objectives) {
    // The knowledge object's own statement is what the learner recognises — it is the thing the
    // document said, not a name minted here. Grouped on the raw form; only the OUTPUT is sanitised,
    // so two statements differing only in dash style still do not collide into one chip by accident.
    const label = entry.knowledge.statement;
    const grouped = byLabel.get(label);
    if (grouped) {
      grouped.identityKeys.push(entry.objective.identityKey);
      grouped.entries.push(entry);
    } else byLabel.set(label, { entries: [entry], identityKeys: [entry.objective.identityKey] });
  }
  const leaves = [...byLabel].map(([rawLabel, grouped]) => ({
    entries: grouped.entries,
    territory: { identityKeys: grouped.identityKeys, label: displaySafe(rawLabel) } satisfies AvailableTerritory,
  }));

  // Only explicit semantic parent roles may create a tree. Document headings are location, not
  // knowledge structure, and never enter this adapter. Overlap is valid: one idea may belong to
  // several classifications, so a leaf can honestly appear below more than one parent.
  const childrenForParent = new Map<string, AvailableTerritory[]>();
  for (const leaf of leaves) {
    const parents = new Set<string>();
    for (const entry of leaf.entries) {
      for (const relation of semanticRelationsOf(entry.knowledge)) {
        if (relation.family !== "hierarchy" && relation.family !== "classification" && relation.family !== "part_whole") continue;
        for (const role of relation.roles) {
          const parentRole =
            (relation.family === "hierarchy" && (role.role === "parent" || role.role === "superordinate")) ||
            (relation.family === "classification" && role.role === "category") ||
            (relation.family === "part_whole" && role.role === "whole");
          if (parentRole && role.value.text.trim()) parents.add(displaySafe(role.value.text.trim()));
        }
      }
    }
    for (const parent of parents) {
      if (parent === leaf.territory.label) continue;
      const children = childrenForParent.get(parent);
      if (children) children.push(leaf.territory);
      else childrenForParent.set(parent, [leaf.territory]);
    }
  }

  const realGroups = [...childrenForParent].filter(([, children]) => children.length >= 2);
  const groupedLabels = new Set(realGroups.flatMap(([, children]) => children.map((child) => child.label)));
  const roots: AvailableTerritory[] = realGroups.map(([label, children]) => ({
    children,
    identityKeys: [...new Set(children.flatMap((child) => child.identityKeys))],
    label,
  }));
  roots.push(...leaves.filter((leaf) => !groupedLabels.has(leaf.territory.label)).map((leaf) => leaf.territory));
  return roots;
}
