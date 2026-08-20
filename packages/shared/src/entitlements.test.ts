// The dual-store rule: a student paying on both Stripe and Apple keeps access
// while EITHER store is paying, and losing one falls back to the other instead
// of to free. node:test so the same file runs under Deno and Node.
//
// 🔴 THIS FILE USED TO ASSERT A LADDER (plus < pro < max). It no longer can:
// there is one paid product, so there is nothing to rank. What survives is the
// property that actually protected subscribers -- neither store can downgrade
// the other -- and it is now asserted on the collapsed answer.
import assert from "node:assert/strict";
import { test } from "node:test";

import { effectivePlan } from "./entitlements.ts";

test("either store paying is enough", () => {
  assert.equal(effectivePlan("nemesis", null), "nemesis");
  assert.equal(effectivePlan(null, "nemesis"), "nemesis");
  assert.equal(effectivePlan("nemesis", "nemesis"), "nemesis");
});

test("one store lapsing falls back to the other, not to free", () => {
  // Apple expired (webhook wrote "free") while Stripe still pays.
  assert.equal(effectivePlan("nemesis", "free"), "nemesis");
  // Stripe canceled while Apple still pays.
  assert.equal(effectivePlan("free", "nemesis"), "nemesis");
});

test("missing columns read as free -- never as access", () => {
  assert.equal(effectivePlan(null, null), "free");
  assert.equal(effectivePlan("free", "free"), "free");
});

test("an unknown string can only fail to grant, never grant", () => {
  assert.equal(effectivePlan("platinum", null), "free");
  assert.equal(effectivePlan("platinum", "nemesis"), "nemesis");
});

test("every retired tier name still grants the one paid product", () => {
  for (const legacy of ["plus", "pro", "max", "student", "professional", "trial"]) {
    assert.equal(effectivePlan(legacy, null), "nemesis", legacy);
    assert.equal(effectivePlan(null, legacy), "nemesis", legacy);
  }
});
