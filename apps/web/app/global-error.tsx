"use client";

// The last barrier: catches a crash in the ROOT layout itself, where no theme, stylesheet or
// provider can be assumed to exist. So this page carries its own minimal styling inline and
// must render its own <html> and <body>.

import { useEffect } from "react";
import { phCaptureException } from "@/lib/posthog";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] the root layout failed to render", error);
    phCaptureException(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#212121", color: "#f7f7f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <div style={{ maxWidth: 360, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 15, margin: 0 }}>Nemesis hit a problem it could not recover from.</p>
          <p style={{ fontSize: 13, margin: "8px 0 0", opacity: 0.6 }}>Your work is saved. Reloading almost always fixes it.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
            <button onClick={reset} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, color: "inherit", cursor: "pointer", font: "inherit", fontSize: 13, padding: "8px 16px" }} type="button">Try again</button>
            <a href="/learn" style={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, color: "inherit", fontSize: 13, padding: "8px 16px", textDecoration: "none" }}>Reload Nemesis</a>
          </div>
        </div>
      </body>
    </html>
  );
}
