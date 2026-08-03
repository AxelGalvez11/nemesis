// Supabase Edge Function: revenuecat-webhook
//
// RevenueCat calls this for every Apple subscription event (purchase, renewal,
// expiration...). It writes the student's `apple_plan` and recomputes the
// effective `plan` as the best of Stripe and Apple — the same rule the Stripe
// webhook applies from its side (packages/shared effectivePlan; owner decision
// 2026-08-03, "the higher plan wins"). This is the ONLY path by which an Apple
// purchase reaches the subscriptions table; every edge function that meters
// usage reads that table and inherits the result for free. Do not build a
// second path.
//
// Auth model: RevenueCat sends a fixed Authorization header, configured in
// their dashboard (Integrations → Webhooks) and stored here as the
// REVENUECAT_WEBHOOK_AUTH secret. Constant value, compared verbatim; if the
// secret is unset the function fails CLOSED.
//
// DEPLOY NOTE: verify_jwt=false (same trap as nemesis-llm/search/media/ics) —
// RevenueCat cannot attach a Supabase JWT.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { effectivePlan } from "../../../packages/shared/src/entitlements.ts";
import { applePlanFromEvent, subscriptionUserId, type RevenueCatEvent } from "../_shared/revenuecat.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!WEBHOOK_AUTH) {
    console.error("revenuecat_webhook_secret_missing");
    return new Response("not configured", { status: 500 });
  }
  if (req.headers.get("authorization") !== WEBHOOK_AUTH) {
    return new Response("unauthorized", { status: 401 });
  }

  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as RevenueCatEvent;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const userId = subscriptionUserId(event);
  const applePlan = applePlanFromEvent(event);
  // Acknowledged-but-no-op: anonymous purchaser, test event, cancellation that
  // keeps access, unknown entitlement. 200 so RevenueCat stops retrying.
  if (!userId || !applePlan) return Response.json({ received: true, applied: false });

  try {
    // Read-then-write keyed on user_id. Concurrent events for one user are no
    // worse than webhook redelivery, which RevenueCat does anyway; the columns
    // are absolute values, so the last write is a correct one.
    const { data: existing, error: readError } = await admin
      .from("subscriptions")
      .select("stripe_plan")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;

    const { error: writeError } = await admin.from("subscriptions").upsert({
      user_id: userId,
      apple_plan: applePlan,
      rc_app_user_id: event.app_user_id ?? null,
      plan: effectivePlan(existing?.stripe_plan, applePlan),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (writeError) throw writeError;
  } catch (error) {
    // 500 → RevenueCat retries with backoff, which is exactly what a transient
    // database failure needs.
    console.error("revenuecat_webhook_write_failed", {
      type: event.type,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response("write failed", { status: 500 });
  }

  return Response.json({ received: true, applied: true });
});
