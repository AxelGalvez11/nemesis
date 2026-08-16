// Pure derivations for the Minimap panel (§H, docs/canvas-v1-acceptance.md). No React, no I/O —
// `MinimapControl` in canvas-controls.tsx is the only caller.
//
// 🔴 THIS FILE INVENTS NO LEARNER STATE (§23: "The Minimap owns no state. It reads the
// learner-state store."). `territoryMark` folds `projectLearnerState` — `learner-evidence.ts`,
// Brain's own projection — over each identity key a territory names, and reads only its
// `.status`. It does not re-derive what "established" or "developing" means, and it does not
// invent a rollup rule beyond the most conservative one available: see `territoryMark` below.
//
// 🔴 A TERRITORY WITH NO EVIDENCE GETS NO MARK AT ALL — NOT AN "UNESTABLISHED" ONE. Production
// sits at 164–229 knowledge objects (2026-08-15); most territories on a real canvas will never
// have been asked about in a given session. A dot on every one of them would be an empty
// progress bar wearing a Minimap's clothes, and `unknown` is explicitly not a point on a scale —
// UI-001. The absence of a mark is what makes that true visually, not merely in prose.

import type { FocusScope } from "@/lib/learn/canvas-focus";
import type { ExtractionOutcome } from "@/lib/learn/knowledge-extraction";
import type { CanvasCoverage } from "@/lib/learn/knowledge-coverage";
import { projectLearnerState, type LearnerEvidence } from "@/lib/learn/learner-evidence";

export type Territory = {
  label: string;
  identityKeys: readonly string[];
  children?: readonly Territory[];
};

/** The only two states the Minimap ever marks a territory with. `null` is the third, unmarked
 *  value — never rendered as a state, because it is not one Brain has reported. */
export type TerritoryMark = "developing" | "established";
export interface MarkedTerritory {
  label: string;
  identityKeys: readonly string[];
  mark: TerritoryMark | null;
  children?: readonly MarkedTerritory[];
}

/**
 * One territory's mark, folded from every objective it names.
 *
 * 🔴 NEVER ROUNDS UP, ON EITHER AXIS. `established` requires EVERY identity key the territory
 * names to read `correct` — not merely every key that happens to have been engaged. A territory
 * of two objectives where only one has ever been asked about is not "established with one
 * untested" when it is shown as one dot on a map; it is `developing`, the same as if that one
 * answer had been wrong. Getting this wrong the other way — folding only the engaged subset — was
 * caught by this file's own tests before it shipped: two objectives, one `correct` and one never
 * asked, produced `established`, which overclaims coverage nobody has. `canvas-focus.test.ts`
 * proves the multi-objective case is real (a pair's forward and backward recall directions can
 * share one territory), so this is not a theoretical branch.
 *
 * A territory returns `null` (no mark, not "unestablished") only when EVERY key is still
 * `unknown` — nothing in it has ever been engaged. In the overwhelming common case a territory
 * names exactly one objective, so this and "read that one objective's status" agree; the general
 * case is handled anyway rather than assumed away.
 */
export function territoryMark(
  identityKeys: readonly string[],
  evidence: readonly LearnerEvidence[],
): TerritoryMark | null {
  const statuses = identityKeys.map((key) => projectLearnerState(key, evidence).status);
  if (statuses.every((status) => status === "unknown")) return null;
  return statuses.every((status) => status === "correct") ? "established" : "developing";
}

/**
 * Which territory Nemesis would work on next, if the learner leaves their focus cleared.
 *
 * 🔴 READS `decision`, NEVER RANKS. There is no yield model
 * (canvas-cognitive-runtime.md §7 — "not implemented"), so this cannot mean "the highest-value
 * territory" and must not be labelled as though it does. It names whichever territory contains
 * the objective the policy already picked for the CURRENT decision — what happens next if the
 * learner does nothing. Only meaningful while nothing is manually focused: a learner who has
 * already narrowed the map has their own answer to "what next", and this stops speaking for them.
 */
export function recommendedTerritoryLabel(
  territories: readonly Territory[],
  decidedObjectiveKey: string | null,
  focus: FocusScope,
): string | null {
  if (focus.kind !== "canvas" || !decidedObjectiveKey) return null;
  return territories.find((territory) => territory.identityKeys.includes(decidedObjectiveKey))?.label ?? null;
}

/**
 * The two source-side facts H5 asks to be kept separate from learner state, and from each other.
 *
 * Both are canvas-wide, deliberately. `RUNTIME-005` is explicit that per-source coverage is
 * coarser than per-unit until `PARSER-003`'s locality reaches this layer, so neither fact is
 * attributed to any one territory — that would be a precision this layer does not have.
 */
export interface SourceDisclosure {
  /** Nemesis could not reliably read part or all of the material — `degraded` / `failed`. */
  readingGap: boolean;
  /** Nemesis read the material, but supported knowledge does not yet account for all of it. */
  unrepresented: boolean;
}

export function sourceDisclosure(
  outcome: ExtractionOutcome | "no-durable-source",
  coverage: CanvasCoverage,
): SourceDisclosure {
  return {
    readingGap: outcome === "degraded" || outcome === "failed",
    unrepresented: coverage.unrepresented > 0,
  };
}

/**
 * Display order for the territory tree. Structure is already evidence-backed by canvas-focus;
 * this function only adds learner-state marks and orders siblings.
 */
export function orderedTerritories(
  territories: readonly Territory[],
  evidence: readonly LearnerEvidence[],
  recommendedLabel: string | null,
): readonly MarkedTerritory[] {
  const marked: MarkedTerritory[] = territories.map(({ children, ...territory }) => ({
    ...territory,
    ...(children
      ? { children: orderedTerritories(children, evidence, recommendedLabel) }
      : {}),
    mark: territoryMark(territory.identityKeys, evidence),
  }));
  const rank = (entry: (typeof marked)[number]): number => {
    if (entry.label === recommendedLabel) return 0;
    if (entry.mark !== null) return 1;
    return 2;
  };
  return [...marked].sort((a, b) => rank(a) - rank(b));
}
