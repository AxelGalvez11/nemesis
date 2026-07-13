import { appUrl } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { stripe, stripeFailureDetail } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const admin = adminClient();
    const { data } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, plan, status")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = data?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("subscriptions").upsert({
        user_id: user.id,
        plan: data?.plan ?? "free",
        status: data?.status ?? "active",
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account/billing`,
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
