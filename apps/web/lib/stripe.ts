import Stripe from "stripe";
import { stripeSecretKey } from "./env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is required");
  cached ??= new Stripe(stripeSecretKey);
  return cached;
}

export function planFromStripeStatus(status: string | null | undefined, priceId: string | null | undefined): "free" | "plus" {
  if (!priceId) return "free";
  if (status === "active" || status === "trialing") return "plus";
  return "free";
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
