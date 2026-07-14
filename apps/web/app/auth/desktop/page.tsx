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
  const [handedOff, setHandedOff] = useState(false);
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
        window.location.href =
          `nemesis://auth/callback?refresh_token=${encodeURIComponent(refreshToken)}` +
          `&state=${encodeURIComponent(state)}`;
        setHandedOff(true);
        // Local-only sign-out: the refresh token now belongs to the desktop app;
        // keeping a browser copy would break the app's session on rotation.
        void supabase.auth.signOut({ scope: "local" });
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
      title={error ? "The perimeter stayed closed." : handedOff ? "Back to your Mac." : "Connecting your Mac."}
      description={
        error
          ? error
          : handedOff
            ? "Your Nemesis app is signing in now. You can close this tab."
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
      ) : (
        <p className="nemesis-auth-notice" role="status">
          {handedOff ? "Session handed to the Nemesis app." : "Working…"}
        </p>
      )}
    </AuthFrame>
  );
}
