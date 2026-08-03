// The dual-store rule: a student paying on both Stripe and Apple gets the
// HIGHER plan, and losing one subscription falls back to the other instead of
// to free. node:test so the same file runs under Deno and Node (see
// onboarding.test.ts for the precedent).
import assert from "node:assert/strict";
import { test } from "node:test";

import { effectivePlan, planRank } from "./entitlements.ts";

test("higher plan wins regardless of which store it came from", () => {
  assert.equal(effectivePlan("plus", "pro"), "pro");
  assert.equal(effectivePlan("pro", "plus"), "pro");
  assert.equal(effectivePlan("free", "plus"), "plus");
  assert.equal(effectivePlan("plus", "free"), "plus");
});

test("one store lapsing falls back to the other, not to free", () => {
  // Apple subscription expired (webhook wrote "free") while Stripe still pays.
  assert.equal(effectivePlan("pro", "free"), "pro");
  // Stripe canceled while Apple still pays.
  assert.equal(effectivePlan("free", "plus"), "plus");
});

test("missing columns read as free — never as access", () => {
  assert.equal(effectivePlan(null, null), "free");
  assert.equal(effectivePlan(undefined, "pro"), "pro");
  assert.equal(effectivePlan("plus", undefined), "plus");
});

test("an unknown string can only fail to grant, never grant", () => {
  assert.equal(effectivePlan("platinum", null), "free");
  assert.equal(effectivePlan("platinum", "plus"), "plus");
  assert.equal(planRank("nonsense"), 0);
});

test("max outranks pro on either side", () => {
  assert.equal(effectivePlan("max", "pro"), "max");
  assert.equal(effectivePlan("plus", "max"), "max");
});
