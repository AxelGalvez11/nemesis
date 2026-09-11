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
import { TOS_VERSION } from "@/lib/legal";
import { supabase } from "@/lib/supabase";

const CONSENT_REQUIRED_MESSAGE = "Please agree to the Terms and Privacy Policy to continue.";

const PROMISE = "Nemesis only reads the material you bring, and only to build what you ask for. No ads, no selling your data, no training on your content, and you can delete your account at any time.";

// Post-auth destination from ?next= (same-site paths only) — the enternemesis.com
// pricing funnel routes strangers through here and resumes Stripe checkout on return.
function nextPath(): string {
  const raw = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
  return sanitizeNextPath(raw, DEFAULT_LANDING_PATH);
}

/**
 * Sign-up on the same rows as sign-in, and so on Sana's: the email first, then a password and the consent
 * box. See the note on /sign-in for why the page asks in two steps.
 *
 * 🔴 THE TERMS SENTENCE APPEARS ONCE PER SCREEN (owner, 2026-07-31: the same sentence twice on one page).
 * The first screen carries it in the legal line, because Google or Apple can create an account from there
 * with nothing else on the screen saying so. The second screen carries it in the consent box, which is what
 * actually gates the account, so its legal line drops that sentence.
 */
export default function SignUpPage() {
  const { signUp, session, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [next, setNext] = useState(DEFAULT_LANDING_PATH);
  // The captcha runs silently (interaction-only); the button stays live and submit waits for it.
  const captcha = useCaptcha();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNext(nextPath());
  }, []);

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus();
  }, [step]);

  // Already signed in? An account exists and is active — this page has nothing to create.
  // Preview mode is exempt so the page stays viewable for local design work.
  useEffect(() => {
    if (!loading && session && !isPreviewMode) router.replace(nextPath());
  }, [loading, session, router]);

  function routeToSignIn(existingEmail: string) {
    // The email already has an account: hand it to /sign-in via sessionStorage (never the URL)
    // and bounce there with a friendly notice instead of a dead-end error. Keep the funnel's
    // ?next= so checkout still resumes after they sign in.
    try {
      window.sessionStorage.setItem(SIGN_IN_PREFILL_KEY, existingEmail);
    } catch {
      // sessionStorage can be unavailable (private mode); the notice on /sign-in still explains.
    }
    const target = nextPath();
    // 🔴 COMPARED AGAINST THE CONSTANT, NOT A REPEATED LITERAL. This read `next === "/sessions"`,
    // which was the old default — the test is "did the learner actually ask for somewhere?", and
    // written as a literal it silently stops answering that the moment the default moves.
    router.replace(
      target === DEFAULT_LANDING_PATH ? "/sign-in?existing=1" : `/sign-in?existing=1&next=${encodeURIComponent(target)}`,
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === "email") {
      // The browser's own check (required, type="email") has already run before this event fires.
      setStep("password");
      return;
    }
    // Consent gate: an account is created only after the user accepts the academic-integrity and
    // privacy boundary. The accepted version is recorded on the user (AuthProvider).
    if (!agreed && !isPreviewMode) {
      setError(CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    const cleanEmail = email.trim();
    try {
      const token = captchaEnabled && !isPreviewMode ? await captcha.waitForToken() : "";
      if (captchaEnabled && !isPreviewMode && !token) {
        setError("The security check did not finish. Reload the page and try again.");
        captcha.reset();
        return;
      }
      const result = await signUp(cleanEmail, password, { tosVersion: TOS_VERSION, next: nextPath() }, token || undefined);
      if (result.alreadyRegistered) {
        routeToSignIn(cleanEmail);
        return;
      }
      if (result.error) {
        setError(friendlySignInError(result.error));
        // Turnstile tokens are single-use: reset the widget so the next attempt gets a fresh challenge.
        captcha.reset();
        return;
      }
      if (result.needsEmailConfirmation) {
        setSubmittedEmail(cleanEmail);
        return;
      }
      router.replace(nextPath());
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
  }

  // Confirmation links expire and inboxes lose things. One button, a minute apart at most
  // (Supabase rate-limits the resend itself), instead of "fill the form in again".
  async function resendConfirmation() {
    setResendState("sending");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: submittedEmail,
      options: { emailRedirectTo: resolveAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(nextPath())}`) },
    });
    setResendState(resendError ? "failed" : "sent");
  }

  if (submittedEmail) {
    return (
      <AuthFrame
        title="Check your email"
        subtitle="Almost there"
        description={<>We sent a confirmation link to<br /><strong className="nemesis-auth-email">{submittedEmail}</strong></>}
        footer={<p><Link className="nemesis-auth-link" href="/sign-in">Back to sign in</Link></p>}
      >
        <p className="nemesis-auth-success">Open the link to finish creating your account. You can close this tab afterward.</p>
        <p className="nemesis-auth-notice">
          {resendState === "sent"
            ? "A fresh link is on its way. Check spam if it does not show up."
            : resendState === "failed"
              ? "Couldn't send another link just now. Wait a minute and try again."
              : <>Nothing arrived? <button className="nemesis-auth-textbtn" disabled={resendState === "sending"} onClick={() => void resendConfirmation()} type="button">{resendState === "sending" ? "Sending…" : "Send it again"}</button></>}
        </p>
      </AuthFrame>
    );
  }

  const signInHref = next === DEFAULT_LANDING_PATH ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
  const lead = step === "password" ? (
    <>Choose a password for<br /><strong className="nemesis-auth-email">{email.trim() || "your account"}</strong></>
  ) : isPreviewMode ? (
    <>Local preview mode<br />No account will be created</>
  ) : (
    <>Free to start, no card needed<br />Already have an account? <Link className="nemesis-auth-link" href={signInHref}>Sign in</Link></>
  );

  return (
    <AuthFrame title="Create your account" subtitle="Your learning space" description={lead}>
      <OAuthButtons disabled={busy} next={next} onError={setError} />
      <form className="nemesis-auth-form" noValidate={isPreviewMode} onSubmit={onSubmit}>
        {step === "email" ? (
          <>
            <label className="nemesis-auth-sr" htmlFor="signup-email">Email</label>
            <input autoComplete="email" id="signup-email" name="email" onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" required={!isPreviewMode} type="email" value={email} />
            <button className="nemesis-auth-submit" type="submit">{email.trim() ? "Continue" : "Enter your email"}</button>
          </>
        ) : (
          <>
            {/* The address rides along, hidden, so a password manager files the new password under it. */}
            <input autoComplete="username" hidden name="email" readOnly type="email" value={email} />
            <label className="nemesis-auth-sr" htmlFor="signup-password">Password</label>
            <input autoComplete="new-password" id="signup-password" minLength={isPreviewMode ? undefined : 8} name="password" onChange={(e) => setPassword(e.target.value)} placeholder="Password, at least 8 characters" ref={passwordRef} required={!isPreviewMode} type="password" value={password} />
            <label className="nemesis-auth-consent">
              <input aria-label="Agree to the Terms and Privacy Policy" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} type="checkbox" />
              {/* The Terms and Privacy agreement is what this box actually gates (submit stays disabled
                  until `agreed`), and it carries the legal weight. */}
              <span>I agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>.</span>
            </label>
            <button className="nemesis-auth-submit" disabled={busy || (!agreed && !isPreviewMode)} type="submit">{busy ? "Creating account…" : isPreviewMode ? "Enter preview" : "Create account"}</button>
          </>
        )}
        <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
      </form>
      {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
      <p className="nemesis-auth-legal">
        {step === "password" ? (
          <>
            <button className="nemesis-auth-textbtn" onClick={changeEmail} type="button">Use a different email</button>
            <br />
            {PROMISE}
          </>
        ) : (
          <>
            By continuing, you agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and{" "}
            <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>. {PROMISE}
          </>
        )}
      </p>
    </AuthFrame>
  );
}
