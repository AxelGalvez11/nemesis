import { stripePlusPriceId, stripeProPriceId } from "@/lib/env";
import { json, verifyBearer } from "@/lib/server";
import { stripe, stripeFailureDetail } from "@/lib/stripe";

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

    const [plusPrice, proPrice] = await Promise.all([
      stripe().prices.retrieve(stripePlusPriceId),
      stripe().prices.retrieve(stripeProPriceId),
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
      },
    });
  } catch (error) {
    console.error("stripe_catalog_failed", stripeFailureDetail(error));
    return json({ error: "stripe_catalog_failed" }, 500);
  }
}
