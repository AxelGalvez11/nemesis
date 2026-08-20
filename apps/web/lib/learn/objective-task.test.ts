import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResponseEvaluation } from "./canvas-model";
import type { KnowledgeObject } from "./knowledge-types";
import { performancesIn, type LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge, type LearningObjective } from "./learning-objective";
import type { EvidenceToRecord, StoredObjective } from "./learner-store";
import {
  evidenceForSubmission,
  judgementOf,
  noJudgement,
  objectiveAsTask,
  objectivePromptText,
  outcomeFor,
  promptTargeting,
  retrievalPromptFor,
  targetFor,
  unobtainedEvidence,
} from "./objective-task";

// Minted through the real function rather than hand-written, so a change to how sides are resolved
// shows up here instead of being papered over by a fixture that agrees with the old rules.
const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
/** An objective as it exists once stored — which is the only state one can be asked about, because
 *  `learner_evidence.objective_id` is a foreign key. */
function stored(objective: LearningObjective | undefined, rowId: string): StoredObjective {
  return { ...objective!, rowId };
}

const [FORWARD, REVERSE] = objectivesForKnowledge(KNOWLEDGE);
const GENERIC_TO_BRAND = stored(FORWARD, "row-forward");
const BRAND_TO_GENERIC = stored(REVERSE, "row-reverse");

/** The prompt builder, given the knowledge these objectives came from — which it needs, because an
 *  explanation is judged against the knowledge and not against the objective's one-line answer. */
const askedAbout = (objective: StoredObjective, id: string) =>
  retrievalPromptFor({ knowledge: KNOWLEDGE, objective }, id);

/** One judged answer about one objective, built the way the live retrieval path builds it. */
function judged(input: {
  prompt: ReturnType<typeof retrievalPromptFor>;
  objective?: StoredObjective;
  evaluation?: ResponseEvaluation;
  text?: string;
  tookMs?: number;
  occurredAt?: string;
}) {
  return evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: input.occurredAt ?? "2026-08-11T12:00:00.000Z",
    judgement: judgementOf([outcomeFor(input.objective ?? GENERIC_TO_BRAND, input.evaluation ?? EVALUATION)!]),
    prompt: input.prompt,
    responseText: input.text ?? "Cozaar",
    ...(input.tookMs !== undefined ? { tookMs: input.tookMs } : {}),
  });
}

const EVALUATION: ResponseEvaluation = {
  confidence: 0.9,
  demonstrated: ["the brand name"],
  feedback: "That's the one.",
  misconceptions: [],
  missing: [],
  verdict: "understood",
};

/**
 * A row to record, as the same row reads back out of the database.
 *
 * 🔴 EVERY ROW GETS A DISTINCT `id`, AND THAT IS WHAT MAKES THE PERFORMANCE COUNT MEAN ANYTHING.
 * `performancesIn` deduplicates by row id before it groups, so giving these a shared id would
 * report one performance no matter what the response identity said — a test that passes because it
 * cannot fail. Distinct ids mean the count of 1 can only come from the shared `responseId`.
 */
function asStored(row: EvidenceToRecord, index: number): LearnerEvidence {
  return {
    canvasId: row.canvasId ?? null,
    demonstrationObtained: row.demonstrationObtained,
    evaluatorVersion: row.evaluatorVersion ?? null,
    id: `db-row-${index}`,
    misconceptions: [...(row.misconceptions ?? [])],
    objectiveIdentityKey: row.objectiveRowId,
    occurredAt: row.occurredAt,
    verdict: row.verdict,
    ...(row.responseId ? { responseId: row.responseId } : {}),
    ...(row.responseLatencyMs == null ? {} : { responseLatencyMs: row.responseLatencyMs }),
  };
}

// ── scaffolding stages a real rung, and it survives the round trip to evidence ──

test("retrievalPromptFor defaults to independent, the same safe default promptTargeting already has", () => {
  const prompt = retrievalPromptFor({ knowledge: KNOWLEDGE, objective: GENERIC_TO_BRAND }, "p1");
  assert.equal(prompt.rung, "independent");
});

test("🔴 a rung passed to retrievalPromptFor survives the round trip into the evidence row", () => {
  // §41's rule, applied here: a structural field that dies between the decision and the database
  // dies silently, because every unit test up to that point still passes. `chooseNextTeachingAction`
  // decides the rung; this is the next hop it has to survive — through the prompt, through
  // `evidenceForSubmission`, into the row `learner_store.ts` actually writes.
  const prompt = retrievalPromptFor({ knowledge: KNOWLEDGE, objective: GENERIC_TO_BRAND }, "p1", "narrowed");
  assert.equal(prompt.rung, "narrowed");
  const [row] = judged({ prompt });
  assert.equal(row?.scaffoldRung, "narrowed", "the rung the task was staged at must reach the durable row");
});

// ── the crossing where six things have already died ─────────────────────────

test("🔴 the two directions of one pair ask OPPOSITE questions", () => {
  // The defect this exists for is silent and passes every other test: build the cue from
  // `pair.left` and BOTH objectives print "What is the brand for losartan?" while carrying
  // opposite identity keys. Every downstream report then reads correctly — one direction
  // demonstrated, the reverse still unknown — and the reverse is unknown only because the learner
  // was never actually asked it.
  const forward = askedAbout(GENERIC_TO_BRAND, "p1");
  const reverse = askedAbout(BRAND_TO_GENERIC, "p2");

  assert.notEqual(forward.prompt, reverse.prompt);
  assert.match(forward.prompt, /losartan/);
  assert.equal(forward.expectedAnswer, "Cozaar");
  assert.match(reverse.prompt, /Cozaar/);
  assert.equal(reverse.expectedAnswer, "losartan");
  // And what one asks for is what the other gives.
  assert.equal(forward.expectedAnswer, BRAND_TO_GENERIC.cue);
  assert.equal(reverse.expectedAnswer, GENERIC_TO_BRAND.cue);
});

test("the question names the role the learner must produce, never a column position", () => {
  // "the right-hand value" means opposite things in a `Generic | Brand` glossary and a
  // `Brand | Generic` revision sheet. The role is what the learner is actually asked for.
  assert.match(objectivePromptText(GENERIC_TO_BRAND), /brand/i);
  assert.match(objectivePromptText(BRAND_TO_GENERIC), /generic/i);
  for (const wording of [objectivePromptText(GENERIC_TO_BRAND), objectivePromptText(BRAND_TO_GENERIC)]) {
    assert.equal(/left|right|column|first|second/i.test(wording), false, wording);
  }
});

test("a headerless pair still asks something, without inventing a role", () => {
  const headerless = objectivesForKnowledge({
    ...KNOWLEDGE,
    pair: { id: "t2:r1", left: "kanji", right: "reading" },
  });
  const wording = objectivePromptText(headerless[0]!);
  assert.match(wording, /kanji|reading/);
  assert.equal(/undefined|null/.test(wording), false);
});

test("the task carries the answer as reference evidence and NO canvas concept", () => {
  const prompt = askedAbout(GENERIC_TO_BRAND, "p1");
  const task = objectiveAsTask(GENERIC_TO_BRAND, prompt, { text: "Cozaar", via: "typed" });
  assert.equal(task.expectedEvidence.referenceAnswer, "Cozaar");
  // 🔴 A per-canvas concept id on a durable objective would be identity leaking back in from the
  // session — the exact thing the objective layer exists to remove.
  assert.equal(task.objective.conceptId, null);
  assert.equal(task.task, "name");
});

// ── the evaluator decides, not the button and not string equality ───────────

test("🔴 the verdict comes from the evaluator even when the text matches exactly", () => {
  // A `said === expected` shortcut is the tempting version of this and it is wrong twice: it marks
  // a correct answer wrong over capitalisation or a synonym, and — the part that changes teaching
  // — it cannot tell a wrong answer from a specific competing belief.
  const prompt = askedAbout(GENERIC_TO_BRAND, "p1");
  const [evidence] = judged({ evaluation: { ...EVALUATION, verdict: "incorrect" }, prompt });
  assert.equal(evidence!.verdict, "incorrect");
});

test("a judged answer always obtained a demonstration — including a wrong one", () => {
  const prompt = askedAbout(GENERIC_TO_BRAND, "p1");
  const [evidence] = judged({
    evaluation: { ...EVALUATION, verdict: "incorrect" },
    prompt,
    text: "Diovan",
  });
  assert.equal(evidence!.demonstrationObtained, true);
});

test("🔴 an opportunity that produced nothing carries NO verdict", () => {
  const prompt = askedAbout(GENERIC_TO_BRAND, "p1");
  const [evidence] = unobtainedEvidence({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-11T12:00:00.000Z",
    prompt,
    responseText: null,
  });
  assert.equal(evidence!.demonstrationObtained, false);
  assert.equal(evidence!.verdict, null);
});

// ── one performance, one row ────────────────────────────────────────────────

test("🔴 the evidence is keyed by the TASK, so one prompt can only ever be one demonstration", () => {
  // A fresh id minted at submit time would give a double click two ids and two rows for one
  // performance — and `demonstrationCount` is what the policy reads to decide whether a capability
  // has been shown repeatedly, so the learner would be credited with practice they never did.
  const prompt = askedAbout(GENERIC_TO_BRAND, "task-abc");
  const [first] = judged({ occurredAt: "2026-08-11T12:00:00.000Z", prompt });
  const [second] = judged({ occurredAt: "2026-08-11T12:00:03.000Z", prompt });

  assert.equal(first!.responseId, "task-abc");
  assert.equal(first!.taskId, "task-abc");
  // Same prompt, later clock: still the same key, so the unique index collapses them.
  assert.equal(second!.responseId, first!.responseId);
});

test("a different prompt is a different demonstration", () => {
  const [one] = judged({ prompt: askedAbout(GENERIC_TO_BRAND, "task-1") });
  const [two] = judged({
    occurredAt: "2026-08-11T13:00:00.000Z",
    prompt: askedAbout(GENERIC_TO_BRAND, "task-2"),
  });
  assert.notEqual(one!.responseId, two!.responseId);
});

test("what the learner said is kept, and the evaluator is named", () => {
  const [evidence] = judged({ prompt: askedAbout(GENERIC_TO_BRAND, "task-1") });
  assert.equal(evidence!.responseText, "Cozaar");
  assert.ok(evidence!.evaluatorVersion);
});

// ── RUNTIME-002: one answer, one response identity ──────────────────────────
//
// 🔴 THESE PIN A PROPERTY THAT ALREADY HOLDS, AND THAT IS THE POINT.
//
// The coordination board (docs/canvas-agent-board.md) records RUNTIME-002 against a stated defect:
// that the prompt id is built as `${objective.identityKey}:${action.type}:${evidenceCount}:${round}`
// and therefore "embeds the objective's identity key". That expression is real, but it is
// `decisionKey` in use-policy-runtime.ts — a memo guard deciding WHEN to mint a fresh id. The id
// itself is `crypto.randomUUID()`, on this branch and on main. Nothing objective-specific reaches it.
//
// So the contract is already satisfied by construction. What was missing is any test that says so —
// which is why the property could be believed broken, and why a later edit could break it for real
// without anything going red. The defect was misdiagnosed; the invariant is worth holding.
//
// 🔴 AND "FIXING" THE REPORTED DEFECT WOULD HAVE CAUSED ONE. The random id is what makes a genuinely
// new attempt after a reload land instead of being swallowed as a duplicate; deriving the id from
// the decision — the shape the board describes as correct-by-accident — is what would actually
// collapse two performances into one.

test("🔴 responseId identifies the ANSWER, never the objective", () => {
  // 🔴 THIS TEST USED TO SIMULATE THE CASE IT DESCRIBES. When RUNTIME-002 pinned it, no code path
  // wrote evidence for several objectives from one submission, so it built two rows by calling the
  // single-row builder twice with the same prompt and different row ids — a hand-made stand-in for
  // a fan-out that did not exist. It now runs against the real one, and the difference matters:
  // the previous version could not have caught a fan-out that minted its own ids, because it WAS
  // the fan-out.
  //
  // 🔴 CALIBRATED, AND THE FIRST ATTEMPT WAS A FALSE PASS WORTH RECORDING. Deriving `responseId`
  // from the prompt's own target key left this GREEN, because every row is built from the same
  // prompt so the derived value matched anyway. It goes red on the defect it actually names —
  // `${target.rowId}:${prompt.id}` — and that is the boundary this can honestly speak about.
  const prompt = promptTargeting({
    expectedAnswer: "Cozaar",
    id: "answer-1",
    operation: "recall",
    prompt: "Both directions at once.",
    targets: [targetFor(GENERIC_TO_BRAND), targetFor(BRAND_TO_GENERIC)],
    task: "name",
  });
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    judgement: judgementOf([outcomeFor(GENERIC_TO_BRAND, EVALUATION)!, outcomeFor(BRAND_TO_GENERIC, EVALUATION)!]),
    prompt,
    responseText: "Cozaar",
    tookMs: 4200,
  });

  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.responseId)).size, 1, "one answer, one identity");
  assert.equal(new Set(rows.map((row) => row.objectiveRowId)).size, 2, "the rows stay distinct");
  // 🔴 THE LATENCY IS THE PERFORMANCE'S, NOT THE ROW'S. Dividing it among rows, or measuring it per
  // objective, would make one 4.2s answer look like several faster ones.
  assert.deepEqual(
    rows.map((row) => row.responseLatencyMs),
    [4200, 4200],
  );
});

test("🔴 nothing objective-specific leaks into the response identity", () => {
  // The board's stated defect, asserted directly against: hand the SAME id to two opposite
  // objectives and it must survive unchanged. If the id were ever derived from the objective, these
  // would diverge — which is the exact failure that would make one answer read as several.
  const forward = askedAbout(GENERIC_TO_BRAND, "shared-id");
  const reverse = askedAbout(BRAND_TO_GENERIC, "shared-id");
  assert.equal(forward.id, "shared-id");
  assert.equal(reverse.id, "shared-id");
  assert.notEqual(forward.targets[0]!.identityKey, reverse.targets[0]!.identityKey);
});

test("separate answers carry separate response identities", () => {
  // Acceptance test 3. The other half: sharing must not become collapsing.
  const first = askedAbout(GENERIC_TO_BRAND, "answer-1");
  const second = askedAbout(GENERIC_TO_BRAND, "answer-2");
  assert.notEqual(first.id, second.id);
});

test("an unobtained demonstration carries the same answer identity", () => {
  // "I don't know" is an opportunity that produced nothing — but it is still ONE answer, and it must
  // group with anything else that submission produced rather than looking like a separate event.
  const prompt = askedAbout(GENERIC_TO_BRAND, "answer-1");
  const [nothing] = unobtainedEvidence({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt,
    responseText: "no idea",
    tookMs: 900,
  });
  assert.equal(nothing!.responseId, "answer-1");
  assert.equal(nothing!.demonstrationObtained, false);
});

// ── RUNTIME-003: one submission, a SET of objectives ────────────────────────
//
// The board's acceptance tests for a task that targets several objectives at once. They run against
// association objectives rather than causal ones deliberately: the routing is knowledge-type
// agnostic, so pinning it here means it is already true when `objectivesForKnowledge(causal)` stops
// returning `[]` — rather than being written for causal knowledge and discovered to be wrong for
// everything else.

/** Three objectives, as a causal chain's edges would be: separate rows, separate identities. */
const CHAIN = [
  GENERIC_TO_BRAND,
  BRAND_TO_GENERIC,
  { ...BRAND_TO_GENERIC, identityKey: "association:v2:third-edge", rowId: "row-third" },
];

const CHAIN_PROMPT = promptTargeting({
  expectedAnswer: "the whole chain",
  id: "one-answer",
  operation: "explain",
  prompt: "Explain why the first leads to the last.",
  targets: CHAIN.map(targetFor),
  task: "explain",
});

test("🔴 acceptance 1+2: one submission across three objectives is ONE performance", () => {
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    judgement: judgementOf(CHAIN.map((objective) => outcomeFor(objective, EVALUATION)!)),
    prompt: CHAIN_PROMPT,
    responseText: "the whole mechanism",
    tookMs: 20_000,
  });

  assert.equal(rows.length, 3, "three objectives, three rows");
  assert.equal(new Set(rows.map((row) => row.responseId)).size, 1, "sharing ONE response identity");
  // Acceptance test 2, using Brain's own helper rather than a local reimplementation of it: if
  // `performanceKey` ever stops keying on the response id, this must go red here too.
  assert.equal(performancesIn(rows.map(asStored)).size, 1);
  // 🔴 The 20 seconds belong to the ANSWER. Four rows each claiming a quarter of it would describe
  // a learner who answered four times, quickly — which is not what happened.
  assert.deepEqual(new Set(rows.map((row) => row.responseLatencyMs)), new Set([20_000]));
});

test("🔴 acceptance 3: an objective the answer did not address is NOT demonstrated, not incorrect", () => {
  // The learner explained two links of three. The third was never mentioned — nothing about it was
  // shown, and nothing about it was contradicted. Recording it as `incorrect` would teach against a
  // mistake they did not make; leaving no row at all would read as never having been asked.
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    judgement: judgementOf([outcomeFor(CHAIN[0]!, EVALUATION)!, outcomeFor(CHAIN[1]!, EVALUATION)!]),
    prompt: CHAIN_PROMPT,
    responseText: "the first two links",
    tookMs: 12_000,
  });

  assert.equal(rows.length, 3, "every target gets a row, including the silent one");
  const third = rows.find((row) => row.objectiveRowId === "row-third");
  assert.equal(third!.demonstrationObtained, false);
  assert.equal(third!.verdict, null);
  // And it is still part of the same performance — the learner answered once.
  assert.equal(third!.responseId, "one-answer");
  assert.equal(third!.responseLatencyMs, 12_000);
});

test("🔴 acceptance 4: a double submit is one row per objective, not two", () => {
  // The same answer arriving twice — a double click, a replayed effect, a network retry. Every row
  // keeps its `(objective, responseId)` pair, which is what the unique index collapses on.
  const first = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    judgement: judgementOf(CHAIN.map((objective) => outcomeFor(objective, EVALUATION)!)),
    prompt: CHAIN_PROMPT,
    responseText: "the whole mechanism",
  });
  const again = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    // A later clock, because the second arrival really is later. It must change nothing that the
    // index conflicts on.
    occurredAt: "2026-08-12T00:00:07.000Z",
    judgement: judgementOf(CHAIN.map((objective) => outcomeFor(objective, EVALUATION)!)),
    prompt: CHAIN_PROMPT,
    responseText: "the whole mechanism",
  });

  const key = (row: { objectiveRowId: string; responseId: string }) =>
    `${row.objectiveRowId}:${row.responseId}`;
  assert.deepEqual(first.map(key), again.map(key), "the same three conflict targets, both times");
  assert.equal(new Set([...first, ...again].map(key)).size, 3, "three demonstrations, not six");
});

test("🔴 a judged outcome for an objective the task did not target writes NO row", () => {
  // A judge that volunteers a relationship the learner asserted is telling us something real, and it
  // is still not a demonstration of anything this task asked. Storing it would put a claim in the
  // durable record that no prompt supports — the same defect as `alsoWeakConceptIds` naming a
  // concept the canvas never declared.
  //
  // 🔴 THIS IS THE ONE FAN-OUT RULE WITH NO NATURAL PRESSURE TO STAY TRUE. Nothing else goes red if
  // an untargeted outcome starts writing a row: the count is right, the ids are right, and the
  // extra row looks exactly like a real one.
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    judgement: judgementOf([
      outcomeFor(GENERIC_TO_BRAND, EVALUATION)!,
      { objectiveIdentityKey: "association:v2:never-asked", verdict: "incorrect" },
    ]),
    prompt: askedAbout(GENERIC_TO_BRAND, "answer-1"),
    responseText: "Cozaar, and also something nobody asked about",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.objectiveRowId, "row-forward");
});

test("🔴 an admission covers every objective it was asked about", () => {
  // "I don't know" to a question spanning three links showed nothing about any of them — and all
  // three were genuinely asked. Writing the admission against only the first would leave the other
  // two reading as never asked, and "never asked" and "asked, nothing came back" call for different
  // teaching.
  const rows = unobtainedEvidence({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: CHAIN_PROMPT,
    responseText: "no idea",
    tookMs: 3_000,
  });

  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.demonstrationObtained === false && row.verdict === null));
  assert.equal(new Set(rows.map((row) => row.responseId)).size, 1);
  assert.equal(performancesIn(rows.map(asStored)).size, 1);
});

test("🔴 the operation is the TASK'S, identical on every row it writes", () => {
  // One answer was one cognitive demand. Rows that disagreed about which operation produced them
  // would describe a learner who did several different things at once.
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    judgement: judgementOf(CHAIN.map((objective) => outcomeFor(objective, EVALUATION)!)),
    prompt: CHAIN_PROMPT,
    responseText: "the whole mechanism",
  });
  assert.deepEqual(new Set(rows.map((row) => row.operation)), new Set(["explain"]));
});

// ── RUNTIME-006: "nothing was demonstrated" and "we never got a judgement" ───────────────────────
//
// 🔴 THE DEFECT THESE EXIST FOR IS INVISIBLE AT THE TYPE LEVEL AND SILENT AT RUNTIME. Before the
// split, `evidenceForSubmission` took a bare `outcomes` array, and a `catch` or a failed parse
// produces an empty one naturally. That empty array fanned out into a row per target saying
// "we asked and they showed nothing" — a durable false claim about a person, authored by our own
// outage, with nothing broken anywhere for a test to catch. It was sound only because `submit`
// happened to return early one layer up.
//
// So these assert BEHAVIOUR — how many rows get written, and what they say — not the shape of a
// type. Each is calibrated by collapsing `judged: false` back into an empty outcomes array, which
// turns them red by WRITING ROWS THAT SHOULD NOT EXIST rather than by failing to compile.

/**
 * The rows that would reach `recordEvidence`, one call each.
 *
 * 🔴 STATED PRECISELY RATHER THAN GRANDLY: this is not a fake database and it does not simulate
 * `record()`. It relies on one true fact — `record()` in `use-policy-runtime.ts` loops the array it
 * is handed and calls `recordEvidence` once per element — so a row here is a write there, and a
 * count here is a count of durable claims. That is what makes these assertions behavioural rather
 * than structural: they fail by PRODUCING ROWS THAT WOULD BE WRITTEN, not by failing to compile.
 */
function writesFrom(rows: readonly EvidenceToRecord[]): readonly EvidenceToRecord[] {
  return rows;
}

test("🔴 RUNTIME-006: a judge that could not be reached writes NOTHING, for any target", () => {
  const written = writesFrom(
    evidenceForSubmission({
      // Pre-experiment boundary test: no controller chose this, and `null` says so.
      teachingStrategy: null,
      canvasId: "c1",
      judgement: noJudgement(),
      occurredAt: "2026-08-12T00:00:00.000Z",
      prompt: CHAIN_PROMPT,
      responseText: "a real answer that never reached a judge",
      tookMs: 20_000,
    }),
  );

  // Three targets were put to the learner and the database must still learn nothing about any of
  // them. An outage is not a learner failure.
  assert.equal(written.length, 0, "an unreachable judge must not write a single row");
});

test("🔴 RUNTIME-006: a judge that RAN and established nothing writes a row per target", () => {
  const written = writesFrom(
    evidenceForSubmission({
      // Pre-experiment boundary test: no controller chose this, and `null` says so.
      teachingStrategy: null,
      canvasId: "c1",
      judgement: judgementOf([]),
      occurredAt: "2026-08-12T00:00:00.000Z",
      prompt: CHAIN_PROMPT,
      responseText: "something that showed nothing",
      tookMs: 20_000,
    }),
  );

  assert.equal(written.length, CHAIN.length, "every target that was asked about gets its record");
  for (const row of written) {
    assert.equal(row.demonstrationObtained, false);
    // 🔴 NOT `incorrect`. Nothing was shown about this objective; the learner was not contradicted.
    assert.equal(row.verdict, null);
  }
});

test("🔴 RUNTIME-006: the two emptinesses produce OPPOSITE writes — that is the whole point", () => {
  const shared = {
    canvasId: "c1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: CHAIN_PROMPT,
    responseText: "same answer, same targets, same everything else",
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
  } as const;

  const ranAndFoundNothing = writesFrom(evidenceForSubmission({ ...shared, judgement: judgementOf([]) }));
  const neverGotAJudgement = writesFrom(evidenceForSubmission({ ...shared, judgement: noJudgement() }));

  // Identical inputs in every respect except which emptiness they carry, and the durable
  // consequences must not be the same value. A bare array made these indistinguishable.
  assert.equal(ranAndFoundNothing.length, 3);
  assert.equal(neverGotAJudgement.length, 0);
  assert.notEqual(ranAndFoundNothing.length, neverGotAJudgement.length);
});

test("🔴 RUNTIME-006: an admission is an ACCOUNT, not an outage — it still writes", () => {
  // "I don't know" never goes near an evaluator, so the tempting reading is that there is no
  // judgement. There is: the opportunity was given and nothing was demonstrated, which is a fact
  // worth keeping about every target that was asked. Routing it through `noJudgement()` would
  // silently delete the record of someone telling us they did not know.
  const written = writesFrom(
    unobtainedEvidence({
      // Pre-experiment boundary test: no controller chose this, and `null` says so.
      teachingStrategy: null,
      canvasId: "c1",
      occurredAt: "2026-08-12T00:00:00.000Z",
      prompt: CHAIN_PROMPT,
      responseText: "I don't know",
      tookMs: 4_000,
    }),
  );

  assert.equal(written.length, CHAIN.length);
  for (const row of written) {
    assert.equal(row.demonstrationObtained, false);
    assert.equal(row.verdict, null);
    // The attempt was still watched: absent latency and a measured one are different observations.
    assert.equal(row.responseLatencyMs, 4_000);
  }
});

test("🔴 RUNTIME-006: an unreached judge does not even mint a performance", () => {
  // `performancesIn` groups the log by response identity. A refusal that wrote rows would show up
  // here as a performance the learner never completed, and `demonstrationCount` is what the policy
  // reads to decide whether something has been practised.
  const rows = evidenceForSubmission({
    // Pre-experiment boundary test: no controller chose this, and `null` says so.
    teachingStrategy: null,
    canvasId: "c1",
    judgement: noJudgement(),
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: CHAIN_PROMPT,
    responseText: "unjudged",
  });
  const log = rows.map((row, index) => ({ ...row, id: `row-${index}` }) as unknown as LearnerEvidence);
  assert.equal(performancesIn(log).size, 0, "no rows, so no performance — the attempt is not counted");
});
