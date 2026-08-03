import type Stripe from "stripe";
import { effectivePlan } from "@nemesis/shared";
import { NEMESIS_TRIAL_PERIOD_DAYS, planLabel, subscriptionWebhookAction } from "@/lib/billing-contract";
import { buildWelcomeEmail, sendEmail } from "@/lib/email";
import { stripeWebhookSecret } from "@/lib/env";
import { adminClient, json } from "@/lib/server";
import {
  assertStripeBillingWritesAllowed,
  planForPriceId,
  planFromStripeStatus,
  stripe,
  stripeFailureDetail,
} from "@/lib/stripe";
import { phServerCapture } from "@/lib/posthog-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripeWebhookSecret) return json({ error: "STRIPE_WEBHOOK_SECRET missing" }, 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing signature" }, 400);

  let event: Stripe.Event;
  const body = await req.text();
  try {
    event = stripe().webhooks.constructEvent(body, signature, stripeWebhookSecret);
  } catch {
    return json({ error: "invalid signature" }, 400);
  }
  let expectedLivemode: boolean;
  try {
    expectedLivemode = assertStripeBillingWritesAllowed() === "live";
  } catch (error) {
    console.error("stripe_webhook_writes_disabled", stripeFailureDetail(error));
    return json({ error: "billing_writes_disabled" }, 503);
  }
  if (event.livemode !== expectedLivemode) {
    console.error("stripe_webhook_mode_mismatch", { event_id: event.id, event_livemode: event.livemode });
    return json({ error: "webhook_mode_mismatch" }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await stripe().subscriptions.retrieve(session.subscription);
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
        const result = await reconcileCustomerSubscriptions(
          customerId,
          session.client_reference_id ?? session.metadata?.user_id ?? null,
          subscription,
        );
        // Welcome/confirmation note for the buyer. Strictly best-effort: sendEmail never throws,
        // so a mail hiccup cannot 500 the webhook and make Stripe re-deliver the event.
        const recipient = session.customer_details?.email;
        if (recipient && result.plan !== "free") {
          const { subject, html, text } = buildWelcomeEmail({
            planName: planLabel(result.plan),
            trialing: subscription.status === "trialing",
            trialDays: NEMESIS_TRIAL_PERIOD_DAYS,
          });
          await sendEmail({ to: recipient, subject, html, text });
        }
      }
    }

    const subscriptionAction = subscriptionWebhookAction(event.type);
    if (subscriptionAction) {
      // Stripe does not guarantee event ordering, including across successive
      // subscription IDs for one customer. Reconcile the customer's complete
      // current set so a delayed cancellation for A cannot overwrite active B.
      const eventSubscription = event.data.object as Stripe.Subscription;
      const customerId = typeof eventSubscription.customer === "string"
        ? eventSubscription.customer
        : eventSubscription.customer.id;
      const result = await reconcileCustomerSubscriptions(
        customerId,
        eventSubscription.metadata.user_id ?? null,
        eventSubscription,
      );
      if (subscriptionAction === "created") {
        await phServerCapture(result.userId, "subscription_started", { plan: result.plan, price_id: result.priceId });
      } else if (subscriptionAction === "deleted" && result.subscriptionId === eventSubscription.id) {
        await phServerCapture(result.userId, "subscription_canceled", { plan: result.plan, price_id: result.priceId });
      } else if (subscriptionAction === "trial_will_end") {
        await phServerCapture(result.userId, "subscription_trial_ending", {
          plan: result.plan,
          price_id: result.priceId,
          trial_end: eventSubscription.trial_end
            ? new Date(eventSubscription.trial_end * 1000).toISOString()
            : null,
        });
      }
    }
  } catch (error) {
    console.error("stripe_webhook_processing_failed", {
      event_id: event.id,
      event_type: event.type,
      ...stripeFailureDetail(error),
      message: error instanceof Error ? error.message : undefined,
    });
    return json({ error: "webhook_processing_failed" }, 500);
  }

  return json({ received: true });
}

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

async function reconcileCustomerSubscriptions(
  customerId: string,
  fallbackUserId: string | null,
  fallbackSubscription: Stripe.Subscription,
) {
  const subscriptions: Stripe.Subscription[] = [];
  for await (const subscription of stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
    subscriptions.push(subscription);
  }

  const entitled = subscriptions
    .filter((subscription) => entitledPlan(subscription) !== "free")
    .sort((a, b) => {
      const planDifference = (entitledPlan(b) === "pro" ? 2 : 1) - (entitledPlan(a) === "pro" ? 2 : 1);
      return planDifference || (subscriptionPeriodEndSeconds(b) ?? 0) - (subscriptionPeriodEndSeconds(a) ?? 0);
    });
  const newest = subscriptions.sort((a, b) => b.created - a.created)[0];
  return mirrorSubscription(entitled[0] ?? newest ?? fallbackSubscription, fallbackUserId);
}

async function mirrorSubscription(subscription: Stripe.Subscription, fallbackUserId: string | null) {
  const admin = adminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = subscription.metadata.user_id
    || fallbackUserId
    || await lookupUserIdByCustomer(customerId, subscription.livemode);
  if (!userId) throw new Error(`No user_id for Stripe customer ${customerId}`);

  const item = subscriptionItem(subscription);
  const priceId = item?.price.id ?? null;
  // Resolve the plan from the actual price id (plus vs pro) — not "any recognized price = plus".
  const plan = planFromStripeStatus(subscription.status, priceId);
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
    plan: effectivePlan(plan, existingRow?.apple_plan),
    stripe_plan: plan,
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

  return { userId, plan, priceId, subscriptionId: subscription.id };
}

async function lookupUserIdByCustomer(customerId: string, livemode: boolean): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .eq("stripe_livemode", livemode)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.user_id === "string" ? data.user_id : null;
}
