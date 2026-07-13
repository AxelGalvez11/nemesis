"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { OAuthButtons } from "@/components/OAuthButtons";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { SIGN_IN_PREFILL_KEY } from "@/lib/auth-signup";
import { captchaEnabled, isPreviewMode } from "@/lib/env";
import { TOS_VERSION } from "@/lib/legal";

const CONSENT_REQUIRED_MESSAGE = "Please agree to the Terms and Privacy Policy to continue.";

export default function SignUpPage() {
  const { signUp, session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  // Bumped on any auth failure to remount the Turnstile widget (its tokens are single-use).
  const [captchaKey, setCaptchaKey] = useState(0);

  // Already signed in? An account exists and is active — this page has nothing to create.
  // Preview mode is exempt so the page stays viewable for local design work.
  useEffect(() => {
    if (!loading && session && !isPreviewMode) router.replace("/account");
  }, [loading, session, router]);

  function routeToSignIn(existingEmail: string) {
    // The email already has an account: hand it to /sign-in via sessionStorage (never the URL)
    // and bounce there with a friendly notice instead of a dead-end error.
    try {
      window.sessionStorage.setItem(SIGN_IN_PREFILL_KEY, existingEmail);
    } catch {
      // sessionStorage can be unavailable (private mode); the notice on /sign-in still explains.
    }
    router.replace("/sign-in?existing=1");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Consent gate: an account is created only after the user accepts the academic-integrity and
    // privacy boundary. The accepted version is recorded on the user (AuthProvider).
    if (!agreed && !isPreviewMode) {
      setError(CONSENT_REQUIRED_MESSAGE);
      return;
    }
    if (captchaEnabled && !isPreviewMode && !captchaToken) {
      setError("Please complete the verification check.");
      return;
    }
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim();
    try {
      const result = await signUp(cleanEmail, password, { tosVersion: TOS_VERSION }, captchaToken || undefined);
      if (result.alreadyRegistered) {
        routeToSignIn(cleanEmail);
        return;
      }
      if (result.error) {
        setError(result.error);
        // Turnstile tokens are single-use: reset the widget so the next attempt gets a fresh challenge.
        setCaptchaToken("");
        setCaptchaKey((k) => k + 1);
        return;
      }
      if (result.needsEmailConfirmation) {
        setSubmittedEmail(cleanEmail);
        return;
      }
      router.replace("/account");
    } catch {
      setError("Nemesis could not reach the identity service. Check your connection and try again.");
      setCaptchaToken("");
      setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  if (submittedEmail) {
    return (
      <AuthFrame
        eyebrow="Authorization required"
        title="Authorize the account."
        description={<>A secure link was sent to <strong>{submittedEmail}</strong>. Open it to complete deployment and enter the perimeter.</>}
        footer={<p><Link className="nemesis-auth-link" href="/sign-in">Return to identity gate.</Link></p>}
      >
        <p className="nemesis-auth-success">Awaiting email authorization. You can close this window after opening the secure link.</p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="Nemesis // initial deployment"
      title="Bring Nemesis online."
      description="Create the account that governs its memory, tools, and permitted scope."
      footer={<p>Already contained? <Link className="nemesis-auth-link" href="/sign-in">Return to sign in.</Link></p>}
    >
        {isPreviewMode ? <p className="nemesis-auth-notice">Local preview mode: no account will be created.</p> : null}
        <OAuthButtons disabled={busy} onError={setError} showTermsNote />
        <form onSubmit={onSubmit} className="nemesis-auth-form">
          <div className="nemesis-auth-field-group">
            <label htmlFor="signup-email">Account email</label>
            <input id="signup-email" type="email" autoComplete="email" required={!isPreviewMode} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="nemesis-auth-field-group">
            <label htmlFor="signup-password">Password</label>
            <input id="signup-password" type="password" autoComplete="new-password" required={!isPreviewMode} minLength={isPreviewMode ? undefined : 8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label className="nemesis-auth-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-label="Agree to the Terms and Privacy Policy" />
            <span>I understand Nemesis prepares academic and research material for my review and never submits on my behalf. I agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>.</span>
          </label>
          <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
          <button className="nemesis-auth-submit" disabled={busy || (!agreed && !isPreviewMode) || (captchaEnabled && !isPreviewMode && !captchaToken)} type="submit">{busy ? "Deploying…" : isPreviewMode ? "Enter preview" : "Deploy Nemesis"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
