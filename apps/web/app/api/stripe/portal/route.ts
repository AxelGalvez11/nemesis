import { appUrl } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { customerIdempotencyKey } from "@/lib/billing-contract";
import { assertStripeBillingWritesAllowed, stripe, stripeFailureDetail } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const stripeClient = stripe();
    const mode = assertStripeBillingWritesAllowed();
    const livemode = mode === "live";
    const admin = adminClient();
    const { data, error: subscriptionReadError } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, stripe_livemode, plan, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subscriptionReadError) throw subscriptionReadError;

    let customerId = data?.stripe_livemode === livemode
      ? data.stripe_customer_id as string | null | undefined
      : null;
    if (!customerId) {
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

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      // Back to /pricing: /account/billing was retired 2026-08-01.
      return_url: `${appUrl}/pricing`,
    });

    return json({ url: session.url });
  } catch (error) {
    // Log Stripe error detail server-side only — never echo it to the client (avoids
    // leaking Stripe config: test-vs-live mode, valid price IDs, internal codes).
    console.error("stripe_portal_failed", stripeFailureDetail(error));
    return json({
      error: "stripe_portal_failed",
      message: "Stripe billing portal is not configured correctly.",
    }, 500);
  }
}
