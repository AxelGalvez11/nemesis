/**
 * When a stronger model is bought, and the four ways that decision could quietly become a bill.
 *
 * 🔴 THE TEST THAT MATTERS MOST IS THE ONE ABOUT PLANS. The owner's rule is that a paid tier raises
 * the CEILING and never the default, and the failure mode is invisible from the outside: a Max
 * learner and a free learner both get good answers, and only the invoice knows one of them paid for
 * a stronger model on every ordinary turn. So the plan is asserted to change nothing about an
 * ordinary turn, on every plan there is.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseCanvasModel,
  escalationCeiling,
  EscalationLedger,
  ESCALATION_CEILING,
} from "./canvas-escalation";

const FRESH = { plan: null, spent: 0 };

test("🔴 an ordinary turn uses the cheap model, on every plan there is", () => {
  for (const plan of [null, "free", "plus", "pro", "max", "something-new"]) {
    const choice = chooseCanvasModel({ alreadyEscalatedThisTurn: false, reason: null }, { plan, spent: 0 });
    assert.equal(choice.model, "deepseek-chat", `${plan} must not change the default`);
    assert.equal(choice.escalated, false);
    assert.equal(choice.reason, null);
  }
});

test("🔴 a paid plan raises the ceiling and nothing else", () => {
  assert.ok(escalationCeiling("max") > escalationCeiling("free"));
  assert.ok(escalationCeiling("pro") > escalationCeiling("plus"));
  assert.equal(escalationCeiling("MAX"), ESCALATION_CEILING.max);
  assert.equal(escalationCeiling("nonsense"), ESCALATION_CEILING.free);
  assert.equal(escalationCeiling(null), ESCALATION_CEILING.free);
  // And the free ceiling is not zero: a learner whose first lesson fails to parse and who cannot be
  // rescued has a broken product, not a cheap one.
  assert.ok(ESCALATION_CEILING.free! > 0);
});

test("a named reason escalates, and the reason travels with the choice", () => {
  const choice = chooseCanvasModel(
    { alreadyEscalatedThisTurn: false, reason: "cheap-model-unusable-output" },
    FRESH,
  );
  assert.equal(choice.escalated, true);
  assert.equal(choice.model, "deepseek-reasoner");
  assert.equal(choice.reason, "cheap-model-unusable-output");
  assert.ok(choice.detail.length > 0, "a reason nobody can read is not a reason");
});

test("🔴 a turn escalates once — a second rescue is a retry loop, not a decision", () => {
  const choice = chooseCanvasModel(
    { alreadyEscalatedThisTurn: true, reason: "cheap-model-unusable-output" },
    FRESH,
  );
  assert.equal(choice.escalated, false);
  assert.match(choice.detail, /already been escalated/);
});

test("🔴 a session that has spent its ceiling fails honestly rather than expensively", () => {
  const spent = escalationCeiling("free");
  const choice = chooseCanvasModel(
    { alreadyEscalatedThisTurn: false, reason: "judgement-did-not-settle" },
    { plan: "free", spent },
  );
  assert.equal(choice.escalated, false);
  assert.match(choice.detail, /escalation\(s\)/);
});

test("🔴 budget alone never buys the stronger model", () => {
  // The ordering matters: no reason is checked before any budget is. A caller with a full ceiling
  // and nothing wrong must not be able to reach the stronger model, or the ceiling becomes a target.
  const choice = chooseCanvasModel({ alreadyEscalatedThisTurn: false, reason: null }, { plan: "max", spent: 0 });
  assert.equal(choice.escalated, false);
});

test("the ledger charges when the escalation is decided, not when it succeeds", () => {
  // A stronger model that also failed was still billed. Counting only successes would make a
  // session that kept failing look free.
  const ledger = new EscalationLedger("pro");
  ledger.note("cheap-model-unusable-output");
  ledger.note("judgement-did-not-settle");
  ledger.note("cheap-model-unusable-output");
  assert.equal(ledger.spent, 3);
  assert.deepEqual(ledger.report().byReason, {
    "cheap-model-unusable-output": 2,
    "judgement-did-not-settle": 1,
  });
  assert.equal(ledger.report().ceiling, escalationCeiling("pro"));
});

test("🔴 the ledger cannot be un-spent by holding an old copy of it", () => {
  const ledger = new EscalationLedger("free");
  const before = ledger.state();
  ledger.note("cheap-model-unusable-output");
  assert.equal(before.spent, 0, "the old snapshot is a snapshot");
  assert.equal(ledger.state().spent, 1, "and the ledger is the ledger");
});

test("🔴 the rescue rung is the same model thinking, not a premium tier", () => {
  // `resolveModel` in the metering valve maps `deepseek-reasoner` to deepseek-v4-flash with
  // thinking enabled — the same per-token price. `deepseek-v4-pro` is 3.1x the input and output
  // rate for every token of the request. If this ever names the premium model, the cascade has
  // skipped the rung that costs almost nothing.
  const choice = chooseCanvasModel(
    { alreadyEscalatedThisTurn: false, reason: "cheap-model-unusable-output" },
    FRESH,
  );
  assert.equal(choice.model, "deepseek-reasoner");
  assert.notEqual(choice.model as string, "deepseek-v4-pro");
});
