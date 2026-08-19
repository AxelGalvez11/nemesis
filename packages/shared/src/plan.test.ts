import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  annualPerMonthCents,
  annualSavingPercent,
  canonicalPlan,
  formatUsdCents,
  FREE_VOICE_SECONDS_MONTH,
  effectivePlan,
  effectivePlanCode,
  entitlementPlanCode,
  intervalFromStripe,
  isInternalPlan,
  isLegacyPlanCode,
  isPaid,
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
  NEMESIS_VOICE_SECONDS_MONTH,
  planLabel,
  priceCents,
  VOICE_COUNTER_KEY,
  VOICE_ENTITLEMENT_KEY,
  voiceSecondsForCharacters,
  voiceSecondsForPlan,
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
  assert.equal(NEMESIS_MONTHLY_CENTS, 1_999, "$19.99/month");
  assert.equal(NEMESIS_ANNUAL_CENTS, 19_999, "$199.99/year");
  assert.equal(priceCents("monthly"), 1_999);
  assert.equal(priceCents("annual"), 19_999);
  assert.equal(formatUsdCents(NEMESIS_MONTHLY_CENTS), "$19.99");
  assert.equal(formatUsdCents(NEMESIS_ANNUAL_CENTS), "$199.99");
});

test("the annual plan displays $16.67 a month and charges $199.99 a year", () => {
  assert.equal(annualPerMonthCents(), 1_667);
  assert.equal(formatUsdCents(annualPerMonthCents()), "$16.67");
  // 🔴 THE DISPLAYED FIGURE IS ROUNDED AND DOES NOT MULTIPLY BACK. 1667 x 12 is
  // $200.04, four cents more than anyone is charged. That is not a bug; it is
  // why the UI is required to print the real annual charge beside it, and this
  // assertion exists so nobody "fixes" the rounding into a claim about billing.
  assert.notEqual(annualPerMonthCents() * 12, NEMESIS_ANNUAL_CENTS);
  assert.equal(annualPerMonthCents() * 12, 20_004);
});

test("the saving claim is arithmetic, not marketing", () => {
  // $19.99 x 12 = $239.88 against $199.99 -> $39.89 saved, 16.63%, shown as 17%.
  assert.equal(NEMESIS_MONTHLY_CENTS * 12, 23_988);
  assert.equal(NEMESIS_MONTHLY_CENTS * 12 - NEMESIS_ANNUAL_CENTS, 3_989);
  assert.equal(annualSavingPercent(), 17);
});

test("annual is NOT two months free, and the copy must not say so", () => {
  // $199.99 buys 10.005 months at the monthly rate, so the saving is a shade
  // under two months. "Save 17%" is true; "2 months free" is not.
  const monthsBought = NEMESIS_ANNUAL_CENTS / NEMESIS_MONTHLY_CENTS;
  assert.ok(monthsBought > 10 && monthsBought < 10.01, `bought ${monthsBought} months`);
  assert.ok(12 - monthsBought < 2, "the discount is less than two whole months");
});

// ── Conversational voice ────────────────────────────────────────────────────

test("paid Nemesis gets five hours of conversational voice a month", () => {
  assert.equal(NEMESIS_VOICE_SECONDS_MONTH, 18_000);
  assert.equal(NEMESIS_VOICE_SECONDS_MONTH / 3_600, 5);
  assert.equal(voiceSecondsForPlan("nemesis"), 18_000);
});

test("free gets enough voice to hear the feature, and not much more", () => {
  assert.equal(FREE_VOICE_SECONDS_MONTH, 900, "15 minutes");
  assert.equal(voiceSecondsForPlan("free"), 900);
  assert.ok(FREE_VOICE_SECONDS_MONTH < NEMESIS_VOICE_SECONDS_MONTH);
});

test("the voice meter is its OWN key, never lecture transcription's", () => {
  // 🔴 THE ASSERTION THAT MATTERS. Reusing either legacy key would silently
  // change what a limit live code already reserves against means.
  assert.equal(VOICE_ENTITLEMENT_KEY, "voice_seconds_month_limit");
  assert.equal(VOICE_COUNTER_KEY, "voice_seconds_month");
  assert.notEqual(VOICE_ENTITLEMENT_KEY, "transcription_seconds_month_limit");
  assert.notEqual(VOICE_ENTITLEMENT_KEY, "live_audio_seconds_month_limit");
  assert.equal(VOICE_COUNTER_KEY + "_limit", VOICE_ENTITLEMENT_KEY);
});

test("synthesised speech is metered in the same seconds as speech in", () => {
  // 850 characters a minute, so a 600-character reply is about 42 seconds.
  assert.equal(voiceSecondsForCharacters(600), 43);
  assert.equal(voiceSecondsForCharacters(0), 0);
  assert.equal(voiceSecondsForCharacters(-5), 0);
  // A call that reached the provider was paid for and can never meter as free.
  assert.equal(voiceSecondsForCharacters(1), 1);
});

test("neither plan's voice allowance comes from a lecture-hours number", () => {
  // The retired ladder was 3,600 / 108,000 / 252,000 transcription seconds.
  for (const retired of [3_600, 108_000, 252_000, 72_000]) {
    assert.notEqual(NEMESIS_VOICE_SECONDS_MONTH, retired);
    assert.notEqual(FREE_VOICE_SECONDS_MONTH, retired);
  }
});
