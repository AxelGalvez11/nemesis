"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import { isPreviewMode } from "@/lib/env";
import { TOS_VERSION } from "@/lib/legal";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const { loading, session } = useAuth();
  const router = useRouter();
  const [urlChecked, setUrlChecked] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/account");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setCallbackError(hash.get("error_description") ?? query.get("error_description"));
    setNextPath(sanitizeNextPath(query.get("next"), "/account"));
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
    router.replace(nextPath);
  }, [loading, nextPath, router, session, urlChecked]);

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
        ? <p className="nemesis-auth-notice" role="alert">Request a new link, or sign in with your email and password.</p>
        : null}
    </AuthFrame>
  );
}
