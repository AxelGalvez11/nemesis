import assert from "node:assert/strict";
import { test } from "node:test";

import { conceptIdentityKey } from "./concept-identity";
import {
  CURRICULUM_SEEDS,
  readCurriculum,
  skeletonInvalid,
  type CurriculumSkeleton,
} from "./curriculum-registry";

test("🔴 a subject resolves by any of its declared names, and by nothing else", () => {
  for (const name of ["General Chemistry", "general chemistry", "  gen chem ", "chemistry 101", "CHEM 101"]) {
    const found = readCurriculum(name);
    assert.equal(found.ok, true, `"${name}" did not resolve`);
    if (found.ok) assert.equal(found.skeleton.title, "General Chemistry");
  }
});

test("🔴🔴 a near-miss is a refusal, never the wrong subject's plan", () => {
  // "organic chemistry" overlaps "general chemistry" on most similarity measures, and resolving it
  // to the wrong course would hand a learner a plan for a subject they did not name — strictly
  // worse than the honest refusal the caller already renders.
  for (const wrong of ["organic chemistry", "chemistry", "biochemistry", "physics 101", ""]) {
    const found = readCurriculum(wrong);
    assert.equal(found.ok, false, `"${wrong}" resolved to a skeleton it should not have`);
    if (!found.ok) assert.equal(found.refusal, "no-curriculum-for-subject");
  }
});

test("🔴 the refusal carries a sentence, because a silent no is a dead control", () => {
  const found = readCurriculum("basket weaving");
  assert.equal(found.ok, false);
  if (!found.ok) assert.ok(found.detail.length > 0);
});

test("🔴 the seed count is a decision, not a drift", () => {
  // Growing this list is deliberate work reviewed in a diff — each of the owner's five subjects
  // arrives in its own slice, proving something the last did not. If you just added one: update
  // this number in the same change, on purpose.
  assert.equal(CURRICULUM_SEEDS.length, 1);
});

test("🔴 the first seed is honest about what it is", () => {
  const chem = CURRICULUM_SEEDS[0]!;
  // 🔴 provisional until a human who teaches the subject reviews it. Serving it as canonical
  // would be the silent promotion the maturity ladder exists to prevent.
  assert.equal(chem.maturity, "provisional");
  assert.equal(chem.provenance, "nemesis-authored");
  assert.ok(chem.nodes.length >= 8, "the seed is too small to prove hierarchy and ordering");
  // Every key is a real concept key in the skeleton's own domain.
  for (const node of chem.nodes) {
    assert.match(node.conceptKey, /^concept:v\d+:[0-9a-f]{16}$/, `${node.label} carries a malformed key`);
  }
  // It genuinely has hierarchy — the plan projection and the Minimap section both need one to prove.
  assert.ok(chem.nodes.some((node) => node.parentKey !== null), "the seed is flat, so grouping is untested");
});

test("🔴 every seed passes its own read-time validation", () => {
  for (const skeleton of CURRICULUM_SEEDS) {
    assert.equal(skeletonInvalid(skeleton), null, `${skeleton.title}: ${skeletonInvalid(skeleton)}`);
  }
});

// ── validation, proven red case by case ─────────────────────────────────────────────────────────

function skeleton(nodes: CurriculumSkeleton["nodes"]): CurriculumSkeleton {
  return {
    aliases: ["test subject"],
    domain: "testing",
    key: conceptIdentityKey({ domain: "testing", label: "test curriculum" }),
    maturity: "provisional",
    nodes,
    provenance: "nemesis-authored",
    title: "Test Subject",
    version: 1,
  };
}

const A = conceptIdentityKey({ domain: "testing", label: "a" });
const B = conceptIdentityKey({ domain: "testing", label: "b" });
const C = conceptIdentityKey({ domain: "testing", label: "c" });

function bare(conceptKey: string, label: string, parentKey: string | null = null) {
  return { aliases: [], conceptKey, label, outcomes: [], parentKey, position: 1 };
}

test("🔴 a duplicate key is refused by name", () => {
  assert.match(skeletonInvalid(skeleton([bare(A, "a"), bare(A, "also a")])) ?? "", /duplicate/);
});

test("🔴 a parent that is not a node is refused by name", () => {
  assert.match(skeletonInvalid(skeleton([bare(A, "a", B)])) ?? "", /parent that is not a node/);
});

test("🔴 a node cannot be its own parent", () => {
  assert.match(skeletonInvalid(skeleton([bare(A, "a", A)])) ?? "", /own parent/);
});

test("🔴 two levels at most — grouping, not a filesystem", () => {
  const three = skeleton([bare(A, "a"), bare(B, "b", A), bare(C, "c", B)]);
  assert.match(skeletonInvalid(three) ?? "", /two levels/);
});

test("🔴 a skeleton that fails validation is refused AT READ TIME, not merely in tests", () => {
  // The registry will one day be a table, and rows will not have been through this repo's CI. A
  // broken skeleton must refuse to serve, loudly, at the moment somebody asks for it.
  const broken = skeleton([bare(A, "a", B)]);
  const found = readCurriculum("test subject", [broken]);
  assert.equal(found.ok, false);
  if (!found.ok) assert.equal(found.refusal, "skeleton-invalid");
});
