import assert from "node:assert/strict";
import { test } from "node:test";

import { conceptIdentityKey, conceptSurfaceKeys } from "./concept-identity";
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
  // "physical chemistry" overlaps "general chemistry" on most similarity measures, and resolving
  // it to the wrong course would hand a learner a plan for a subject they did not name — strictly
  // worse than the honest refusal the caller already renders. (When the library GAINED organic
  // chemistry and biochemistry, those names moved from this list to their own courses — which is
  // this same rule succeeding: a name resolves to its own subject or to nothing, never to a
  // neighbour.)
  for (const wrong of ["physical chemistry", "inorganic chemistry", "chemistry", "quantum mechanics 2", ""]) {
    const found = readCurriculum(wrong);
    assert.equal(found.ok, false, `"${wrong}" resolved to a skeleton it should not have`);
    if (!found.ok) assert.equal(found.refusal, "no-curriculum-for-subject");
  }
  // And the two that used to sit in the refusal list now land on their OWN skeletons.
  for (const [name, own] of [["organic chemistry", "Organic Chemistry"], ["biochemistry", "Biochemistry"]] as const) {
    const found = readCurriculum(name);
    assert.equal(found.ok, true, `"${name}" no longer resolves at all`);
    if (found.ok) assert.equal(found.skeleton.title, own);
  }
});

test("🔴 the refusal carries a sentence, because a silent no is a dead control", () => {
  const found = readCurriculum("basket weaving");
  assert.equal(found.ok, false);
  if (!found.ok) assert.ok(found.detail.length > 0);
});

test("🔴 the seed count is a decision, not a drift", () => {
  // 103 = General Chemistry (longhand, the founding proof) + the 102-course library sweep the
  // owner ordered on 2026-08-23 ("aren't you supposed to be building everything at once?").
  // If you just added or removed one: update this number in the same change, on purpose.
  assert.equal(CURRICULUM_SEEDS.length, 103);
});

// ── the library, as a whole ─────────────────────────────────────────────────────────────────────

test("🔴🔴 every name resolves to exactly ONE course — a shared alias serves whoever is listed first", () => {
  // Found live before this guard existed: "micro" was claimed by Microbiology AND Microeconomics,
  // and a biology student would silently have received an economics course. Ambiguous short names
  // belong to the clarify question, not to whichever file loads first.
  const claimed = new Map<string, string>();
  for (const skeleton of CURRICULUM_SEEDS) {
    for (const name of conceptSurfaceKeys({ aliases: skeleton.aliases, label: skeleton.title })) {
      const holder = claimed.get(name);
      assert.ok(
        holder === undefined || holder === skeleton.title,
        `"${name}" is claimed by both ${holder} and ${skeleton.title}`,
      );
      claimed.set(name, skeleton.title);
    }
  }
});

test("🔴 every curriculum key is distinct — two courses cannot share an identity", () => {
  const keys = new Map<string, string>();
  for (const skeleton of CURRICULUM_SEEDS) {
    assert.ok(!keys.has(skeleton.key), `${skeleton.title} shares a key with ${keys.get(skeleton.key)}`);
    keys.set(skeleton.key, skeleton.title);
  }
});

test("🔴 the whole library is provisional and nemesis-authored — the sweep smuggled nothing up the ladder", () => {
  for (const skeleton of CURRICULUM_SEEDS) {
    assert.equal(skeleton.maturity, "provisional", `${skeleton.title} climbed the maturity ladder in a bulk sweep`);
    assert.equal(skeleton.provenance, "nemesis-authored", `${skeleton.title} claims a provenance no one attested`);
    assert.ok(skeleton.nodes.length >= 6, `${skeleton.title} is too thin to be a course (${skeleton.nodes.length} nodes)`);
  }
});

test("🔴 the names students actually type reach the right course", () => {
  for (const [asked, expected] of [
    ["ap biology", "General Biology"],
    ["calc 2", "Calculus II"],
    ["orgo", "Organic Chemistry"],
    ["apush", "US History"],
    ["med surg", "Medical-Surgical Nursing"],
    ["spanish", "Spanish"],
    ["torts", "Torts"],
    ["dsa", "Data Structures and Algorithms"],
  ] as const) {
    const found = readCurriculum(asked);
    assert.equal(found.ok, true, `"${asked}" did not resolve`);
    if (found.ok) assert.equal(found.skeleton.title, expected, `"${asked}" resolved to ${found.skeleton.title}`);
  }
});

test("🔴 umbrella words and whole-exam names still refuse — the clarify question and the research builder own them", () => {
  // "biology" is the turn contract's own clarify example; "nclex" spans four nursing courses and
  // resolving it to one would hand a learner a fraction wearing the whole exam's name.
  for (const ambiguous of ["biology", "economics", "micro", "physics", "nclex", "mcat", "cpa", "bar exam", "python"]) {
    assert.equal(readCurriculum(ambiguous).ok, false, `"${ambiguous}" resolved — that ambiguity belongs to the model`);
  }
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
