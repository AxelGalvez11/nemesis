"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
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

function nextPath(): string {
  const raw = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
  return sanitizeNextPath(raw, DEFAULT_LANDING_PATH);
}

const LEGAL = (
  <>
    By continuing, you agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and{" "}
    <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>. Nemesis only reads the material
    you bring, and only to build what you ask for. No ads, no selling your data, no training on your content, and you can
    delete your account at any time.
  </>
);

// The password step's legal slot opens with its two links, so the rest is one clause shorter: the slot keeps Sana's
// line count (four lines in a 381px column) instead of growing by one.
const LEGAL_SHORT = (
  <>
    By continuing, you agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and{" "}
    <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>. No ads, no selling your data, and no
    training on your content. You can delete your account at any time.
  </>
);

/**
 * 🔴🔴 THE EMAIL COMES FIRST AND THE PASSWORD SECOND, AND THAT IS A LAYOUT DECISION. Owner, 2026-09-11, the
 * fourth report on this page: "the spacing doesn't match like the Sana sign in one for one". Sana's first
 * screen is a headline, a lead, Google, "or", one field, one button and the legal line. Ours had a second
 * provider button, a password field, a forgot-password line, a captcha box and a sign-up line as well:
 * five rows Sana does not have, so no spacing could line the two pages up. The rows are Sana's now. The
 * password is the second step of the same form (the way Google, Microsoft and Sana ask), the sign-up link
 * is in the lead, the forgot-password link is in the legal slot, and the captcha floats.
 *
 * Nothing about HOW anyone signs in changed: the same signIn call, the same captcha, the same MFA step.
 */
export default function SignInPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  // Read once on mount. Reading the URL during render would give the server and the browser different
  // links and a hydration warning whenever ?next= is set.
  const [next, setNext] = useState(DEFAULT_LANDING_PATH);
  // The captcha runs silently (interaction-only); the button stays live and submit waits for it.
  const captcha = useCaptcha();
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  // Two-step verification: set when the password was right but the account
  // has a verified second factor — the code form replaces the redirect.
  const [mfa, setMfa] = useState<MfaStepUp | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus();
  }, [step]);

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
      router.replace(nextPath());
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
    setNext(nextPath());
    // /sign-up hands the typed email over via sessionStorage (never the URL) when the address
    // already has an account, so the visitor lands on its password with the email already known.
    try {
      const prefill = window.sessionStorage.getItem(SIGN_IN_PREFILL_KEY);
      if (prefill) {
        setEmail(prefill);
        setStep("password");
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
      router.replace(nextPath());
    })();
    return () => { alive = false; };
    // beginStepUp is stable enough for this gate; re-running on mfa covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, router, mfa]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === "email") {
      // The browser's own check (required, type="email") has already run before this event fires.
      setStep("password");
      return;
    }
    setBusy(true);
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

  function changeEmail() {
    setStep("email");
    setPassword("");
    setError(null);
    setUnconfirmed(false);
    setResent(false);
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

  if (mfa) {
    return (
      <AuthFrame
        title="One more step"
        subtitle="Enter your code"
        description={mfa.kind === "phone" ? <>We texted a code to your phone<br />Type it below to finish signing in</> : <>Open your authenticator app<br />and type the 6-digit code</>}
      >
        <form className="nemesis-auth-form" onSubmit={onSubmitMfa}>
          <label className="nemesis-auth-sr" htmlFor="signin-mfa-code">Verification code</label>
          <input autoComplete="one-time-code" autoFocus id="signin-mfa-code" inputMode="numeric" maxLength={8} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" value={mfaCode} />
          <button className="nemesis-auth-submit" disabled={mfaBusy || mfaCode.length < 6} type="submit">{mfaBusy ? "Checking…" : "Continue"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
      </AuthFrame>
    );
  }

  const signUpHref = next === DEFAULT_LANDING_PATH ? "/sign-up" : `/sign-up?next=${encodeURIComponent(next)}`;
  const lead = step === "password" ? (
    <>
      {existing ? "That email already has an account" : "Enter the password for"}
      <br />
      <strong className="nemesis-auth-email">{email.trim() || "your account"}</strong>
    </>
  ) : existing ? (
    <>That email already has an account<br />Enter it again to sign in</>
  ) : deleted ? (
    <>Your account and its records were deleted<br />Sign in again, or <Link className="nemesis-auth-link" href={signUpHref}>create an account</Link></>
  ) : isPreviewMode ? (
    <>Local preview mode<br />No account needed to look around</>
  ) : (
    <>Sign in to pick up where you left off<br />New to Nemesis? <Link className="nemesis-auth-link" href={signUpHref}>Create an account</Link></>
  );

  return (
    <AuthFrame title="Welcome to Nemesis" subtitle="Your learning space" description={lead}>
      {/* `next` is threaded through so a learner who came from the pricing page and signs in
          with Google lands back on checkout, not on the front door. */}
      <OAuthButtons disabled={busy} next={next} onError={setError} />
      <form className="nemesis-auth-form" noValidate={isPreviewMode} onSubmit={onSubmit}>
        {step === "email" ? (
          <>
            <label className="nemesis-auth-sr" htmlFor="signin-email">Email</label>
            <input autoComplete="username" id="signin-email" name="email" onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" required={!isPreviewMode} type="email" value={email} />
            <button className="nemesis-auth-submit" type="submit">{email.trim() ? "Continue" : "Enter your email"}</button>
          </>
        ) : (
          <>
            {/* The address rides along, hidden, so a password manager files the password under it. */}
            <input autoComplete="username" hidden name="email" readOnly type="email" value={email} />
            <label className="nemesis-auth-sr" htmlFor="signin-password">Password</label>
            <input autoComplete="current-password" id="signin-password" name="password" onChange={(e) => setPassword(e.target.value)} placeholder="Password" ref={passwordRef} required={!isPreviewMode} type="password" value={password} />
            <button className="nemesis-auth-submit" disabled={busy} type="submit">{busy ? "Signing in…" : isPreviewMode ? "Enter preview" : "Sign in"}</button>
          </>
        )}
        <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
      </form>
      {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
      {unconfirmed && !resent ? (
        <p className="nemesis-auth-notice">
          <button className="nemesis-auth-textbtn" onClick={() => void resendConfirmation()} type="button">Send me a new confirmation email</button>
        </p>
      ) : null}
      {resent ? <p className="nemesis-auth-success">A new confirmation link is on its way to {email.trim()}.</p> : null}
      <p className="nemesis-auth-legal">
        {step === "password" ? (
          <>
            <Link className="nemesis-auth-link" href="/auth/forgot">Forgot your password?</Link>
            {" · "}
            <button className="nemesis-auth-textbtn" onClick={changeEmail} type="button">Use a different email</button>
            <br />
            {LEGAL_SHORT}
          </>
        ) : LEGAL}
      </p>
    </AuthFrame>
  );
}
