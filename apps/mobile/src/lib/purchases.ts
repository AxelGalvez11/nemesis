// The one file that touches react-native-purchases (RevenueCat's SDK).
//
// Everything here is deliberately failure-proof: purchases are a nice-to-have
// layered onto an app whose core must keep working when the native module is
// absent (Expo Go, the simulator dev-client built before Build 27, Android) or
// the key is missing. Every export resolves gracefully instead of throwing —
// a broken paywall must degrade to "no paywall", never to a crash.
//
// Deno tests cannot import this file (native module); the testable rules live
// in purchases-logic.ts.
import { Platform } from "react-native";
import {
  orderedPaywallPackages,
  planFromActiveEntitlements,
  type PurchasePlan,
} from "./purchases-logic";

// Public SDK key for the "Nemesis (App Store)" app in RevenueCat — safe to ship
// in the binary by design (it can only be used to talk to our own catalog).
// eas.json injects it for EAS builds; .env covers local dev clients.
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

// The narrow slice of react-native-purchases we call, typed structurally so
// tsc does not depend on whether the native package is installed (worktrees
// and Expo Go builds don't have it; the require() below is what really decides
// availability at runtime).
interface RcProduct {
  priceString: string;
  introPrice?: { price: number } | null;
}
interface RcPackage {
  identifier: string;
  product: RcProduct;
}
interface RcCustomerInfo {
  entitlements: { active: Record<string, unknown> };
}
interface PurchasesModule {
  configure(options: { apiKey: string; appUserID: string }): void;
  logIn(appUserID: string): Promise<unknown>;
  getOfferings(): Promise<{ current?: { availablePackages: RcPackage[] } | null }>;
  purchasePackage(pkg: RcPackage): Promise<{ customerInfo: RcCustomerInfo }>;
  restorePurchases(): Promise<RcCustomerInfo>;
}

let purchasesModule: PurchasesModule | null | undefined;
let configuredForUser: string | null = null;

/** Lazy-require so a build without the native module (Expo Go, old dev
 *  clients) loads this file fine and simply reports "unavailable". */
function nativeModule(): PurchasesModule | null {
  if (purchasesModule !== undefined) return purchasesModule;
  if (Platform.OS !== "ios" || !IOS_KEY) {
    purchasesModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    purchasesModule = (require("react-native-purchases") as { default: PurchasesModule }).default;
  } catch {
    purchasesModule = null;
  }
  return purchasesModule;
}

export function purchasesAvailable(): boolean {
  return nativeModule() != null;
}

/** Configure the SDK under the student's Supabase user id, so the RevenueCat
 *  webhook can write straight to their `subscriptions` row. Called from
 *  AuthProvider whenever a session appears; a null id (sign-out) is ignored —
 *  RevenueCat keeps working under the last identity until the next sign-in,
 *  which is harmless because purchases are per-Apple-ID anyway. */
export async function syncPurchasesIdentity(userId: string | null): Promise<void> {
  const purchases = nativeModule();
  if (!purchases || !userId || configuredForUser === userId) return;
  try {
    if (configuredForUser == null) {
      purchases.configure({ apiKey: IOS_KEY as string, appUserID: userId });
    } else {
      await purchases.logIn(userId);
    }
    configuredForUser = userId;
  } catch {
    // Never let billing setup take down sign-in.
  }
}

export interface PaywallOption {
  /** Opaque handle passed back to purchasePaywallOption. */
  rcPackage: unknown;
  identifier: string;
  /** Localised price string straight from the store, e.g. "$19.99". */
  priceString: string;
  /** True when Apple says this user is eligible for the 7-day free trial. */
  trialAvailable: boolean;
}

/** The current offering's packages, in display order. Empty array on ANY
 *  failure — the sheet then simply shows no upgrade cards. */
export async function paywallOptions(): Promise<PaywallOption[]> {
  const purchases = nativeModule();
  if (!purchases || configuredForUser == null) return [];
  try {
    const offerings = await purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return orderedPaywallPackages(
      packages.map((pkg) => ({
        rcPackage: pkg,
        identifier: pkg.identifier,
        priceString: pkg.product.priceString,
        trialAvailable: pkg.product.introPrice?.price === 0,
      })),
    );
  } catch {
    return [];
  }
}

export type PurchaseOutcome =
  | { status: "purchased"; plan: PurchasePlan | null }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

/** Run the Apple purchase sheet for one paywall option. */
export async function purchasePaywallOption(option: PaywallOption): Promise<PurchaseOutcome> {
  const purchases = nativeModule();
  if (!purchases) return { status: "failed", message: "Purchases aren't available in this build." };
  try {
    const { customerInfo } = await purchases.purchasePackage(option.rcPackage as RcPackage);
    return { status: "purchased", plan: planFromActiveEntitlements(Object.keys(customerInfo.entitlements.active)) };
  } catch (error) {
    if ((error as { userCancelled?: boolean } | null)?.userCancelled) return { status: "cancelled" };
    const message = error instanceof Error && error.message
      ? error.message
      : "The App Store couldn't complete the purchase.";
    return { status: "failed", message };
  }
}

/** Restore Purchases — Apple requires this button anywhere purchases exist. */
export async function restorePurchases(): Promise<PurchasePlan | null> {
  const purchases = nativeModule();
  if (!purchases) return null;
  try {
    const customerInfo = await purchases.restorePurchases();
    return planFromActiveEntitlements(Object.keys(customerInfo.entitlements.active));
  } catch {
    return null;
  }
}
