import { appUrl, stripePlusPriceId } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { stripe, stripeFailureDetail } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);
    if (!stripePlusPriceId) return json({ error: "STRIPE_PLUS_PRICE_ID missing" }, 500);

    const admin = adminClient();
    const { data: existing } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
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
      line_items: [{ price: stripePlusPriceId, quantity: 1 }],
      success_url: `${appUrl}/app/billing?checkout=success`,
      cancel_url: `${appUrl}/app/billing?checkout=cancelled`,
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
    });

    return json({ url: session.url });
  } catch (error) {
    const detail = stripeFailureDetail(error);
    console.error("stripe_checkout_failed", detail);
    return json({
      error: "stripe_checkout_failed",
      message: "Stripe checkout is not configured correctly.",
      detail,
    }, 500);
  }
}
