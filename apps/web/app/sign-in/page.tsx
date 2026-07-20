"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { AuthModeSwitch } from "@/components/AuthModeSwitch";
import { useAuth } from "@/components/AuthProvider";
import { OAuthButtons } from "@/components/OAuthButtons";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import { SIGN_IN_PREFILL_KEY } from "@/lib/auth-signup";
import { captchaEnabled, isPreviewMode } from "@/lib/env";

export default function SignInPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  // Bumped on any auth failure to remount the Turnstile widget (its tokens are single-use).
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDeleted(params.get("deleted") === "1");
    setExisting(params.get("existing") === "1");
    // /sign-up hands the typed email over via sessionStorage (never the URL) when the address
    // already has an account, so the visitor lands here with their email ready to go.
    try {
      const prefill = window.sessionStorage.getItem(SIGN_IN_PREFILL_KEY);
      if (prefill) {
        setEmail(prefill);
        window.sessionStorage.removeItem(SIGN_IN_PREFILL_KEY);
      }
    } catch {
      // sessionStorage can be unavailable (private mode); prefill is a nicety, not a requirement.
    }
  }, []);

  // Already signed in? There is nothing to authenticate — go straight to the account.
  // Preview mode is exempt so the page stays viewable for local design work.
  useEffect(() => {
    if (loading || !session || isPreviewMode) return;
    const rawNext = new URLSearchParams(window.location.search).get("next");
    router.replace(sanitizeNextPath(rawNext, "/sessions"));
  }, [loading, session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (captchaEnabled && !isPreviewMode && !captchaToken) {
      setError("Please complete the verification check.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const err = await signIn(email.trim(), password, captchaToken || undefined);
      if (err) {
        setError(err);
        // Turnstile tokens are single-use: reset the widget so the next attempt gets a fresh challenge.
        setCaptchaToken("");
        setCaptchaKey((k) => k + 1);
        return;
      }
      const rawNext = new URLSearchParams(window.location.search).get("next");
      router.replace(sanitizeNextPath(rawNext, "/sessions"));
    } catch {
      setError("Nemesis could not reach the identity service. Check your connection and try again.");
      setCaptchaToken("");
      setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Sign in to Nemesis."
      description="Your account, your plan, and your workspace."
      footer={<p>New to Nemesis? <Link className="nemesis-auth-link" href="/sign-up">Create your account.</Link></p>}
    >
        <AuthModeSwitch active="sign-in" />
        {deleted ? <p className="nemesis-auth-success">Your account and its server-side records were deleted.</p> : null}
        {existing ? <p className="nemesis-auth-notice">That email already has a Nemesis account. Sign in below to continue.</p> : null}
        {isPreviewMode ? <p className="nemesis-auth-notice">Local preview mode: no account credentials are required.</p> : null}
        <OAuthButtons disabled={busy} onError={setError} showTermsNote />
        <form onSubmit={onSubmit} className="nemesis-auth-form">
          <div className="nemesis-auth-field-group">
            <label htmlFor="signin-email">Account email</label>
            <input id="signin-email" type="email" autoComplete="email" required={!isPreviewMode} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="nemesis-auth-field-group">
            <label htmlFor="signin-password">Password</label>
            <input id="signin-password" type="password" autoComplete="current-password" required={!isPreviewMode} placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
          <button className="nemesis-auth-submit" disabled={busy || (captchaEnabled && !isPreviewMode && !captchaToken)} type="submit">{busy ? "Signing in…" : isPreviewMode ? "Enter preview" : "Sign in"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
