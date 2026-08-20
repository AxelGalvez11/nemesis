import { stripeNemesisAnnualPriceId, stripeNemesisMonthlyPriceId } from "@/lib/env";
import { json, verifyBearer } from "@/lib/server";
import { stripePriceMatchesInterval, type CheckoutInterval } from "@/lib/billing-contract";
import { assertStripeBillingWritesAllowed, stripe, stripeFailureDetail } from "@/lib/stripe";

interface CatalogPrice {
  unitAmount: number | null;
  currency: string;
  interval: string | null;
}

/**
 * What Nemesis costs, read back from Stripe.
 *
 * 🔴 THIS IS A VERIFICATION SURFACE, NOT THE PRICING PAGE'S SOURCE OF TRUTH.
 * The pricing page renders its amounts from packages/shared/src/plan.ts so it
 * cannot be blanked by a Stripe outage or a missing Price. This route exists so
 * a misconfigured environment is visible as a 503 rather than as a customer
 * being charged the wrong number, and so the two can be compared.
 *
 * One product, two intervals. There is no plan to choose here any more.
 */
export async function GET(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);
    if (!stripeNemesisMonthlyPriceId || !stripeNemesisAnnualPriceId) {
      return json({ error: "stripe_catalog_not_configured" }, 503);
    }

    const stripeClient = stripe();
    // Freemium (2026-07-20): checkout never grants a trial, so the catalog no
    // longer computes or advertises trial eligibility. The mode assertion stays
    // so a misconfigured key fails here the same way the checkout route would.
    assertStripeBillingWritesAllowed();
    const [monthlyPrice, annualPrice] = await Promise.all([
      stripeClient.prices.retrieve(stripeNemesisMonthlyPriceId),
      stripeClient.prices.retrieve(stripeNemesisAnnualPriceId),
    ]);

    const configured: Array<{ interval: CheckoutInterval; price: typeof monthlyPrice }> = [
      { interval: "monthly", price: monthlyPrice },
      { interval: "annual", price: annualPrice },
    ];
    for (const { interval, price } of configured) {
      if (!stripePriceMatchesInterval(interval, price)) {
        console.error("stripe_catalog_price_mismatch", {
          active: price.active,
          currency: price.currency,
          interval: price.recurring?.interval,
          unitAmount: price.unit_amount,
          wanted: interval,
        });
        return json({ error: "stripe_catalog_price_mismatch" }, 503);
      }
    }

    const serialize = (price: typeof monthlyPrice): CatalogPrice => ({
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    });

    return json({
      plan: "nemesis",
      intervals: {
        annual: serialize(annualPrice),
        monthly: serialize(monthlyPrice),
      },
    });
  } catch (error) {
    console.error("stripe_catalog_failed", stripeFailureDetail(error));
    return json({ error: "stripe_catalog_failed" }, 500);
  }
}
