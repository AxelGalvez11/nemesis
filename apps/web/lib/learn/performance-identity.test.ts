// One learner answer is ONE performance, however many things it demonstrates.
//
// 🔴 WHY THIS FILE EXISTS. `response_id` has been written on every evidence row since evidence
// existed — it is the idempotency key the upsert conflicts on — and it was never selected back.
// So the database could always tell that four rows came from one answer, and no code above it
// ever could. Three fields died at that boundary (`response_id`, `response_text`, `task_id`),
// inside the one function whose comment warns that fields die there.
//
// The tests below are in two groups, and the distinction matters:
//
//   the BOUNDARY guard   no field may be written and silently not read, ever again
//   the MEANING tests    what a performance is, and what it deliberately does not claim

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  performanceKey,
  performancesIn,
  projectLearnerState,
  type LearnerEvidence,
} from "./learner-evidence";
import {
  EVIDENCE_COLUMNS,
  EVIDENCE_SELECT,
  EVIDENCE_WRITE_ONLY_COLUMNS,
  evidenceFromRow,
  evidenceRow,
  type EvidenceToRecord,
} from "./learner-store";

const RECORD: EvidenceToRecord = {
  canvasId: "canvas-1",
  confidence: 0.8,
  demonstrationObtained: true,
  evaluatorVersion: "eval/3",
  misconceptions: ["m1"],
  objectiveEvidence: "demonstrated",
  objectiveRowId: "obj-row-1",
  occurredAt: "2026-08-12T10:00:00.000Z",
  operation: "explain",
  responseId: "resp-1",
  responseLatencyMs: 20_000,
  responseModality: "written",
  responseText: "AT1 blockade lowers aldosterone, so less potassium is excreted.",
  scaffoldRung: "independent",
  scaffoldingLevel: 0,
  taskId: "task-1",
  // 🔴 THE BASELINE ARM ON PURPOSE, NOT THE DEFAULT. A fixture carrying `nemesis_policy` would pass
  // this round trip identically while proving less: `nemesis_policy` is what a broken reader that
  // fell back to a default would also produce. `llm_teacher` can only arrive here by genuinely
  // surviving write, select and read.
  teachingStrategy: "llm_teacher",
  verdict: "understood",
};

/** A stored row, as PostgREST would hand it back for the columns we select. */
function storedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "row-1", ...evidenceRow("user-1", RECORD), ...over };
}

// ── The boundary guard ──────────────────────────────────────────────────────────────────────────

test("🔴 the literal sent to the database matches the list derived from the write shape", () => {
  // The select has to be a string LITERAL for supabase-js to infer the row type, so the column
  // list genuinely exists twice. This is what stops that from being a liability: the derived list
  // cannot drift from `evidenceRow`, and this asserts the literal cannot drift from the derived
  // list — so a column added to the write shape and forgotten in the query fails here.
  assert.deepEqual(
    [...EVIDENCE_SELECT.split(",")].sort(),
    [...EVIDENCE_COLUMNS].sort(),
    "EVIDENCE_SELECT and the write shape disagree — add the new column to the literal",
  );
});

test("🔴 CALIBRATION: that guard fails when the literal misses a written column", () => {
  // The defect it exists to catch, reproduced: a column present in the write shape and absent from
  // the query literal. Without this, the assertion above compares a list with itself.
  const literalMissingOne = EVIDENCE_SELECT.split(",").filter((c) => c !== "response_id");
  assert.notDeepEqual([...literalMissingOne].sort(), [...EVIDENCE_COLUMNS].sort());
});

test("every column the write path produces is selected, or declared write-only WITH a reason", () => {
  const written = Object.keys(evidenceRow("user-1", RECORD));
  const selected = new Set(EVIDENCE_COLUMNS);
  const lost = written.filter(
    (column) => !selected.has(column) && !EVIDENCE_WRITE_ONLY_COLUMNS.includes(column),
  );
  assert.deepEqual(lost, [], `written and never selected: ${lost.join(", ")}`);
});

/**
 * Where a field can still die: SELECTED BUT NEVER MAPPED.
 *
 * 🔴 THE REAL REMAINING SEAM. Deriving the select list closed the write→read gap, but nothing
 * stops a column being fetched and then dropped on the floor by `evidenceFromRow` — which is a
 * field that costs bandwidth, looks present in every query, and is invisible to every consumer.
 * Exactly the same defect, one step later.
 *
 * So this map IS the specification, and it is asserted in both directions: every selected column
 * must appear here, and every entry must actually arrive in the read shape.
 */
const COLUMN_TO_FIELD: Record<string, keyof LearnerEvidence | null> = {
  canvas_id: "canvasId",
  confidence: "confidence",
  demonstration_obtained: "demonstrationObtained",
  evaluator_version: "evaluatorVersion",
  id: "id",
  misconceptions: "misconceptions",
  objective_evidence: "objectiveEvidence",
  // Resolved to the objective's IDENTITY key and then dropped: the raw row id is a database
  // detail that must not leak, and `objectiveIdentityKey` is what every consumer reads instead.
  objective_id: null,
  occurred_at: "occurredAt",
  operation: "operation",
  response_id: "responseId",
  response_latency_ms: "responseLatencyMs",
  response_modality: "responseModality",
  response_text: "responseText",
  scaffold_rung: "scaffoldRung",
  scaffolding_level: "scaffoldingLevel",
  task_id: "taskId",
  teaching_strategy: "teachingStrategy",
  verdict: "verdict",
};

test("🔴 every SELECTED column reaches the read shape, or is explicitly dropped with a reason", () => {
  const selected = [...EVIDENCE_COLUMNS];
  const undeclared = selected.filter((column) => !(column in COLUMN_TO_FIELD));
  assert.deepEqual(
    undeclared,
    [],
    `selected but not declared: ${undeclared.join(", ")} — add it to COLUMN_TO_FIELD and map it, or say why it is dropped`,
  );

  const loaded = evidenceFromRow(storedRow(), "objective-key-1");
  const missing = selected.filter((column) => {
    const field = COLUMN_TO_FIELD[column];
    return field !== null && field !== undefined && !(field in loaded);
  });
  assert.deepEqual(
    missing,
    [],
    `fetched from the database and never mapped: ${missing.join(", ")}`,
  );
});

test("🔴 CALIBRATION: the guard fails when a mapped field stops arriving", () => {
  // The defect reproduced against the REAL reader. `evidenceFromRow` omits a key whenever its
  // column is null — the mechanism that keeps "not observed" absent — so feeding it a row with
  // `response_id: null` reproduces exactly what a deleted mapping line looks like from the
  // outside, and the guard must call it out rather than pass.
  const loaded = evidenceFromRow(storedRow({ response_id: null }), "objective-key-1");
  const missing = [...EVIDENCE_COLUMNS].filter((column) => {
    const field = COLUMN_TO_FIELD[column];
    return field !== null && field !== undefined && !(field in loaded);
  });
  assert.deepEqual(missing, ["response_id"], "the guard must notice a field that did not arrive");
});

test("🔴 a response identity is always written — it is never null the way observations are", () => {
  // The unique index is (user_id, objective_id, response_id) and NULLS DISTINCT, so two rows with a
  // null response_id never collide and the deduplication silently does not apply to them. A retry
  // written without one becomes a second demonstration — practice the learner never did.
  //
  // 🔴 AND THE INDEX CANNOT BE FIXED INSTEAD. `NULLS NOT DISTINCT` would collapse every
  // unidentified row for an objective into one, which is wrong the other way: two separate answers
  // that both lacked an id are two demonstrations. Only the answer can say which answer it was.
  const row = evidenceRow("user-1", RECORD);
  assert.equal(row.response_id, "resp-1");
  assert.notEqual(row.response_id, null);

  // Its neighbours stay nullable, because for them absent genuinely means not observed.
  const unobserved = evidenceRow("user-1", {
    demonstrationObtained: false,
    objectiveRowId: "obj-1",
    occurredAt: "2026-08-12T10:00:00.000Z",
    responseId: "resp-2",
    verdict: null,
  });
  assert.equal(unobserved.response_id, "resp-2");
  assert.equal(unobserved.response_latency_ms, null);
  assert.equal(unobserved.operation, null);
});

test("🔴 the three fields that actually died come back", () => {
  const loaded = evidenceFromRow(storedRow(), "objective-key-1");
  assert.equal(loaded.responseId, "resp-1");
  assert.equal(loaded.responseText, "AT1 blockade lowers aldosterone, so less potassium is excreted.");
  assert.equal(loaded.taskId, "task-1");
});

test("write shape → stored row → read shape preserves every observation", () => {
  const loaded = evidenceFromRow(storedRow(), "objective-key-1");
  assert.equal(loaded.operation, "explain");
  assert.equal(loaded.responseLatencyMs, 20_000);
  assert.equal(loaded.responseModality, "written");
  assert.equal(loaded.scaffoldingLevel, 0);
  assert.equal(loaded.confidence, 0.8);
  assert.equal(loaded.evaluatorVersion, "eval/3");
  assert.equal(loaded.canvasId, "canvas-1");
  assert.deepEqual(loaded.misconceptions, ["m1"]);
  assert.equal(loaded.verdict, "understood");
  assert.equal(loaded.demonstrationObtained, true);
});

test("🔴 absent stays absent — a null column must not read back as a value", () => {
  const loaded = evidenceFromRow(
    storedRow({ operation: null, response_id: null, response_latency_ms: null, response_text: null, scaffolding_level: null, task_id: null }),
    "objective-key-1",
  );
  // Not `=== null`, not `=== 0`: the KEY must be missing, because "we did not observe this" and
  // "we observed zero" are different claims and only one of them is true here.
  assert.equal("responseId" in loaded, false);
  assert.equal("responseText" in loaded, false);
  assert.equal("taskId" in loaded, false);
  assert.equal("operation" in loaded, false);
  assert.equal("responseLatencyMs" in loaded, false);
  assert.equal("scaffoldingLevel" in loaded, false);
});

test("a scaffolding level of 0 is a real measurement and survives", () => {
  // The counterpart to the test above, and the reason it checks key presence rather than falsiness:
  // 0 is the most common real value here and `?? null` on a falsy check would erase it.
  const loaded = evidenceFromRow(storedRow({ scaffolding_level: 0 }), "objective-key-1");
  assert.equal(loaded.scaffoldingLevel, 0);
});

// ── What a performance means ────────────────────────────────────────────────────────────────────

function evidence(over: Partial<LearnerEvidence> & { id: string }): LearnerEvidence {
  return {
    demonstrationObtained: true,
    objectiveIdentityKey: "objective-a",
    occurredAt: "2026-08-12T10:00:00.000Z",
    verdict: "understood",
    ...over,
  };
}

test("🔴 one answer demonstrating three edges is ONE performance, not three", () => {
  // The charter's invariant, in its literal form: performances = 1, observations = 3.
  const log = [
    evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "answer-1", responseLatencyMs: 20_000 }),
    evidence({ id: "r2", objectiveIdentityKey: "edge-2", responseId: "answer-1", responseLatencyMs: 20_000 }),
    evidence({ id: "r3", objectiveIdentityKey: "edge-3", responseId: "answer-1", responseLatencyMs: 20_000 }),
  ];

  const performances = performancesIn(log);
  assert.equal(performances.size, 1);
  assert.equal(performances.get("answer-1")!.length, 3);
});

test("🔴 the same three edges demonstrated separately are THREE performances", () => {
  // Same rows, same verdicts, same objectives — and a different fact about the learner. One fluent
  // explanation suggests an integrated model; three scaffolded answers suggest three isolated
  // facts. Before response ids were read back, these two logs were indistinguishable.
  const log = [
    evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "answer-1" }),
    evidence({ id: "r2", objectiveIdentityKey: "edge-2", responseId: "answer-2" }),
    evidence({ id: "r3", objectiveIdentityKey: "edge-3", responseId: "answer-3" }),
  ];
  assert.equal(performancesIn(log).size, 3);
});

test("🔴 HISTORICAL TRUTH: a row with no response id is its own performance", () => {
  // Not a fallback for missing data — those rows were written by a surface that produced exactly
  // one row per answer, so one row genuinely was one performance. Backfilling a shared id would
  // invent an origin no learner ever created.
  const legacy = [
    evidence({ id: "old-1", objectiveIdentityKey: "edge-1" }),
    evidence({ id: "old-2", objectiveIdentityKey: "edge-2" }),
  ];
  assert.equal(performancesIn(legacy).size, 2);
  assert.equal(performanceKey(legacy[0]!), "old-1");
});

test("mixed old and new rows count correctly together", () => {
  const log = [
    evidence({ id: "old-1", objectiveIdentityKey: "edge-1" }),
    evidence({ id: "r2", objectiveIdentityKey: "edge-2", responseId: "answer-1" }),
    evidence({ id: "r3", objectiveIdentityKey: "edge-3", responseId: "answer-1" }),
  ];
  assert.equal(performancesIn(log).size, 2);
});

test("a row arriving twice from overlapping reads is still one observation", () => {
  const row = evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "answer-1" });
  const performances = performancesIn([row, row]);
  assert.equal(performances.size, 1);
  assert.equal(performances.get("answer-1")!.length, 1);
});

test("performances keep the order they first appeared in", () => {
  const log = [
    evidence({ id: "r1", responseId: "answer-1", occurredAt: "2026-08-12T10:00:00.000Z" }),
    evidence({ id: "r2", responseId: "answer-2", occurredAt: "2026-08-12T10:01:00.000Z" }),
  ];
  assert.deepEqual([...performancesIn(log).keys()], ["answer-1", "answer-2"]);
});

test("an empty log has no performances, and that is not zero attempts inferred from zero rows", () => {
  assert.equal(performancesIn([]).size, 0);
});

// ── What this deliberately does NOT change ──────────────────────────────────────────────────────

test("🔴 demonstrationCount is untouched, because the database already made it honest", () => {
  // The unique constraint is (user_id, objective_id, response_id), so one answer can never produce
  // two rows for the SAME objective. Per objective, rows already equal performances — which is why
  // the policy's existing count needed no change and deliberately did not get one. Changing it
  // would have altered teaching behaviour to fix a defect that was somewhere else.
  const log = [
    evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "answer-1" }),
    evidence({ id: "r2", objectiveIdentityKey: "edge-2", responseId: "answer-1" }),
    evidence({ id: "r3", objectiveIdentityKey: "edge-3", responseId: "answer-1" }),
  ];
  const state = projectLearnerState("edge-1", log);
  assert.equal(state.demonstrationCount, 1);
  assert.equal(state.evidenceCount, 1);
  assert.equal(state.status, "correct");
});

test("🔴 the projection still ignores every observation, including this one", () => {
  // Observation, inference and policy stay apart. Nothing may read a response id and conclude
  // something about the learner yet — that inference is a later layer, and the point of keeping
  // the row raw is that the layer can be replaced without rewriting history.
  const fast = projectLearnerState("edge-1", [
    evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "a", responseLatencyMs: 900 }),
  ]);
  const slow = projectLearnerState("edge-1", [
    evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "a", responseLatencyMs: 40_000 }),
  ]);
  assert.deepEqual(fast, slow);
});

test("🔴 an unobtained demonstration in a multi-edge answer stays unobtained", () => {
  // A learner who explains two links of three has not failed the third — nothing was demonstrated
  // about it. `not_demonstrated` and `incorrect` call for opposite teaching.
  const log = [
    evidence({ id: "r1", objectiveIdentityKey: "edge-1", responseId: "answer-1" }),
    evidence({ id: "r2", objectiveIdentityKey: "edge-2", responseId: "answer-1" }),
    evidence({
      demonstrationObtained: false,
      id: "r3",
      objectiveIdentityKey: "edge-3",
      responseId: "answer-1",
      verdict: null,
    }),
  ];
  assert.equal(projectLearnerState("edge-3", log).status, "not_demonstrated");
  assert.equal(projectLearnerState("edge-1", log).status, "correct");
  assert.equal(performancesIn(log).size, 1);
});
