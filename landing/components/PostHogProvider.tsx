"use client";

import { useEffect } from "react";
import { initPosthog } from "@/lib/posthog";

// Starts analytics once in the browser. That is all it does now.
//
// It used to also render a <PageView> child inside a <Suspense> boundary that read
// usePathname/useSearchParams and sent $pageview by hand. That effect never fired on the
// deployed site, and because autocapture is off too, the result was an analytics install
// that recorded nothing at all: cookie written, config fetched, zero events sent, and no
// error to notice. Pageviews are posthog-js's job again (capture_pageview:
// 'history_change' in lib/posthog.ts), which also covers App Router soft navigations
// without this component needing to know anything about routing.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPosthog();
  }, []);

  return <>{children}</>;
}
