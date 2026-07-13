export type CheckoutPlan = "plus" | "pro" | "max";
export type StripeMode = "test" | "live";

export const NEMESIS_TRIAL_PERIOD_DAYS = 7;

export function isTrialEligibleForSubscriptionHistory(hasSubscriptionHistory: boolean): boolean {
  return !hasSubscriptionHistory;
}

export function subscriptionCheckoutTerms(hasSubscriptionHistory: boolean) {
  return {
    payment_method_collection: "always" as const,
    payment_method_types: ["card"] as ["card"],
    subscription_data: isTrialEligibleForSubscriptionHistory(hasSubscriptionHistory)
      ? {
          trial_period_days: NEMESIS_TRIAL_PERIOD_DAYS,
          trial_settings: {
            end_behavior: {
              missing_payment_method: "cancel" as const,
            },
          },
        }
      : {},
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

export function planLabel(plan: string | null | undefined): string {
  switch ((plan ?? "free").toLowerCase()) {
    case "plus":
    case "student":
      return "Nemesis Student";
    case "pro":
      return "Nemesis Agent Pro";
    case "max":
      return "Nemesis Max";
    case "professional":
      return "Professional";
    case "enterprise":
      return "Enterprise";
    default:
      return "Free";
  }
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

export function reusableCheckoutUrl(
  sessions: CheckoutSessionLike[],
  userId: string,
  plan: CheckoutPlan,
  nowMs = Date.now(),
): string | null {
  const session = sessions.find((candidate) =>
    candidate.mode === "subscription" &&
    candidate.status === "open" &&
    Boolean(candidate.url) &&
    (candidate.expires_at == null || candidate.expires_at * 1000 > nowMs) &&
    candidate.metadata?.user_id === userId &&
    candidate.metadata?.plan === plan);
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
