import { stripeMaxPriceId, stripePlusPriceId, stripeProPriceId } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import { isTrialEligibleForSubscriptionHistory } from "@/lib/billing-contract";
import { assertStripeBillingWritesAllowed, stripe, stripeFailureDetail } from "@/lib/stripe";

interface CatalogPrice {
  unitAmount: number | null;
  currency: string;
  interval: string | null;
}

export async function GET(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);
    if (!stripePlusPriceId || !stripeProPriceId) {
      return json({ error: "stripe_catalog_not_configured" }, 503);
    }

    const stripeClient = stripe();
    // Keep this UI promise aligned with Checkout. Production test keys are
    // deliberately read-only, so never advertise a trial the write route
    // would refuse to create.
    const livemode = assertStripeBillingWritesAllowed() === "live";
    const [plusPrice, proPrice, trialEligible, maxPrice] = await Promise.all([
      stripeClient.prices.retrieve(stripePlusPriceId),
      stripeClient.prices.retrieve(stripeProPriceId),
      trialEligibilityForUser(user.id, livemode),
      stripeMaxPriceId ? stripeClient.prices.retrieve(stripeMaxPriceId) : Promise.resolve(null),
    ]);

    const serialize = (price: typeof plusPrice): CatalogPrice => ({
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    });

    return json({
      plans: {
        plus: serialize(plusPrice),
        pro: serialize(proPrice),
        ...(maxPrice ? { max: serialize(maxPrice) } : {}),
      },
      trialEligible,
    });
  } catch (error) {
    console.error("stripe_catalog_failed", stripeFailureDetail(error));
    return json({ error: "stripe_catalog_failed" }, 500);
  }
}

async function trialEligibilityForUser(userId: string, livemode: boolean): Promise<boolean | null> {
  const { data, error } = await adminClient()
    .from("subscriptions")
    .select("stripe_customer_id, stripe_livemode, stripe_subscription_id, trial_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("stripe_trial_eligibility_read_failed", { message: error.message });
    return null;
  }

  const existingInCurrentMode = data?.stripe_livemode === livemode;
  const hasMirroredSubscriptionHistory = existingInCurrentMode
    && Boolean(data?.stripe_subscription_id || data?.trial_end);
  const customerId = existingInCurrentMode
    ? data.stripe_customer_id as string | null | undefined
    : null;
  if (!customerId) return isTrialEligibleForSubscriptionHistory(hasMirroredSubscriptionHistory);

  try {
    const subscriptions = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    return isTrialEligibleForSubscriptionHistory(
      hasMirroredSubscriptionHistory || subscriptions.data.length > 0,
    );
  } catch (error) {
    console.error("stripe_trial_eligibility_lookup_failed", stripeFailureDetail(error));
    return null;
  }
}
