// Analytics opt-out PERSISTENCE (the sink-slice requirement the reviewers flagged
// on the core: the in-memory flag must survive a cold start, or a consent
// withdrawal silently resets to opted-IN on the next launch).
//
// Pure logic with an INJECTED store (so it's unit-testable and not bound to
// expo-secure-store here). The bootstrap passes the real SecureStore. hydrate()
// MUST run BEFORE configureAnalytics() so an opted-out user never emits at boot.

import { isOptedOut, setOptOut } from "./analytics.ts";

export const ANALYTICS_OPT_OUT_KEY = "analytics_opt_out";

/** Minimal async key/value store (expo-secure-store satisfies this). */
export interface ConsentStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** Load the persisted opt-out choice into the analytics core. Call at boot,
 *  before wiring a sink. Read failure leaves the current (default) state. */
export async function hydrateOptOut(store: ConsentStore): Promise<void> {
  try {
    const value = await store.getItemAsync(ANALYTICS_OPT_OUT_KEY);
    if (value !== null) setOptOut(value === "true");
  } catch {
    // Never block boot on a storage read; leave the default.
  }
}

/** Set the opt-out choice AND persist it. Use this from the settings/consent UI
 *  (not the core's setOptOut, which is in-memory only). */
export async function persistOptOut(store: ConsentStore, value: boolean): Promise<void> {
  setOptOut(value); // in-memory takes effect immediately
  try {
    await store.setItemAsync(ANALYTICS_OPT_OUT_KEY, String(value));
  } catch {
    // Persistence is best-effort; the in-memory flag is already updated.
  }
}

export { isOptedOut };
