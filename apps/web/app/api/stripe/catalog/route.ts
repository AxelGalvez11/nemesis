import { stripeMaxPriceId, stripePlusPriceId, stripeProPriceId } from "@/lib/env";
import { json, verifyBearer } from "@/lib/server";
import { stripePriceMatchesPlan } from "@/lib/billing-contract";
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
    const [plusPrice, proPrice, maxPrice] = await Promise.all([
      stripeClient.prices.retrieve(stripePlusPriceId),
      stripeClient.prices.retrieve(stripeProPriceId),
      stripeMaxPriceId ? stripeClient.prices.retrieve(stripeMaxPriceId) : Promise.resolve(null),
    ]);

    const configuredPrices: Array<{
      plan: "plus" | "pro" | "max";
      price: typeof plusPrice;
    }> = [
      { plan: "plus", price: plusPrice },
      { plan: "pro", price: proPrice },
    ];
    if (maxPrice) configuredPrices.push({ plan: "max", price: maxPrice });
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
        ...(maxPrice ? { max: serialize(maxPrice) } : {}),
      },
    });
  } catch (error) {
    console.error("stripe_catalog_failed", stripeFailureDetail(error));
    return json({ error: "stripe_catalog_failed" }, 500);
  }
}
