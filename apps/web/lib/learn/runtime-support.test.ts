// Whether a capability the runtime mints is a capability the runtime can actually choose.
//
// 🔴 THIS IS THE GUARD THE FILE'S OWN HEADER ASKS FOR AND NEVER HAD. `objectivesForKnowledge` has
// minted `classification|discriminate` and `procedure|sequence` objectives since the wide-grid and
// procedure lanes shipped — `knowledge-lane-completeness.test.ts` pins both types as minted — and
// until this file's companion fix, `SUPPORTED` in `runtime-support.ts` never grew past
// `association|recall` and `causal|predict`. So every objective either type minted was constructed,
// then silently discarded by `supportedObjectives` before `decideNext` ever saw it: an invisible
// ceiling, one layer downstream of the `objectivesForKnowledge` type-gate this codebase already
// found and fixed once. Every test below is END TO END — built, offered to `decideNext` alongside
// something that already ranks, and asserted as the winner — because a constant-level check
// (`runtimeCanStage(...) === true`) proves the ledger has the right string in it and nothing about
// whether a learner is ever actually asked.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext, supportedObjectives } from "./policy-runtime";
import { runtimeCanStage, supportedPairs } from "./runtime-support";
import { classAxesOf, contrastsOf } from "./wide-grid-classification";

const NOW = new Date("2026-08-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

test("the ledger names both new pairs, and still refuses the one whose wording is not built", () => {
  assert.equal(runtimeCanStage("classification", "discriminate"), true);
  assert.equal(runtimeCanStage("procedure", "sequence"), true);
  // 🔴 spatial|locate STAYS FALSE — objective-task.ts has no locatePromptText yet. Asserted here so
  // the day someone adds that lane and forgets this ledger, the sweep test below (not this one) is
  // what tells them a mint exists with nowhere to go — not silence.
  assert.equal(runtimeCanStage("spatial", "locate"), false);
});

test("supportedPairs reports exactly four entries — a change in count here is a deliberate edit", () => {
  assert.equal(supportedPairs().length, 4);
});

// ── classification|discriminate, end to end ──────────────────────────────────

const CYP2D6_HEADER = [
  "**Genotype CYP2D6** **(Allele Combination)**",
  "**Allele associated function**",
  "**Type of Variation**",
  "**Predicted Metabolizer status**",
];
const CYP2D6_ROWS = [
  ["*1/*1", "Normal / Normal", "Reference", "Normal (NM)"],
  ["*3/*3", "No function / No function", "SNV (nonsense)", "Poor (PM)"],
  ["*3/*6", "No function / No function", "SNV (nonsense)", "Poor (PM)"],
];

function poorContrast() {
  const axis = classAxesOf(CYP2D6_ROWS, 4, { index: 0, populated: CYP2D6_ROWS.length }, CYP2D6_HEADER).find(
    (a) => a.column === 3,
  )!;
  return contrastsOf(axis).find((c) => c.label === "Poor (PM)")!;
}

const CLASSIFICATION: KnowledgeObject = {
  contrast: poorContrast(),
  id: "kc1",
  identityKey: "kc1",
  statement: "Predicted Metabolizer status: Poor (PM)",
  type: "classification",
  unanchoredProvenance: [],
};

const ASSOCIATION: KnowledgeObject = {
  id: "ka1",
  identityKey: "ka1",
  pair: { id: "ka1:r", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};

function ev(id: string, key: string, occurredAt: string, verdict: LearnerEvidence["verdict"]): LearnerEvidence {
  return { demonstrationObtained: verdict !== null, id, objectiveIdentityKey: key, occurredAt, verdict };
}

test("a classification objective survives supportedObjectives — it did not before this fix", () => {
  const [discriminate] = objectivesForKnowledge(CLASSIFICATION);
  const resolved: ResolvedObjective[] = [{ knowledge: CLASSIFICATION, objective: { ...discriminate!, rowId: "r1" } }];
  assert.equal(supportedObjectives(resolved).length, 1);
});

test("🔴 decideNext chooses the discriminate objective over an already-demonstrated association", () => {
  // Two real objectives compete. The association was demonstrated long ago and is merely due —
  // `next-action-value.ts`'s `due` band. The classification objective has never been asked — the
  // `owed` band, which outranks `due`. If the ranker could not see `discriminate` at all, this
  // candidate would vanish before scoring and the association would win by default; if it can see
  // it but scores it wrong, the association still wins. Either failure looks identical from outside
  // `decideNext` without this test.
  const [discriminate] = objectivesForKnowledge(CLASSIFICATION);
  const [recall] = objectivesForKnowledge(ASSOCIATION);
  const objectives: ResolvedObjective[] = [
    { knowledge: CLASSIFICATION, objective: { ...discriminate!, rowId: "r1" } },
    { knowledge: ASSOCIATION, objective: { ...recall!, rowId: "r2" } },
  ];
  const evidence = [ev("e1", recall!.identityKey, ago(30 * 24 * 3600_000), "strong")];

  const decision = decideNext({ evidence, now: NOW, objectives: supportedObjectives(objectives) });

  assert.equal(decision?.objective.identityKey, discriminate!.identityKey);
  assert.equal(decision?.action.type, "retrieve");
});

// ── procedure|sequence, end to end ───────────────────────────────────────────

const PROCEDURE: KnowledgeObject = {
  id: "kp1",
  identityKey: "kp1",
  statement: "Filing a motion to dismiss",
  steps: [
    { marker: "1.", text: "Draft the motion stating the grounds for dismissal.", unitId: "u1" },
    { marker: "2.", text: "File the motion with the clerk of court.", unitId: "u1" },
    { marker: "3.", text: "Serve a copy on the opposing party.", unitId: "u1" },
  ],
  type: "procedure",
  unanchoredProvenance: [],
};

test("a sequence objective survives supportedObjectives — it did not before this fix", () => {
  const [first] = objectivesForKnowledge(PROCEDURE);
  const resolved: ResolvedObjective[] = [{ knowledge: PROCEDURE, objective: { ...first!, rowId: "r1" } }];
  assert.equal(supportedObjectives(resolved).length, 1);
});

test("🔴 decideNext chooses a never-asked sequence step over an already-demonstrated association", () => {
  const [first] = objectivesForKnowledge(PROCEDURE);
  const [recall] = objectivesForKnowledge(ASSOCIATION);
  const objectives: ResolvedObjective[] = [
    { knowledge: PROCEDURE, objective: { ...first!, rowId: "r1" } },
    { knowledge: ASSOCIATION, objective: { ...recall!, rowId: "r2" } },
  ];
  const evidence = [ev("e1", recall!.identityKey, ago(30 * 24 * 3600_000), "strong")];

  const decision = decideNext({ evidence, now: NOW, objectives: supportedObjectives(objectives) });

  assert.equal(decision?.objective.identityKey, first!.identityKey);
  assert.equal(decision?.action.type, "retrieve");
});
