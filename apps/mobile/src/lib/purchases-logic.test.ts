import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  orderedPaywallPackages,
  paywallInterval,
  paywallPlanName,
  paywallPlanPitch,
  planFromActiveEntitlements,
} from "./purchases-logic.ts";

// 🔴 THIS FILE USED TO ASSERT A RANKING ("pro outranks plus"). There is one paid
// product now, so any recognised entitlement grants the whole thing and there is
// nothing left to rank. The property worth keeping is the one that protected
// subscribers: an unknown id can only fail to grant.

Deno.test("any recognised entitlement grants Nemesis", () => {
  assertEquals(planFromActiveEntitlements(["nemesis"]), "nemesis");
  assertEquals(planFromActiveEntitlements(["plus"]), "nemesis");
  assertEquals(planFromActiveEntitlements(["pro"]), "nemesis");
  assertEquals(planFromActiveEntitlements(["plus", "pro"]), "nemesis");
});

Deno.test("no entitlements, or only unknown ids, grant nothing", () => {
  assertEquals(planFromActiveEntitlements([]), null);
  // The dead demo entitlement from June must never grant a plan.
  assertEquals(planFromActiveEntitlements(["Pharma Orb Pro"]), null);
  assertEquals(planFromActiveEntitlements(["platinum"]), null);
});

Deno.test("the dashboard's current ids still work, and the new ones already do", () => {
  // The RevenueCat project still says plus/pro. Reconfiguring it must not need
  // an app release, and this app already understands what it will say.
  const legacy = [{ identifier: "pro_monthly" }, { identifier: "plus_monthly" }];
  assertEquals(orderedPaywallPackages(legacy).length, 2);
  const renamed = [{ identifier: "nemesis_annual" }, { identifier: "nemesis_monthly" }];
  assertEquals(
    orderedPaywallPackages(renamed).map((p) => p.identifier),
    ["nemesis_monthly", "nemesis_annual"],
    "monthly is shown first",
  );
});

Deno.test("unrecognised packages are dropped, not rendered", () => {
  const withStray = [
    { identifier: "nemesis_monthly" },
    { identifier: "$rc_lifetime" },
    { identifier: "nemesis_annual" },
  ];
  assertEquals(orderedPaywallPackages(withStray).length, 2);
});

Deno.test("a missing package simply leaves its card out", () => {
  assertEquals(
    orderedPaywallPackages([{ identifier: "nemesis_annual" }]).map((p) => p.identifier),
    ["nemesis_annual"],
  );
});

Deno.test("one product, so one name", () => {
  assertEquals(paywallPlanName(), "Nemesis");
});

Deno.test("🔴 the paywall no longer sells recording hours", () => {
  for (const id of ["nemesis_monthly", "nemesis_annual", "plus_monthly", "pro_monthly"]) {
    const pitch = paywallPlanPitch(id);
    assertEquals(/recording|lecture|transcription|hours/i.test(pitch), false, pitch);
  }
});

Deno.test("the interval is display only, and reads off the identifier", () => {
  assertEquals(paywallInterval("nemesis_annual"), "annual");
  assertEquals(paywallInterval("nemesis_monthly"), "monthly");
  assertEquals(paywallInterval("pro_monthly"), "monthly");
  // An unknown shape defaults to monthly rather than claiming a yearly charge.
  assertEquals(paywallInterval("something_else"), "monthly");
});
