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
import { TOS_VERSION } from "@/lib/legal";
import { supabase } from "@/lib/supabase";

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
  // The captcha runs silently (interaction-only); the button stays live and submit waits for it.
  const captcha = useCaptcha();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // Post-auth destination from ?next= (same-site paths only) — the enternemesis.com
  // pricing funnel routes strangers through here and resumes Stripe checkout on return.
  function nextPath(): string {
    const raw = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
    return sanitizeNextPath(raw, DEFAULT_LANDING_PATH);
  }

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
    const next = nextPath();
    // 🔴 COMPARED AGAINST THE CONSTANT, NOT A REPEATED LITERAL. This read `next === "/sessions"`,
    // which was the old default — the test is "did the learner actually ask for somewhere?", and
    // written as a literal it silently stops answering that the moment the default moves. It would
    // then forward `next=/learn` as though it had been requested, which is harmless here and
    // exactly the kind of drift that is not harmless somewhere else.
    router.replace(
      next === DEFAULT_LANDING_PATH ? "/sign-in?existing=1" : `/sign-in?existing=1&next=${encodeURIComponent(next)}`,
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Consent gate: an account is created only after the user accepts the academic-integrity and
    // privacy boundary. The accepted version is recorded on the user (AuthProvider).
    if (!agreed && !isPreviewMode) {
      setError(CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
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
        eyebrow="Check your email"
        title="Confirm your email."
        description={<>A confirmation link was sent to <strong>{submittedEmail}</strong>. Open it to finish creating your account.</>}
        footer={<p><Link className="nemesis-auth-link" href="/sign-in">Back to sign in.</Link></p>}
      >
        <p className="nemesis-auth-success">Waiting for you to open the link. You can close this tab afterward.</p>
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

  return (
    <AuthFrame
      eyebrow="Get started"
      title="Create your account"
      subtitle="Your learning workspace"
      description="One account for your plan and everything Nemesis builds for you."
      footer={<p>Already have an account? <Link className="nemesis-auth-link" href="/sign-in">Sign in.</Link></p>}
    >
        <AuthModeSwitch active="sign-up" />
        {isPreviewMode ? <p className="nemesis-auth-notice">Local preview mode: no account will be created.</p> : null}
        {/* No `showTermsNote` here, unlike /sign-in: the consent checkbox below already
            states the Terms and Privacy agreement, and rendering both put the same
            sentence on this page twice (owner, 2026-07-31). Sign-in keeps the note
            because it has no checkbox — OAuth there can create an account with nothing
            else on the page saying so. */}
        <OAuthButtons disabled={busy} onError={setError} next={nextPath()} />
        <form onSubmit={onSubmit} className="nemesis-auth-form">
          <div className="nemesis-auth-field-group">
            <input id="signup-email" type="email" autoComplete="email" required={!isPreviewMode} placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="signup-email">Account email</label>
          </div>
          <div className="nemesis-auth-field-group">
            <input id="signup-password" type="password" autoComplete="new-password" required={!isPreviewMode} minLength={isPreviewMode ? undefined : 8} placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} />
            <label htmlFor="signup-password">Password</label>
          </div>
          <label className="nemesis-auth-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-label="Agree to the Terms and Privacy Policy" />
            {/* The "Nemesis prepares material for my review and never submits on my
                behalf" sentence was removed by the owner 2026-07-30. The Terms and
                Privacy agreement stays: it is what the checkbox actually gates
                (submit is disabled until `agreed`), and it is the part that carries
                legal weight. That commitment still holds and is stated in the Terms. */}
            <span>I agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>.</span>
          </label>
          <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
          <button className="nemesis-auth-submit" disabled={busy || (!agreed && !isPreviewMode)} type="submit">{busy ? "Creating account…" : isPreviewMode ? "Enter preview" : "Create account"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
