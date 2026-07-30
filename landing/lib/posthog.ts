"use client";

import posthog from "posthog-js";

// Marketing-site analytics — the www half of the funnel.
//
// WHY THIS FILE DUPLICATES apps/web/lib/posthog.ts: `landing` is its own pnpm workspace root
// (see landing/pnpm-workspace.yaml) and cannot import from apps/web. The duplication is
// deliberate; what must NOT drift is the privacy posture below, which is copied verbatim.
//
// Privacy: autocapture and session recording are OFF, so no on-screen text, form input, or
// scroll content is ever collected. What ships is the page you were on and the button you
// pressed. Nothing on this site touches a student's coursework — that lives in the app.
//
// THE POINT OF SHARING THE APP'S PROJECT KEY: the question worth answering is "did the people
// who land here become people who use it", and that only works if one visitor stays ONE person
// across www.enternemesis.com -> app.enternemesis.com. posthog-js sets its cookie on the
// registrable domain (`.enternemesis.com`) unless the host is shared infrastructure — its
// blocklist is herokuapp.com / vercel.app / netlify.app, none of which we are in production.
// So both sites read the same distinct_id and the funnel is continuous, with no extra config.
// Verified against the installed posthog-js (1.408.0) rather than assumed.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

// Report only from the live marketing domain. Gating on the hostname rather than an env var
// means localhost and every *.vercel.app preview deploy stay silent WITHOUT depending on
// Vercel's "expose system environment variables" toggle being on — one less thing that can be
// quietly off and poison production numbers with preview traffic.
const ROOT_DOMAIN = "enternemesis.com";

function isReportingHost(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
}

let started = false;

export function initPosthog(): void {
  if (started || !posthogKey || !isReportingHost()) return;
  started = true;
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false, // sent manually so App Router soft navigations still register
    capture_pageleave: true, // gives us time-on-page, which is how we tell reading from bouncing
    autocapture: false, // never auto-collect on-screen text or input
    disable_session_recording: true,
    person_profiles: "identified_only", // visitors stay anonymous until they sign in
  });
}

/** Where a sign-up call to action lives, so we can tell which placement actually earns clicks. */
export type CtaLocation = "nav" | "hero" | "showcase" | "ios" | "closer" | "footer" | "pricing";

export function phCapture(event: string, properties?: Record<string, unknown>): void {
  initPosthog();
  if (started) posthog.capture(event, properties);
}

/**
 * One event for every "start using Nemesis" click, with the placement as a property.
 * One event name + a breakdown beats six event names: the funnel stays a single step and
 * the placement question is a filter, not a separate chart.
 *
 * Sent via sendBeacon because every one of these clicks immediately navigates to
 * app.enternemesis.com. A normally-queued event races the page teardown and loses, which
 * would silently drop the single most important number on the site. sendBeacon hands the
 * request to the browser to deliver after the page is gone.
 */
export function captureCtaClick(location: CtaLocation, label: string): void {
  initPosthog();
  if (started) {
    posthog.capture("landing_cta_click", { location, label }, { transport: "sendBeacon" });
  }
}
