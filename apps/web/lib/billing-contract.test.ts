// pnpm --filter @nemesis/web exec tsx lib/billing-contract.test.ts
import assert from "node:assert/strict";
import {
  checkoutIdempotencyKey,
  customerIdempotencyKey,
  isTrialEligibleForSubscriptionHistory,
  planLabel,
  reusableCheckoutUrl,
  stripeKeyMode,
  subscriptionCheckoutTerms,
  subscriptionGrantsAccess,
  subscriptionRemainsOpen,
  subscriptionWebhookAction,
} from "./billing-contract";

assert.equal(planLabel("plus"), "Nemesis Student");
assert.equal(planLabel("pro"), "Nemesis Agent Pro");
assert.equal(subscriptionGrantsAccess("active"), true);
assert.equal(subscriptionGrantsAccess("trialing"), true);
assert.equal(subscriptionGrantsAccess("past_due"), true);
assert.equal(subscriptionGrantsAccess("canceled"), false);
assert.equal(subscriptionRemainsOpen("incomplete_expired"), false);
assert.equal(subscriptionRemainsOpen("past_due"), true);
assert.equal(stripeKeyMode("sk_test_example"), "test");
assert.equal(stripeKeyMode("rk_live_example"), "live");
assert.equal(stripeKeyMode("not-a-key"), "unknown");

const now = Date.parse("2026-07-12T12:00:00Z");
assert.equal(reusableCheckoutUrl([
  { mode: "subscription", status: "open", url: "https://checkout.example/session", expires_at: now / 1000 + 60, metadata: { user_id: "u1", plan: "plus" } },
], "u1", "plus", now), "https://checkout.example/session");
assert.equal(reusableCheckoutUrl([
  { mode: "subscription", status: "open", url: "https://checkout.example/wrong-plan", metadata: { user_id: "u1", plan: "pro" } },
], "u1", "plus", now), null);
assert.equal(
  checkoutIdempotencyKey("u1", "test", "attempt-1"),
  "nemesis-checkout:test:u1:attempt-1",
);
assert.notEqual(
  checkoutIdempotencyKey("u1", "test", "attempt-1"),
  checkoutIdempotencyKey("u1", "test", "attempt-2"),
);
assert.equal(customerIdempotencyKey("u1", "live"), "nemesis-customer:live:u1");
assert.equal(isTrialEligibleForSubscriptionHistory(false), true);
assert.equal(isTrialEligibleForSubscriptionHistory(true), false);

assert.deepEqual(subscriptionCheckoutTerms(false), {
  payment_method_collection: "always",
  payment_method_types: ["card"],
  subscription_data: {
    trial_period_days: 7,
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
  },
});
assert.deepEqual(subscriptionCheckoutTerms(true), {
  payment_method_collection: "always",
  payment_method_types: ["card"],
  subscription_data: {},
});
assert.equal(subscriptionWebhookAction("customer.subscription.created"), "created");
assert.equal(subscriptionWebhookAction("customer.subscription.updated"), "updated");
assert.equal(subscriptionWebhookAction("customer.subscription.deleted"), "deleted");
assert.equal(subscriptionWebhookAction("customer.subscription.trial_will_end"), "trial_will_end");
assert.equal(subscriptionWebhookAction("invoice.paid"), null);

console.log("billing-contract.test.ts OK");
