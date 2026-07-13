"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import { captchaEnabled, isPreviewMode } from "@/lib/env";

export default function SignInPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  // Bumped on any auth failure to remount the Turnstile widget (its tokens are single-use).
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    setDeleted(new URLSearchParams(window.location.search).get("deleted") === "1");
  }, []);

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
      router.replace(sanitizeNextPath(rawNext));
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
      eyebrow="Nemesis // identity gate"
      title="Re-enter the perimeter."
      description="Authenticate to restore your contained workspace. Its memory persists; final authority remains yours."
      footer={<p>No instance yet? <Link className="nemesis-auth-link" href="/sign-up">Deploy Nemesis.</Link></p>}
    >
        {deleted ? <p className="nemesis-auth-success">Your account and its server-side records were deleted.</p> : null}
        {isPreviewMode ? <p className="nemesis-auth-notice">Local preview mode: no account credentials are required.</p> : null}
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
          <button className="nemesis-auth-submit" disabled={busy || (captchaEnabled && !isPreviewMode && !captchaToken)} type="submit">{busy ? "Authenticating…" : isPreviewMode ? "Enter preview" : "Enter Nemesis"}</button>
        </form>
        {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
