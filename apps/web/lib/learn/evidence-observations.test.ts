import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import { projectLearnerState } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import {
  UNSUPPORTED_RETRIEVAL,
  evidenceFromEvaluation,
  retrievalPromptFor,
  unobtainedEvidence,
} from "./objective-task";

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
const [OBJECTIVE] = objectivesForKnowledge(KNOWLEDGE);
const PROMPT = retrievalPromptFor(OBJECTIVE!, "prompt-1");

const EVALUATION = {
  confidence: 0.9,
  demonstrated: ["the brand for losartan"],
  feedback: "",
  misconceptions: [],
  missing: [],
  verdict: "strong" as const,
};

/** The evidence INSERT, sliced from its own function.
 *
 *  🔴 ANCHORED ON `recordEvidence`, NOT ON THE FIRST `.upsert(` IN THE FILE. `saveKnowledge` sits
 *  above it and upserts too, so a bare `indexOf` slices the wrong function — and a guard reading
 *  the wrong region passes for reasons that have nothing to do with what it claims. */
function evidenceInsert(): string {
  const store = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");
  const fn = store.indexOf("export async function recordEvidence");
  assert.notEqual(fn, -1);
  const end = store.indexOf("ignoreDuplicates", fn);
  assert.ok(end > fn, "recordEvidence must still upsert");
  return store.slice(fn, end);
}

/** The evidence SELECT, sliced from `loadEvidence` for the same reason. */
function evidenceSelect(): string {
  const store = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");
  const fn = store.indexOf("export async function loadEvidence");
  assert.notEqual(fn, -1);
  const end = store.indexOf('.in("objective_id"', fn);
  assert.ok(end > fn, "loadEvidence must still filter by objective");
  return store.slice(fn, end);
}

function judged(response: { text: string; via: "typed" | "spoken"; tookMs?: number }) {
  return evidenceFromEvaluation({
    canvasId: null,
    evaluation: EVALUATION,
    objectiveRowId: "row-1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: PROMPT,
    response,
  });
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

  const explain = retrievalPromptFor({ ...OBJECTIVE!, capability: "explain" }, "prompt-2");
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
    objectiveRowId: "row-1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: PROMPT,
    responseText: "I don't know",
    tookMs: 4_100,
  });

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
    objectiveRowId: "row-1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: PROMPT,
    responseText: null,
  });
  assert.equal(built.responseLatencyMs, undefined);
  assert.equal("responseLatencyMs" in built && built.responseLatencyMs !== undefined, false);
});

// ── 5. absent stays absent across the boundary ──────────────────────────────

test("🔴 the writer sends null, never a default, for anything unobserved", () => {
  for (const field of ["operation", "response_latency_ms", "scaffolding_level"]) {
    const insert = evidenceInsert();
    assert.ok(insert.includes(`${field}:`), `${field} must be written`);
    assert.equal(
      new RegExp(`${field}:[^,]*\\?\\?\\s*0`).test(insert),
      false,
      `${field} defaults to 0 — a row nobody measured would claim a measurement`,
    );
  }
});

test("🔴 the reader omits an unobserved field rather than coercing it", () => {
  // Historical rows predate all three columns. They must read back as "not observed" — and `?? 0`
  // would turn every one of them into a claim that the learner answered instantly, unaided.
  const store = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");
  const mapper = store.slice(store.indexOf(".map((row) => ({"));
  for (const [column, field] of [
    ["operation", "operation"],
    ["response_latency_ms", "responseLatencyMs"],
    ["scaffolding_level", "scaffoldingLevel"],
  ]) {
    assert.ok(
      new RegExp(`row\\.${column} == null \\? \\{\\} : \\{ ${field}`).test(mapper),
      `${field} must be spread only when the column is present`,
    );
  }
});

// ── 6. the round trip is real ───────────────────────────────────────────────

test("🔴 every observation written is also SELECTED back", () => {
  // Six structural fields have died at a boundary in this codebase by being written and never read,
  // each passing every test on both sides. A field the reader does not ask for is not persisted
  // state, it is a column nobody will discover is unreachable until something needs it.
  const insert = evidenceInsert();
  const select = evidenceSelect();

  for (const field of ["operation", "response_latency_ms", "scaffolding_level"]) {
    assert.ok(insert.includes(`${field}:`), `${field} is not written`);
    assert.ok(select.includes(field), `${field} is written and never read back`);
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
