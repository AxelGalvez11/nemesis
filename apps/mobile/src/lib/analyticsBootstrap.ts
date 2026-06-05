// Analytics bootstrap: run once at app start. Restores the persisted opt-out,
// then — ONLY if a PostHog key is configured — connects PostHog as the sink.
// No key → analytics stays the inert no-op (safe default, no SDK loaded).
//
// The `posthog-react-native` import is DYNAMIC + guarded so the heavy native dep
// stays out of the bundle and the typecheck until an operator installs it
// (`npx expo install posthog-react-native`). Until then this file compiles and
// runs (it just no-ops on the missing module).

import { configureAnalytics } from "./analytics.ts";
import { type ConsentStore, hydrateOptOut } from "./analyticsConsent.ts";
import { makePostHogSink, type PostHogClient } from "./posthogSink.ts";

export interface AnalyticsEnv {
  posthogKey?: string;
  posthogHost?: string;
}

// Guard against a second init (React StrictMode double-invokes effects in dev;
// a second client would leak the first's buffer).
let booted = false;

export async function bootstrapAnalytics(store: ConsentStore, env: AnalyticsEnv): Promise<void> {
  if (booted) return;
  booted = true;
  // Restore consent BEFORE wiring a sink, so an opted-out user never emits at boot.
  await hydrateOptOut(store);
  if (!env.posthogKey) return; // no provider configured → stay no-op

  try {
    // @ts-ignore optional native dep — operator runs `npx expo install posthog-react-native`
    const mod = await import("posthog-react-native");
    // PostHog is both the named and default export of the SDK — same class either way.
    // Cast the constructor to accept a loose options bag so excess-property checking
    // can never break the operator's `tsc` after install, regardless of which option
    // keys the installed SDK version recognizes (unknown keys are ignored at runtime).
    const PostHogCtor = (mod.PostHog ?? mod.default) as unknown as new (
      key: string,
      options?: Record<string, unknown>,
    ) => PostHogClient;
    const client = new PostHogCtor(env.posthogKey, {
      host: env.posthogHost,
      // PRIVACY (doc-14): PostHog is a dumb pipe for our pre-sanitized events ONLY.
      captureAppLifecycleEvents: false, // else auto-sends "Application Opened" with the deep-link URL
      enableSessionReplay: false, // hard-off: replay screenshots would bypass the allowlist entirely
      errorTracking: { autocapture: false }, // stack frames can carry health detail; pin off (remote config can flip it)
      // NOTE: touch/screen autocapture is a <PostHogProvider> concern (captureScreens
      // defaults TRUE). This app does NOT render <PostHogProvider>, so those paths are
      // structurally absent. If one is ever added it MUST set autocapture={false}.
    });
    configureAnalytics(makePostHogSink(client));
  } catch {
    // SDK not installed / init failed → stay no-op. Analytics is best-effort and
    // must never block or break app boot.
  }
}

/** Test-only: reset the one-time boot guard. */
export function resetBootGuardForTests(): void {
  booted = false;
}
