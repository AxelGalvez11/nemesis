import type Stripe from "stripe";
import { effectivePlanCode, intervalFromStripe } from "@nemesis/shared";
import { adminClient } from "@/lib/server";
import { intervalForPriceId, planForPriceId, planFromStripeStatus, stripe } from "@/lib/stripe";

// The Stripe -> `subscriptions` mirror, shared by the webhook (Stripe pushes an event) and the
// checkout status route (the browser asks "did my payment land?" right after checkout, and
// mirrors it itself if the webhook has not arrived yet). One implementation so both agree.

function subscriptionItem(subscription: Stripe.Subscription) {
  return subscription.items.data.find((candidate) => planForPriceId(candidate.price.id) !== "free")
    ?? subscription.items.data[0];
}

function subscriptionPeriodEndSeconds(subscription: Stripe.Subscription): number | null {
  const item = subscriptionItem(subscription);
  const legacyPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  if (typeof item?.current_period_end === "number") return item.current_period_end;
  return typeof legacyPeriodEnd === "number" ? legacyPeriodEnd : null;
}

function entitledPlan(subscription: Stripe.Subscription) {
  const item = subscriptionItem(subscription);
  const plan = planFromStripeStatus(subscription.status, item?.price.id ?? null);
  const periodEnd = subscriptionPeriodEndSeconds(subscription);
  return plan !== "free" && periodEnd != null && periodEnd * 1000 > Date.now() ? plan : "free";
}

export async function reconcileCustomerSubscriptions(
  customerId: string,
  fallbackUserId: string | null,
  fallbackSubscription: Stripe.Subscription,
) {
  const subscriptions: Stripe.Subscription[] = [];
  for await (const subscription of stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
    subscriptions.push(subscription);
  }

  // 🔴 THE TIE-BREAK USED TO RANK pro ABOVE plus. With one paid product there is
  // nothing to rank: every entitled subscription grants the same Nemesis. What
  // still matters is picking the one that runs LONGEST, so a cancellation
  // arriving out of order cannot mirror a subscription that has already lapsed
  // over one that is still paying.
  const entitled = subscriptions
    .filter((subscription) => entitledPlan(subscription) !== "free")
    .sort((a, b) => (subscriptionPeriodEndSeconds(b) ?? 0) - (subscriptionPeriodEndSeconds(a) ?? 0));
  const newest = subscriptions.sort((a, b) => b.created - a.created)[0];
  return mirrorSubscription(entitled[0] ?? newest ?? fallbackSubscription, fallbackUserId);
}

export async function mirrorSubscription(subscription: Stripe.Subscription, fallbackUserId: string | null) {
  const admin = adminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = subscription.metadata.user_id
    || fallbackUserId
    || await lookupUserIdByCustomer(customerId, subscription.livemode);
  if (!userId) throw new Error(`No user_id for Stripe customer ${customerId}`);

  const item = subscriptionItem(subscription);
  const priceId = item?.price.id ?? null;
  // Resolve the plan from the actual price id — not "any recognized price is paid".
  const plan = planFromStripeStatus(subscription.status, priceId);
  // How often they pay, recorded next to the entitlement and never consulted to
  // decide one. Read from the configured Price ID first (that is the definitive
  // answer for a price we sell) and fall back to what Stripe says the price
  // recurs at, which is what a replayed LEGACY price will carry.
  const interval = intervalForPriceId(priceId)
    ?? intervalFromStripe(item?.price.recurring?.interval ?? null);
  // Dual-store rule: Stripe owns stripe_plan; the effective `plan` is the best
  // of both stores, so a Stripe cancellation cannot downgrade someone whose
  // Apple subscription (apple_plan, written by the RevenueCat webhook) still pays.
  const { data: existingRow, error: existingRowError } = await admin
    .from("subscriptions")
    .select("apple_plan")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingRowError) throw existingRowError;
  const currentPeriodEndSeconds = subscriptionPeriodEndSeconds(subscription);
  const currentPeriodEnd = typeof currentPeriodEndSeconds === "number"
    ? new Date(currentPeriodEndSeconds * 1000).toISOString()
    : null;
  const trialEnd = typeof subscription.trial_end === "number"
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  const { error: subscriptionMirrorError } = await admin.from("subscriptions").upsert({
    user_id: userId,
    // 🔴 effectivePlanCode, NOT effectivePlan. The plain version returns the
    // canonical `nemesis`, which would flatten a comped `enterprise` account to
    // a subscriber's allowance the first time any webhook fired for it.
    plan: effectivePlanCode(plan, existingRow?.apple_plan),
    stripe_plan: plan,
    billing_interval: interval,
    billing_provider: "stripe",
    status: subscription.status,
    stripe_customer_id: customerId,
    stripe_livemode: subscription.livemode,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_status: subscription.status,
    current_period_end: currentPeriodEnd,
    trial_end: trialEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (subscriptionMirrorError) throw subscriptionMirrorError;

  return { interval, userId, plan, priceId, subscriptionId: subscription.id };
}

export async function lookupUserIdByCustomer(customerId: string, livemode: boolean): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .eq("stripe_livemode", livemode)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.user_id === "string" ? data.user_id : null;
}
