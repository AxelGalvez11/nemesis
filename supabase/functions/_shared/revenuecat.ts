// What a RevenueCat webhook event means for the student's `apple_plan` column.
//
// Pure — lives in _shared so the CI Deno step that already covers this folder
// runs the tests. The webhook function (revenuecat-webhook/index.ts) is a thin
// shell around this file.
//
// The entitlement ids ("plus"/"pro") are configured in the RevenueCat
// dashboard and deliberately EQUAL the PlanCode strings, verified against
// packages/shared/src/entitlements.ts when they were created (2026-08-03).

export interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  entitlement_ids?: string[] | null;
}

/** Event types that mean "these entitlements are (still) paid for". */
const GRANTING_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
]);

/** The apple_plan a webhook event dictates, or null when the event carries no
 *  entitlement change and must not touch the row at all.
 *
 *  Deliberate no-ops, each for a reason:
 *  - CANCELLATION: auto-renew switched off — access lasts until the period
 *    ends, and EXPIRATION is the event that ends it. Writing "free" here would
 *    cut off weeks someone already paid for.
 *  - BILLING_ISSUE: Apple's grace period may still grant access; again,
 *    EXPIRATION is the authoritative end.
 *  - TRANSFER: entitlements moving between Apple accounts. Rare, and acting on
 *    it needs the transferred_from/to arrays — a deliberate follow-up, not a
 *    guess here.
 *  - TEST: the dashboard's "send test event" button. */
export function applePlanFromEvent(event: RevenueCatEvent): "plus" | "pro" | "free" | null {
  const type = event.type ?? "";
  if (type === "EXPIRATION") return "free";
  if (!GRANTING_TYPES.has(type)) return null;
  const ids = event.entitlement_ids ?? [];
  if (ids.includes("pro")) return "pro";
  if (ids.includes("plus")) return "plus";
  // A granting event for an entitlement we don't recognise (a dashboard
  // experiment, the dead "Pharma Orb Pro" demo) must not grant a plan — but it
  // must not revoke one either.
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Purchases are configured under the Supabase auth uid (AuthProvider calls
 *  syncPurchasesIdentity on sign-in), so a well-formed app_user_id is a UUID.
 *  Anything else — RevenueCat's "$RCAnonymousID:..." for a purchase made
 *  before sign-in, or dashboard test values — has no subscriptions row to
 *  write to and is acknowledged without a write. */
export function subscriptionUserId(event: RevenueCatEvent): string | null {
  const id = event.app_user_id ?? "";
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}
