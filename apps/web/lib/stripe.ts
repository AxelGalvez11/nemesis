import Stripe from "stripe";
import { stripeAllowLive, stripeMaxPriceId, stripePlusPriceId, stripeProPriceId, stripeSecretKey } from "./env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is required");
  if (stripeSecretKey.startsWith("sk_live_") && !stripeAllowLive) {
    throw new Error("Live Stripe key is disabled for beta. Use test-mode keys or set STRIPE_ALLOW_LIVE=true.");
  }
  cached ??= new Stripe(stripeSecretKey);
  return cached;
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
  return status === "active" || status === "trialing" ? plan : "free";
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
