"use client";

import posthog from "posthog-js";
import { isPreviewMode, posthogHost, posthogKey } from "./env";

// PharmaOrb product analytics — browser client.
//
// Privacy: PharmaOrb answers health-related questions, so this is deliberately minimal —
// autocapture and session recording are OFF and we never send question text. Only the explicit
// events fired from the app (signup, ask_*, research_*, checkout_started) plus pageviews flow,
// and page URLs carry UUIDs, never query content. The phc_ project key is a write-only ingestion
// key, safe to ship in the bundle; analytics READS happen server-side with a personal API key,
// never this one. Every helper no-ops when PostHog is unconfigured or in preview mode, so call
// sites never need to guard.
let started = false;

export function initPosthog(): void {
  if (started || typeof window === "undefined" || !posthogKey || isPreviewMode) return;
  started = true;
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false,            // captured manually on App Router route changes (PostHogProvider)
    capture_pageleave: true,
    autocapture: false,                 // health app: never auto-capture on-screen text or inputs
    disable_session_recording: true,
    person_profiles: "identified_only", // anonymous visitors don't mint person rows until sign-in
  });
}

export function phCapture(event: string, properties?: Record<string, unknown>): void {
  initPosthog();
  if (started) posthog.capture(event, properties);
}

export function phIdentify(distinctId: string, properties?: Record<string, unknown>): void {
  initPosthog();
  if (started) posthog.identify(distinctId, properties);
}

export function phReset(): void {
  if (started) posthog.reset();
}
