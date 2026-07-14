import Stripe from "stripe";
import {
  stripeAllowLive,
  stripeAllowTestBilling,
  stripeMaxPriceId,
  stripePlusPriceId,
  stripeProPriceId,
  stripeSecretKey,
} from "./env";
import { stripeKeyMode, subscriptionGrantsAccess, type StripeMode } from "./billing-contract";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  stripeMode();
  cached ??= new Stripe(stripeSecretKey);
  return cached;
}

export function stripeMode(): StripeMode {
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is required");
  const mode = stripeKeyMode(stripeSecretKey);
  if (mode === "unknown") throw new Error("STRIPE_SECRET_KEY must be a Stripe test or live secret key");
  if (mode === "live" && !stripeAllowLive) {
    throw new Error("Live Stripe key is disabled for beta. Use test-mode keys or set STRIPE_ALLOW_LIVE=true.");
  }
  return mode;
}

/** Production Nemesis billing is live-only. Test writers require an explicit
 * non-production opt-in so a preview cannot overwrite live customer state in
 * the shared subscriptions table. */
export function assertStripeBillingWritesAllowed(): StripeMode {
  const mode = stripeMode();
  if (mode === "test" && (process.env.VERCEL_ENV === "production" || !stripeAllowTestBilling)) {
    throw new Error("Stripe test billing writes are disabled. Use an isolated non-production environment.");
  }
  return mode;
}

export type PaidPlan = "free" | "plus" | "pro" | "max";

/** Which plan a Stripe price grants. Unrecognized prices grant nothing (free). */
export function planForPriceId(priceId: string | null | undefined): PaidPlan {
  if (priceId && stripeMaxPriceId && priceId === stripeMaxPriceId) return "max";
  if (priceId && stripeProPriceId && priceId === stripeProPriceId) return "pro";
  if (priceId && stripePlusPriceId && priceId === stripePlusPriceId) return "plus";
  return "free";
}

/** Effective plan from a subscription: the price's plan when active/trialing, else free. */
export function planFromStripeStatus(status: string | null | undefined, priceId: string | null | undefined): PaidPlan {
  const plan = planForPriceId(priceId);
  if (plan === "free") return "free";
  return subscriptionGrantsAccess(status) ? plan : "free";
}

export interface StripeFailureDetail {
  type?: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
}

export function stripeFailureDetail(error: unknown): StripeFailureDetail {
  if (!error || typeof error !== "object") return {};
  const record = error as Record<string, unknown>;
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
    statusCode: typeof record.statusCode === "number" ? record.statusCode : undefined,
    requestId: typeof record.requestId === "string" ? record.requestId : undefined,
  };
}
