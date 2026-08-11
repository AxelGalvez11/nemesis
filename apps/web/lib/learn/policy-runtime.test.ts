import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { canUsePolicyRuntime, decideNext, supportedObjectives } from "./policy-runtime";

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
};
const [FORWARD, REVERSE] = objectivesForKnowledge(KNOWLEDGE);
const NOW = new Date("2026-08-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const RESOLVED: ResolvedObjective[] = [
  { knowledge: KNOWLEDGE, objective: { ...FORWARD!, rowId: "row-forward" } },
  { knowledge: KNOWLEDGE, objective: { ...REVERSE!, rowId: "row-reverse" } },
].sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));

function ev(id: string, key: string, occurredAt: string, verdict: LearnerEvidence["verdict"]): LearnerEvidence {
  return { demonstrationObtained: verdict !== null, id, objectiveIdentityKey: key, occurredAt, verdict };
}

// ── nothing known yet ───────────────────────────────────────────────────────

test("🔴 with no evidence at all, the first thing asked is a retrieval", () => {
  // No orientation screen, no level question, no Learn stage. Nemesis has no evidence, and asking
  // is the fastest honest way to get some.
  const decision = decideNext({ evidence: [], now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
  assert.equal(decision?.state.status, "unknown");
});

test("the decision is the same however often it is asked", () => {
  // Stateless: if calling it repeatedly walked forwards, that would be a sequence in a new file.
  const first = decideNext({ evidence: [], now: NOW, objectives: RESOLVED });
  for (let i = 0; i < 4; i += 1) {
    assert.deepEqual(decideNext({ evidence: [], now: NOW, objectives: RESOLVED }), first);
  }
});

// ── evidence for one direction does not become evidence for the other ───────

test("🔴 demonstrating one direction leaves the REVERSE still asked", () => {
  // The single strongest acceptance case for the whole objective model. A learner model that
  // collapsed the pair into "knows losartan/Cozaar" would answer `advance` here and never ask.
  const evidence = [ev("e1", FORWARD!.identityKey, ago(2 * 3600_000), "understood")];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
  assert.equal(decision?.objective.identityKey, REVERSE!.identityKey);
  assert.equal(decision?.state.status, "unknown");
});

test("🔴 evidence is matched by objective, never merely 'this canvas has evidence'", () => {
  // Handing the whole log to every objective would make one demonstration mark them all correct.
  const evidence = [ev("e1", FORWARD!.identityKey, ago(2 * 3600_000), "understood")];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.evidence.length, 0, "the reverse objective has no evidence of its own");
});

test("both directions demonstrated means nothing is owed", () => {
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(2 * 3600_000), "understood"),
    ev("e2", REVERSE!.identityKey, ago(1 * 3600_000), "understood"),
  ];
  assert.equal(decideNext({ evidence, now: NOW, objectives: RESOLVED }), null);
});

test("a demonstrated objective is never re-tested to fill a stage", () => {
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(2 * 3600_000), "understood"),
    ev("e2", REVERSE!.identityKey, ago(1 * 3600_000), "understood"),
  ];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision, null, "advance is the absence of a next action, not an action");
});

// ── correction outranks a fresh question, holding outranks nothing ──────────

test("a wrong answer is corrected before another objective is opened", () => {
  const evidence = [ev("e1", RESOLVED[0]!.objective.identityKey, ago(2 * 3600_000), "incorrect")];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "show_correction");
  assert.equal(decision?.objective.identityKey, RESOLVED[0]!.objective.identityKey);
});

test("🔴 an objective being held does not block one that is actually owed something", () => {
  // `defer` means "not this, not now". Returning it while another objective has never been asked
  // would stall the session on a technicality.
  const held = RESOLVED[0]!.objective.identityKey;
  const evidence = [
    ev("e1", held, ago(5 * 3600_000), "incorrect"),
    ev("e2", held, ago(60_000), "incorrect"),
  ];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
  assert.notEqual(decision?.objective.identityKey, held);
});

test("when everything is held, holding is what is reported", () => {
  const [a, b] = [RESOLVED[0]!.objective.identityKey, RESOLVED[1]!.objective.identityKey];
  const evidence = [
    ev("e1", a, ago(5 * 3600_000), "incorrect"),
    ev("e2", a, ago(60_000), "incorrect"),
    ev("e3", b, ago(5 * 3600_000), "incorrect"),
    ev("e4", b, ago(90_000), "incorrect"),
  ];
  assert.equal(decideNext({ evidence, now: NOW, objectives: RESOLVED })?.action.type, "defer");
});

// ── order comes from identity, not from arrival ─────────────────────────────

test("the decision does not depend on the order evidence arrives in", () => {
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(6 * 3600_000), "incorrect"),
    ev("e2", FORWARD!.identityKey, ago(3 * 3600_000), "understood"),
  ];
  assert.deepEqual(
    decideNext({ evidence: [...evidence].reverse(), now: NOW, objectives: RESOLVED }),
    decideNext({ evidence, now: NOW, objectives: RESOLVED }),
  );
});

// ── the gate is the supported slice ─────────────────────────────────────────

test("🔴 a knowledge type with no built interaction does NOT switch the runtime on", () => {
  // The gate is what keeps this honest: shipping the next knowledge type means building its
  // interaction, not flipping a flag and letting it fall back to a quiz.
  const causal: ResolvedObjective[] = [
    {
      knowledge: { ...KNOWLEDGE, id: "k2", type: "causal" },
      objective: { ...FORWARD!, rowId: "row-causal" },
    },
  ];
  assert.equal(canUsePolicyRuntime(causal), false);
  assert.equal(supportedObjectives(causal).length, 0);
});

test("an association with a recall objective does switch it on", () => {
  assert.equal(canUsePolicyRuntime(RESOLVED), true);
  assert.equal(supportedObjectives(RESOLVED).length, 2);
});
