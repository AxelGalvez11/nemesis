// pnpm --filter @nemesis/web exec tsx lib/billing-contract.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkoutIdempotencyKey,
  customerIdempotencyKey,
  INTERVAL_PRICE_CENTS,
  planLabel,
  reusableCheckoutUrl,
  stripePriceMatchesInterval,
  stripeKeyMode,
  subscriptionCheckoutTerms,
  subscriptionGrantsAccess,
  subscriptionRemainsOpen,
  subscriptionWebhookAction,
} from "./billing-contract";

// ── What the customer is shown ──────────────────────────────────────────────
//
// Every retired tier reads as "Nemesis". A stored plan that labels itself with a
// name nobody can buy is how "half the app still says Pro" happens.
assert.equal(planLabel("plus"), "Nemesis");
assert.equal(planLabel("pro"), "Nemesis");
assert.equal(planLabel("max"), "Nemesis");
assert.equal(planLabel("student"), "Nemesis");
assert.equal(planLabel("nemesis"), "Nemesis");
assert.equal(planLabel("free"), "Free");
assert.equal(planLabel(null), "Free");
assert.equal(planLabel("gibberish"), "Free", "an unknown code can only fail to grant");

assert.equal(subscriptionGrantsAccess("active"), true);
assert.equal(subscriptionGrantsAccess("trialing"), true);
assert.equal(subscriptionGrantsAccess("past_due"), true);
assert.equal(subscriptionGrantsAccess("canceled"), false);
assert.equal(subscriptionRemainsOpen("incomplete_expired"), false);
assert.equal(subscriptionRemainsOpen("past_due"), true);
assert.equal(stripeKeyMode("sk_test_example"), "test");
assert.equal(stripeKeyMode("rk_live_example"), "live");
assert.equal(stripeKeyMode("not-a-key"), "unknown");

// ── The two prices ──────────────────────────────────────────────────────────
assert.equal(INTERVAL_PRICE_CENTS.monthly, 1_999, "$19.99");
assert.equal(INTERVAL_PRICE_CENTS.annual, 19_999, "$199.99");

assert.equal(stripePriceMatchesInterval("monthly", {
  active: true,
  currency: "usd",
  recurring: { interval: "month" },
  type: "recurring",
  unit_amount: 1_999,
}), true, "the monthly Nemesis price");

assert.equal(stripePriceMatchesInterval("annual", {
  active: true,
  currency: "usd",
  recurring: { interval: "year" },
  type: "recurring",
  unit_amount: 19_999,
}), true, "the annual Nemesis price");

// 🔴 THE CROSS-WIRING CASE. A configuration that swaps the two variables gives
// each interval a real, active, correctly-priced Stripe Price — just the wrong
// one. Charging $199.99 as a monthly subscription is the worst outcome in this
// file, and it is caught by the interval, not by the amount.
assert.equal(stripePriceMatchesInterval("monthly", {
  active: true,
  currency: "usd",
  recurring: { interval: "year" },
  type: "recurring",
  unit_amount: 19_999,
}), false, "the annual price must not pass as monthly");
assert.equal(stripePriceMatchesInterval("annual", {
  active: true,
  currency: "usd",
  recurring: { interval: "month" },
  type: "recurring",
  unit_amount: 1_999,
}), false, "the monthly price must not pass as annual");

// The retired ladder's amounts, offered as the new ones.
assert.equal(stripePriceMatchesInterval("monthly", {
  active: true,
  currency: "usd",
  recurring: { interval: "month" },
  type: "recurring",
  unit_amount: 999,
}), false, "retired Student's $9.99 must not pass");
assert.equal(stripePriceMatchesInterval("annual", {
  active: true,
  currency: "usd",
  recurring: { interval: "year" },
  type: "recurring",
  unit_amount: 9_600,
}), false, "the earlier $96 annual draft must not pass");

// An archived price is not a sellable one.
assert.equal(stripePriceMatchesInterval("monthly", {
  active: false,
  currency: "usd",
  recurring: { interval: "month" },
  type: "recurring",
  unit_amount: 1_999,
}), false, "an archived price must not pass");
assert.equal(stripePriceMatchesInterval("monthly", {
  active: true,
  currency: "eur",
  recurring: { interval: "month" },
  type: "recurring",
  unit_amount: 1_999,
}), false, "a non-USD price must not pass");

// 🔴 WHAT THIS GUARD CANNOT DO, WRITTEN DOWN. Retired Agent Pro charged exactly
// $19.99 a month, so a stale STRIPE_PRO_PRICE_ID would satisfy every assertion
// above. Identity comes from reading the price ID through `nemesisPriceIdFor`
// in lib/stripe.ts; this function only ever proves the AMOUNT is right.
assert.equal(stripePriceMatchesInterval("monthly", {
  active: true,
  currency: "usd",
  recurring: { interval: "month" },
  type: "recurring",
  unit_amount: INTERVAL_PRICE_CENTS.monthly,
}), true, "the old Agent Pro amount is indistinguishable here, by design");

// ── Resuming an open checkout ───────────────────────────────────────────────
const now = Date.parse("2026-07-12T12:00:00Z");
assert.equal(reusableCheckoutUrl([
  { mode: "subscription", status: "open", url: "https://checkout.example/session", expires_at: now / 1000 + 60, metadata: { user_id: "u1", interval: "monthly", plan: "nemesis" } },
], "u1", "monthly", now), "https://checkout.example/session");
// Someone who opened monthly and then chose yearly must get a NEW session, not
// the old one — otherwise the toggle silently does nothing.
assert.equal(reusableCheckoutUrl([
  { mode: "subscription", status: "open", url: "https://checkout.example/wrong-interval", metadata: { user_id: "u1", interval: "monthly", plan: "nemesis" } },
], "u1", "annual", now), null);
// A session belonging to someone else is never reused.
assert.equal(reusableCheckoutUrl([
  { mode: "subscription", status: "open", url: "https://checkout.example/other", metadata: { user_id: "u2", interval: "monthly", plan: "nemesis" } },
], "u1", "monthly", now), null);
// A legacy session, opened before intervals existed, carries no interval and
// must not be reused rather than being reused for the wrong thing.
assert.equal(reusableCheckoutUrl([
  { mode: "subscription", status: "open", url: "https://checkout.example/legacy", metadata: { user_id: "u1", plan: "pro" } },
], "u1", "monthly", now), null);

assert.equal(
  checkoutIdempotencyKey("u1", "test", "attempt-1"),
  "nemesis-checkout:test:u1:attempt-1",
);
assert.notEqual(
  checkoutIdempotencyKey("u1", "test", "attempt-1"),
  checkoutIdempotencyKey("u1", "test", "attempt-2"),
);
assert.equal(customerIdempotencyKey("u1", "live"), "nemesis-customer:live:u1");

// Freemium (2026-07-20): checkout terms NEVER include a trial — paid plans bill
// immediately; the free plan is the try-before-you-buy path.
assert.deepEqual(subscriptionCheckoutTerms(), {
  payment_method_collection: "always",
  payment_method_types: ["card"],
  subscription_data: {},
});
assert.ok(!JSON.stringify(subscriptionCheckoutTerms()).includes("trial"), "no trial keys in checkout terms");

// ── Webhook events we act on ────────────────────────────────────────────────
assert.equal(subscriptionWebhookAction("customer.subscription.created"), "created");
assert.equal(subscriptionWebhookAction("customer.subscription.updated"), "updated");
assert.equal(subscriptionWebhookAction("customer.subscription.deleted"), "deleted");
assert.equal(subscriptionWebhookAction("customer.subscription.trial_will_end"), "trial_will_end");
assert.equal(subscriptionWebhookAction("invoice.paid"), null);
// A failed payment is NOT handled here: Stripe moves the subscription to
// past_due and sends customer.subscription.updated, which is what actually
// carries the state. `subscriptionGrantsAccess("past_due")` is true on purpose —
// a card that fails on renewal must not lock a student out mid-week while
// Stripe is still retrying.
assert.equal(subscriptionWebhookAction("invoice.payment_failed"), null);
assert.equal(subscriptionGrantsAccess("past_due"), true, "a retrying card keeps access");
assert.equal(subscriptionGrantsAccess("unpaid"), false, "an exhausted retry schedule does not");

// ── The choice has to survive the hop from the marketing site ───────────────
//
// 🔴 FOUND IN THE BROWSER, NOT BY A TEST. www.enternemesis.com links here as
// /pricing?interval=annual when someone presses "Get Nemesis" under the yearly
// toggle. Reading that parameter only inside the resume-checkout effect meant it
// applied ONLY to someone already signed in — everyone else landed on a page
// showing $19.99 a month, having just chosen $16.67.
//
// This is a source assertion, which is weaker than rendering the component: it
// proves the parameter reaches the initial state, not that the toggle paints.
// The paint was checked in the browser at 375px and 1280px, light and dark.
const pricingPage = readFileSync(new URL("../app/pricing/page.tsx", import.meta.url), "utf8");
assert.match(
  pricingPage,
  /useState<CheckoutInterval>\(\s*\(\)\s*=>\s*asInterval\(params\.get\("interval"\)\)/,
  "the pricing page must take its opening interval from the URL",
);
// And an unrecognised value must fall back to the CHEAPER commitment, never the
// larger charge.
assert.match(pricingPage, /\?\?\s*"monthly"/, "an unknown interval means monthly");

// ── Nothing may gate a capability on a tier name ────────────────────────────
//
// 🔴 THE FAILURE THIS CATCHES IS COMPLETELY SILENT, AND IT ALREADY HAPPENED.
// `resolve_user_plan` now returns the canonical `nemesis` / `free` /
// `enterprise`, so every `plan === 'pro'` in the edge functions stopped matching
// the moment the migration landed. Three of them lived in nemesis-llm and gated
// the premium reasoning lane: High-effort turns would have quietly stopped being
// upgraded for EVERY user, including the owner's own comped account, with no
// error, no failing test and nothing visible in the browser. A fourth, in the
// news gate, would have shown paying subscribers the unpaid teaser.
//
// This scans for equality against a retired tier name in the functions that
// decide what a user can do. Compatibility LISTS are fine and are how old
// records keep working; it is a lone `=== "pro"` deciding a capability that is
// the bug.
const GATED_FUNCTIONS = [
  "supabase/functions/nemesis-llm/index.ts",
  "supabase/functions/ask/index.ts",
  "supabase/functions/nemesis-media/index.ts",
  "supabase/functions/research/index.ts",
] as const;

for (const path of GATED_FUNCTIONS) {
  const source = readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  for (const tier of ["pro", "plus", "max", "student", "professional"]) {
    const gate = new RegExp(`plan\\s*[!=]==?\\s*['"\`]${tier}['"\`]`);
    assert.doesNotMatch(
      source,
      gate,
      `${path} still decides something by comparing the plan to "${tier}" -- a code resolve_user_plan no longer returns`,
    );
  }
}

console.log("billing-contract.test.ts OK");
