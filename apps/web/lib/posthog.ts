"use client";

import type { PostHog } from "posthog-js";
import { isPreviewMode, posthogHost, posthogKey } from "./env";

// Nemesis product analytics — browser client.
//
// Privacy: Nemesis handles students' own coursework and questions, so this is deliberately minimal —
// autocapture and session recording are OFF and we never send question text. Only the explicit
// events fired from the app (signup, ask_*, research_*, checkout_started) plus pageviews flow,
// and page URLs carry UUIDs, never query content. The phc_ project key is a write-only ingestion
// key, safe to ship in the bundle; analytics READS happen server-side with a personal API key,
// never this one. Every helper no-ops when PostHog is unconfigured or in preview mode, so call
// sites never need to guard.
//
// 🔴 LOADED LAZILY. `posthog-js` is 195 KB (64 KB gzipped) and used to be a static import in the
// root layout, so the sign-in and pricing pages paid for it before the form could paint. It is now
// fetched after first paint; anything captured before it arrives is queued and replayed in order.

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
const queue: Array<(ph: PostHog) => void> = [];

function enabled(): boolean {
  return typeof window !== "undefined" && Boolean(posthogKey) && !isPreviewMode;
}

export function initPosthog(): void {
  if (!enabled() || loading) return;
  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        capture_pageview: false,            // captured manually on App Router route changes (PostHogProvider)
        capture_pageleave: true,
        autocapture: false,                 // never auto-capture on-screen text or inputs
        disable_session_recording: true,
        person_profiles: "identified_only", // anonymous visitors don't mint person rows until sign-in
        // Error tracking. Until 2026-09-04 nothing in the app recorded a client-side crash anywhere;
        // the only way to learn a student hit one was for them to write in. Uncaught exceptions and
        // unhandled rejections now land in PostHog's Error tracking with the signed-in user's id
        // (from phIdentify) and the page URL. No page text or inputs ride along with them.
        capture_exceptions: true,
        // The two sites share one visitor: the landing sets the same cookie on .enternemesis.com, so
        // a click on "Get Nemesis" and the sign-up that follows count as one person in the funnel.
        cross_subdomain_cookie: true,
      });
      client = posthog;
      for (const job of queue.splice(0)) job(posthog);
      return posthog;
    })
    .catch(() => null);
}

function withClient(job: (ph: PostHog) => void): void {
  if (!enabled()) return;
  initPosthog();
  if (client) job(client);
  else queue.push(job);
}

export function phCapture(event: string, properties?: Record<string, unknown>): void {
  withClient((ph) => ph.capture(event, properties));
}

export function phIdentify(distinctId: string, properties?: Record<string, unknown>): void {
  withClient((ph) => ph.identify(distinctId, properties));
}

export function phReset(): void {
  if (client) client.reset();
}

/** Report a caught error with context. Used by the error boundaries and by places that swallow
 *  an exception on purpose but still want it visible in the error tracker. */
export function phCaptureException(error: unknown, properties?: Record<string, unknown>): void {
  withClient((ph) => ph.captureException(error instanceof Error ? error : new Error(String(error)), properties));
}
