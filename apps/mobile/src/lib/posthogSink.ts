// Adapter: AnalyticsSink → PostHog.
//
// Deliberately SDK-AGNOSTIC: it takes a minimal `PostHogClient` instead of
// importing `posthog-react-native`. That keeps the heavy native dependency
// isolated to the one bootstrap file that constructs the real client, and makes
// this adapter fully unit-testable with a mock. By the time capture()/identify()
// reach here, the analytics core has ALREADY privacy-sanitized the props
// (allowlist + per-key value validation), so this layer only forwards them.

import type { AnalyticsEvent, AnalyticsSink, EventProps } from "./analytics.ts";

/** The slice of the `posthog-react-native` (or posthog-js) client we depend on.
 *  Any object with these methods works — the real PostHog instance satisfies it. */
export interface PostHogClient {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  reset(): void;
  flush(): Promise<void> | void;
}

/** Wrap a PostHog client as an AnalyticsSink for configureAnalytics(). */
export function makePostHogSink(client: PostHogClient): AnalyticsSink {
  return {
    capture: (event: AnalyticsEvent, props: EventProps) => client.capture(event, props),
    identify: (distinctId: string, props?: EventProps) => client.identify(distinctId, props),
    reset: () => client.reset(),
    flush: () => client.flush(),
  };
}
