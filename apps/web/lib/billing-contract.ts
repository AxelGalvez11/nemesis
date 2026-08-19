/**
 * What can be BOUGHT, and the guards that stop the wrong thing being charged.
 *
 * ── ONE PRODUCT, TWO WAYS TO PAY FOR IT ───────────────────────────────────────
 *
 * This file used to enumerate a ladder: `CheckoutPlan = "plus" | "pro"`, with
 * Max retired above it. Every sale path narrowed through that type, which is why
 * "which plan is this?" was answered by string comparison in a dozen places.
 *
 * Since 2026-08-17 there is one paid product, Nemesis. What checkout still has
 * to choose is the BILLING INTERVAL, and an interval is not a capability — so
 * the type this file exports is an interval, and the entitlement it grants is
 * always the same. See packages/shared/src/plan.ts.
 *
 * 🔴 LEGACY NAMES ARE NOT FORGOTTEN, THEY ARE JUST NOT FOR SALE. `planForPriceId`
 * in lib/stripe.ts still maps the retired Student/Agent Pro/Max prices so a
 * replayed webhook keeps granting access, and `planLabel` below still resolves
 * them. "No sale path" and "no memory of it" are different guarantees.
 */

import {
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
  canonicalPlanLabel,
  type BillingInterval,
} from "@nemesis/shared";

/** What checkout picks. NOT a plan — both intervals buy the same Nemesis. */
export type CheckoutInterval = BillingInterval;
export type StripeMode = "test" | "live";

export const NEMESIS_TRIAL_PERIOD_DAYS = 7;

/** The amounts a Stripe Price must carry to be the Nemesis price for that
 *  interval. Sourced from packages/shared so the pricing page, the catalog and
 *  Checkout cannot disagree about what Nemesis costs. */
export const INTERVAL_PRICE_CENTS: Record<CheckoutInterval, number> = {
  annual: NEMESIS_ANNUAL_CENTS,
  monthly: NEMESIS_MONTHLY_CENTS,
};

/** Stripe's own word for each interval, for validating `recurring.interval`. */
export const STRIPE_INTERVAL: Record<CheckoutInterval, "month" | "year"> = {
  annual: "year",
  monthly: "month",
};

interface StripePriceLike {
  active?: boolean;
  currency?: string;
  type?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string | null } | null;
}

/**
 * Fail closed when an environment variable points at the wrong Stripe Price.
 * The pricing page, the catalog and Checkout must agree on the amount.
 *
 * 🔴 THIS IS NOT ENOUGH ON ITS OWN, AND THE REASON IS A COLLISION. Nemesis
 * monthly is $19.99 — the SAME amount retired Agent Pro charged. A stale
 * STRIPE_PRO_PRICE_ID would therefore pass an amount-only check while selling a
 * price that grants a retired plan code. Callers must ALSO confirm the Price ID
 * came from STRIPE_NEMESIS_MONTHLY_PRICE_ID / STRIPE_NEMESIS_ANNUAL_PRICE_ID;
 * `nemesisPriceIdFor` in lib/stripe.ts is the only place those are read.
 */
export function stripePriceMatchesInterval(
  interval: CheckoutInterval,
  price: StripePriceLike,
): boolean {
  return price.active !== false
    && price.currency === "usd"
    && price.type === "recurring"
    && price.recurring?.interval === STRIPE_INTERVAL[interval]
    && price.unit_amount === INTERVAL_PRICE_CENTS[interval];
}

/** Freemium (owner decision 2026-07-20): checkout NEVER grants a trial — the free
 * plan is the try-before-you-buy path, and paid plans bill immediately.
 * NEMESIS_TRIAL_PERIOD_DAYS survives above only for webhook/email handling of
 * subscriptions that started a trial before this cutoff. */
export function subscriptionCheckoutTerms() {
  return {
    payment_method_collection: "always" as const,
    payment_method_types: ["card"] as ["card"],
    subscription_data: {},
  };
}

export type SubscriptionWebhookAction = "created" | "updated" | "deleted" | "trial_will_end";

export function subscriptionWebhookAction(eventType: string): SubscriptionWebhookAction | null {
  switch (eventType) {
    case "customer.subscription.created":
      return "created";
    case "customer.subscription.updated":
      return "updated";
    case "customer.subscription.deleted":
      return "deleted";
    case "customer.subscription.trial_will_end":
      return "trial_will_end";
    default:
      return null;
  }
}

/**
 * What the customer is shown for a stored plan code.
 *
 * 🔴 DELEGATES, AND THE DELEGATION IS THE POINT. This used to be a switch that
 * printed "Nemesis Student" / "Nemesis Agent Pro" / "Nemesis Max" — names no
 * customer should ever see again, on a plan they cannot buy. One canonical
 * answer now: `Nemesis` or `Free`.
 */
export function planLabel(plan: string | null | undefined): string {
  return canonicalPlanLabel(plan);
}

export function subscriptionGrantsAccess(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function subscriptionRemainsOpen(status: string): boolean {
  return status !== "canceled" && status !== "incomplete_expired";
}

interface CheckoutSessionLike {
  mode?: string | null;
  status?: string | null;
  url?: string | null;
  expires_at?: number;
  metadata?: Record<string, string> | null;
}

/**
 * An open Checkout session this student can be sent back to.
 *
 * Matched on the INTERVAL, not the plan: both intervals now carry
 * `plan: "nemesis"`, so a student who opened monthly and then chose annual must
 * get a new session rather than the old one.
 */
export function reusableCheckoutUrl(
  sessions: CheckoutSessionLike[],
  userId: string,
  interval: CheckoutInterval,
  nowMs = Date.now(),
): string | null {
  const session = sessions.find((candidate) =>
    candidate.mode === "subscription" &&
    candidate.status === "open" &&
    Boolean(candidate.url) &&
    (candidate.expires_at == null || candidate.expires_at * 1000 > nowMs) &&
    candidate.metadata?.user_id === userId &&
    candidate.metadata?.interval === interval);
  return session?.url ?? null;
}

export function customerIdempotencyKey(userId: string, mode: StripeMode): string {
  return `nemesis-customer:${mode}:${userId}`;
}

export function checkoutIdempotencyKey(
  userId: string,
  mode: StripeMode,
  attemptId: string,
): string {
  return `nemesis-checkout:${mode}:${userId}:${attemptId}`;
}

export function stripeKeyMode(key: string): "test" | "live" | "unknown" {
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return "unknown";
}
