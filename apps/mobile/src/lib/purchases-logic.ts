// Pure paywall rules — everything about in-app purchases that does NOT touch
// the native module, so Deno can test it. The native wrapper (purchases.ts)
// stays a thin shell around these.
//
// The identifiers here are load-bearing: they must match the RevenueCat
// dashboard exactly (project "Nemesis", offering "default", packages
// "plus_monthly"/"pro_monthly", entitlements "plus"/"pro" — configured
// 2026-08-03). A typo fails SILENTLY: getOfferings() returns an offering our
// code finds nothing in, and the paywall renders empty with no error anywhere.

/** RevenueCat entitlement ids — must equal the PlanCode strings they grant. */
export const PURCHASE_ENTITLEMENTS = ["plus", "pro"] as const;

/** Offering package identifiers, in the order the paywall shows them. */
export const PAYWALL_PACKAGE_ORDER = ["plus_monthly", "pro_monthly"] as const;

export type PurchasePlan = (typeof PURCHASE_ENTITLEMENTS)[number];

/** The plan a set of ACTIVE RevenueCat entitlement ids grants. Pro wins when
 *  both are somehow active; unknown ids grant nothing. */
export function planFromActiveEntitlements(activeIds: readonly string[]): PurchasePlan | null {
  if (activeIds.includes("pro")) return "pro";
  if (activeIds.includes("plus")) return "plus";
  return null;
}

/** Order the offering's packages for display: Plus first (the affordable
 *  default), Pro second (the upgrade). Packages we don't recognise are DROPPED
 *  rather than rendered — a stray dashboard experiment must not put an
 *  unpriced card in front of a student. */
export function orderedPaywallPackages<T extends { identifier: string }>(
  packages: readonly T[],
): T[] {
  return PAYWALL_PACKAGE_ORDER
    .map((id) => packages.find((candidate) => candidate.identifier === id))
    .filter((match): match is T => match != null);
}

/** Student-facing name for a package. Derived from the identifier, not the
 *  store metadata, so the paywall reads identically to the marketing site. */
export function paywallPlanName(packageIdentifier: string): string {
  return packageIdentifier === "pro_monthly" ? "Nemesis Pro" : "Nemesis Plus";
}

/** The one-line pitch under each plan name. Same numbers as the store
 *  descriptions, which come from apps/web/lib/workload-cost.ts. */
export function paywallPlanPitch(packageIdentifier: string): string {
  return packageIdentifier === "pro_monthly"
    ? "70 recording hours a month and the highest AI limits"
    : "20 recording hours a month and higher AI limits";
}
