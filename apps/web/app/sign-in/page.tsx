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
  const [captchaToken, setCaptchaToken] = useState("");
  // Bumped on any auth failure to remount the Turnstile widget (its tokens are single-use).
  const [captchaKey, setCaptchaKey] = useState(0);
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
        setError("That code didn't match — try the newest one from your app.");
        return;
      }
      const rawNext = new URLSearchParams(window.location.search).get("next");
      router.replace(sanitizeNextPath(rawNext, "/sessions"));
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
      router.replace(sanitizeNextPath(rawNext, "/sessions"));
    })();
    return () => { alive = false; };
    // beginStepUp is stable enough for this gate; re-running on mfa covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, router, mfa]);

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
      // The signed-in effect above finishes the trip: it either redirects or,
      // when the account has two-step verification, shows the code form.
    } catch {
      setError("Nemesis could not reach the identity service. Check your connection and try again.");
      setCaptchaToken("");
      setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
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
            <input id="signin-email" type="email" autoComplete="email" required={!isPreviewMode} placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="signin-email">Account email</label>
          </div>
          <div className="nemesis-auth-field-group">
            <input id="signin-password" type="password" autoComplete="current-password" required={!isPreviewMode} placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} />
            <label htmlFor="signin-password">Password</label>
          </div>
          <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
          <button className="nemesis-auth-submit" disabled={busy || (captchaEnabled && !isPreviewMode && !captchaToken)} type="submit">{busy ? "Signing in…" : isPreviewMode ? "Enter preview" : "Sign in"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
