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
      return_url: `${appUrl}/app/billing`,
    });

    return json({ url: session.url });
  } catch (error) {
    const detail = stripeFailureDetail(error);
    console.error("stripe_portal_failed", detail);
    return json({
      error: "stripe_portal_failed",
      message: "Stripe billing portal is not configured correctly.",
      detail,
    }, 500);
  }
}
