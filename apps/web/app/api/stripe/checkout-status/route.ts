import type Stripe from "stripe";
import { canonicalPlan } from "@nemesis/shared";
import { adminClient, json, verifyBearer, withRouteLog } from "@/lib/server";
import { assertStripeBillingWritesAllowed, stripe, stripeFailureDetail } from "@/lib/stripe";
import { reconcileCustomerSubscriptions } from "@/lib/stripe-mirror";

// GET /api/stripe/checkout-status?session_id=cs_…
//
// 🔴 THE SUCCESS PAGE USED TO SAY "YOUR PLAN IS LIVE" BECAUSE THE URL SAID SO. Stripe sends the
// buyer back to /pricing?checkout=success the instant the card clears, and the page printed the
// good news without looking at anything. The plan itself only changes when the webhook lands,
// which is usually seconds later and occasionally never (a misconfigured secret, a mode
// mismatch, an outage). So a student could pay, read "live", open a chat and hit the free limit.
//
// This route is what the success page asks instead. It retrieves the Checkout Session, checks it
// belongs to the caller, and if the subscription exists, mirrors it into `subscriptions` right
// now, the same way the webhook would. The answer is the plan the app will actually enforce.

async function GETHandler(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const sessionId = new URL(req.url).searchParams.get("session_id")?.trim() ?? "";
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return json({ error: "bad_session_id" }, 400);

    assertStripeBillingWritesAllowed();
    const client = stripe();
    const session = await client.checkout.sessions.retrieve(sessionId);
    const owner = session.client_reference_id ?? session.metadata?.user_id ?? null;
    if (owner !== user.id) return json({ error: "not_your_session" }, 403);

    if (session.status !== "complete" || typeof session.subscription !== "string") {
      return json({ state: session.status === "expired" ? "expired" : "pending", plan: "free" });
    }

    const subscription: Stripe.Subscription = await client.subscriptions.retrieve(session.subscription);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const result = await reconcileCustomerSubscriptions(customerId, user.id, subscription);

    // Read back what the app will enforce, not what Stripe said: the mirror is the truth.
    const { data: row } = await adminClient()
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    const plan = canonicalPlan(row?.plan ?? result.plan);
    return json({
      state: plan === "free" ? "pending" : "active",
      plan,
      status: row?.status ?? subscription.status,
      current_period_end: row?.current_period_end ?? null,
      interval: result.interval,
    });
  } catch (error) {
    console.error("stripe_checkout_status_failed", stripeFailureDetail(error));
    return json({ error: "stripe_checkout_status_failed" }, 500);
  }
}

export const GET = withRouteLog(GETHandler);
