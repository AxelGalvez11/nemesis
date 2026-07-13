import { appUrl, stripePlusPriceId, stripeProPriceId } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { stripe, stripeFailureDetail } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    // Which plan to buy. Defaults to plus (no body) for backward compatibility.
    let plan: "plus" | "pro" = "plus";
    try {
      const body = await req.json();
      if (body?.plan === "pro") plan = "pro";
    } catch { /* no body → plus */ }
    const priceId = plan === "pro" ? stripeProPriceId : stripePlusPriceId;
    if (!priceId) return json({ error: `STRIPE_${plan.toUpperCase()}_PRICE_ID missing` }, 500);

    const admin = adminClient();
    const { data: existing } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | null | undefined;
    if (customerId) {
      // Paid users change tiers in Stripe's portal. Starting another subscription checkout for the
      // same customer can leave both tiers active and double-charge them.
      const subscriptions = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
      const hasOpenSubscription = subscriptions.data.some((subscription) =>
        subscription.status !== "canceled" && subscription.status !== "incomplete_expired");
      if (hasOpenSubscription) {
        const portal = await stripe().billingPortal.sessions.create({
          customer: customerId,
          return_url: `${appUrl}/account/billing`,
        });
        return json({ url: portal.url, mode: "portal" });
      }
    } else {
      const customer = await stripe().customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("subscriptions").upsert({
        user_id: user.id,
        plan: "free",
        status: "active",
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account/billing?checkout=success`,
      cancel_url: `${appUrl}/account/billing?checkout=cancelled`,
      subscription_data: { metadata: { user_id: user.id, plan } },
      metadata: { user_id: user.id, plan },
    });

    return json({ url: session.url });
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
