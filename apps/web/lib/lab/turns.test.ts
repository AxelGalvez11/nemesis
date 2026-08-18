import assert from "node:assert/strict";
import { test } from "node:test";

import { foldTurns } from "./turns";
import type { LabTraceEvent } from "./trace";

let seq = 0;
const event = (kind: LabTraceEvent["kind"], label: string, detail: Record<string, unknown>, ms?: number): LabTraceEvent => ({
  at: 1_000 + (seq += 1),
  detail,
  kind,
  label,
  seq,
  ...(ms === undefined ? {} : { ms }),
});

test("a controller decision opens a turn and carries its choice", () => {
  const turns = foldTurns([
    event("controller", "llm_teacher → retrieve", {
      action: { type: "retrieve" },
      objective: { identityKey: "losartan:brand" },
      strategy: "llm_teacher",
    }, 900),
    event("judge", "partial", { errorType: "conceptual", question: "Which brand?", verdict: "partial" }),
    event("evidence", "writing 1 row(s)", { rows: [{ verdict: "partial" }] }),
  ]);
  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.strategy, "llm_teacher");
  assert.equal(turns[0]!.action, "retrieve");
  assert.equal(turns[0]!.objective, "losartan:brand");
  assert.equal(turns[0]!.verdict, "partial");
  assert.equal(turns[0]!.errorType, "conceptual");
  assert.equal(turns[0]!.evidenceRows, 1);
  assert.equal(turns[0]!.evidenceWritten, true);
});

test("🔴 no evidence write at all reads as null, never as zero rows written", () => {
  // The whole diagnostic value of §10 rests on this: "the judge marked it and nothing was saved"
  // and "no answer was given yet" must not render the same.
  const turns = foldTurns([
    event("controller", "nemesis_policy → retrieve", { action: { type: "retrieve" }, strategy: "nemesis_policy" }),
  ]);
  assert.equal(turns[0]!.evidenceRows, null);
  assert.equal(turns[0]!.evidenceWritten, null);
});

test("🔴 a failed write is recorded as failed, not as a write", () => {
  const turns = foldTurns([
    event("controller", "nemesis_policy → retrieve", { action: { type: "retrieve" }, strategy: "nemesis_policy" }),
    event("evidence", "writing 2 row(s)", { rows: [{}, {}] }),
    event("evidence", "🔴 the write FAILED, so nothing was recorded", { rows: [{}, {}] }),
  ]);
  assert.equal(turns[0]!.evidenceRows, 2);
  assert.equal(turns[0]!.evidenceWritten, false);
});

test("🔴 an unreported token count is null, never zero, and carries no cost", () => {
  const turns = foldTurns([
    event("controller", "llm_teacher → retrieve", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
    event("model_call", "deepseek-chat → deepseek-chat", { answeredBy: "deepseek-chat", usage: null }, 700),
  ]);
  assert.equal(turns[0]!.modelCalls, 1);
  assert.equal(turns[0]!.tokens, null, "a streamed turn reports no usage, and that is not 'it was free'");
  assert.equal(turns[0]!.costUsd, null);
});

test("reported tokens are summed across the turn and priced by the valve's own table", () => {
  const turns = foldTurns([
    event("controller", "llm_teacher → retrieve", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
    event("model_call", "a", { answeredBy: "deepseek-v4-flash", usage: { cacheHitTokens: 100, completionTokens: 50, promptTokens: 1000, totalTokens: 1050 } }, 500),
    event("model_call", "b", { answeredBy: "deepseek-v4-flash", usage: { cacheHitTokens: 0, completionTokens: 20, promptTokens: 400, totalTokens: 420 } }, 300),
  ]);
  assert.deepEqual(turns[0]!.tokens, { cacheHit: 100, completion: 70, prompt: 1400 });
  assert.ok((turns[0]!.costUsd ?? 0) > 0, "two priced calls cost something");
  assert.equal(turns[0]!.totalMs, 800);
});

test("🔴 the price table is keyed on what the provider ANSWERED, not on what we asked for", () => {
  // `deepseek-chat` is the name the client requests; the valve maps it and reports the model that
  // actually answered. Pricing on the requested name would silently price nothing, so this asserts
  // the requested name is genuinely unpriced and the answered name is not.
  const asked = foldTurns([
    event("controller", "x", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
    event("model_call", "d", { answeredBy: "deepseek-chat", usage: { cacheHitTokens: 0, completionTokens: 10, promptTokens: 10, totalTokens: 20 } }),
  ]);
  assert.equal(asked[0]!.costUsd, null);
  const answered = foldTurns([
    event("controller", "x", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
    event("model_call", "d", { answeredBy: "deepseek-v4-flash", usage: { cacheHitTokens: 0, completionTokens: 10, promptTokens: 10, totalTokens: 20 } }),
  ]);
  assert.ok((answered[0]!.costUsd ?? 0) > 0);
});

test("🔴 an unpriced model contributes tokens but no invented cost", () => {
  const turns = foldTurns([
    event("controller", "llm_teacher → retrieve", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
    event("model_call", "c", { answeredBy: "some-new-model-nobody-priced", usage: { cacheHitTokens: 0, completionTokens: 10, promptTokens: 10, totalTokens: 20 } }),
  ]);
  assert.ok(turns[0]!.tokens, "the tokens were reported");
  assert.equal(turns[0]!.costUsd, null, "an unpriced model must never read as $0.00");
});

test("work done before the first decision lands in the first turn rather than being lost", () => {
  const turns = foldTurns([
    event("knowledge", "resolved 12 objectives", { objectives: 12 }),
    event("model_call", "territory", { answeredBy: "deepseek-chat", usage: null }, 2000),
    event("controller", "llm_teacher → retrieve", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
  ]);
  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.events.length, 3);
  assert.equal(turns[0]!.strategy, "llm_teacher");
});

test("a second decision opens a second turn", () => {
  const turns = foldTurns([
    event("controller", "one", { action: { type: "retrieve" }, strategy: "llm_teacher" }),
    event("judge", "correct", { verdict: "correct" }),
    event("controller", "two", { action: { type: "explain" }, strategy: "llm_teacher" }),
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.verdict, "correct");
  assert.equal(turns[1]!.verdict, null, "the second turn has not judged anything yet");
  assert.equal(turns[1]!.action, "explain");
});
