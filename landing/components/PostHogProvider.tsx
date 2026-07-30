"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPosthog, phCapture } from "@/lib/posthog";

// Starts analytics once in the browser and records a pageview on every route change.
// Next.js soft navigations (Home -> Pricing) don't reload the page, so the pageview has to be
// sent explicitly or the whole site would look like one visit. Mirrors the app's provider so
// both halves of the funnel count a "page" the same way. useSearchParams forces a Suspense
// boundary: without it the entire page opts out of static rendering.
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
    // Campaign tags (utm_*) ride in the query string, which is how we learn whether a visitor
    // came from TikTok, YouTube, or a link someone shared.
    if (qs) url += `?${qs}`;
    phCapture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
