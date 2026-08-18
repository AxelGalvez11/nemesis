import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  annualPerMonthCents,
  annualSavingPercent,
  canonicalPlan,
  effectivePlan,
  effectivePlanCode,
  entitlementPlanCode,
  intervalFromStripe,
  isInternalPlan,
  isLegacyPlanCode,
  isPaid,
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
  planLabel,
  priceCents,
} from "./plan.ts";

// ── The two answers ─────────────────────────────────────────────────────────

test("free is free and Nemesis is paid", () => {
  assert.equal(canonicalPlan("free"), "free");
  assert.equal(canonicalPlan("nemesis"), "nemesis");
  assert.equal(isPaid(canonicalPlan("nemesis")), true);
  assert.equal(isPaid(canonicalPlan("free")), false);
});

test("an unknown, empty or corrupted plan can only fail to grant access", () => {
  for (const bad of [null, undefined, "", "   ", "NEMESIS_PRO", "gold", "premium", "1"]) {
    assert.equal(canonicalPlan(bad), "free", `"${String(bad)}" must not grant access`);
  }
});

test("plan codes are matched case- and whitespace-insensitively", () => {
  assert.equal(canonicalPlan("  PRO "), "nemesis");
  assert.equal(canonicalPlan("Nemesis"), "nemesis");
});

// ── Legacy compatibility ────────────────────────────────────────────────────
//
// Production held no external paying legacy subscribers on 2026-08-17, but old
// codes still arrive in Stripe webhook events and RevenueCat payloads. Each of
// these must keep granting the full product.

test("every legacy paid tier resolves to the Nemesis entitlement", () => {
  for (const legacy of ["plus", "pro", "max", "student", "professional", "trial"]) {
    assert.equal(canonicalPlan(legacy), "nemesis", `${legacy} must keep paid access`);
    assert.equal(isLegacyPlanCode(legacy), true);
  }
});

test("a legacy subscriber reads their entitlements from the Nemesis row set", () => {
  assert.equal(entitlementPlanCode("pro"), "nemesis");
  assert.equal(entitlementPlanCode("student"), "nemesis");
  assert.equal(entitlementPlanCode("max"), "nemesis");
  assert.equal(entitlementPlanCode("free"), "free");
});

test("legacy tiers are NOT shown to the customer by their old names", () => {
  for (const legacy of ["plus", "pro", "max", "student", "professional"]) {
    assert.equal(planLabel(legacy), "Nemesis");
  }
  assert.equal(planLabel("free"), "Free");
  assert.equal(planLabel(null), "Free");
});

// ── Internal comps ──────────────────────────────────────────────────────────

test("internal comp accounts keep paid access AND their own entitlement rows", () => {
  assert.equal(canonicalPlan("enterprise"), "nemesis", "comps must not lose access");
  assert.equal(isInternalPlan("enterprise"), true);
  // The one place the collapse to two plans deliberately does not apply: folding
  // this to `nemesis` would cap the owner's own testing account at a student's
  // allowance.
  assert.equal(entitlementPlanCode("enterprise"), "enterprise");
});

test("a comp is never flattened by a webhook writing back the effective plan", () => {
  assert.equal(effectivePlanCode("enterprise", null), "enterprise");
  assert.equal(effectivePlanCode(null, "enterprise"), "enterprise");
  // and an ordinary paid subscription still normalises
  assert.equal(effectivePlanCode("pro", null), "nemesis");
  assert.equal(effectivePlanCode(null, null), "free");
});

// ── Dual store ──────────────────────────────────────────────────────────────

test("either store paying is enough, and neither can downgrade the other", () => {
  assert.equal(effectivePlan("nemesis", null), "nemesis");
  assert.equal(effectivePlan(null, "nemesis"), "nemesis");
  assert.equal(effectivePlan("free", "nemesis"), "nemesis", "Apple carries a lapsed Stripe");
  assert.equal(effectivePlan("nemesis", "free"), "nemesis", "Stripe carries a lapsed Apple");
  assert.equal(effectivePlan("free", "free"), "free");
  assert.equal(effectivePlan(null, null), "free");
});

test("a legacy code in one store and nothing in the other still grants Nemesis", () => {
  assert.equal(effectivePlan("pro", null), "nemesis");
  assert.equal(effectivePlan(null, "student"), "nemesis");
});

// ── Billing interval is not a capability ────────────────────────────────────

test("monthly and annual are the SAME entitlement", () => {
  // There is deliberately no function that takes an interval and returns
  // capabilities. This test documents the absence: entitlement is derived from
  // the plan alone, so annual cannot drift into being a tier.
  assert.equal(canonicalPlan("nemesis"), "nemesis");
  assert.equal(entitlementPlanCode("nemesis"), "nemesis");
});

test("Stripe intervals map, and anything else is not a Nemesis price", () => {
  assert.equal(intervalFromStripe("month"), "monthly");
  assert.equal(intervalFromStripe("year"), "annual");
  for (const bad of ["week", "day", "quarter", null, undefined, ""]) {
    assert.equal(intervalFromStripe(bad), null, `${String(bad)} must not be accepted`);
  }
});

// ── Price ───────────────────────────────────────────────────────────────────

test("the prices are exactly what the owner set", () => {
  assert.equal(NEMESIS_MONTHLY_CENTS, 1_900, "$19.00/month");
  assert.equal(NEMESIS_ANNUAL_CENTS, 9_600, "$96.00/year");
  assert.equal(priceCents("monthly"), 1_900);
  assert.equal(priceCents("annual"), 9_600);
});

test("the advertised $8/month is the real annual price divided by twelve", () => {
  // 9600 / 12 = 800 exactly. If the annual price ever stops dividing evenly this
  // still returns a rounded figure, and the UI is required to print the true
  // annual charge next to it.
  assert.equal(annualPerMonthCents(), 800);
  assert.equal(annualPerMonthCents() * 12, NEMESIS_ANNUAL_CENTS);
});

test("the saving claim is arithmetic, not marketing", () => {
  // $19 x 12 = $228 against $96.
  assert.equal(NEMESIS_MONTHLY_CENTS * 12, 22_800);
  assert.equal(annualSavingPercent(), 58);
});
