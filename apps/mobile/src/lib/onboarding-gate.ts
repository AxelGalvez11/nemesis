// Does this launch go to setup, or straight into the app?
//
// The rule itself is shouldShowOnboarding in packages/shared. What lives here is
// the ORDER the two guards are asked in, which is a cold-start performance
// decision rather than a product one:
//
//   1. The local marker first. It is a keychain read — microseconds — and it
//      answers for every returning student on a device they have used before,
//      which is nearly every launch. No network, no delay, no spinner.
//   2. The account only when there is no marker. That is a real network round
//      trip, and it exists for the case the marker cannot cover: a student who
//      set up on their laptop, or reinstalled, and whose phone has never
//      written a marker but whose ACCOUNT is plainly not new.
//
// 🔴 GETTING THAT ORDER BACKWARDS COSTS EVERY LAUNCH A NETWORK CALL to answer a
// question the keychain already knew. It is also the difference between the app
// opening instantly and the app opening after the library loads.

import { shouldShowOnboarding, type StoredOnboarding } from "@nemesis/shared";

export type GateDecision = "onboarding" | "app";

/** What the account looks like, fetched only when step 1 was inconclusive. */
export interface AccountProbe {
  hasEvents: boolean;
  hasLibrary: boolean;
}

/**
 * Decide where this launch goes.
 *
 * `probeAccount` is a thunk rather than a value so the caller can pass the
 * network call itself and have it SKIPPED entirely on the common path. Awaiting
 * a value the function may not need is the mistake this signature prevents.
 *
 * A probe that throws is treated as "the account has content" — the
 * conservative direction. An offline launch must never drop a returning student
 * into a "welcome, name your courses" screen over the app they were using
 * yesterday; the worst case of guessing this way is that a genuinely new
 * student on a broken connection has to open setup from Settings instead.
 */
export async function decideOnboardingGate(
  stored: StoredOnboarding | null,
  probeAccount: () => Promise<AccountProbe>,
): Promise<GateDecision> {
  if (stored) return "app";
  let probe: AccountProbe;
  try {
    probe = await probeAccount();
  } catch {
    return "app";
  }
  return shouldShowOnboarding({ ...probe, stored: null }) ? "onboarding" : "app";
}
