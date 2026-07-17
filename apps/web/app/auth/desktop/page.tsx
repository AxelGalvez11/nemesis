"use client";

// /auth/desktop — the browser half of DESKTOP app sign-in.
//
// The Nemesis Mac app opens  /auth/desktop?provider=google|apple&state=<nonce>.
// Leg 1 (no session yet): run the normal Supabase OAuth flow; the provider
//   round-trips through /auth/callback back to /auth/desktop?state=<nonce>.
// Leg 2 (session present): hand the session's refresh token to the app through
//   the nemesis:// deep link (with the app's own state nonce echoed back), then
//   drop the browser-LOCAL copy of the session so exactly one side — the app —
//   owns the token family. No server-side revoke: the app is about to use it.
//
// The deep link is delivered through a VISIBLE "Open Nemesis" button, not only
// the automatic redirect: Chrome blocks custom-protocol launches that don't come
// from a user gesture, so the silent `location.href = nemesis://…` hop can be
// dropped without any error — the page said "Back to your Mac" while the app sat
// waiting forever (owner-reported, 2026-07-14). A real click always works.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { enabledOAuthProviders, isPreviewMode, type OAuthProviderId } from "@/lib/env";
import { supabase } from "@/lib/supabase";

// The app mints crypto.randomUUID() nonces; anything outside this shape is noise.
const STATE_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export default function DesktopAuthPage() {
  const { loading, session, signInWithOAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || startedRef.current) return;

    const query = new URLSearchParams(window.location.search);
    const state = query.get("state") ?? "";

    if (!STATE_PATTERN.test(state)) {
      setError("This sign-in link is missing its security code. Start again from the Nemesis app on your Mac.");
      return;
    }
    if (isPreviewMode) {
      setError("Desktop sign-in is not available in preview mode.");
      return;
    }

    if (session) {
      // Leg 2: hand the session to the app.
      startedRef.current = true;
      void (async () => {
        const { data } = await supabase.auth.getSession();
        const refreshToken = data.session?.refresh_token;
        if (!refreshToken) {
          setError("Could not read the signed-in session. Start again from the Nemesis app.");
          return;
        }
        const link =
          `nemesis://auth/callback?refresh_token=${encodeURIComponent(refreshToken)}` +
          `&state=${encodeURIComponent(state)}`;
        // Keep the link in state FIRST: once the local session copy is dropped
        // below, this string is the only remaining path to the app, and the
        // button must keep working even if the automatic hop was blocked.
        setDeepLink(link);
        window.location.href = link;
        // Hand-off done: drop the browser's LOCAL session WITHOUT a server-side
        // revoke. In supabase-js v2, signOut({ scope: "local" }) is NOT local — it
        // POSTs /logout and revokes THIS refresh token on the server, i.e. the exact
        // token we just handed the desktop app, so the app always exchanged an
        // already-dead token and sign-in silently failed (both Google and Apple).
        // Stop the browser's auto-refresh and clear its stored session so it can
        // neither rotate nor reuse the token the app now owns.
        try {
          void supabase.auth.stopAutoRefresh();
        } catch {
          // ignore
        }
        try {
          for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
              window.localStorage.removeItem(key);
            }
          }
        } catch {
          // A lingering browser copy is harmless once the tab is closed.
        }
      })();
      return;
    }

    // Leg 1: start the provider flow, returning to this page with the same state.
    const provider = query.get("provider") as OAuthProviderId | null;
    if (!provider || !enabledOAuthProviders.includes(provider)) {
      setError("Unknown sign-in provider. Start again from the Nemesis app.");
      return;
    }
    startedRef.current = true;
    void signInWithOAuth(provider, `/auth/desktop?state=${state}`).then((err) => {
      if (err) {
        startedRef.current = false;
        setError(err);
      }
    });
  }, [loading, session, signInWithOAuth]);

  return (
    <AuthFrame
      eyebrow={error ? "Desktop sign-in failed" : "Desktop sign-in"}
      title={error ? "The perimeter stayed closed." : deepLink ? "One click to finish." : "Connecting your Mac."}
      description={
        error
          ? error
          : deepLink
            ? "You're signed in. Press Open Nemesis below — your browser may ask permission to open the app; choose Open."
            : "Nemesis is finishing sign-in in your browser and handing the session to the desktop app."
      }
      footer={
        error ? (
          <p>
            <Link className="nemesis-auth-link" href="/sign-in">
              Sign in on the web instead.
            </Link>
          </p>
        ) : undefined
      }
    >
      {error ? (
        <p className="nemesis-auth-error" role="alert">
          Open the Nemesis app and press Continue with Google or Apple again.
        </p>
      ) : deepLink ? (
        <>
          <a className="nemesis-auth-submit" href={deepLink}>
            Open Nemesis
          </a>
          <p className="nemesis-auth-notice" role="status">
            Nothing happening? Make sure the Nemesis app is installed and open, then press the button again. You can
            close this tab once the app shows your account.
          </p>
        </>
      ) : (
        <p className="nemesis-auth-notice" role="status">
          Working…
        </p>
      )}
    </AuthFrame>
  );
}
