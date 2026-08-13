// §33: scaffolding is part of the evidence, and §31.1's partial order is built into the type.
//
// 🔴 THE OWNER'S CASE, WHICH IS WHAT EVERY ASSERTION HERE IS ABOUT: "If two learners eventually say
// 'active site,' but one produced it independently while another required three cues, those
// responses are not equivalent evidence."
//
// 🔴 AND THE FAILURE MODE THAT MATTERS IS ASYMMETRIC. Under-crediting costs re-teaching something
// known — annoying, self-correcting. Over-crediting costs skipping something unknown — invisible,
// and compounding under §22 scheduling. Every default and every absence below leans the first way.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  entails,
  higherRung,
  readRung,
  rungRank,
  SCAFFOLD_RUNGS,
  type ScaffoldRung,
} from "./scaffold-rung";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import {
  evidenceForSubmission,
  judgementOf,
  outcomeFor,
  promptTargeting,
  unobtainedEvidence,
} from "./objective-task";

const AT = "2026-08-13T10:00:00.000Z";
const LATER = "2026-08-13T11:00:00.000Z";

function row(over: Partial<LearnerEvidence> & { id: string }): LearnerEvidence {
  return {
    canvasId: null,
    demonstrationObtained: true,
    evaluatorVersion: "eval/1",
    misconceptions: [],
    objectiveIdentityKey: "obj-1",
    occurredAt: AT,
    verdict: "understood",
    ...over,
  };
}

// ── the ladder ──────────────────────────────────────────────────────────────

test("🔴 production entails recognition; recognition entails NOTHING above it", () => {
  // The single most important property in this file. Flattening this into one confidence number is
  // exactly how "recognised HTN" becomes "knows HTN".
  assert.equal(entails("independent", "recognition"), true);
  assert.equal(entails("recognition", "independent"), false);

  // And it is a direction, not a matter of degree — true at every distance along the ladder.
  assert.equal(entails("independent", "taught"), true);
  assert.equal(entails("taught", "recognition"), false);
  assert.equal(entails("narrowed", "cued"), true);
  assert.equal(entails("cued", "narrowed"), false);
});

test("a rung entails itself — the requirement is 'at least', not 'strictly above'", () => {
  for (const rung of SCAFFOLD_RUNGS) assert.equal(entails(rung, rung), true, rung);
});

test("🔴 the ladder is totally ordered, weakest first, with no ties", () => {
  // A tie would make two genuinely different demands interchangeable, and `higherRung` would then
  // return either one — so a real demonstration could be silently replaced by a weaker one.
  const ranks = SCAFFOLD_RUNGS.map(rungRank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "declared order must be the rank order");
  assert.equal(new Set(ranks).size, SCAFFOLD_RUNGS.length, "no two rungs may share a rank");
  assert.equal(SCAFFOLD_RUNGS[0], "taught", "being told is the weakest evidence there is");
  assert.equal(SCAFFOLD_RUNGS[SCAFFOLD_RUNGS.length - 1], "independent", "unaided production is the strongest");
});

test("higherRung keeps the stronger demonstration whichever order it is folded in", () => {
  assert.equal(higherRung("recognition", "independent"), "independent");
  assert.equal(higherRung("independent", "recognition"), "independent");
});

test("🔴 an unrecognised stored value reads as null, never as a rung", () => {
  // It comes out of a text column that a migration, a manual fix or an older writer could put
  // anything into. `as ScaffoldRung` would let a stray string reach `rungRank`, which returns -1
  // for it — silently ranking it BELOW `taught` and making every entailment check pass.
  assert.equal(readRung("independent"), "independent");
  assert.equal(readRung("INDEPENDENT"), null);
  assert.equal(readRung("mastered"), null);
  assert.equal(readRung(3), null);
  assert.equal(readRung(null), null);
  assert.equal(readRung(undefined), null);
});

// ── the projection ──────────────────────────────────────────────────────────

test("🔴 THE STORE MUST NEVER LET RECOGNITION SATISFY A RETRIEVAL REQUIREMENT", () => {
  // §31.1, executed. The learner tapped the right option and has never produced the answer.
  const state = projectLearnerState("obj-1", [row({ id: "e1", scaffoldRung: "recognition" })]);

  assert.equal(state.status, "correct", "they did answer correctly — that part is real");
  assert.equal(satisfies(state, "recognition"), true, "and it establishes what a recognition task would");
  assert.equal(
    satisfies(state, "independent"),
    false,
    "but it must not establish that they can produce it unprompted",
  );
});

test("🔴 the HIGHEST rung ever demonstrated stands — a later cheap check cannot demote it", () => {
  // Producing an answer unaided is not undone by picking it off a list an hour later. Taking the
  // LATEST rung would let a recognition probe silently erase a real demonstration.
  const state = projectLearnerState("obj-1", [
    row({ id: "e1", scaffoldRung: "independent" }),
    row({ id: "e2", occurredAt: LATER, scaffoldRung: "recognition" }),
  ]);
  assert.equal(state.demonstratedAt, "independent");
  assert.equal(satisfies(state, "independent"), true);
});

test("🔴 a demonstration with no recorded rung satisfies NOTHING", () => {
  // Every row written before §33 lands here. Crediting them with unaided production is the exact
  // inflation this exists to stop, so the error is deliberately in the under-claiming direction.
  const state = projectLearnerState("obj-1", [row({ id: "e1" })]);
  assert.equal(state.demonstrationCount, 1, "the demonstration is real and still counted");
  assert.equal(state.demonstratedAt, null, "but at what demand is genuinely unknown");
  assert.equal(satisfies(state, "recognition"), false, "so it establishes nothing on the ladder");
});

test("no evidence at all satisfies nothing, and says so as `unknown`", () => {
  const state = projectLearnerState("obj-1", []);
  assert.equal(state.status, "unknown", "'not enough evidence yet' is a first-class state, not an absent row");
  assert.equal(state.demonstratedAt, null);
  assert.equal(satisfies(state, "recognition"), false);
});

// ── not_addressed ───────────────────────────────────────────────────────────

test("🔴 AN OBJECTIVE THE ANSWER NEVER MENTIONED IS NOT A FAILED ATTEMPT", () => {
  // The owner's worked case. Asked to explain ventricular phase 0, "Sodium enters the cell, causing
  // rapid depolarization" demonstrates A and C and says NOTHING about B — why Na⁺ moves inward.
  //
  // The fan-out is total over the targets, so B gets a row: demonstrationObtained false, verdict
  // null — structurally identical to "asked, produced nothing usable". Read as an attempt, B would
  // project to `not_demonstrated`, and the learner would be shown a correction for something they
  // were never asked.
  const b = projectLearnerState("obj-1", [
    row({ demonstrationObtained: false, id: "e1", objectiveEvidence: "not_addressed", verdict: null }),
  ]);
  assert.equal(b.status, "unknown", "Nemesis still does not know — and must ASK, not correct");
});

test("🔴 CALIBRATION: the same row WITHOUT the marker still reads as a failed attempt", () => {
  // Proves the assertion above is testing `objectiveEvidence` and not something incidental about
  // the fixture. A row that genuinely was an attempt and produced nothing is `not_demonstrated`,
  // which is the correct reading for it — the two must stay distinguishable.
  const attempted = projectLearnerState("obj-1", [
    row({ demonstrationObtained: false, id: "e1", verdict: null }),
  ]);
  assert.equal(attempted.status, "not_demonstrated");
});

test("🔴 a not_addressed row still COUNTS as evidence and still moves the clock", () => {
  // It may not claim anything about the learner, but the opportunity genuinely passed. The policy's
  // churn guard reads `lastEvidenceAt`, and hiding the row would let it re-ask immediately —
  // trading a false claim for a loop.
  const state = projectLearnerState("obj-1", [
    row({ demonstrationObtained: false, id: "e1", objectiveEvidence: "not_addressed", verdict: null }),
  ]);
  assert.equal(state.evidenceCount, 1);
  assert.equal(state.lastEvidenceAt, AT);
});

test("🔴 a not_addressed row does not overwrite what an earlier real answer established", () => {
  // The regression that would follow from filtering these out at the wrong place: a later question
  // spanning several objectives writes a not_addressed row for one the learner had already
  // demonstrated, and that objective must not fall back to unknown.
  const state = projectLearnerState("obj-1", [
    row({ id: "e1", scaffoldRung: "independent" }),
    row({
      demonstrationObtained: false,
      id: "e2",
      objectiveEvidence: "not_addressed",
      occurredAt: LATER,
      verdict: null,
    }),
  ]);
  assert.equal(state.status, "correct", "the earlier demonstration still stands");
  assert.equal(satisfies(state, "independent"), true);
});

// ── the WRITE path: the rows a real submission produces ─────────────────────
//
// 🔴 THESE EXIST BECAUSE TWO OF MY PROJECTION GUARDS WERE GREEN WHEN I BROKE THE WRITER. Deleting
// `scaffoldRung: prompt.rung` from `rowForTarget`, and recording a silent target as `contradicted`
// instead of `not_addressed`, both left every assertion above passing — because they all build
// their own rows. A projection guard cannot see a writer that stopped writing. This is the
// predecessor's lesson arriving in my own file, so it is calibrated against the writer itself.

/** The owner's worked case: one question spanning three objectives. */
const PHASE_0 = promptTargeting({
  expectedAnswer: "Na⁺ influx depolarizes the membrane",
  id: "prompt-phase0",
  operation: "recall",
  prompt: "Explain ventricular phase 0 and why the membrane potential rises.",
  targets: [
    { identityKey: "A-inward-ion", rowId: "row-A" },
    { identityKey: "B-why-inward", rowId: "row-B" },
    { identityKey: "C-influx-depolarizes", rowId: "row-C" },
  ],
  task: "explain",
});

const GOOD = {
  confidence: 0.9,
  demonstrated: [],
  feedback: "",
  misconceptions: [],
  missing: [],
  verdict: "understood" as const,
};

test("🔴 NEMESIS MUST NOT INFER B BECAUSE THE OVERALL ANSWER WAS GOOD", () => {
  // "Sodium enters the cell, causing rapid depolarization." demonstrates A and C. It says nothing
  // about WHY Na⁺ moves inward. The judge speaks about A and C only; the fan-out is total over the
  // targets, so B still gets a row — and that row must say `not_addressed`.
  const rows = evidenceForSubmission({
    canvasId: "canvas-1",
    judgement: judgementOf([
      outcomeFor({ identityKey: "A-inward-ion" }, GOOD),
      outcomeFor({ identityKey: "C-influx-depolarizes" }, GOOD),
    ]),
    occurredAt: AT,
    prompt: PHASE_0,
    responseText: "Sodium enters the cell, causing rapid depolarization.",
  });

  assert.equal(rows.length, 3, "every objective the question spanned gets a row");
  const by = new Map(rows.map((r) => [r.objectiveRowId, r]));
  assert.equal(by.get("row-A")?.objectiveEvidence, "demonstrated");
  assert.equal(by.get("row-C")?.objectiveEvidence, "demonstrated");
  assert.equal(
    by.get("row-B")?.objectiveEvidence,
    "not_addressed",
    "🔴 B was never mentioned — recording it as anything else claims something the learner never said",
  );
  assert.equal(by.get("row-B")?.verdict, null, "and it carries no verdict, because none was made about it");
});

test("🔴 every row of one submission records the rung the TASK set", () => {
  const rows = evidenceForSubmission({
    canvasId: null,
    judgement: judgementOf([outcomeFor({ identityKey: "A-inward-ion" }, GOOD)]),
    occurredAt: AT,
    prompt: PHASE_0,
    responseText: "Sodium enters the cell.",
  });
  // The learner answered one question at one demand, whatever it turned out to establish — so the
  // rung is identical on every row, including the ones the answer did not address.
  assert.deepEqual([...new Set(rows.map((r) => r.scaffoldRung))], ["independent"]);
});

test("🔴 a scaffolded prompt records ITS rung, not the default", () => {
  // Calibrates the guard above: it must be reading the prompt rather than asserting a constant that
  // happens to be right today. A recognition task writes `recognition`, and `satisfies` then
  // refuses to let it stand in for production.
  const recognised = promptTargeting({
    expectedAnswer: "active site",
    id: "prompt-mcq",
    operation: "recall",
    prompt: "Active site or allosteric site?",
    rung: "recognition",
    targets: [{ identityKey: "obj-1", rowId: "row-1" }],
    task: "name",
  });
  const [written] = evidenceForSubmission({
    canvasId: null,
    judgement: judgementOf([outcomeFor({ identityKey: "obj-1" }, GOOD)]),
    occurredAt: AT,
    prompt: recognised,
    responseText: "active site",
  });
  assert.equal(written?.scaffoldRung, "recognition");
});

test("🔴 an answer that produced nothing is `not_addressed` on targets, never a contradiction", () => {
  // `unobtainedEvidence` fans out with no outcomes at all — a reveal, an admission, an unreadable
  // response. Every target must record that nothing came back, and none of them may record that
  // the learner asserted something wrong. Absence of evidence stored as negative evidence is how a
  // learner gets taught against a mistake they never made.
  const rows = unobtainedEvidence({
    canvasId: null,
    occurredAt: AT,
    prompt: PHASE_0,
    responseText: null,
  });
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.equal(r.objectiveEvidence, "not_addressed", r.objectiveRowId);
    assert.equal(r.verdict, null, r.objectiveRowId);
    assert.equal(r.demonstrationObtained, false, r.objectiveRowId);
  }
});

test("🔴 a contradicted objective is recorded as contradicted, not as silence", () => {
  // The other direction, and it has to hold or `not_addressed` becomes a value that swallows real
  // negative evidence — which would be the same defect pointing the other way.
  const [written] = evidenceForSubmission({
    canvasId: null,
    judgement: judgementOf([
      outcomeFor({ identityKey: "A-inward-ion" }, { ...GOOD, verdict: "misconception" }),
    ]),
    occurredAt: AT,
    prompt: promptTargeting({
      expectedAnswer: "sodium",
      id: "p2",
      operation: "recall",
      prompt: "Which ion?",
      targets: [{ identityKey: "A-inward-ion", rowId: "row-A" }],
      task: "name",
    }),
    responseText: "Calcium enters the cell.",
  });
  assert.equal(written?.objectiveEvidence, "contradicted");
});

// ── the shape makes the ambiguous question unaskable ────────────────────────

test("🔴 there is no way to ask 'is this demonstrated' without naming a rung", () => {
  // 🔴 THIS IS THE ENFORCEMENT, AND IT IS A TYPE-LEVEL CLAIM ASSERTED AT RUNTIME. The brief asked
  // for the flattening to be unrepresentable rather than discouraged. `satisfies` is the only
  // sanctioned reader and its second parameter is required, so a caller cannot write
  // `if (state.demonstrated)` — there is no such field to read.
  const state = projectLearnerState("obj-1", [row({ id: "e1", scaffoldRung: "recognition" })]);
  assert.equal("demonstrated" in state, false, "a bare boolean here is what re-flattens the order");
  assert.equal(satisfies.length, 2, "the required rung must not be optional");
});
