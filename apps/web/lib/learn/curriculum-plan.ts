// A COURSE: one curriculum skeleton, cut for one canvas, persisted on its territory marker.
//
// 🔴🔴 THE PLAN GOVERNS SCOPE, NEVER THE NEXT MOVE. Owner ruling, 2026-08-23: the Curriculum
// Planner decides "where are we going"; the existing teaching controller keeps deciding "what is
// the best next learning interaction". Nothing in this module reaches `decideNext`, touches
// arbitration weights, or stores an ordering the policy consults — non-goal 7 stands. A plan node
// the learner clicks becomes an ordinary `FocusScope`, which filters candidates and stops, exactly
// as clicking a knowledge territory already does.
//
// 🔴 IT LIVES ON `CanvasTerritory`, NOT IN A NEW COLUMN. `canvas-knowledge.ts` filed the remedy for
// multi-subject canvases in its own words — "making it right needs THE MARKER to hold an
// accumulating set of subjects" — and a second jsonb column with its own reuse predicate would be
// the second independent retry system `canvas-territory.ts` forbids in bold. One marker, one
// `markerStands`, one `force`.
//
// 🔴 IT CARRIES NO LEARNER STATE AND NO ACQUISITION STATE. There is no `progress`, no `mastery`,
// and no `acquired` flag — each was in an earlier draft and each is a stored interpretation of
// state that lives elsewhere (non-goal 9: "store what was measured; decide what it means where the
// decision can be changed"). Whether a canvas holds material for a node is COMPUTED at read time by
// `resolvePlanScope`; what the learner has shown is projected by `projectLearnerState`, reached
// only through `territoryMark`.
//
// PURE. No React, no I/O.

import { conceptSurfaceKey, conceptSurfaceKeys } from "./concept-identity";
import type { CurriculumSkeleton } from "./curriculum-registry";
import type { FocusScope } from "./canvas-focus";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import { normalizeForIdentity } from "./knowledge-identity";

/** One node of the plan, as stored. Display facts and identity — nothing else. */
export interface PlanNode {
  /** `concept:v1:<hash>` — the registry's identity for this concept. */
  readonly conceptKey: string;
  readonly label: string;
  /** Surface forms, carried so resolution does not need the registry at read time. */
  readonly aliases: readonly string[];
  /** Grouping parent within the plan, or null at the top. Grouping only, two levels. */
  readonly parentKey: string | null;
  /** The skeleton author's stated order. Presentation keeps it; nothing arbitrates by it. */
  readonly position: number;
}

export interface CurriculumPlan {
  /** Which skeleton this was cut from, and which version of it. */
  readonly curriculumKey: string;
  readonly curriculumVersion: number;
  readonly title: string;
  /** The maturity the skeleton had when applied. Shown, so a provisional plan says so. */
  readonly maturity: string;
  /** ISO — when the plan was applied to this canvas. */
  readonly appliedAt: string;
  readonly nodes: readonly PlanNode[];
}

/** Cut a plan from a skeleton. The whole skeleton in v1 — scoping to a syllabus is later work. */
export function planFromSkeleton(skeleton: CurriculumSkeleton, appliedAt: string): CurriculumPlan {
  return {
    appliedAt,
    curriculumKey: skeleton.key,
    curriculumVersion: skeleton.version,
    maturity: skeleton.maturity,
    nodes: skeleton.nodes.map((node) => ({
      aliases: node.aliases,
      conceptKey: node.conceptKey,
      label: node.label,
      parentKey: node.parentKey,
      position: node.position,
    })),
    title: skeleton.title,
  };
}

/**
 * A plan node → the objective identity keys this canvas ACTUALLY holds for it.
 *
 * 🔴 IT SCANS THE CANVAS, IT DOES NOT WALK A JOIN. There is deliberately no canvas→knowledge lookup
 * table, so this reads what `ensureKnowledgeForCanvas` already resolved — the same list the policy
 * arbitrates over, filtered the same way `availableTerritories` groups.
 *
 * 🔴 THE COVERAGE IS STATED RATHER THAN CLAIMED. A concept is recognised in a pair's two sides, a
 * causal relation's two node keys, and the knowledge object's normalised statement — the fields
 * that already reduce through `causalNodeKey`/`normalizeForIdentity`. A `procedure`'s steps are
 * reached through their parent object's statement, never through the synthetic `#step#N` key,
 * which is a position and not a word. A node the scan does not recognise is `no-material-yet`,
 * which is an honest source gap — NOT a claim about the learner, and never rendered as one.
 */
export function resolvePlanScope(
  node: PlanNode,
  objectives: readonly ResolvedObjective[],
): { reachable: true; scope: FocusScope } | { reachable: false; reason: "no-material-yet" } {
  const wanted = new Set(conceptSurfaceKeys({ aliases: node.aliases, label: node.label }));
  const identityKeys = objectives
    .filter((entry) => recognises(entry.knowledge, wanted))
    .map((entry) => entry.objective.identityKey);
  if (identityKeys.length === 0) return { reachable: false, reason: "no-material-yet" };
  return { reachable: true, scope: { identityKeys, kind: "selection", label: node.label } };
}

function recognises(knowledge: KnowledgeObject, keys: ReadonlySet<string>): boolean {
  if (knowledge.pair) {
    if (keys.has(conceptSurfaceKey(knowledge.pair.left))) return true;
    if (keys.has(conceptSurfaceKey(knowledge.pair.right))) return true;
  }
  if (knowledge.relation) {
    if (keys.has(knowledge.relation.cause.key)) return true;
    if (keys.has(knowledge.relation.effect.key)) return true;
  }
  return keys.has(normalizeForIdentity(knowledge.statement));
}

/**
 * The plan, shaped for the Minimap — a second, separately-labelled tree, never merged into
 * `availableTerritories`.
 *
 * 🔴 THE TWO TREES HAVE DIFFERENT JUSTIFICATIONS AND MUST STAY VISIBLY DIFFERENT THINGS.
 * `availableTerritories` earns a parent only when the material's own explicit semantic relations
 * support one — evidence-backed grouping. A plan's structure is an AUTHOR'S claim about the
 * subject. Laundering the second through the first would leave the next reader believing the
 * curriculum was derived from the learner's material, which is precisely the provenance confusion
 * this repo keeps spending weeks digging out of.
 *
 * 🔴 A NODE WITH NO MATERIAL YIELDS `identityKeys: []`, WHICH `territoryMark` MARKS AS NOTHING —
 * not "unestablished", nothing. The caller renders those rows unfocusable: `applyFocus` returns
 * EVERYTHING when a filter empties, so focusing an empty node would silently focus the whole
 * canvas, a control that appears to work and does something else.
 */
export interface PlanTerritory {
  readonly label: string;
  readonly identityKeys: readonly string[];
  /** False when the canvas holds no material for this node — an honest source gap. */
  readonly reachable: boolean;
  readonly children?: readonly PlanTerritory[];
}

export function planTerritories(
  plan: CurriculumPlan,
  objectives: readonly ResolvedObjective[],
): readonly PlanTerritory[] {
  const bottom = (node: PlanNode): PlanTerritory => {
    const resolved = resolvePlanScope(node, objectives);
    return {
      identityKeys: resolved.reachable ? resolved.scope.kind === "selection" ? resolved.scope.identityKeys : [] : [],
      label: node.label,
      reachable: resolved.reachable,
    };
  };

  const roots = [...plan.nodes].filter((node) => node.parentKey === null).sort((a, b) => a.position - b.position);
  return roots.map((root) => {
    const children = [...plan.nodes]
      .filter((node) => node.parentKey === root.conceptKey)
      .sort((a, b) => a.position - b.position)
      .map(bottom);
    const own = bottom(root);
    if (children.length === 0) return own;
    // A parent's keys are its children's pooled keys plus its own — same fold direction as
    // `territoryMark`, which ANDs over every member and never rounds up.
    const pooled = [...new Set([...own.identityKeys, ...children.flatMap((child) => child.identityKeys)])];
    return {
      children,
      identityKeys: pooled,
      label: own.label,
      reachable: own.reachable || children.some((child) => child.reachable),
    };
  });
}

/**
 * Read a stored plan back off the marker, field by field.
 *
 * 🔴 THE SAME HAND-WRITTEN RECONSTRUCTION `readTerritory` DOES, FOR THE SAME REASON — and it is
 * called FROM there. A malformed plan reads as ABSENT, never as partially present: a plan whose
 * nodes half-survived storage would render a curriculum with silent holes, and a missing plan
 * merely renders the Minimap the canvas had yesterday.
 */
export function readCurriculumPlan(value: unknown): CurriculumPlan | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.curriculumKey !== "string" || !row.curriculumKey.trim()) return null;
  if (typeof row.curriculumVersion !== "number" || !Number.isFinite(row.curriculumVersion)) return null;
  if (typeof row.title !== "string" || !row.title.trim()) return null;
  if (typeof row.maturity !== "string" || !row.maturity.trim()) return null;
  if (typeof row.appliedAt !== "string" || !row.appliedAt.trim()) return null;
  if (!Array.isArray(row.nodes) || row.nodes.length === 0) return null;
  const nodes: PlanNode[] = [];
  for (const raw of row.nodes) {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.conceptKey !== "string" || !entry.conceptKey.trim()) return null;
    if (typeof entry.label !== "string" || !entry.label.trim()) return null;
    if (typeof entry.position !== "number" || !Number.isFinite(entry.position)) return null;
    const parentKey = typeof entry.parentKey === "string" && entry.parentKey.trim() ? entry.parentKey : null;
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias): alias is string => typeof alias === "string")
      : null;
    if (aliases === null) return null;
    nodes.push({ aliases, conceptKey: entry.conceptKey, label: entry.label, parentKey, position: entry.position });
  }
  return {
    appliedAt: row.appliedAt,
    curriculumKey: row.curriculumKey,
    curriculumVersion: row.curriculumVersion,
    maturity: row.maturity,
    nodes,
    title: row.title,
  };
}
