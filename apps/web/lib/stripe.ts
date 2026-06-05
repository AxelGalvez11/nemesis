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
