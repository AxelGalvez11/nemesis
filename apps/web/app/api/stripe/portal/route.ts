import { appUrl } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { stripe, stripeFailureDetail } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const { data } = await adminClient()
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const customerId = data?.stripe_customer_id as string | null | undefined;
    if (!customerId) return json({ error: "No Stripe customer for this account yet" }, 400);

    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/app/settings?section=billing`,
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
