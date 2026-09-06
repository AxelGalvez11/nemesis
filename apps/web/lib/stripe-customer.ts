import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Record a freshly created Stripe customer on the learner's `subscriptions` row WITHOUT touching
 * their plan.
 *
 * 🔴 THE OLD CODE UPSERTED `{ plan: "free", status: "active", ... }`. Both the checkout and the
 * portal route did it whenever the row had no Stripe customer for the current key mode. That is
 * exactly the state of a comped account (the owner's own `enterprise` plan) and of an Apple
 * subscriber: press "Manage billing" once and the row was flattened to free. The webhook was
 * careful about this; these two routes were not. Now: an existing row gets only its customer
 * columns updated, and a row is created with `plan: "free"` only when there was none.
 */
export async function rememberStripeCustomer(
  admin: SupabaseClient,
  userId: string,
  customerId: string,
  livemode: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await admin
      .from("subscriptions")
      .update({ stripe_customer_id: customerId, stripe_livemode: livemode, updated_at: now })
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    plan: "free",
    status: "active",
    stripe_customer_id: customerId,
    stripe_livemode: livemode,
    stripe_subscription_id: null,
    stripe_price_id: null,
    stripe_status: null,
    current_period_end: null,
    trial_end: null,
    updated_at: now,
  });
  if (error) throw error;
}
