import type Stripe from "stripe";
import { stripeWebhookSecret, stripePlusPriceId } from "@/lib/env";
import { adminClient, json } from "@/lib/server";
import { planFromStripeStatus, stripe } from "@/lib/stripe";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const subscription = await stripe().subscriptions.retrieve(session.subscription);
      await mirrorSubscription(subscription, session.client_reference_id ?? session.metadata?.user_id ?? null);
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await mirrorSubscription(event.data.object as Stripe.Subscription, null);
  }

  return json({ received: true });
}

async function mirrorSubscription(subscription: Stripe.Subscription, fallbackUserId: string | null) {
  const admin = adminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = subscription.metadata.user_id || fallbackUserId || await lookupUserIdByCustomer(customerId);
  if (!userId) throw new Error(`No user_id for Stripe customer ${customerId}`);

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const recognizedPlusPrice = priceId === stripePlusPriceId ? priceId : null;
  const plan = planFromStripeStatus(subscription.status, recognizedPlusPrice);
  const period = subscription as Stripe.Subscription & { current_period_end?: number };
  const currentPeriodEnd = typeof period.current_period_end === "number"
    ? new Date(period.current_period_end * 1000).toISOString()
    : null;

  await admin.from("subscriptions").upsert({
    user_id: userId,
    plan,
    status: subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_status: subscription.status,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function lookupUserIdByCustomer(customerId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return typeof data?.user_id === "string" ? data.user_id : null;
}
