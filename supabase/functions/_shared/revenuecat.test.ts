import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applePlanFromEvent, subscriptionUserId } from "./revenuecat.ts";

Deno.test("any recognised entitlement grants the one paid product", () => {
  // There is nothing left to rank. The dashboard still says plus/pro, and both
  // must keep working -- renaming them there is a separate, live change.
  assertEquals(applePlanFromEvent({ type: "INITIAL_PURCHASE", entitlement_ids: ["plus"] }), "nemesis");
  assertEquals(applePlanFromEvent({ type: "RENEWAL", entitlement_ids: ["pro"] }), "nemesis");
  assertEquals(applePlanFromEvent({ type: "PRODUCT_CHANGE", entitlement_ids: ["plus", "pro"] }), "nemesis");
  assertEquals(applePlanFromEvent({ type: "UNCANCELLATION", entitlement_ids: ["plus"] }), "nemesis");
  // And the id the dashboard should eventually carry already works.
  assertEquals(applePlanFromEvent({ type: "INITIAL_PURCHASE", entitlement_ids: ["nemesis"] }), "nemesis");
});

Deno.test("only EXPIRATION revokes — cancellation keeps the paid-for weeks", () => {
  assertEquals(applePlanFromEvent({ type: "EXPIRATION", entitlement_ids: ["pro"] }), "free");
  // Auto-renew off ≠ access off. The student keeps what they paid for.
  assertEquals(applePlanFromEvent({ type: "CANCELLATION", entitlement_ids: ["pro"] }), null);
  assertEquals(applePlanFromEvent({ type: "BILLING_ISSUE", entitlement_ids: ["pro"] }), null);
});

Deno.test("test events, transfers, and unknown types touch nothing", () => {
  assertEquals(applePlanFromEvent({ type: "TEST", entitlement_ids: ["pro"] }), null);
  assertEquals(applePlanFromEvent({ type: "TRANSFER" }), null);
  assertEquals(applePlanFromEvent({ type: "SOMETHING_NEW" }), null);
  assertEquals(applePlanFromEvent({}), null);
});

Deno.test("a granting event for an unknown entitlement neither grants nor revokes", () => {
  assertEquals(applePlanFromEvent({ type: "INITIAL_PURCHASE", entitlement_ids: ["Pharma Orb Pro"] }), null);
  assertEquals(applePlanFromEvent({ type: "RENEWAL", entitlement_ids: [] }), null);
  assertEquals(applePlanFromEvent({ type: "RENEWAL", entitlement_ids: null }), null);
});

Deno.test("only a Supabase-uid-shaped app_user_id maps to a row", () => {
  assertEquals(
    subscriptionUserId({ app_user_id: "A6E2D2E5-8F7A-4B31-9C1D-2F3A4B5C6D7E" }),
    "a6e2d2e5-8f7a-4b31-9c1d-2f3a4b5c6d7e",
  );
  assertEquals(subscriptionUserId({ app_user_id: "$RCAnonymousID:abc123" }), null);
  assertEquals(subscriptionUserId({ app_user_id: "test-user" }), null);
  assertEquals(subscriptionUserId({}), null);
});
