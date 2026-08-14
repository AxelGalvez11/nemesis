// One causal edge, all the way round the loop — the first knowledge that is not a word pair.
//
// 🔴 THIS FILE EXISTS BECAUSE A KNOWLEDGE TYPE CAN BE ADDED WITHOUT A LEARNER EVER MEETING IT, AND
// THAT IS EXACTLY WHAT HAD HAPPENED. Ten types were declared, a grounded causal extractor was
// built, its output was persisted and round-tripped — and `objectivesForKnowledge` returned `[]` for
// every type but `association`, so none of it could become a question. Nothing errored. The Canvas
// simply had less to do, and the shortfall was invisible from any single file.
//
// So this test walks the WHOLE chain rather than any link in it:
//
//     knowledge → objective → runtime admits it → prompt → judged → evidence → state → next action
//
// 🔴 AND THE LAST ASSERTION IS THE ONE THAT MATTERS. Every step above can pass while the causal
// objective is quietly handled as a flashcard — same question shape, same one-line correction,
// flashed past in a second and a half. The discriminator is §39's exposition: an association's
// correction is `transient` and auto-advances, a causal one is `deliberate` and waits for the
// learner. If those two come back the same, a type label has been added with no behavioural
// consequence, and "eleven kinds in the spec, one lane in the code" has simply moved up a layer.

import assert from "node:assert/strict";
import { test } from "node:test";

import { causalKnowledgeFrom, validateCausalEdges } from "./causal-extraction-contract";
import { advancesItself } from "./cognitive-mode";
import type { KnowledgeObject } from "./knowledge-types";
import { supportedKnowledge } from "./knowledge-coverage";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import type { EvidenceToRecord, StoredObjective } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";
import {
  evidenceForSubmission,
  judgementOf,
  objectiveAsTask,
  outcomeFor,
  retrievalPromptFor,
  unobtainedEvidence,
} from "./objective-task";
import { decideNext, supportedObjectives } from "./policy-runtime";
import { runtimeCanStage } from "./runtime-support";

// ── the material ────────────────────────────────────────────────────────────
//
// 🔴 BUILT THROUGH THE REAL VALIDATOR AND THE REAL CONSTRUCTOR, NEVER HAND-WRITTEN. A hand-authored
// `KnowledgeObject` can carry a shape the extractor never actually produces, and then this whole
// file would prove the loop works for material that does not exist. Everything below starts from a
// raw model edge and the passage it claims to have read, exactly as the lane receives them.

const PASSAGE =
  "The incorporation of a stop codon will lead to pre-mature termination of the amino acid change.";

const EDGE = validateCausalEdges({
  passage: PASSAGE,
  raw: [
    {
      cause: "incorporation of a stop codon",
      effect: "pre-mature termination",
      negated: false,
      quote: "The incorporation of a stop codon will lead to pre-mature termination",
      relation: "causes",
      verb: "will lead to",
    },
  ],
}).relations[0]!;

const CAUSAL = causalKnowledgeFrom({
  anchors: [
    {
      quote: { exact: "will lead to pre-mature termination", prefix: "stop codon " },
      sourceId: "lib-1",
      unitId: "b550",
    },
  ],
  index: 0,
  model: "claude-sonnet-5",
  relation: EDGE,
  unitId: "b550",
});

/** The word pair the runtime has always been able to teach, for the side-by-side comparison. */
const ASSOCIATION: KnowledgeObject = {
  id: "t1:r1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};

const stored = (object: KnowledgeObject, rowId: string): StoredObjective => ({
  ...objectivesForKnowledge(object)[0]!,
  rowId,
});

const PREDICT = stored(CAUSAL, "row-causal");
const RECALL = stored(ASSOCIATION, "row-assoc");

const NOW = new Date("2026-08-14T12:00:00Z");

/**
 * What the store hands back after a write.
 *
 * 🔴 A ROW IS WRITTEN AGAINST `objectiveRowId` AND READ BACK AGAINST `objectiveIdentityKey`, and
 * that swap is the boundary this bridge stands in for. Doing it explicitly here rather than reusing
 * one object for both keeps the test honest about the fact that the durable record does not carry
 * the identity key — it carries a foreign key, and the projection groups by what the read resolves.
 */
function asStored(rows: readonly EvidenceToRecord[], identityKey: string, id: string): LearnerEvidence[] {
  // 🔴 FIELD BY FIELD, NOT A SPREAD, AND THE TEDIUM IS THE POINT. The stored columns are NULLABLE
  // and the in-memory shape says ABSENT; a spread carries `null` into fields typed `T | undefined`
  // and the difference between "measured as nothing" and "never measured" is one this whole model
  // rests on. Writing the conversion out is what makes it visible.
  return rows.map((row, index) => ({
    canvasId: row.canvasId ?? null,
    confidence: row.confidence ?? undefined,
    demonstrationObtained: row.demonstrationObtained,
    evaluatorVersion: row.evaluatorVersion ?? null,
    id: `${id}-${index}`,
    misconceptions: row.misconceptions,
    objectiveEvidence: row.objectiveEvidence ?? undefined,
    objectiveIdentityKey: identityKey,
    occurredAt: row.occurredAt,
    operation: row.operation ?? undefined,
    responseId: row.responseId,
    responseLatencyMs: row.responseLatencyMs ?? undefined,
    responseText: row.responseText,
    scaffoldRung: row.scaffoldRung ?? undefined,
    scaffoldingLevel: row.scaffoldingLevel ?? undefined,
    taskId: row.taskId,
    verdict: row.verdict,
  }));
}

const wrongAnswer = {
  confidence: 0.9,
  demonstrated: [],
  feedback: "",
  misconceptions: [],
  missing: ["what the stop codon does to translation"],
  verdict: "incorrect" as const,
};

// ── 1. the edge becomes something a learner can be asked ────────────────────

test("🔴 a grounded causal edge mints an objective, and the runtime will stage it", () => {
  const objectives = objectivesForKnowledge(CAUSAL);
  assert.equal(objectives.length, 1, "one edge, one forward question");
  assert.equal(objectives[0]!.capability, "predict");
  assert.ok(runtimeCanStage(CAUSAL.type, objectives[0]!.capability));

  // Both gates, because they are asked at different layers and used to hold the same literal.
  // Ownership deciding yes while selection decides no is an empty Canvas with no error anywhere.
  assert.deepEqual(supportedKnowledge([CAUSAL]).map((k) => k.id), [CAUSAL.id]);
  assert.equal(supportedObjectives([{ knowledge: CAUSAL, objective: PREDICT }]).length, 1);
});

test("🔴 the objective still points at the passage the claim was read from", () => {
  // A question a learner cannot be shown the source of is a question Nemesis is asserting on its own
  // authority. The anchor is what a correction cites, and it has to survive minting.
  assert.equal(CAUSAL.sourceAnchors?.[0]?.unitId, "b550");
  assert.equal(PREDICT.knowledgeIdentityKey, objectivesForKnowledge(CAUSAL)[0]!.knowledgeIdentityKey);
  assert.match(CAUSAL.relation!.assertion, /stop codon/);
});

// ── 2. the question asked is a different question ───────────────────────────

test("🔴 the prompt asks for the consequence AND the reason, not a term", () => {
  const asked = retrievalPromptFor({ knowledge: CAUSAL, objective: PREDICT }, "p-causal");
  assert.equal(asked.task, "predict", "the judge is told to expect an account");
  assert.equal(asked.operation, "predict", "and the durable row will say so too");
  assert.match(asked.prompt, /and why\?$/);
  assert.match(asked.prompt, /incorporation of a stop codon/);

  // 🔴 THE ASSOCIATION MUST NOT HAVE MOVED. Widening the runtime is only safe if the lane that
  // already worked is untouched, and a shared builder is exactly where that breaks.
  const term = retrievalPromptFor({ knowledge: ASSOCIATION, objective: RECALL }, "p-assoc");
  assert.equal(term.task, "name");
  assert.equal(term.operation, "recall");
  assert.doesNotMatch(term.prompt, /why/);
});

test("🔴 the judge is told the two ends of the edge, not just the source's sentence", () => {
  // Marking an account against one model sentence is a similarity check wearing a judge's name: a
  // learner can be entirely right in words that share almost nothing with the document's.
  const asked = retrievalPromptFor({ knowledge: CAUSAL, objective: PREDICT }, "p-causal");
  assert.deepEqual(asked.expectedEvidence.requiredConcepts, [
    "incorporation of a stop codon",
    "pre-mature termination",
  ]);
  assert.equal(asked.expectedEvidence.referenceAnswer, PREDICT.answer);

  // And it survives the last hop into the evaluator's input, which is where it would die quietly.
  const task = objectiveAsTask(PREDICT, asked, { text: "…", via: "typed" });
  assert.deepEqual(task.expectedEvidence, asked.expectedEvidence);

  // An association expects only its reference answer — there is nothing else to require.
  const term = retrievalPromptFor({ knowledge: ASSOCIATION, objective: RECALL }, "p-assoc");
  assert.deepEqual(term.expectedEvidence, { referenceAnswer: RECALL.answer });
});

// ── 3. an answer becomes evidence, and evidence becomes state ───────────────

test("🔴 an account is judged, recorded as a prediction, and moves the learner's state", () => {
  const asked = retrievalPromptFor({ knowledge: CAUSAL, objective: PREDICT }, "p-causal");
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    judgement: judgementOf([
      outcomeFor(PREDICT, {
        confidence: 0.9,
        demonstrated: ["translation stops early"],
        feedback: "",
        misconceptions: [],
        missing: [],
        verdict: "understood",
      }),
    ]),
    occurredAt: NOW.toISOString(),
    prompt: asked,
    responseText: "Translation stops there, so the protein comes out short.",
    tookMs: 21_000,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.operation, "predict", "a prediction filed as a recall is unrecoverable later");
  assert.equal(rows[0]!.scaffoldRung, "independent");
  assert.equal(rows[0]!.demonstrationObtained, true);
  assert.equal(rows[0]!.responseLatencyMs, 21_000);

  const state = projectLearnerState(PREDICT.identityKey, asStored(rows, PREDICT.identityKey, "e"));
  assert.equal(state.status, "correct");
  assert.equal(state.demonstrationCount, 1);
});

test("🔴 an opportunity that produced nothing is not recorded as a wrong account", () => {
  const asked = retrievalPromptFor({ knowledge: CAUSAL, objective: PREDICT }, "p-causal");
  const rows = unobtainedEvidence({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: null,
    occurredAt: NOW.toISOString(),
    prompt: asked,
    responseText: "I don't know",
  });
  assert.equal(rows[0]!.demonstrationObtained, false);
  assert.equal(rows[0]!.verdict, null);
  assert.equal(rows[0]!.operation, "predict", "the demand is a property of what was asked");

  const state = projectLearnerState(PREDICT.identityKey, asStored(rows, PREDICT.identityKey, "e"));
  assert.equal(state.status, "not_demonstrated");
  assert.notEqual(state.status, "incorrect");
});

// ── 4. the loop closes: state chooses the next action ───────────────────────

test("🔴 the policy acts on a causal objective, having never been able to before", () => {
  const fresh = decideNext({ evidence: [], now: NOW, objectives: [{ knowledge: CAUSAL, objective: PREDICT }] });
  assert.equal(fresh?.action.type, "retrieve");
  assert.equal(fresh?.state.status, "unknown");
  assert.equal(fresh?.objective.identityKey, PREDICT.identityKey);
});

// ── 5. THE DISCRIMINATOR ────────────────────────────────────────────────────

test("🔴🔴 a causal correction is DELIBERATE where an association's is TRANSIENT", () => {
  // 🔴 THE ASSERTION THIS WHOLE FILE IS FOR. Same verdict, same status, same policy, same moment —
  // the ONLY difference is the knowledge type. If these come back equal, the causal objective is
  // being handled as a flashcard: its answer flashes past in a second and a half and the learner is
  // moved on, which for a mechanism is the product failing in the exact way §39 was written to stop.
  const answered = (objective: StoredObjective, knowledge: KnowledgeObject) => {
    const asked = retrievalPromptFor({ knowledge, objective }, `p-${objective.rowId}`);
    const rows = evidenceForSubmission({
      // Pre-experiment boundary test: no controller chose this, and `null` says so.
      teachingStrategy: null,
      canvasId: null,
      judgement: judgementOf([outcomeFor(objective, wrongAnswer)]),
      occurredAt: NOW.toISOString(),
      prompt: asked,
      responseText: "no idea, sorry",
    });
    return decideNext({
      evidence: asStored(rows, objective.identityKey, objective.rowId),
      // 🔴 THE MOMENT THE ATTEMPT FELL SHORT, WHICH IS WHEN A CORRECTION IS OWED. Later — once other
      // material has intervened or the working-memory window has decayed — what is owed is another
      // attempt, not the answer restated. §39: exposure must not reduce priority.
      now: NOW,
      objectives: [{ knowledge, objective }],
    });
  };

  const causal = answered(PREDICT, CAUSAL);
  const association = answered(RECALL, ASSOCIATION);

  // Both are owed the same KIND of action — this is not a difference in what the policy decided.
  assert.equal(causal?.action.type, "show_correction");
  assert.equal(association?.action.type, "show_correction");
  assert.equal(causal?.state.status, "incorrect");
  assert.equal(association?.state.status, "incorrect");

  // And they are presented completely differently, which is the whole point.
  assert.equal(causal?.exposition.mode, "deliberate");
  assert.equal(association?.exposition.mode, "transient");
  assert.equal(advancesItself(causal!.exposition), false, "a mechanism must not be flashed past");
  assert.equal(advancesItself(association!.exposition), true);
  assert.notEqual(causal?.exposition.mode, association?.exposition.mode);
});

test("🔴 a named competing model separates the pair before asking again", () => {
  const asked = retrievalPromptFor({ knowledge: CAUSAL, objective: PREDICT }, "p-causal");
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: null,
    judgement: judgementOf([
      outcomeFor(PREDICT, {
        ...wrongAnswer,
        misconceptions: ["a stop codon substitutes a different amino acid"],
        verdict: "misconception",
      }),
    ]),
    occurredAt: NOW.toISOString(),
    prompt: asked,
    responseText: "it swaps in another amino acid",
  });
  const decision = decideNext({
    evidence: asStored(rows, PREDICT.identityKey, "e"),
    now: NOW,
    objectives: [{ knowledge: CAUSAL, objective: PREDICT }],
  });

  assert.equal(decision?.action.type, "contrast");
  assert.equal(decision?.state.status, "misconception");
  assert.deepEqual(
    decision?.action.type === "contrast" ? decision.action.competingWith : null,
    ["a stop codon substitutes a different amino acid"],
    "the specific wrong belief has to reach the teaching, or it is only a wrong-answer count",
  );
  assert.equal(decision?.exposition.mode, "deliberate");
});

// ── 6. the ledger admits pairs, never a cross product ──────────────────────

test("🔴 no combination is admitted that nothing mints", () => {
  // A capability list beside a type list would admit their cross product, and each of these is a
  // question no builder can word — a learner would be handed a prompt the rest of the chain cannot
  // process, or an empty one.
  assert.equal(runtimeCanStage("causal", "recall"), false);
  assert.equal(runtimeCanStage("association", "predict"), false);
  assert.equal(runtimeCanStage("procedure", "predict"), false);
  assert.equal(runtimeCanStage("causal", "predict"), true);
  assert.equal(runtimeCanStage("association", "recall"), true);
});

test("🔴 the answer is the CONSEQUENCE, so 'cue → answer' does not print the cue twice", () => {
  // 🔴 MEASURED ON THE LIVE CANVAS, NOT REASONED ABOUT. The first version used the whole statement,
  // which reads correctly for a pair ("losartan → Cozaar") and absurdly for an edge that contains
  // its own cue: the correction painted "Increasing resistance → Increasing resistance — decreases
  // — current". The cue is the cause; the answer is what follows from it.
  const [objective] = objectivesForKnowledge(CAUSAL);
  assert.equal(objective?.cue, "incorporation of a stop codon");
  assert.equal(objective?.answer.includes(objective.cue), false, "the answer must not repeat the cue");
  assert.match(objective!.answer, /pre-mature termination/);
});

test("🔴 a bounding condition rides along with the answer, because dropping it changes the claim", () => {
  // "decreases current" and "decreases current when voltage is held constant" are different facts,
  // and the second is the one the document made. It is also the judge's reference answer, so a
  // learner who states the bound is not marked down for exceeding it.
  const bounded = causalKnowledgeFrom({
    anchors: [],
    index: 0,
    model: "m",
    relation: { ...EDGE, qualifier: "when voltage is held constant", qualifierKind: "conditional" },
    unitId: "b1",
  });
  assert.match(objectivesForKnowledge(bounded)[0]!.answer, /when voltage is held constant/);
});

test("🔴 a denied edge says so in its answer, not the opposite of what the source said", () => {
  const denied = causalKnowledgeFrom({
    anchors: [], index: 0, model: "m", relation: { ...EDGE, negated: true }, unitId: "b1",
  });
  assert.match(objectivesForKnowledge(denied)[0]!.answer, /does not/);
});
