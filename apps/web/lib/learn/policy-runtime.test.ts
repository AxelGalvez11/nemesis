import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext, supportedObjectives } from "./policy-runtime";

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

// ── reading a correction is not evidence, but it must still move ────────────

test("🔴 an acknowledged correction does not serve the identical card again", () => {
  // Found by clicking "Got it" in the running app. Showing a correction produces no new evidence —
  // correctly, because reading one says nothing about what the learner can now do — so the state
  // that asked for it is unchanged and it asks again. The card looped for ever.
  const held = RESOLVED[0]!.objective.identityKey;
  const evidence = [ev("e1", held, ago(60_000), null)];
  const before = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(before?.action.type, "show_correction");
  assert.equal(before?.objective.identityKey, held);

  const after = decideNext({ actedOn: new Set([held]), evidence, now: NOW, objectives: RESOLVED });
  assert.notEqual(after?.objective.identityKey, held, "the same card came back immediately");
  assert.equal(after?.action.type, "retrieve");
});

test("acting on everything comes back round rather than ending in a blank page", () => {
  // 🔴 A REORDERING, NOT A FILTER. Being shown something twice is a far smaller failure than a
  // surface with nothing on it and no way forward.
  const all = new Set(RESOLVED.map(({ objective }) => objective.identityKey));
  const decision = decideNext({ actedOn: all, evidence: [], now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
});

test("acknowledging is session state and never reaches the learner's record", async () => {
  // If this ever became evidence it would assert that reading an answer is a demonstration.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");
  const ack = source.slice(source.indexOf("const acknowledge = useCallback"), source.indexOf("return {", source.indexOf("const acknowledge")));
  for (const forbidden of ["recordEvidence", "unobtainedEvidence", "evidenceFromEvaluation"]) {
    assert.equal(ack.includes(forbidden), false, `acknowledging must not write ${forbidden}`);
  }
});

// ── the supported slice ─────────────────────────────────────────────────────

test("🔴 a knowledge type with no built interaction yields nothing to act on", () => {
  // Shipping the next knowledge type means building its interaction, not flipping a flag and
  // letting it fall back to a quiz.
  const causal: ResolvedObjective[] = [
    {
      knowledge: { ...KNOWLEDGE, id: "k2", type: "causal" },
      objective: { ...FORWARD!, rowId: "row-causal" },
    },
  ];
  assert.equal(supportedObjectives(causal).length, 0);
  assert.equal(decideNext({ evidence: [], now: NOW, objectives: supportedObjectives(causal) }), null);
});

test("an association with a recall objective is acted on", () => {
  assert.equal(supportedObjectives(RESOLVED).length, 2);
});

// ── the runtime actually asks ───────────────────────────────────────────────
//
// 🔴 EVERY TEST ABOVE COULD BE GREEN WHILE PRODUCTION IGNORED ALL OF IT. A strict ownership rule
// that nothing calls changes nothing; the previous version of this pivot shipped a guard that
// checked only the first occurrence of a stage component and stayed green through a duplicate
// rendered outside the branch. So the wiring is asserted, not assumed.

test("🔴 the runtime refuses BEFORE it goes active, on ownership rather than on a count", () => {
  const source = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const refusal = source.indexOf("if (!resolved.ownership.owns && !forced)");
  const active = source.indexOf('setStatus("active")');
  assert.notEqual(refusal, -1, "the runtime must consult policyOwnsCanvas's decision");
  assert.notEqual(active, -1);
  assert.ok(refusal < active, "ownership must be checked before the runtime takes the surface");
});

test("🔴 a bypassed session declares itself all the way to the screen", () => {
  // The one property that makes an override safe to have. `?policy=1` was untrustworthy because a
  // forced session looked exactly like an owned one; anything showing this runtime must be able to
  // tell them apart, and must actually do it.
  const runtime = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    runtime.includes("forced: forced && !knowledge.ownership.owns"),
    "the runtime must disclose running without ownership, and only then",
  );

  const view = readFileSync(
    new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(view.includes("runtime.forced &&"), "the surface must show it");
});

test("🔴 no permissive ownership predicate has grown back beside the filter", () => {
  // `canUsePolicyRuntime` was `objectives.some(supported)` — one association handed the runtime a
  // whole canvas, and a lecture containing a single glossary table satisfied it exactly as well as
  // a glossary did. Ownership belongs in knowledge-coverage.ts, decided from what the SOURCE holds.
  // This is here because deleting a function does not stop the next edit reintroducing it.
  const source = readFileSync(new URL("./policy-runtime.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/\.some\s*\(/.test(code), false, "policy-runtime must not decide ownership with .some()");
  assert.equal(code.includes("canUsePolicyRuntime"), false);
});
