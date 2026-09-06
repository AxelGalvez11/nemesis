"use client";

// The crash barrier for every route that does not have its own.
//
// Until 2026-09-04 only the Canvas route (/learn) had an error boundary; a render crash on
// Library, Study, Settings, Pricing, or the sign-in pages showed Next's bare "Application error"
// page with nothing on it that led back into the product. Same posture as learn/error.tsx: quiet,
// no red, real <a> links (a click handler that runs application code is not a recovery path when
// the application is what just broke).

import { useEffect } from "react";
import { phCaptureException } from "@/lib/posthog";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] a page failed to render", error);
    phCaptureException(error, { boundary: "app", digest: error.digest, path: window.location.pathname });
  }, [error]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-(--ui-bg-editor)">
      <div className="mx-auto w-full max-w-sm px-6 text-center">
        <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">Something went wrong on this page.</p>
        <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">Your work is saved. Try again, or go back to Nemesis.</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)" onClick={reset} type="button">Try again</button>
          <a className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)" href="/learn">Back to Nemesis</a>
        </div>
      </div>
    </main>
  );
}
