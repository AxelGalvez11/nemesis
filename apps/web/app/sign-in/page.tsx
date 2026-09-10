"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { AuthModeSwitch } from "@/components/AuthModeSwitch";
import { useAuth } from "@/components/AuthProvider";
import { OAuthButtons } from "@/components/OAuthButtons";
import { TurnstileWidget, useCaptcha } from "@/components/TurnstileWidget";
import { DEFAULT_LANDING_PATH, resolveAuthRedirectUrl, sanitizeNextPath } from "@/lib/auth-redirect";
import { friendlySignInError } from "@/lib/auth-errors";
import { SIGN_IN_PREFILL_KEY } from "@/lib/auth-signup";
import { captchaEnabled, isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";

interface MfaStepUp {
  factorId: string;
  challengeId: string;
  kind: "totp" | "phone";
}

/** True when the account has a verified second factor this session hasn't
 *  passed yet. Fail-open: an errored check never blocks sign-in. */
async function needsStepUp(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

export default function SignInPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  // The captcha runs silently (interaction-only); the button stays live and submit waits for it.
  const captcha = useCaptcha();
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  // Two-step verification: set when the password was right but the account
  // has a verified second factor — the code form replaces the redirect.
  const [mfa, setMfa] = useState<MfaStepUp | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  // Challenge the first verified factor (authenticator app preferred; phone
  // sends the SMS as part of the challenge). Returns false to fall back to a
  // normal redirect if anything about the challenge fails.
  const beginStepUp = async (): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.find((item) => item.status === "verified")
        ?? data?.phone?.find((item) => item.status === "verified");
      if (!factor) return false;
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError || !challenge) return false;
      setMfaCode("");
      setMfa({ challengeId: challenge.id, factorId: factor.id, kind: factor.factor_type === "phone" ? "phone" : "totp" });
      return true;
    } catch {
      return false;
    }
  };

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfa) return;
    setMfaBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({ challengeId: mfa.challengeId, code: mfaCode.trim(), factorId: mfa.factorId });
      if (verifyError) {
        setError("That code didn't match. Try the newest code from your app.");
        return;
      }
      const rawNext = new URLSearchParams(window.location.search).get("next");
      router.replace(sanitizeNextPath(rawNext, DEFAULT_LANDING_PATH));
    } catch {
      setError("Nemesis could not check that code. Try again.");
    } finally {
      setMfaBusy(false);
    }
  }

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

  // Already signed in? Go straight to the account — UNLESS the account has a
  // verified second factor this session hasn't passed, in which case show the
  // code form instead. Preview mode is exempt for local design work.
  useEffect(() => {
    if (loading || !session || isPreviewMode || mfa) return;
    let alive = true;
    void (async () => {
      if (await needsStepUp()) {
        if (alive && (await beginStepUp())) return;
        if (!alive) return;
      }
      if (!alive) return;
      const rawNext = new URLSearchParams(window.location.search).get("next");
      router.replace(sanitizeNextPath(rawNext, DEFAULT_LANDING_PATH));
    })();
    return () => { alive = false; };
    // beginStepUp is stable enough for this gate; re-running on mfa covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, router, mfa]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    try {
      const token = captchaEnabled && !isPreviewMode ? await captcha.waitForToken() : "";
      if (captchaEnabled && !isPreviewMode && !token) {
        setError("The security check did not finish. Reload the page and try again.");
        captcha.reset();
        return;
      }
      const err = await signIn(email.trim(), password, token || undefined);
      if (err) {
        setError(friendlySignInError(err));
        setUnconfirmed(/not confirmed/i.test(err));
        // Turnstile tokens are single-use: reset the widget so the next attempt gets a fresh challenge.
        captcha.reset();
        return;
      }
      // The signed-in effect above finishes the trip: it either redirects or,
      // when the account has two-step verification, shows the code form.
    } catch {
      setError("Nemesis could not reach the identity service. Check your connection and try again.");
      captcha.reset();
    } finally {
      setBusy(false);
    }
  }

  // The account exists but the confirmation link was never opened (or expired). Send a new one
  // from right here instead of pointing the learner back at a sign-up form they already filled in.
  async function resendConfirmation() {
    setResent(false);
    const cleanEmail = email.trim();
    if (!cleanEmail) return;
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: { emailRedirectTo: resolveAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(nextPath())}`) },
    });
    if (resendError) {
      setError(friendlySignInError(resendError.message));
      return;
    }
    setError(null);
    setResent(true);
  }

  function nextPath(): string {
    const raw = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
    return sanitizeNextPath(raw, DEFAULT_LANDING_PATH);
  }

  if (mfa) {
    return (
      <AuthFrame
        eyebrow="One more step"
        title="Enter your verification code."
        description={mfa.kind === "phone" ? "We texted a code to your phone." : "Open your authenticator app and type the 6-digit code."}
      >
        <form onSubmit={onSubmitMfa} className="nemesis-auth-form">
          <div className="nemesis-auth-field-group">
            <input autoComplete="one-time-code" autoFocus id="signin-mfa-code" inputMode="numeric" maxLength={8} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} placeholder=" " value={mfaCode} />
            <label htmlFor="signin-mfa-code">Verification code</label>
          </div>
          <button className="nemesis-auth-submit" disabled={mfaBusy || mfaCode.length < 6} type="submit">{mfaBusy ? "Checking…" : "Continue"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Welcome to Nemesis"
      subtitle="Your learning workspace"
      description="Sign in to pick up where you left off."
      footer={<p>New to Nemesis? <Link className="nemesis-auth-link" href="/sign-up">Create your account.</Link></p>}
    >
        <AuthModeSwitch active="sign-in" />
        {deleted ? <p className="nemesis-auth-success">Your account and its server-side records were deleted.</p> : null}
        {existing ? <p className="nemesis-auth-notice">That email already has a Nemesis account. Sign in below to continue.</p> : null}
        {isPreviewMode ? <p className="nemesis-auth-notice">Local preview mode: no account credentials are required.</p> : null}
        {/* `next` is threaded through so a learner who came from the pricing page and signs in
            with Google lands back on checkout, not on the front door. */}
        <OAuthButtons disabled={busy} onError={setError} showTermsNote next={nextPath()} />
        <form onSubmit={onSubmit} className="nemesis-auth-form">
          <div className="nemesis-auth-field-group">
            <input id="signin-email" type="email" autoComplete="email" required={!isPreviewMode} placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="signin-email">Account email</label>
          </div>
          <div className="nemesis-auth-field-group">
            <input id="signin-password" type="password" autoComplete="current-password" required={!isPreviewMode} placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} />
            <label htmlFor="signin-password">Password</label>
          </div>
          <p className="nemesis-auth-aside">
            <Link className="nemesis-auth-link" href="/auth/forgot">Forgot your password?</Link>
          </p>
          <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
          <button className="nemesis-auth-submit" disabled={busy} type="submit">{busy ? "Signing in…" : isPreviewMode ? "Enter preview" : "Sign in"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
        {unconfirmed && !resent ? (
          <p className="nemesis-auth-notice">
            <button className="nemesis-auth-textbtn" onClick={() => void resendConfirmation()} type="button">Send me a new confirmation email</button>
          </p>
        ) : null}
        {resent ? <p className="nemesis-auth-success">A new confirmation link is on its way to {email.trim()}.</p> : null}
    </AuthFrame>
  );
}
