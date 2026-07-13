"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { sanitizeNextPath } from "@/lib/auth-redirect";

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
    if (urlChecked && !loading && session) router.replace(nextPath);
  }, [loading, nextPath, router, session, urlChecked]);

  const failed = urlChecked && !loading && !session;
  const message = callbackError
    ? callbackError.replace(/\+/g, " ")
    : "This authorization link is invalid, expired, or has already been used.";

  return (
    <AuthFrame
      eyebrow={failed ? "Authorization failed" : "Authorization in progress"}
      title={failed ? "The perimeter stayed closed." : "Restoring containment."}
      description={failed ? message : "Nemesis is validating the secure link and restoring your account session."}
      footer={failed ? <p><Link className="nemesis-auth-link" href="/sign-in">Return to identity gate.</Link></p> : undefined}
    >
      {failed
        ? <p className="nemesis-auth-error" role="alert">Request a new account link or sign in with your email and password.</p>
        : <p className="nemesis-auth-notice" role="status">Identity token received. Verifying scope…</p>}
    </AuthFrame>
  );
}
