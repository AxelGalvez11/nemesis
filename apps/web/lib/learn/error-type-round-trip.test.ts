import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResponseEvaluation } from "./canvas-model";
import { EVIDENCE_COLUMNS, EVIDENCE_SELECT, evidenceFromRow, evidenceRow } from "./learner-store";
import type { LearnerEvidence } from "./learner-evidence";
import { evidenceForSubmission, judgementOf, outcomeFor } from "./objective-task";
import { brief } from "./strategy-llm-teacher";
import { teachingSnapshot, type ObjectiveSnapshot } from "./teaching-snapshot";

// 🔴 THE FIELD THAT WAS COMPUTED, SHOWN, AND THROWN AWAY.
//
// The judge has produced `errorType` since it was written. `canvas-prompts.ts` asks for it by name,
// `canvas-judge.ts` validates it, and the feedback on screen used it — and then `outcomeFor` built a
// `SubmissionOutcome` without it, so it died at that one line. Two learners who are `incorrect` on
// the same objective — one who had the right method and slipped, one who reached for the wrong
// method entirely — were the same row.
//
// 🔴 AND AN EARLIER GUARD FOR THIS EXACT FIELD WAS HOLLOW. It asserted the mapping's words appeared
// in the file, and it passed with the whole mapping deleted, because the same words survived in an
// unrelated list. So nothing here reads source text. Every assertion below moves a value through the
// real write shape and the real read shape, which is the only way this field can be shown to arrive.

const PROMPT = {
  id: "task-1",
  operation: "recall" as const,
  rung: "independent" as const,
  scaffoldingLevel: 0,
  targets: [
    { identityKey: "k1", rowId: "row-k1" },
    { identityKey: "k2", rowId: "row-k2" },
  ],
  text: "Why does that happen?",
};

function evaluation(over: Partial<ResponseEvaluation> = {}): ResponseEvaluation {
  return { confidence: 0.9, verdict: "incorrect", ...over } as ResponseEvaluation;
}

const submit = (evaluations: Record<string, ResponseEvaluation | undefined>) =>
  evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf(
      Object.entries(evaluations).flatMap(([key, value]) =>
        value ? [outcomeFor({ identityKey: key }, value)] : [],
      ),
    ),
    occurredAt: "2026-08-18T00:00:00.000Z",
    prompt: PROMPT as never,
    responseText: "because the enzyme is inhibited",
    teachingStrategy: "llm_teacher",
  });

// ── the round trip, which is the whole point ────────────────────────────────

test("🔴 a diagnosed failure survives judge → row → database shape → read back", () => {
  // The full chain in one assertion, in the order production runs it. Every earlier version of this
  // field passed a test at one of these hops and died at the next.
  const [row] = submit({ k1: evaluation({ errorType: "careless" }) });
  assert.equal(row?.errorType, "careless", "the outcome must carry the judge's diagnosis");

  const stored = evidenceRow("user-1", row!);
  assert.equal(stored.error_type, "careless", "the diagnosis must reach the column");

  const read = evidenceFromRow({ ...stored, id: "row-1" }, "k1");
  assert.equal(read.errorType, "careless", "and it must come back out again");
});

test("🔴 the column is SELECTED, not merely written", () => {
  // Six structural fields in this codebase have been stored on every row and read by nothing. The
  // derived list and the hand-written literal PostgREST needs are checked against each other here so
  // that adding one without the other cannot pass.
  assert.ok(EVIDENCE_COLUMNS.includes("error_type"), "error_type must be in the derived column list");
  assert.ok(
    EVIDENCE_SELECT.split(",").includes("error_type"),
    "error_type must be in the literal handed to PostgREST — a derived list it is absent from is not read",
  );
});

// ── absent must stay absent ─────────────────────────────────────────────────

test("🔴 a judge that named no kind produces no kind — never a default", () => {
  // The mandate's rule, and the codebase's: absent means the evaluator established nothing. A
  // plausible-looking value here would be this layer authoring a diagnosis nobody made.
  const [row] = submit({ k1: evaluation() });
  assert.equal(row?.errorType, undefined, "an undiagnosed failure must carry no kind");
  assert.equal(evidenceRow("u", row!).error_type, null, "and it must be stored as null, not omitted");
});

test("🔴 an objective the judge stayed silent about gets no diagnosis from its neighbour", () => {
  // One answer, two targets, one diagnosis. The rung and the latency are copied to every row on
  // purpose; a diagnosis must not be, because it was made about one objective.
  const rows = submit({ k1: evaluation({ errorType: "conceptual" }) });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.objectiveRowId === "row-k1")?.errorType, "conceptual");
  assert.equal(
    rows.find((r) => r.objectiveRowId === "row-k2")?.errorType,
    undefined,
    "a target the judge did not speak about must not inherit the other one's diagnosis",
  );
});

test("two targets can fail differently in one answer", () => {
  const rows = submit({
    k1: evaluation({ errorType: "careless" }),
    k2: evaluation({ errorType: "missing_prerequisite" }),
  });
  assert.equal(rows.find((r) => r.objectiveRowId === "row-k1")?.errorType, "careless");
  assert.equal(rows.find((r) => r.objectiveRowId === "row-k2")?.errorType, "missing_prerequisite");
});

test("🔴 an unrecognised stored value reads as absent rather than flowing on", () => {
  // The column has no CHECK constraint, deliberately — a constraint would make an unknown kind fail
  // the whole INSERT, and `recordEvidence` turns a failed insert into a warning, so one unknown
  // value would silently discard a complete demonstration. The validation lives on the read instead,
  // where the cost is one field.
  const read = evidenceFromRow(
    { ...evidenceRow("u", submit({ k1: evaluation() })[0]!), error_type: "vibes", id: "row-9" },
    "k1",
  );
  assert.equal(read.errorType, undefined, "a kind this build does not know is not a kind");
});

// ── and something reads it ──────────────────────────────────────────────────

function evidence(over: Partial<LearnerEvidence>): LearnerEvidence {
  return {
    demonstrationObtained: true,
    id: `e-${Math.abs(Number(over.occurredAt?.slice(-4).replace(/\D/g, "") ?? 0))}`,
    objectiveIdentityKey: "k1",
    occurredAt: "2026-08-18T00:00:00.000Z",
    verdict: "incorrect",
    ...over,
  };
}

function snapshotFor(rows: readonly LearnerEvidence[]) {
  const knowledge = {
    id: "k1",
    statement: "Competitive inhibition raises the apparent Km.",
    type: "causal" as const,
  };
  return teachingSnapshot({
    attention: { activeMs: 0, availableMs: null },
    correctionsShown: [],
    evidence: rows,
    now: new Date("2026-08-18T01:00:00.000Z"),
    objectives: [
      {
        knowledge,
        objective: { answer: "the apparent Km rises", capability: "recall", identityKey: "k1", label: "Km" },
      },
    ],
    recentActs: [],
    uid: "u",
  } as never).objectives;
}

test("🔴 the teaching snapshot reports the LAST diagnosis, not the last row", () => {
  // 🔴 THIS IS THE ASSERTION THAT MAKES THE FIELD MEAN SOMETHING. Storing it and reading it back is
  // only half — a value nothing consults is the same as a value nothing stored. The controller is
  // told how the learner's last diagnosed failure was classified, so it can tell an arithmetic slip
  // from a wrong method and stop treating them alike.
  const [objective] = snapshotFor([
    evidence({ errorType: "conceptual", occurredAt: "2026-08-18T00:01:00.000Z" }),
    evidence({ errorType: "careless", occurredAt: "2026-08-18T00:02:00.000Z" }),
    // Newest, and undiagnosed. It must not erase what the attempt before it established.
    evidence({ occurredAt: "2026-08-18T00:03:00.000Z" }),
  ]);
  assert.equal(objective?.lastErrorType, "careless");
});

test("no diagnosis ever made reads as null, and is not confused with no failures", () => {
  const [objective] = snapshotFor([
    evidence({ occurredAt: "2026-08-18T00:01:00.000Z" }),
    evidence({ occurredAt: "2026-08-18T00:02:00.000Z" }),
  ]);
  assert.equal(objective?.lastErrorType, null);
  assert.ok(
    (objective?.unresolvedAttempts ?? 0) > 0,
    "two failed attempts with no diagnosis is a real state — null here must not read as 'doing fine'",
  );
});

/** A snapshot with every field the brief prints, so only the diagnosis line varies below. */
const BRIEF_BASE: ObjectiveSnapshot = {
  blockedDependents: [],
  capability: "recall",
  identityKey: "k1",
  importance: null,
  knowledgeType: "causal",
  label: "Km under competitive inhibition",
  lastErrorType: null,
  lastRung: "independent",
  medianResponseMs: null,
  minutesSinceLastEvidence: 3,
  misconceptions: [],
  msThisSession: 0,
  prerequisites: [],
  retrievability: null,
  semanticKeys: [],
  semanticRelations: [],
  state: { demonstrationCount: 0, evidenceCount: 1, latestVerdict: "incorrect", status: "shaky" },
  statement: "Competitive inhibition raises the apparent Km.",
  terminologyInTheWay: false,
  unresolvedAttempts: 1,
} as unknown as ObjectiveSnapshot;

// ── and the model is actually told ──────────────────────────────────────────

test("🔴 the diagnosis reaches the model's brief, not just the snapshot", () => {
  // 🔴 THIS GUARD EXISTS BECAUSE DELETING THE LINE LEFT EVERY OTHER TEST GREEN. The field was
  // written, selected, mapped and projected — four proven boundaries — and the model was still
  // never told. "Implemented, merged, deployed, dead" is the failure this codebase repeats, and
  // asserting on the rendered text is the only place it becomes visible.
  const rendered = brief({ ...BRIEF_BASE, lastErrorType: "careless" });
  assert.match(
    rendered,
    /careless/,
    "the controller cannot act on a diagnosis it is never shown",
  );
});

test("🔴 and it says nothing when no kind was named", () => {
  // "none" would read to a model as a finding — that the last attempt failed in no particular way.
  // What it means is that nobody looked, and silence is how you say that.
  const rendered = brief({ ...BRIEF_BASE, lastErrorType: null });
  assert.doesNotMatch(rendered, /diagnos/i, "an absent diagnosis must produce no line at all");
});
