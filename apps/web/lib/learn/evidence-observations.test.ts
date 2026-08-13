import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import { projectLearnerState } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import {
  UNSUPPORTED_RETRIEVAL,
  evidenceForSubmission,
  outcomeFor,
  retrievalPromptFor,
  unobtainedEvidence,
} from "./objective-task";
import { EVIDENCE_SELECT, evidenceFromRow, evidenceRow } from "./learner-store";

// Track B1 — the observation layer, and ONLY the observation layer.
//
// 🔴 EVERY ASSERTION BELOW IS ABOUT WHAT WAS MEASURED, NEVER ABOUT WHAT IT MEANS. There is no test
// here that a slow answer is weak, because there is no code that says so and there must not be.
// What these guard is that Nemesis has stopped throwing away things it already saw, and that
// nothing has quietly started interpreting them on the way to the log.

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
};
const [RESOLVED] = objectivesForKnowledge(KNOWLEDGE);
/** As it exists once stored — the only state an objective can be asked about. */
const OBJECTIVE = { ...RESOLVED!, rowId: "row-1" };
const PROMPT = retrievalPromptFor(OBJECTIVE, "prompt-1");

const EVALUATION = {
  confidence: 0.9,
  demonstrated: ["the brand for losartan"],
  feedback: "",
  misconceptions: [],
  missing: [],
  verdict: "strong" as const,
};

/**
 * A fully-populated record, used only to enumerate which COLUMNS the write path produces.
 *
 * 🔴 THE SOURCE-SLICING HELPERS THIS REPLACED ARE GONE ON PURPOSE. They existed because the write
 * shape was built inline inside a function that needed a database, so reading the file was the
 * only way to see it. Both are now pure and exported, and asking the code beats grepping it: the
 * old guards broke the moment the code was restructured, while asserting nothing about behaviour.
 */
const RECORD_FOR_COLUMNS = {
  demonstrationObtained: true,
  objectiveRowId: "obj-1",
  occurredAt: "2026-08-12T10:00:00.000Z",
  operation: "recall" as const,
  responseId: "resp-1",
  responseLatencyMs: 1_000,
  responseText: "valsartan",
  scaffoldingLevel: 0,
  taskId: "task-1",
  verdict: "strong" as const,
};

/** The one row a single-objective judged answer produces. */
function judged(response: { text: string; via: "typed" | "spoken"; tookMs?: number }) {
  return evidenceForSubmission({
    canvasId: null,
    occurredAt: "2026-08-12T00:00:00.000Z",
    outcomes: [outcomeFor(OBJECTIVE, EVALUATION)],
    prompt: PROMPT,
    responseText: response.text,
    ...(response.tookMs !== undefined ? { tookMs: response.tookMs } : {}),
  })[0]!;
}

// ── 1. the measurement survives ─────────────────────────────────────────────

test("🔴 tookMs 14200 becomes responseLatencyMs 14200 — not a band, not a verdict", () => {
  const built = judged({ text: "Cozaar", tookMs: 14_200, via: "typed" });
  assert.equal(built.responseLatencyMs, 14_200);
});

test("a fast answer and a slow one differ only in the number", () => {
  const fast = judged({ text: "Cozaar", tookMs: 1_800, via: "typed" });
  const slow = judged({ text: "Cozaar", tookMs: 18_000, via: "typed" });
  assert.equal(fast.responseLatencyMs, 1_800);
  assert.equal(slow.responseLatencyMs, 18_000);
  // 🔴 THE POINT OF THE WHOLE TRACK. Everything else about these two demonstrations is identical,
  // because the log records what happened and says nothing about what it is worth.
  assert.deepEqual({ ...fast, responseLatencyMs: 0 }, { ...slow, responseLatencyMs: 0 });
});

// ── 2. nothing interprets it ────────────────────────────────────────────────

test("🔴 no threshold, band or qualitative reading of latency exists in the evidence writers", () => {
  // The one rule Track B1 exists to establish. An interpretation written into the log cannot be
  // revised: rows recorded under the old rule mean something different from rows recorded under the
  // new one, and afterwards nothing can tell them apart.
  for (const file of ["objective-task.ts", "learner-store.ts"]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const comparison = new RegExp(`(responseLatencyMs|response_latency_ms|tookMs)\\s*[<>]`);
    assert.equal(comparison.test(code), false, `${file} compares latency against something`);
    for (const banned of ["fluency", "automaticity", "isSlow", "isFast", "latencyBand", "mastery"]) {
      assert.equal(code.includes(banned), false, `${file} introduces an interpretation: ${banned}`);
    }
  }
});

test("🔴 the projection still reads verdicts only, and ignores every observation", () => {
  // Observation, inference and policy are three layers. This asserts the first two have not merged:
  // the same verdicts must project to the same state whatever the attempt looked like.
  const base = (extra: Partial<LearnerEvidence>): LearnerEvidence => ({
    demonstrationObtained: true,
    id: "e1",
    objectiveIdentityKey: OBJECTIVE!.identityKey,
    occurredAt: "2026-08-12T00:00:00.000Z",
    verdict: "strong",
    ...extra,
  });

  const bare = projectLearnerState(OBJECTIVE!.identityKey, [base({})]);
  const observed = projectLearnerState(OBJECTIVE!.identityKey, [
    base({ operation: "recall", responseLatencyMs: 18_000, scaffoldingLevel: 0 }),
  ]);
  assert.deepEqual(observed, bare, "an observation changed the projected state");
});

// ── 3. the operation survives ───────────────────────────────────────────────

test("🔴 operation comes from the objective, so it cannot silently stay 'recall' forever", () => {
  assert.equal(PROMPT.operation, "recall");
  assert.equal(judged({ text: "Cozaar", tookMs: 900, via: "typed" }).operation, "recall");

  const explain = retrievalPromptFor({ ...OBJECTIVE, capability: "explain" }, "prompt-2");
  assert.equal(explain.operation, "explain", "the prompt must read the objective, not a literal");
});

test("scaffolding records what was offered — one state, and it is observed rather than absent", () => {
  assert.equal(PROMPT.scaffoldingLevel, UNSUPPORTED_RETRIEVAL);
  assert.equal(judged({ text: "Cozaar", via: "typed" }).scaffoldingLevel, 0);
});

// ── 4. an admission keeps the same observations ─────────────────────────────

test("🔴 'I don't know' records the same observations and still is not a wrong answer", () => {
  const built = unobtainedEvidence({
    canvasId: null,
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: PROMPT,
    responseText: "I don't know",
    tookMs: 4_100,
  })[0]!;

  // The observations are identical in kind to a judged attempt...
  assert.equal(built.responseLatencyMs, 4_100);
  assert.equal(built.operation, "recall");
  assert.equal(built.scaffoldingLevel, 0);
  // ...and the invariant that matters is untouched.
  assert.equal(built.demonstrationObtained, false);
  assert.equal(built.verdict, null);
});

test("🔴 a reveal with nothing typed leaves latency ABSENT rather than 0", () => {
  // A zero would assert an instantaneous answer that never happened, which is the same defect as
  // absence-as-negative-evidence wearing a different hat.
  const built = unobtainedEvidence({
    canvasId: null,
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: PROMPT,
    responseText: null,
  })[0]!;
  assert.equal(built.responseLatencyMs, undefined);
  assert.equal("responseLatencyMs" in built && built.responseLatencyMs !== undefined, false);
});

// ── 5. absent stays absent across the boundary ──────────────────────────────

test("🔴 the writer sends null, never a default, for anything unobserved", () => {
  // 🔴 NOW ASKED OF THE CODE, NOT OF ITS SOURCE TEXT. This used to slice `recordEvidence` and
  // pattern-match for `?? 0`, because the row shape was built inline in a function that needed a
  // database to call. It is a pure function now, so the guard runs it and inspects what it really
  // produces — and no longer passes or fails on how a line happens to be written.
  const row = evidenceRow("user-1", {
    demonstrationObtained: false,
    objectiveRowId: "obj-1",
    occurredAt: "2026-08-12T10:00:00.000Z",
    // 🔴 REQUIRED, AND THE CONTRAST WITH THE LOOP BELOW IS THE POINT. Everything checked below is
    // optional because absent means not observed. This one is not optional, because an absent
    // response identity does not mean "not measured" — it means the row cannot be deduplicated.
    responseId: "resp-1",
    verdict: null,
  });

  for (const column of ["operation", "response_latency_ms", "scaffolding_level"]) {
    assert.ok(column in row, `${column} must be written`);
    assert.equal(
      row[column],
      null,
      `${column} came out as ${JSON.stringify(row[column])} when nothing measured it — a row nobody measured would carry a measurement`,
    );
  }
});

test("🔴 the reader omits an unobserved field rather than coercing it", () => {
  // Historical rows predate all three columns. They must read back as "not observed" — and `?? 0`
  // would turn every one of them into a claim that the learner answered instantly, unaided.
  // 🔴 ALSO BEHAVIOURAL NOW. Matching the source for `row.x == null ? {} : { y` asserted one
  // spelling of the fix rather than the fix, so an equivalent rewrite would have failed it while a
  // subtly wrong one that kept the shape would have passed.
  const loaded = evidenceFromRow(
    {
      demonstration_obtained: false,
      id: "row-1",
      misconceptions: [],
      occurred_at: "2026-08-12T10:00:00.000Z",
      operation: null,
      response_latency_ms: null,
      scaffolding_level: null,
      verdict: null,
    },
    "objective-key-1",
  );
  for (const field of ["operation", "responseLatencyMs", "scaffoldingLevel"]) {
    assert.equal(field in loaded, false, `${field} must be absent, not coerced, when never observed`);
  }
});

// ── 6. the round trip is real ───────────────────────────────────────────────

test("🔴 every observation written is also SELECTED back", () => {
  // Six structural fields have died at a boundary in this codebase by being written and never read,
  // each passing every test on both sides. A field the reader does not ask for is not persisted
  // state, it is a column nobody will discover is unreachable until something needs it.
  // 🔴 AND IT WAS TOO NARROW TO SEE THE BREAKAGE THAT ALREADY EXISTED. Scoped to the three columns
  // B1 was adding, it could not notice that `response_id`, `response_text` and `task_id` were
  // already written and never selected — a guard shaped around its author's change rather than
  // around the defect. The general form now lives in `performance-identity.test.ts`, which checks
  // EVERY written column; this keeps B1's three explicit, because they are the ones whose absence
  // would silently un-observe a learner.
  const written = Object.keys(evidenceRow("user-1", RECORD_FOR_COLUMNS));
  const selected = EVIDENCE_SELECT.split(",");

  for (const field of ["operation", "response_latency_ms", "scaffolding_level"]) {
    assert.ok(written.includes(field), `${field} is not written`);
    assert.ok(selected.includes(field), `${field} is written and never read back`);
  }
});

test("the migration adds all three columns, nullable and undefaulted", () => {
  const raw = readFileSync(
    new URL("../../../../supabase/migrations/20260812T01_evidence_observations.sql", import.meta.url),
    "utf8",
  );
  // 🔴 COMMENTS STRIPPED FIRST. The prose in this migration explains WHY there is no default, so a
  // scan of the raw file matches its own reasoning — a guard that fails on the argument for the
  // thing it is guarding.
  const sql = raw.replace(/^\s*--.*$/gm, "");
  for (const column of ["operation", "response_latency_ms", "scaffolding_level"]) {
    assert.ok(sql.includes(`add column if not exists ${column}`), `${column} is not added`);
  }
  assert.equal(/\bdefault\b/i.test(sql), false, "a default would invent history for existing rows");
  assert.equal(/\bnot\s+null\b/i.test(sql), false, "not null would reject rows written before this ran");
});
