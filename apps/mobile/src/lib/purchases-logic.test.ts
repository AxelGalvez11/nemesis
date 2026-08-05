import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  orderedPaywallPackages,
  paywallPlanName,
  paywallPlanPitch,
  planFromActiveEntitlements,
} from "./purchases-logic.ts";

Deno.test("pro entitlement outranks plus when both are active", () => {
  assertEquals(planFromActiveEntitlements(["plus", "pro"]), "pro");
  assertEquals(planFromActiveEntitlements(["pro", "plus"]), "pro");
});

Deno.test("a single active entitlement maps to its plan", () => {
  assertEquals(planFromActiveEntitlements(["plus"]), "plus");
  assertEquals(planFromActiveEntitlements(["pro"]), "pro");
});

Deno.test("no entitlements, or only unknown ids, grant nothing", () => {
  assertEquals(planFromActiveEntitlements([]), null);
  // The dead demo entitlement from June must never grant a plan.
  assertEquals(planFromActiveEntitlements(["Pharma Orb Pro"]), null);
});

Deno.test("paywall shows Plus first, Pro second, whatever order RevenueCat sends", () => {
  const shuffled = [{ identifier: "pro_monthly" }, { identifier: "plus_monthly" }];
  assertEquals(
    orderedPaywallPackages(shuffled).map((p) => p.identifier),
    ["plus_monthly", "pro_monthly"],
  );
});

Deno.test("unrecognised packages are dropped, not rendered", () => {
  const withStray = [
    { identifier: "plus_monthly" },
    { identifier: "$rc_lifetime" },
    { identifier: "pro_monthly" },
  ];
  assertEquals(orderedPaywallPackages(withStray).length, 2);
});

Deno.test("a missing package simply leaves its card out", () => {
  assertEquals(
    orderedPaywallPackages([{ identifier: "pro_monthly" }]).map((p) => p.identifier),
    ["pro_monthly"],
  );
});

Deno.test("names and pitches match the store listing", () => {
  assertEquals(paywallPlanName("plus_monthly"), "Nemesis Plus");
  assertEquals(paywallPlanName("pro_monthly"), "Nemesis Pro");
  assertEquals(paywallPlanPitch("pro_monthly"), "70 recording hours a month and the highest AI limits");
  assertEquals(paywallPlanPitch("plus_monthly"), "30 recording hours a month and higher AI limits");
});
