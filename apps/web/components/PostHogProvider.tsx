"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPosthog, phCapture } from "@/lib/posthog";

// Initializes PostHog once in the browser and captures a $pageview on every App Router navigation.
// Next.js soft navigations don't reload the page, so pageviews must be sent explicitly on
// pathname/search changes. Mounted high in the root layout. No-ops cleanly when PostHog isn't
// configured or in preview mode (see lib/posthog). useSearchParams forces a Suspense boundary.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPosthog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageView />
      </Suspense>
      {children}
    </>
  );
}

function PageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    phCapture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
