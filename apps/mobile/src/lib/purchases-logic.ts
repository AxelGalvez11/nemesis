// Pure paywall rules — everything about in-app purchases that does NOT touch
// the native module, so Deno can test it. The native wrapper (purchases.ts)
// stays a thin shell around these.
//
// ── ONE PRODUCT, AND A DASHBOARD THAT STILL SAYS TWO ─────────────────────────
//
// 🔴 THE IDENTIFIERS BELOW ARE NOT OURS TO RENAME. They must match the
// RevenueCat dashboard exactly (project "Nemesis", offering "default", packages
// "plus_monthly"/"pro_monthly", entitlements "plus"/"pro" — configured
// 2026-08-03). A typo fails SILENTLY: getOfferings() returns an offering our
// code finds nothing in, and the paywall renders empty with no error anywhere.
// Renaming them here would not rename them there; it would just stop matching.
//
// So the collapse to one product happens in the MEANING, not in the strings:
// every recognised entitlement grants `nemesis`, and the paywall says "Nemesis"
// however the package is spelled. The new identifiers are listed first so that
// when the dashboard is reconfigured this file already understands them.

/** RevenueCat entitlement ids we accept. `nemesis` first because it is what the
 *  dashboard should say; the rest are the ids it says TODAY. */
export const PURCHASE_ENTITLEMENTS = ["nemesis", "plus", "pro"] as const;

/** Offering package identifiers, in the order the paywall shows them. */
export const PAYWALL_PACKAGE_ORDER = [
  "nemesis_monthly",
  "nemesis_annual",
  "plus_monthly",
  "pro_monthly",
] as const;

/** What the application grants. Two answers, as everywhere else. */
export type PurchasePlan = "nemesis";

/**
 * The plan a set of ACTIVE RevenueCat entitlement ids grants.
 *
 * 🔴 THERE IS NOTHING LEFT TO RANK. This used to prefer `pro` over `plus`,
 * which mattered while they bought different amounts of product. Any recognised
 * entitlement now grants the whole thing; unknown ids grant nothing.
 */
export function planFromActiveEntitlements(activeIds: readonly string[]): PurchasePlan | null {
  return activeIds.some((id) => (PURCHASE_ENTITLEMENTS as readonly string[]).includes(id))
    ? "nemesis"
    : null;
}

/** How often a package bills, from its identifier. Display only — it must never
 *  decide what the subscriber can do. */
export function paywallInterval(packageIdentifier: string): "monthly" | "annual" {
  return packageIdentifier.endsWith("_annual") ? "annual" : "monthly";
}

/** Order the offering's packages for display. Packages we don't recognise are
 *  DROPPED rather than rendered — a stray dashboard experiment must not put an
 *  unpriced card in front of a student. */
export function orderedPaywallPackages<T extends { identifier: string }>(
  packages: readonly T[],
): T[] {
  return PAYWALL_PACKAGE_ORDER
    .map((id) => packages.find((candidate) => candidate.identifier === id))
    .filter((match): match is T => match != null);
}

/** Student-facing name. One product, so one name, whatever the package is
 *  called in the dashboard. */
export function paywallPlanName(): string {
  return "Nemesis";
}

/**
 * The one-line pitch under each option.
 *
 * 🔴 NO RECORDING HOURS. This used to read "70 recording hours a month" and "30
 * recording hours a month", which were the honest difference between two tiers
 * of a product that sold lecture transcription. Nemesis does not sell that any
 * more, and there are no longer two tiers. What differs between these two cards
 * is how often you pay, and nothing else.
 */
export function paywallPlanPitch(packageIdentifier: string): string {
  return paywallInterval(packageIdentifier) === "annual"
    ? "Billed yearly. The same Nemesis, for less each month."
    : "Billed monthly. Room for a full course load.";
}
