// First-run setup on the phone — persistence and the "should this run?" answer.
//
// 🔴 THE RULES ARE NOT HERE. Step order, course-name tidying, the cap, the
// duplicate handling and shouldShowOnboarding all live in
// packages/shared/src/onboarding.ts, which the web app reads too. This file is
// only the phone's half: where the marker is written, and how the two account
// signals are fetched. Put anything a browser would also ask in the shared file.
//
// Same shape as analyticsConsent.ts: an INJECTED store, so the logic is testable
// under Deno without expo-secure-store. The caller passes the real SecureStore.

import {
  parseStoredOnboarding,
  type OnboardingOutcome,
  type StoredOnboarding,
  storedOnboarding,
} from "@nemesis/shared";

/** Where the marker lives ON THIS PHONE. Versioned so a redesign can show the
 *  new flow without hunting old keys, and namespaced away from the web's
 *  `nemesis.web.onboarding.v1` because the two stores are unrelated. */
export const ONBOARDING_KEY = "nemesis.mobile.onboarding.v1";

/** Minimal async key/value store — expo-secure-store satisfies this. */
export interface OnboardingStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/**
 * Read the marker back, tolerating anything.
 *
 * A read failure is reported as "never ran" rather than thrown. That is the
 * SAFE direction and not merely the convenient one: the account-emptiness guard
 * in shouldShowOnboarding still suppresses the flow for anybody who has actually
 * used the app, so the worst case of a failed read is that a genuinely empty
 * account is offered setup a second time. The opposite default — treating an
 * unreadable store as "already done" — would silently deny setup to every new
 * student on a device with a flaky keychain.
 */
export async function readOnboarding(store: OnboardingStore): Promise<StoredOnboarding | null> {
  try {
    return parseStoredOnboarding(await store.getItemAsync(ONBOARDING_KEY));
  } catch {
    return null;
  }
}

/** Write the marker. Best-effort: a student who finished setup has finished it
 *  whether or not the keychain accepted the note, and failing here must never
 *  strand them on the last screen. */
export async function writeOnboarding(
  store: OnboardingStore,
  outcome: OnboardingOutcome,
  now: Date,
): Promise<void> {
  try {
    await store.setItemAsync(ONBOARDING_KEY, JSON.stringify(storedOnboarding(outcome, now)));
  } catch {
    // Deliberately swallowed — see above.
  }
}
