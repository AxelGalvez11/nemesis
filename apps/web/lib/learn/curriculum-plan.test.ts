import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { association, causal, resolved } from "./__fixtures__/three-disciplines";
import { conceptIdentityKey } from "./concept-identity";
import {
  planFromSkeleton,
  planTerritories,
  readCurriculumPlan,
  resolvePlanScope,
  type CurriculumPlan,
  type PlanNode,
} from "./curriculum-plan";
import { CURRICULUM_SEEDS } from "./curriculum-registry";
import { readTerritory, territoryReuse } from "./canvas-territory";
import { KNOWLEDGE_IDENTITY_VERSION } from "./knowledge-identity";

const CHEMISTRY = CURRICULUM_SEEDS[0]!;

function node(over: Partial<PlanNode> = {}): PlanNode {
  return {
    aliases: [],
    conceptKey: conceptIdentityKey({ domain: "testing", label: over.label ?? "a node" }),
    label: "a node",
    parentKey: null,
    position: 1,
    ...over,
  };
}

// ── the plan is a faithful cut of the skeleton ──────────────────────────────────────────────────

test("a plan carries the skeleton's identity, version and maturity, so it can say what it is", () => {
  const plan = planFromSkeleton(CHEMISTRY, "2026-08-23T00:00:00.000Z");
  assert.equal(plan.curriculumKey, CHEMISTRY.key);
  assert.equal(plan.curriculumVersion, CHEMISTRY.version);
  assert.equal(plan.maturity, "provisional");
  assert.equal(plan.nodes.length, CHEMISTRY.nodes.length);
});

// ── resolution: field-agnostic by construction ──────────────────────────────────────────────────

// 🔴 THE FIXTURES ARE THE FIELD-AGNOSTICISM ARGUMENT, exactly as three-disciplines.ts says of
// itself. `resolvePlanScope` reads knowledge STRUCTURE — a pair's sides, a relation's node keys, a
// normalised statement — and never the words inside it. So a law-school plan node and an
// engineering one must both resolve, through the same code, against material that shares no
// vocabulary with chemistry.

test("🔴 a plan node finds objectives through a pair's sides — law", () => {
  const objectives = [resolved(association("law1", "Consideration", "what makes a promise binding"))];
  const scope = resolvePlanScope(node({ aliases: [], label: "Consideration" }), objectives);
  assert.equal(scope.reachable, true);
  if (scope.reachable && scope.scope.kind === "selection") {
    assert.deepEqual(scope.scope.identityKeys, [objectives[0]!.objective.identityKey]);
    assert.equal(scope.scope.label, "Consideration");
  }
});

test("🔴 a plan node finds objectives through a causal relation's node keys — engineering", () => {
  const objectives = [
    resolved(
      causal({
        assertion: "Increasing beam depth reduces bending stress.",
        cause: "beam depth",
        effect: "bending stress",
        id: "eng1",
        relation: "decreases",
      }),
    ),
  ];
  const scope = resolvePlanScope(node({ label: "Bending stress" }), objectives);
  assert.equal(scope.reachable, true);
});

test("🔴 an alias reaches material its label would miss", () => {
  const objectives = [resolved(association("chem1", "VSEPR", "shapes from electron repulsion"))];
  const missed = resolvePlanScope(node({ aliases: [], label: "Molecular geometry" }), objectives);
  assert.equal(missed.reachable, false, "resolved without the alias — the label test below is dead");
  const found = resolvePlanScope(node({ aliases: ["vsepr"], label: "Molecular geometry" }), objectives);
  assert.equal(found.reachable, true);
});

test("🔴🔴 a node the canvas holds nothing for says so — it never resolves to everything", () => {
  // `applyFocus` returns EVERYTHING when a filter empties, so an empty scope handed to setFocus
  // would silently focus the whole canvas: a control that appears to work and does something else.
  // `reachable: false` is what lets the surface refuse to make that node a button at all.
  const objectives = [resolved(association("x1", "unrelated", "material"))];
  const scope = resolvePlanScope(node({ label: "Electrochemistry" }), objectives);
  assert.equal(scope.reachable, false);
  if (!scope.reachable) assert.equal(scope.reason, "no-material-yet");
});

// ── the Minimap projection ──────────────────────────────────────────────────────────────────────

test("🔴 planTerritories keeps the AUTHOR'S order — nothing re-sorts a curriculum", () => {
  const plan = planFromSkeleton(CHEMISTRY, "2026-08-23T00:00:00.000Z");
  const rows = planTerritories(plan, []);
  const roots = CHEMISTRY.nodes.filter((entry) => entry.parentKey === null).sort((a, b) => a.position - b.position);
  assert.deepEqual(
    rows.map((row) => row.label),
    roots.map((entry) => entry.label),
    "the plan's rows left the order the skeleton's author stated",
  );
});

test("a parent pools its children's keys and is reachable when any child is", () => {
  const objectives = [resolved(association("chem2", "Lewis structures", "electron dot diagrams"))];
  const plan = planFromSkeleton(CHEMISTRY, "2026-08-23T00:00:00.000Z");
  const rows = planTerritories(plan, objectives);
  const bonding = rows.find((row) => row.label === "Chemical bonding");
  assert.ok(bonding, "the bonding group is missing");
  assert.equal(bonding!.reachable, true, "a group with reachable material reported none");
  const lewis = bonding!.children?.find((child) => child.label === "Lewis structures");
  assert.ok(lewis && lewis.reachable);
  assert.ok(
    lewis!.identityKeys.every((key) => bonding!.identityKeys.includes(key)),
    "a child's keys are missing from its parent's pool",
  );
});

// ── storage round trip ──────────────────────────────────────────────────────────────────────────

test("🔴 a stored plan survives the round trip byte for byte", () => {
  const plan = planFromSkeleton(CHEMISTRY, "2026-08-23T00:00:00.000Z");
  assert.deepEqual(readCurriculumPlan(JSON.parse(JSON.stringify(plan))), plan);
});

test("🔴 a malformed plan reads as ABSENT, never as partially present", () => {
  const plan = planFromSkeleton(CHEMISTRY, "2026-08-23T00:00:00.000Z");
  const broken: unknown[] = [
    null,
    "a string",
    { ...plan, nodes: [] },
    { ...plan, curriculumKey: "" },
    { ...plan, nodes: [{ label: "no key", position: 1 }] },
    { ...plan, nodes: [{ ...plan.nodes[0], position: "first" }] },
  ];
  for (const value of broken) {
    assert.equal(readCurriculumPlan(value), null, `a malformed plan was accepted: ${JSON.stringify(value).slice(0, 80)}`);
  }
});

// ── the marker semantics the plan rides on ──────────────────────────────────────────────────────

test("🔴🔴 a plan-bearing PRE-territory reads back, and still reads as NOT BUILT", () => {
  // The two halves of the one new marker shape, asserted together because each is only safe with
  // the other. A course can be applied before the first territory build; the plan must survive
  // that gap (readTerritory accepts the row) AND must never make the canvas think it was built
  // (territoryReuse reports a miss) — a plan is scope, never evidence of construction.
  const plan = planFromSkeleton(CHEMISTRY, "2026-08-23T00:00:00.000Z");
  const stored = readTerritory({
    identityVersion: KNOWLEDGE_IDENTITY_VERSION,
    objects: [],
    plan: JSON.parse(JSON.stringify(plan)),
    topic: "general chemistry",
  });
  assert.ok(stored, "the plan-bearing pre-territory was refused by the reader");
  assert.deepEqual(stored!.plan, plan);
  const reuse = territoryReuse({ identityVersion: KNOWLEDGE_IDENTITY_VERSION, stored: stored! });
  assert.equal(reuse.reuse, false, "a pre-territory was treated as a built territory");
  if (!reuse.reuse) assert.equal(reuse.miss, "never-built");
});

test("🔴 an empty unstamped row WITHOUT a plan still reads as null — the corrupt-row protection holds", () => {
  const stored = readTerritory({ identityVersion: KNOWLEDGE_IDENTITY_VERSION, objects: [], topic: "x" });
  assert.equal(stored, null);
});

test("🔴 a malformed plan on a REAL territory drops the plan and keeps the territory", () => {
  const stored = readTerritory({
    identityVersion: KNOWLEDGE_IDENTITY_VERSION,
    objects: [{ id: "k1" }],
    plan: { curriculumKey: "" },
    topic: "x",
  });
  assert.ok(stored, "a real territory was refused because its plan was malformed");
  assert.equal(stored!.plan, undefined);
});

// ── source-shape guards ─────────────────────────────────────────────────────────────────────────

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const KNOWLEDGE = code(readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8"));
const PLAN = code(readFileSync(new URL("./curriculum-plan.ts", import.meta.url), "utf8"));
const COURSE = code(readFileSync(new URL("./curriculum-course.ts", import.meta.url), "utf8"));

test("🔴🔴 every fresh territory the build writes carries the stored plan forward", () => {
  // The build's saves construct whole replacement rows. The plan is the one field on the marker
  // the build did not produce — any save that forgets it silently deletes the learner's course
  // seconds after it was applied. Counted, so a FIFTH save site cannot arrive without meeting the
  // same obligation: if this number changed, add the plan-preservation spread to the new site and
  // update the count in the same commit.
  const saves = KNOWLEDGE.match(/saveCanvasTerritory\(/g) ?? [];
  assert.equal(saves.length, 4, "the number of territory save sites changed — audit plan preservation");
  const preserving = KNOWLEDGE.match(/\.plan \? \{ plan: (?:stored|previous)\.plan \}/g) ?? [];
  // One site spreads the whole stored marker (`...(stored ?? …)`), which preserves every field
  // including the plan; the other three construct fresh rows and need the explicit spread.
  assert.equal(preserving.length, 3, "a fresh-row territory save no longer carries the plan forward");
  assert.match(KNOWLEDGE, /\.\.\.\(stored \?\? \{ objects: \[\], topic: subject \}\)/);
});

test("🔴 the plan modules carry no learner state and no arbitration", () => {
  for (const source of [PLAN, COURSE]) {
    for (const forbidden of ["decideNext", "mastery", "progress", "acquired"]) {
      assert.ok(!source.includes(forbidden), `"${forbidden}" appears in a curriculum module`);
    }
  }
});

test("🔴 applying a course never touches enrolment identity", () => {
  // public.courses is student-created enrolment identity; docs/course-identity-design.md forbids
  // inferring one from topic overlap. A curriculum plan and a course enrolment share an English
  // word and nothing else.
  assert.ok(!COURSE.includes("course_id"), "curriculum-course.ts writes enrolment identity");
  assert.ok(!/from\("courses"\)/.test(COURSE), "curriculum-course.ts reads the courses table");
});
