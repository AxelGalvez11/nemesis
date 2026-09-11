"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { TurnstileWidget, useCaptcha } from "@/components/TurnstileWidget";
import { friendlySignInError } from "@/lib/auth-errors";
import { resolveAuthRedirectUrl } from "@/lib/auth-redirect";
import { captchaEnabled, isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";

/**
 * Forgot password, step one: ask for the email and send Supabase's recovery link.
 *
 * The link lands on /auth/reset, which is where the new password is chosen. The confirmation
 * copy is the same whether or not the address has an account, so this page cannot be used to
 * find out who has signed up.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captcha = useCaptcha();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cleanEmail = email.trim();
      const token = captchaEnabled && !isPreviewMode ? await captcha.waitForToken() : "";
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: resolveAuthRedirectUrl("/auth/reset"),
        ...(token ? { captchaToken: token } : {}),
      });
      if (resetError) {
        setError(friendlySignInError(resetError.message));
        captcha.reset();
        return;
      }
      setSent(true);
    } catch {
      setError("Nemesis could not reach the sign-in service. Check your connection and try again.");
      captcha.reset();
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthFrame
        title="Check your email."
        description={<>If <strong>{email.trim()}</strong> has a Nemesis account, a link to choose a new password is on its way. It works for one hour.</>}
        footer={<p><Link className="nemesis-auth-link" href="/sign-in">Back to sign in</Link></p>}
      >
        <p className="nemesis-auth-notice">Nothing in your inbox after a couple of minutes? Check spam, then try again.</p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Reset your password."
      description="Enter the email on your account and we'll send you a link to choose a new one."
      footer={<p>Remembered it? <Link className="nemesis-auth-link" href="/sign-in">Sign in.</Link></p>}
    >
      <form onSubmit={onSubmit} className="nemesis-auth-form">
        <label className="nemesis-auth-sr" htmlFor="forgot-email">Account email</label>
        <input autoFocus id="forgot-email" type="email" autoComplete="email" required placeholder="name@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
        <button className="nemesis-auth-submit" disabled={busy} type="submit">{busy ? "Sending…" : "Send reset link"}</button>
      </form>
      {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
