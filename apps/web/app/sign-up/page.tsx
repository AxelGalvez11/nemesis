"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ErrorText } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { isPreviewMode } from "@/lib/env";

export default function SignUpPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim();
    const result = await signUp(cleanEmail, password);
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }
    setBusy(false);
    if (result.needsEmailConfirmation) {
      setSubmittedEmail(cleanEmail);
      return;
    }
    router.replace("/app");
  }

  if (submittedEmail) {
    return (
      <main className="centered">
        <section className="auth-card">
          <p className="eyebrow">PharmaOrb beta</p>
          <h1>Check your email</h1>
          <p className="muted">We sent a confirmation link to {submittedEmail}. Open it to finish creating your account.</p>
          <p className="muted">After confirming, sign in with the same email and password.</p>
          <Link className="source-link" href="/sign-in">Go to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="centered">
      <section className="auth-card">
        <p className="eyebrow">PharmaOrb beta</p>
        <h1>Create account</h1>
        <p className="muted">Educational information only. PharmaOrb does not diagnose, treat, prescribe, or replace a healthcare professional.</p>
        {isPreviewMode ? <p className="muted">Preview mode: no account will be created.</p> : null}
        <form onSubmit={onSubmit}>
          <input type="email" autoComplete="email" required={!isPreviewMode} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" autoComplete="new-password" required={!isPreviewMode} minLength={isPreviewMode ? undefined : 8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} type="submit">{busy ? "Creating…" : isPreviewMode ? "Enter preview app" : "Create account"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <p className="muted">Already have an account? <Link className="source-link" href="/sign-in">Sign in</Link></p>
      </section>
    </main>
  );
}
