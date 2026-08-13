import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { declaredCognitiveMode, readingRequirementOf } from "./canvas-continue";
import { declaredExposition, expositionFor } from "./cognitive-mode";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext } from "./policy-runtime";
import { chooseNextTeachingAction, expositionOf, type TeachingAction } from "./teaching-policy";
import { projectLearnerState } from "./learner-evidence";

// 🔴 EVERY ASSERTION BELOW IS A DATA-FLOW CLAIM, NEVER AN ORDERING ONE. An ordering assertion stays
// green against code that computes a value and never uses it — that is how `RUNTIME-001` shipped a
// gate that had already been moved, and how the Continue button sat dead in the document for weeks.
// Each test here breaks the PRODUCER and requires the CONSUMER's answer to change.

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [A, B] = objectivesForKnowledge(KNOWLEDGE);
const RESOLVED: ResolvedObjective[] = [
  { knowledge: KNOWLEDGE, objective: { ...A!, rowId: "row-a" } },
  { knowledge: KNOWLEDGE, objective: { ...B!, rowId: "row-b" } },
];
const NOW = new Date("2026-08-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function ev(key: string, at: string, verdict: LearnerEvidence["verdict"], extra: Partial<LearnerEvidence> = {}): LearnerEvidence {
  return {
    demonstrationObtained: verdict !== null,
    id: `${key}:${at}:${verdict}`,
    objectiveIdentityKey: key,
    occurredAt: at,
    verdict,
    ...extra,
  };
}

function actionFor(evidence: LearnerEvidence[], correctionAlreadyShown = false): TeachingAction {
  return chooseNextTeachingAction({
    correctionAlreadyShown,
    knowledgeObject: KNOWLEDGE,
    learnerState: projectLearnerState(A!.identityKey, evidence),
    now: NOW,
    objective: A!,
    recentEvidence: evidence,
  });
}

/** Every action the policy can reach on today's data, one of each. */
function everyReachableAction(): TeachingAction[] {
  const wrong = [ev(A!.identityKey, ago(60_000), "incorrect")];
  const confused = [ev(A!.identityKey, ago(60_000), "misconception", { misconceptions: ["valsartan"] })];
  return [
    actionFor([]), // retrieve
    actionFor(wrong), // show_correction
    actionFor(confused), // contrast
    actionFor(wrong, true), // defer
    actionFor([ev(A!.identityKey, ago(60_000), "understood")]), // advance
  ];
}

// ── the policy declares it, and it survives to the consumer ─────────────────

test("🔴 every action the policy can produce carries an exposition the Canvas recognises", () => {
  // 🔴 THE CONSUMER'S `null` MEANS "THE POLICY SAID NOTHING", AND IT RESOLVES TO *REQUIRES READING*.
  // So an action whose exposition the reader cannot parse is not a type error — it is a Continue
  // silently appearing on a retrieval, or on a two-word answer exposure. The claim asserted here is
  // that the un-emitted path is unreachable from a real decision, which is the whole point of
  // landing the producer.
  // 🔴 THROUGH `declaredCognitiveMode`, NOT PAST IT. Calibration caught this: handing
  // `exposition.mode` straight to `readingRequirementOf` skips the structural reader, so deleting a
  // member from the reader's own match list left this green while the Canvas silently stopped
  // recognising it. The reader is the thing under test, so the reader has to be in the path.
  const seen = new Set<string>();
  for (const action of everyReachableAction()) {
    seen.add(action.type);
    const asTheCanvasSeesIt = declaredCognitiveMode({ exposition: expositionOf(action), cognitiveMode: expositionOf(action).mode });
    assert.notEqual(asTheCanvasSeesIt, null, `${action.type} produced a mode the Canvas cannot read`);
    assert.equal(readingRequirementOf(asTheCanvasSeesIt).unknown, false);
  }
  assert.deepEqual([...seen].sort(), ["advance", "contrast", "defer", "retrieve", "show_correction"]);
});

test("🔴 a retrieval declares 'nothing to read' — not silence, and not a reading requirement", () => {
  // Two different failures if this is wrong. `null` puts the stopgap's Continue on the question,
  // which N3 forbids outright; `deliberate` does the same thing on purpose.
  assert.deepEqual(expositionOf(actionFor([])), { mode: "none" });
  assert.equal(readingRequirementOf(expositionOf(actionFor([])).mode).requiresReading, false);
});

test("🔴🔴 a real decision reaches the Canvas's reader with a real mode", () => {
  // The end-to-end data-flow claim: from `decideNext` — the only constructor — through the exact
  // structural read the Canvas performs, on the exact field it reads. This is what makes the
  // consumer's "absence is a defect" path unreachable rather than merely unlikely.
  const decision = decideNext({
    actedOn: [],
    correctionsShown: new Set(),
    evidence: [ev(A!.identityKey, ago(60_000), "incorrect")],
    now: NOW,
    objectives: RESOLVED,
  });
  assert.equal(decision?.action.type, "show_correction");
  assert.equal(declaredCognitiveMode(decision), "transient", "the Canvas read no mode off the decision");
  assert.deepEqual(declaredExposition(decision), expositionFor({
    capability: A!.capability,
    kind: "correction",
    knowledgeType: KNOWLEDGE.type,
  }));
  assert.equal(readingRequirementOf(declaredCognitiveMode(decision)).requiresReading, false);
});

test("🔴 the flat mode is the union's mode — one source, never two opinions", () => {
  // `cognitiveMode` exists only because the Canvas reads that field name. If it were ever assigned
  // independently of `exposition`, the surface and the timer would disagree about the same screen.
  for (const evidence of [
    [] as LearnerEvidence[],
    [ev(A!.identityKey, ago(60_000), "incorrect")],
    [ev(A!.identityKey, ago(60_000), "misconception", { misconceptions: ["valsartan"] })],
  ]) {
    const decision = decideNext({ actedOn: [], correctionsShown: new Set(), evidence, now: NOW, objectives: RESOLVED });
    assert.ok(decision);
    assert.equal(decision.cognitiveMode, decision.exposition.mode);
  }
});

test("🔴 a misconception reaches the Canvas as a reading requirement, an ordinary miss does not", () => {
  // §39's two reachable rows, asserted through the consumer rather than on the pure function — the
  // difference between "the mode is computed" and "the mode decides the button".
  const miss = decideNext({
    actedOn: [],
    correctionsShown: new Set(),
    evidence: [ev(A!.identityKey, ago(60_000), "incorrect")],
    now: NOW,
    objectives: RESOLVED,
  });
  const confused = decideNext({
    actedOn: [],
    correctionsShown: new Set(),
    evidence: [ev(A!.identityKey, ago(60_000), "misconception", { misconceptions: ["valsartan"] })],
    now: NOW,
    objectives: RESOLVED,
  });
  assert.equal(confused?.action.type, "contrast");
  assert.equal(readingRequirementOf(declaredCognitiveMode(miss)).requiresReading, false, "an answer exposure must not stop the learner");
  assert.equal(readingRequirementOf(declaredCognitiveMode(confused)).requiresReading, true, "replacing a mental model must wait for the learner");
});

// ── the runtime's own wiring ────────────────────────────────────────────────

test("🔴 the verdict on screen declares its OWN mode, not the next action's", async () => {
  // The renderer shows the verdict while `decision` has already moved on underneath. A mode read
  // straight off the decision would describe a screen the learner is not looking at — on a pass,
  // the difference between advancing by itself and waiting for a press §39 says must not be there.
  const source = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /feedback\s*\?\s*\{\s*\.\.\.next,\s*cognitiveMode:\s*feedback\.exposition\.mode,\s*exposition:\s*feedback\.exposition\s*\}/,
    "a verdict on screen must override the decision's declared mode with its own",
  );
  assert.match(
    source,
    /const exposition: Exposition =\s*feedback\s*\?\s*feedback\.exposition/,
    "the authoritative exposition must prefer the verdict while one is on screen",
  );
});

test("🔴 the verdict's mode is minted from the objective, and the evaluator is not consulted", async () => {
  // Canvas UI came one commit from shipping a Continue wired to `feedbackPassed` — a control that
  // appears exactly when the learner was WRONG. `evaluation` is in scope at this call site, so the
  // only thing keeping it out is that it is not passed.
  const source = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const mint = source.slice(source.indexOf("setFeedback({"), source.indexOf("setFeedback({") + 500);
  assert.match(mint, /kind:\s*"verdict"/);
  assert.match(mint, /capability:\s*decision\.objective\.capability/);
  assert.match(mint, /knowledgeType:\s*decision\.knowledge\.type/);
  const call = mint.slice(mint.indexOf("expositionFor("), mint.indexOf("}),"));
  for (const forbidden of ["evaluation", "verdict:", "passed", "result"]) {
    assert.equal(call.includes(forbidden), false, `the verdict's mode must not read ${forbidden}`);
  }
});

test("🔴 acting on an objective APPENDS, so the working-memory window can move", async () => {
  // A `Set`-shaped write compiles, looks correct and freezes the window at the first visit's
  // position for the rest of the session — an objective returned to would report the same
  // intervening count for ever. Asserted on the write, because a projection guard cannot see a
  // writer that stopped writing.
  const source = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /setActedOn\(\(current\) => \[\.\.\.current, seen\]\)/, "the acted-on log must append");
  assert.equal(source.includes("setActedOn((current) => new Set"), false, "a Set cannot answer 'since when'");
});

test("🔴 the reordering set is DERIVED from the ordered log, never passed beside it", async () => {
  // Two inputs that must agree is the construction that let the failed-objective defect sit
  // unnoticed under a comment promising they could not disagree.
  const source = await readFile(new URL("./policy-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /const acted = new Set\(actedInOrder\)/);
  assert.equal(/actedOn\?:\s*ReadonlySet/.test(source), false, "the ordered log is the only input");
});

test("🔴 the policy is TOLD what intervened — it does not count for itself", async () => {
  // If `decideNext` stopped passing it, every objective would read zero intervening acts and the
  // hour-long defer would come back silently, with every pure test still green.
  const source = await readFile(new URL("./policy-runtime.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /interveningActs:\s*interveningActs\(objective\.identityKey,\s*actedInOrder\)/,
    "the decision must be given the intervening count for THIS objective",
  );
});
