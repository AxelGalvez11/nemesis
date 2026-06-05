"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ErrorText } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

export default function SignUpPage() {
  const { signUp, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim();
    const err = await signUp(cleanEmail, password);
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    await signIn(cleanEmail, password);
    setBusy(false);
    router.replace("/app");
  }

  return (
    <main className="centered">
      <section className="auth-card">
        <p className="eyebrow">PharmaOrb beta</p>
        <h1>Create account</h1>
        <p className="muted">Educational information only. PharmaOrb does not diagnose, treat, prescribe, or replace a healthcare professional.</p>
        <form onSubmit={onSubmit}>
          <input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" autoComplete="new-password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} type="submit">{busy ? "Creating…" : "Create account"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <p className="muted">Already have an account? <Link className="source-link" href="/sign-in">Sign in</Link></p>
      </section>
    </main>
  );
}
