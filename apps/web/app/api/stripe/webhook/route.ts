import type Stripe from "stripe";
import {
  NEMESIS_TRIAL_PERIOD_DAYS,
  isInvoicePaymentFailed,
  planLabel,
  subscriptionWebhookAction,
} from "@/lib/billing-contract";
import { buildCancellationEmail, buildPaymentFailedEmail, buildWelcomeEmail, sendEmail } from "@/lib/email";
import { appUrl, stripeWebhookSecret } from "@/lib/env";
import { adminClient, json, withRouteLog } from "@/lib/server";
import { assertStripeBillingWritesAllowed, planForPriceId, stripe, stripeFailureDetail } from "@/lib/stripe";
import { lookupUserIdByCustomer, reconcileCustomerSubscriptions } from "@/lib/stripe-mirror";
import { phServerCapture } from "@/lib/posthog-server";

export const runtime = "nodejs";

/** The signed-in email for a user id, or null. Best-effort: a lookup failure is logged, never thrown. */
async function emailForUser(userId: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient().auth.admin.getUserById(userId);
    if (error) {
      console.error("stripe_webhook_user_lookup_failed", { user_id: userId, message: error.message });
      return null;
    }
    return data.user?.email ?? null;
  } catch (error) {
    console.error("stripe_webhook_user_lookup_failed", {
      user_id: userId,
      message: error instanceof Error ? error.message : undefined,
    });
    return null;
  }
}

/**
 * A renewal charge bounced. Stripe keeps the subscription alive as `past_due` and retries on its
 * own schedule, so nothing is mirrored here: the only job is to tell the person, once, that the
 * card needs updating. Best-effort end to end, so a mail hiccup can never 500 the webhook.
 */
async function notifyPaymentFailed(invoice: Stripe.Invoice): Promise<string | null> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return null;
  try {
    const userId = await lookupUserIdByCustomer(customerId, invoice.livemode);
    if (!userId) {
      console.warn("stripe_webhook_payment_failed_no_user", { customer_id: customerId });
      return null;
    }
    const recipient = invoice.customer_email ?? await emailForUser(userId);
    if (!recipient) return userId;
    const { data: row } = await adminClient()
      .from("subscriptions")
      .select("stripe_plan")
      .eq("user_id", userId)
      .maybeSingle();
    const { subject, html, text } = buildPaymentFailedEmail({
      planName: planLabel(row?.stripe_plan ?? "nemesis"),
      portalUrl: `${appUrl}/settings`,
    });
    await sendEmail({ to: recipient, subject, html, text });
    return userId;
  } catch (error) {
    console.error("stripe_webhook_payment_failed_notice_failed", {
      customer_id: customerId,
      message: error instanceof Error ? error.message : undefined,
    });
    return null;
  }
}

/** The plan has ended. Tell the person, best-effort, with the date their access runs out. */
async function notifyCancellation(userId: string, plan: string, subscription: Stripe.Subscription): Promise<void> {
  try {
    const recipient = await emailForUser(userId);
    if (!recipient) return;
    const item = subscription.items.data[0];
    const legacyPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
    const periodEnd = typeof item?.current_period_end === "number" ? item.current_period_end : legacyPeriodEnd;
    const endsAt = typeof subscription.ended_at === "number" ? subscription.ended_at : periodEnd;
    const { subject, html, text } = buildCancellationEmail({
      planName: planLabel(plan),
      accessUntil: typeof endsAt === "number" && endsAt * 1000 > Date.now()
        ? new Date(endsAt * 1000).toISOString()
        : null,
    });
    await sendEmail({ to: recipient, subject, html, text });
  } catch (error) {
    console.error("stripe_webhook_cancellation_notice_failed", {
      user_id: userId,
      message: error instanceof Error ? error.message : undefined,
    });
  }
}

async function POSTHandler(req: Request) {
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

  // Idempotency. Stripe retries any event it did not get a 2xx for, and can deliver the same
  // event twice regardless. The mirror below is safe to repeat (it re-reads Stripe), but the
  // welcome email and the analytics events are not. Claim the event id first; a second delivery
  // finds the row and stops here.
  const admin = adminClient();
  const { error: claimError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, livemode: event.livemode });
  if (claimError) {
    if (claimError.code === "23505") {
      console.info("stripe_webhook_duplicate", { event_id: event.id, event_type: event.type });
      return json({ received: true, duplicate: true });
    }
    // The table is missing or unreachable: process anyway rather than drop billing events, but
    // say so, because from here on a retry could double-send the welcome email.
    console.error("stripe_webhook_claim_failed", { event_id: event.id, message: claimError.message });
  }

  let processedUserId: string | null = null;
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
        processedUserId = result.userId;
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

    if (isInvoicePaymentFailed(event.type)) {
      processedUserId = await notifyPaymentFailed(event.data.object as Stripe.Invoice);
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
      processedUserId = result.userId;
      if (subscriptionAction === "created") {
        await phServerCapture(result.userId, "subscription_started", {
          billing_interval: result.interval,
          plan: result.plan,
          price_id: result.priceId,
        });
      } else if (subscriptionAction === "deleted" && result.subscriptionId === eventSubscription.id) {
        await phServerCapture(result.userId, "subscription_canceled", {
          billing_interval: result.interval,
          plan: result.plan,
          price_id: result.priceId,
        });
        // Only when the deleted subscription is the one the mirror now holds: a stale cancellation
        // for an older subscription, while a newer one still pays, is not a goodbye.
        // The mirror now says "free"; the email should name the plan that ENDED, read from the
        // deleted subscription's own price.
        const endedPlan = planForPriceId(eventSubscription.items.data[0]?.price.id ?? null);
        await notifyCancellation(result.userId, endedPlan === "free" ? "nemesis" : endedPlan, eventSubscription);
      } else if (subscriptionAction === "trial_will_end") {
        await phServerCapture(result.userId, "subscription_trial_ending", {
          billing_interval: result.interval,
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
    // Release the claim so Stripe's retry gets a real second attempt.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return json({ error: "webhook_processing_failed" }, 500);
  }

  // The audit line the owner can search for: which event did what, for whom.
  console.info("stripe_webhook_processed", { event_id: event.id, event_type: event.type, user_id: processedUserId });
  return json({ received: true });
}

export const POST = withRouteLog(POSTHandler);
