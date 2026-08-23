// The Curriculum Registry — canonical skeletons of how a subject is learned.
//
// 🔴🔴 A SKELETON IS STRUCTURE, NEVER LESSONS. It holds concepts, grouping, order and outcomes —
// "what does competent understanding of this subject contain, and in what shape" — and it holds no
// prose, no questions, no fixed sequence of interactions and no learner state. The owner's rule:
// *"The curriculum defines the territory. DeepSeek teaches through that territory adaptively."*
// Non-goal 7 of docs/canvas-cognitive-runtime.md stands unbroken: nothing here reaches
// `decideNext`, and an ordering that walked every learner through the same steps would be the
// six-stage machine rebuilt one level up.
//
// 🔴 WHY THIS EXISTS, MEASURED. `canvas-territory.ts` records production numbers: opening one topic
// canvas three times produced knowledge objects 2 → 26 → 50 and objectives 4 → 51 → 99, every
// identity key distinct — the model genuinely resamples a subject every time it is asked. A
// curriculum request that regenerated "what does general chemistry contain" per learner would pay
// that cost forever and converge on nothing. The registry is the once-per-subject answer.
//
// 🔴 CHECKED IN, NOT A TABLE, FOR THE SAME REASON `REFERENCE_REGISTRY` IS. A registry row is a
// claim somebody can be asked about; a checked-in array is auditable in review, versioned in git,
// testable offline, and cannot drift from the code that reads it. The `core_source_license_versions`
// migration exists for EXTERNAL sources at scale; the seed skeletons are Nemesis-authored and small.
// When the corpus outgrows this file, the reader's contract (`readCurriculum`) is the seam a table
// slots in behind — callers never see which one answered. The injected `registry` parameter is the
// test seam, exactly as `ReferenceDeps.registry` is.
//
// 🔴 MATURITY IS A LADDER AND ONE GENERATED COURSE NEVER CLIMBS IT SILENTLY. `provisional` is
// machine-built from approved evidence; `reviewed` passed checks; `canonical` is the trusted
// default. Owner: *"Do not allow one generated Course to silently become the canonical curriculum.
// A niche Course may remain provisional indefinitely."* Nothing in this module writes.
//
// PURE. No React, no I/O, no model call.

import { conceptIdentityKey, conceptSurfaceKey, conceptSurfaceKeys } from "./concept-identity";

/** How trusted a skeleton is. See the header — one generated course never climbs this silently. */
export type CurriculumMaturity = "provisional" | "reviewed" | "canonical";

/**
 * One node of a skeleton: a concept, placed.
 *
 * 🔴 NO PREREQUISITE EDGES, AND THAT IS A DECISION WITH A DATE ON IT. v1's plan governs scope; the
 * acquisition queue that would consume a cross-node dependency graph cannot exist until
 * `territoryReuse` is keyed on subject (see canvas-knowledge.ts's own filing of that gap), and a
 * dependency table with no consumer is non-goal 10 — "a promise the schema cannot keep". The edges
 * return in the same change as their consumer. `position` is the AUTHOR'S stated order, which is a
 * fact about the skeleton, not an instruction to the teacher.
 */
export interface CurriculumNode {
  /** `concept:v1:<hash>` — see concept-identity.ts. THE identity; label and aliases are display. */
  readonly conceptKey: string;
  readonly label: string;
  /** Other surface forms this concept answers to, so a canvas's own text can be matched to it. */
  readonly aliases: readonly string[];
  /** Grouping parent within THIS skeleton, or null at the top. Two levels at most — grouping, not
   *  a filesystem. The same depth rule `folders_depth_guard` enforces for folders. */
  readonly parentKey: string | null;
  /** The author's stated order among siblings. */
  readonly position: number;
  /** What competence at this node looks like, in the learner's terms. Display and audit only —
   *  nothing mechanical consumes these in v1, and none of them is an instruction to the teacher. */
  readonly outcomes: readonly string[];
}

export interface CurriculumSkeleton {
  /** `curriculum:v1:<hash of domain+title>` — stable across edits to the nodes. */
  readonly key: string;
  readonly title: string;
  /** The concept-identity domain every node's key was minted under. */
  readonly domain: string;
  /** Surface forms a learner might name this whole subject by. */
  readonly aliases: readonly string[];
  readonly maturity: CurriculumMaturity;
  /**
   * Where this skeleton came from, stated so it can be challenged.
   *
   * 🔴 "nemesis-authored" IS AN HONEST PROVENANCE, NOT A DODGE. The owner's own list of curriculum
   * sources ends with *"Nemesis-authored synthesis from approved sources"*. Facts about a field —
   * that stoichiometry builds on the mole concept — are nobody's property; what would need a
   * licence is copying another publisher's ARRANGEMENT AND WORDING, which is exactly what an
   * authored skeleton does not do. An externally-seeded skeleton names its `core_sources` row here
   * and must have passed `admitSource` before its material was read.
   */
  readonly provenance: string;
  /** Bumped when the node set changes, so a stored plan can say which version it was cut from. */
  readonly version: number;
  readonly nodes: readonly CurriculumNode[];
}

export type CurriculumRefusal =
  /** The registry holds nothing for this subject. The honest and common answer. */
  | "no-curriculum-for-subject"
  /** The skeleton exists and is malformed — a parent that is not a node, a duplicate key. Named
   *  loudly because a silently-dropped node would read as "covered" when it is not. */
  | "skeleton-invalid";

export type CurriculumLookup =
  | { readonly ok: true; readonly skeleton: CurriculumSkeleton }
  | { readonly ok: false; readonly refusal: CurriculumRefusal; readonly detail: string };

/**
 * Find the skeleton for a subject the learner named.
 *
 * 🔴 EXACT SURFACE-KEY MATCH ON THE SKELETON'S OWN ALIASES, NEVER SIMILARITY. "organic chemistry"
 * must not resolve to General Chemistry because the strings overlap — a near-miss that returns the
 * wrong subject's plan is strictly worse than `no-curriculum-for-subject`, which the caller already
 * handles honestly. The alias list is the skeleton author's explicit claim about what names it
 * answers to, and `conceptSurfaceKey` is the same normaliser every other join in this system uses.
 */
export function readCurriculum(
  subject: string,
  registry: readonly CurriculumSkeleton[] = CURRICULUM_SEEDS,
): CurriculumLookup {
  const wanted = conceptSurfaceKey(subject);
  if (!wanted) {
    return { detail: "no subject was named", ok: false, refusal: "no-curriculum-for-subject" };
  }
  for (const skeleton of registry) {
    const answers = new Set(conceptSurfaceKeys({ aliases: skeleton.aliases, label: skeleton.title }));
    if (!answers.has(wanted)) continue;
    const invalid = skeletonInvalid(skeleton);
    if (invalid) return { detail: invalid, ok: false, refusal: "skeleton-invalid" };
    return { ok: true, skeleton };
  }
  return {
    detail: `Nemesis has no curriculum for "${subject}" yet`,
    ok: false,
    refusal: "no-curriculum-for-subject",
  };
}

/**
 * Structural validation, run at READ time so a bad seed cannot serve.
 *
 * 🔴 AT READ TIME AND NOT ONLY IN A TEST, because the registry will one day be a table and rows
 * will not have been through this repo's CI. The rules are the owner's own validation list:
 * every parent references a real node, no cycles, every key resolves, no duplicates.
 */
export function skeletonInvalid(skeleton: CurriculumSkeleton): string | null {
  const keys = new Set<string>();
  for (const node of skeleton.nodes) {
    if (keys.has(node.conceptKey)) return `duplicate concept key ${node.conceptKey} (${node.label})`;
    keys.add(node.conceptKey);
  }
  for (const node of skeleton.nodes) {
    if (node.parentKey === null) continue;
    if (node.parentKey === node.conceptKey) return `${node.label} is its own parent`;
    if (!keys.has(node.parentKey)) return `${node.label} names a parent that is not a node`;
  }
  // Two levels: a parent may not itself have a parent. Same rule, same reason, as folders_depth_guard.
  const parentOf = new Map(skeleton.nodes.map((node) => [node.conceptKey, node.parentKey]));
  for (const node of skeleton.nodes) {
    const above = node.parentKey ? parentOf.get(node.parentKey) : null;
    if (above) return `${node.label} nests more than two levels deep`;
  }
  return null;
}

// ─── seeds ──────────────────────────────────────────────────────────────────────────────────────

/** Shorthand for minting a seed node in one domain. Keeps the seed readable enough to review. */
function node(
  domain: string,
  label: string,
  input: { aliases?: readonly string[]; outcomes?: readonly string[]; parent?: string; position: number },
): CurriculumNode {
  return {
    aliases: input.aliases ?? [],
    conceptKey: conceptIdentityKey({ domain, label }),
    label,
    outcomes: input.outcomes ?? [],
    parentKey: input.parent ? conceptIdentityKey({ domain, label: input.parent }) : null,
    position: input.position,
  };
}

const CHEM = "chemistry";

/**
 * General Chemistry — the first end-to-end proof, owner-designated 2026-08-23.
 *
 * 🔴 `provisional`, AND IT STAYS provisional UNTIL A HUMAN REVIEWS IT. It was authored for this
 * slice, not reviewed by anyone who teaches the subject. Serving it as `canonical` would be the
 * exact silent promotion the maturity ladder exists to prevent.
 *
 * 🔴 THE STRUCTURE IS SYNTHESISED, NOT COPIED. "Atomic structure before bonding before
 * stoichiometry" is how the field itself is ordered — a fact, like alphabetical order, that every
 * textbook shares because chemistry shares it. No publisher's table of contents was reproduced;
 * compare any two and they differ in exactly the ways this one differs from both.
 */
const GENERAL_CHEMISTRY: CurriculumSkeleton = {
  aliases: ["general chemistry", "gen chem", "intro chemistry", "chemistry 101", "chem 101"],
  domain: CHEM,
  key: conceptIdentityKey({ domain: CHEM, label: "general chemistry curriculum" }),
  maturity: "provisional",
  nodes: [
    node(CHEM, "Atomic structure", {
      outcomes: ["describe what protons, neutrons and electrons do", "read a periodic table entry"],
      position: 1,
    }),
    node(CHEM, "Electron configuration", {
      aliases: ["electron configurations", "orbitals"],
      outcomes: ["write the configuration of a main-group element", "explain why noble gases are stable"],
      parent: "Atomic structure",
      position: 1,
    }),
    node(CHEM, "Periodic trends", {
      aliases: ["periodicity"],
      outcomes: ["predict which of two elements is more electronegative, and say why"],
      parent: "Atomic structure",
      position: 2,
    }),
    node(CHEM, "Chemical bonding", {
      aliases: ["bonding"],
      outcomes: ["tell ionic from covalent bonding and predict which a pair of elements forms"],
      position: 2,
    }),
    node(CHEM, "Lewis structures", {
      outcomes: ["draw a Lewis structure for a small molecule, charges included"],
      parent: "Chemical bonding",
      position: 1,
    }),
    node(CHEM, "Molecular geometry", {
      aliases: ["vsepr"],
      outcomes: ["predict a small molecule's shape from its Lewis structure"],
      parent: "Chemical bonding",
      position: 2,
    }),
    node(CHEM, "Intermolecular forces", {
      aliases: ["imf"],
      outcomes: ["rank boiling points from the forces between molecules"],
      parent: "Chemical bonding",
      position: 3,
    }),
    node(CHEM, "Stoichiometry", {
      aliases: ["mole calculations"],
      outcomes: ["balance an equation and compute how much product a given amount of reactant yields"],
      position: 3,
    }),
    node(CHEM, "Thermochemistry", {
      aliases: ["enthalpy"],
      outcomes: ["say whether a reaction absorbs or releases heat, from data"],
      position: 4,
    }),
    node(CHEM, "Chemical equilibrium", {
      aliases: ["equilibrium"],
      outcomes: ["predict which way a disturbed equilibrium shifts, and say why"],
      position: 5,
    }),
    node(CHEM, "Acids and bases", {
      aliases: ["acid-base chemistry", "ph"],
      outcomes: ["compute the pH of a strong acid solution", "explain what a buffer does"],
      position: 6,
    }),
    node(CHEM, "Electrochemistry", {
      aliases: ["redox", "oxidation and reduction"],
      outcomes: ["assign oxidation states and identify what is oxidised and what is reduced"],
      position: 7,
    }),
  ],
  provenance: "nemesis-authored",
  title: "General Chemistry",
  version: 1,
};

/**
 * Every skeleton the registry serves.
 *
 * 🔴 ONE SEED, DELIBERATELY. The owner's five subjects arrive one per slice, each proving something
 * the last did not — adding four more copies of the same shape before the first has been read end
 * to end would be coverage theatre. The count is asserted in the test file so growing this list is
 * a decision someone makes in a diff, not a drive-by.
 */
export const CURRICULUM_SEEDS: readonly CurriculumSkeleton[] = [GENERAL_CHEMISTRY];
