"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { DEFAULT_LANDING_PATH, sanitizeNextPath } from "@/lib/auth-redirect";
import { isPreviewMode } from "@/lib/env";
import { TOS_VERSION } from "@/lib/legal";
import { phCapture } from "@/lib/posthog";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const { loading, session } = useAuth();
  const [urlChecked, setUrlChecked] = useState(false);
  // The page sat on "Signing you in…" with nothing to press when the hand-off stalled (owner,
  // 2026-09-05, a confirmation link on production). Two answers: after a short wait, finish the
  // sign-in by hand from the tokens in the URL; after a longer one, admit it and offer a way out.
  const [stuck, setStuck] = useState(false);
  const leaving = useRef(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState(DEFAULT_LANDING_PATH);
  // What kind of link brought them here: Supabase's confirmation link carries `type=signup`
  // in the hash, a recovery link `type=recovery`, an OAuth return neither. This is the
  // "email verified" step of the funnel, which had no event at all until 2026-09-04.
  const [linkType, setLinkType] = useState<string>("oauth");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setCallbackError(hash.get("error_description") ?? query.get("error_description"));
    setNextPath(sanitizeNextPath(query.get("next"), DEFAULT_LANDING_PATH));
    setLinkType(hash.get("type") ?? query.get("type") ?? "oauth");
    setUrlChecked(true);
  }, []);

  useEffect(() => {
    if (!urlChecked || loading || !session) return;
    // OAuth accounts never pass the signup consent form, so stamp the accepted Terms version on
    // first arrival. Email signups already carry tos_version from the signup form (no-op here).
    if (!isPreviewMode && !session.user.user_metadata?.tos_version) {
      void supabase.auth.updateUser({
        data: { tos_version: TOS_VERSION, tos_accepted_at: new Date().toISOString(), tos_recorded_via: "auth-callback" },
      });
    }
    if (leaving.current) return;
    leaving.current = true;
    phCapture(linkType === "signup" ? "email_verified" : "auth_callback_completed", { type: linkType });
    // A full navigation, not router.replace. The client router has wedged on this hop before
    // (the "blank screen on canvas exit" report), and a page whose only job is to leave must
    // not depend on it. It also drops the tokens out of the address bar.
    window.location.replace(nextPath);
  }, [linkType, loading, nextPath, session, urlChecked]);

  // Fallback one: the tokens are in the hash, but the client did not pick them up (a race with
  // the auth listener, a blocked storage write). Hand them over ourselves after three seconds.
  useEffect(() => {
    if (!urlChecked || session || isPreviewMode) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) return;
    const timer = window.setTimeout(() => {
      void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [session, urlChecked]);

  // Fallback two: ten seconds with no session and no error is not "a moment" any more.
  useEffect(() => {
    if (!urlChecked || session) return;
    const timer = window.setTimeout(() => setStuck(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [session, urlChecked]);

  const failed = urlChecked && !loading && !session;
  const message = callbackError
    ? callbackError.replace(/\+/g, " ")
    : "This authorization link is invalid, expired, or has already been used.";

  // Nobody is meant to read this page on the way in — it redirects the moment the
  // session lands. So the success state is one line and nothing else: no logo
  // badge, no uppercase label, no status line restating the headline.
  //
  // The FAILURE state is the opposite: it is the end of the road, someone is
  // actually reading it, and it has to say what to do next. Minimal means fewer
  // words, not fewer answers.
  if (!failed && stuck) {
    return (
      <AuthFrame
        minimal
        title="This is taking longer than usual."
        description="Your link may still be working in the background. You can also open Nemesis directly, or sign in again."
        footer={<p><a className="nemesis-auth-link" href={nextPath}>Open Nemesis</a> <span aria-hidden="true">&middot;</span> <a className="nemesis-auth-link" href="/sign-in">Sign in</a></p>}
      >
        {null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      minimal
      title={failed ? "That link didn't work." : "Signing you in…"}
      description={failed ? message : "This only takes a moment."}
      footer={failed ? <p><Link className="nemesis-auth-link" href="/sign-in">Back to sign in</Link></p> : undefined}
    >
      {/* The red error panel used to sit here. Dropped: the description above
          already carries the reason, so the panel was a second error message
          shouting the same news, and on a page this quiet the title is signal
          enough. role="alert" stays so a screen reader is still told. */}
      {failed
        ? <p className="nemesis-auth-notice" role="alert">Sign in with your email and password. If your email is not confirmed yet, the sign-in page can send you a fresh link.</p>
        : null}
    </AuthFrame>
  );
}
