"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="centered">
          <section className="auth-card">
            <p className="eyebrow">Application error</p>
            <h1>Something went wrong</h1>
            <p className="muted">The error was captured for review. You can retry the current view.</p>
            <button type="button" onClick={reset}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
