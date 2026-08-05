import { stripePlusPriceId, stripeProPriceId } from "@/lib/env";
import { json, verifyBearer } from "@/lib/server";
import { stripePriceMatchesPlan, type CheckoutPlan } from "@/lib/billing-contract";
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
    // Freemium (2026-07-20): checkout never grants a trial, so the catalog no
    // longer computes or advertises trial eligibility. The mode assertion stays
    // so a misconfigured key fails here the same way the checkout route would.
    assertStripeBillingWritesAllowed();
    // Two plans, always. Max ($99) was retired 2026-08-05 and this catalog no
    // longer reads STRIPE_MAX_PRICE_ID, so leaving that variable set in the
    // environment does nothing — the sale path is closed in code, not config.
    const [plusPrice, proPrice] = await Promise.all([
      stripeClient.prices.retrieve(stripePlusPriceId),
      stripeClient.prices.retrieve(stripeProPriceId),
    ]);

    const configuredPrices: Array<{
      plan: CheckoutPlan;
      price: typeof plusPrice;
    }> = [
      { plan: "plus", price: plusPrice },
      { plan: "pro", price: proPrice },
    ];
    for (const { plan, price } of configuredPrices) {
      if (!stripePriceMatchesPlan(plan, price)) {
        console.error("stripe_catalog_price_mismatch", {
          active: price.active,
          currency: price.currency,
          interval: price.recurring?.interval,
          plan,
          unitAmount: price.unit_amount,
        });
        return json({ error: "stripe_catalog_price_mismatch" }, 503);
      }
    }

    const serialize = (price: typeof plusPrice): CatalogPrice => ({
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    });

    return json({
      plans: {
        plus: serialize(plusPrice),
        pro: serialize(proPrice),
      },
    });
  } catch (error) {
    console.error("stripe_catalog_failed", stripeFailureDetail(error));
    return json({ error: "stripe_catalog_failed" }, 500);
  }
}
