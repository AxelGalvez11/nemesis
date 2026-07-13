import { appUrl, stripeMaxPriceId, stripePlusPriceId, stripeProPriceId } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { assertStripeBillingWritesAllowed, stripe, stripeFailureDetail } from "@/lib/stripe";
import {
  checkoutIdempotencyKey,
  customerIdempotencyKey,
  reusableCheckoutUrl,
  subscriptionCheckoutTerms,
  subscriptionRemainsOpen,
} from "@/lib/billing-contract";

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    // Which plan to buy. Defaults to plus (no body) for backward compatibility.
    let plan: "plus" | "pro" | "max" = "plus";
    try {
      const body = await req.json();
      if (body?.plan === "pro" || body?.plan === "max") plan = body.plan;
    } catch { /* no body → plus */ }
    const priceByPlan = { plus: stripePlusPriceId, pro: stripeProPriceId, max: stripeMaxPriceId } as const;
    const priceId = priceByPlan[plan];
    if (!priceId) return json({ error: `STRIPE_${plan.toUpperCase()}_PRICE_ID missing` }, 500);

    const stripeClient = stripe();
    const mode = assertStripeBillingWritesAllowed();
    const livemode = mode === "live";
    const admin = adminClient();
    const attemptId = crypto.randomUUID();
    const { data: lockClaimed, error: lockClaimError } = await admin.rpc("claim_stripe_checkout_lock", {
      p_user_id: user.id,
      p_lock_token: attemptId,
      p_ttl_seconds: 90,
    });
    if (lockClaimError) throw lockClaimError;
    if (lockClaimed !== true) {
      return json({ error: "checkout_in_progress", message: "Another checkout is already opening." }, 409);
    }

    try {
    const { data: existing, error: subscriptionReadError } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, stripe_livemode, stripe_subscription_id, trial_end")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subscriptionReadError) throw subscriptionReadError;

    const existingInCurrentMode = existing?.stripe_livemode === livemode;
    let customerId = existingInCurrentMode
      ? existing.stripe_customer_id as string | null | undefined
      : null;
    let hasSubscriptionHistory = existingInCurrentMode
      && Boolean(existing?.stripe_subscription_id || existing?.trial_end);
    if (customerId) {
      // Paid users change tiers in Stripe's portal. Starting another subscription checkout for the
      // same customer can leave both tiers active and double-charge them.
      let hasOpenSubscription = false;
      for await (const subscription of stripeClient.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
        // Any prior subscription, including canceled/incomplete-expired, consumes the one-time trial.
        hasSubscriptionHistory = true;
        if (subscriptionRemainsOpen(subscription.status)) {
          hasOpenSubscription = true;
        }
      }
      if (hasOpenSubscription) {
        const portal = await stripeClient.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${appUrl}/account/billing`,
        });
        return json({ url: portal.url, mode: "portal" });
      }

      const openCheckoutSessions = [];
      for await (const checkoutSession of stripeClient.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
        openCheckoutSessions.push(checkoutSession);
      }
      const existingCheckoutUrl = reusableCheckoutUrl(openCheckoutSessions, user.id, plan);
      if (existingCheckoutUrl) return json({ url: existingCheckoutUrl, mode: "checkout" });

      // A student must never be able to complete two different plan checkouts
      // from separate tabs. Expire any prior Nemesis subscription session
      // before creating the newly selected plan.
      for (const checkoutSession of openCheckoutSessions) {
        if (
          checkoutSession.mode === "subscription" &&
          checkoutSession.metadata?.user_id === user.id &&
          checkoutSession.status === "open"
        ) {
          await stripeClient.checkout.sessions.expire(checkoutSession.id);
        }
      }
    } else {
      const customer = await stripeClient.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      }, { idempotencyKey: customerIdempotencyKey(user.id, mode) });
      customerId = customer.id;
      const { error: customerMirrorError } = await admin.from("subscriptions").upsert({
        user_id: user.id,
        plan: "free",
        status: "active",
        stripe_customer_id: customerId,
        stripe_livemode: livemode,
        stripe_subscription_id: null,
        stripe_price_id: null,
        stripe_status: null,
        current_period_end: null,
        trial_end: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (customerMirrorError) throw customerMirrorError;
    }

    const checkoutTerms = subscriptionCheckoutTerms(hasSubscriptionHistory);
    const session = await stripeClient.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      payment_method_collection: checkoutTerms.payment_method_collection,
      payment_method_types: checkoutTerms.payment_method_types,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account/billing?checkout=success`,
      cancel_url: `${appUrl}/account/billing?checkout=cancelled`,
      subscription_data: {
        ...checkoutTerms.subscription_data,
        metadata: { user_id: user.id, plan },
      },
      metadata: { user_id: user.id, plan },
    }, { idempotencyKey: checkoutIdempotencyKey(user.id, mode, attemptId) });

    return json({ url: session.url });
    } finally {
      const { error: releaseError } = await admin.rpc("release_stripe_checkout_lock", {
        p_user_id: user.id,
        p_lock_token: attemptId,
      });
      if (releaseError) console.error("stripe_checkout_lock_release_failed", { message: releaseError.message });
    }
  } catch (error) {
    // Log Stripe error type/code/requestId server-side only — do NOT return it to the client
    // (it can fingerprint Stripe config: test-vs-live mode, valid price IDs, etc.).
    console.error("stripe_checkout_failed", stripeFailureDetail(error));
    return json({
      error: "stripe_checkout_failed",
      message: "Stripe checkout is not configured correctly.",
    }, 500);
  }
}
