import { Linking } from "react-native";

// Where upgrading happens: the web app's plan page, which runs the signed-in
// Stripe checkout. No purchase UI ships inside this app.
//
// WHY A LINK OUT IS ALLOWED HERE, and the condition attached to it. Apple's
// guideline 3.1.1(a) bans buttons and links to non-Apple purchasing "in all
// other storefronts, except for the United States storefront, where this
// prohibition does not apply". So this is compliant exactly as long as the app
// ships US-only — which is an availability setting in App Store Connect, not
// something this repo can enforce.
//
// THEREFORE: opening another storefront and shipping this button is a rejection.
// Whoever widens availability has to either remove every caller of
// openPricingPage() or wire Apple in-app purchase first (owner decision,
// 2026-07-28: launch US-only and keep the button rather than delay for IAP).
//
// One definition, because the app offers this in two places — the out-of-credits
// sheet and the Subscription screen — and they must never drift to two URLs.
export const PRICING_URL = "https://app.enternemesis.com/pricing";

/** Open the web plan page. Never rejects: a failed openURL here would otherwise
 *  surface as an unhandled promise rather than as anything a student could act
 *  on, and the caller has no better fallback to offer. */
export function openPricingPage(): void {
  void Linking.openURL(PRICING_URL).catch(() => {});
}
