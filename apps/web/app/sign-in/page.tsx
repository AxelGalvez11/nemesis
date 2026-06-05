"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ErrorText } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

export default function SignInPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next || "/app");
  }

  return (
    <main className="centered">
      <section className="auth-card">
        <p className="eyebrow">PharmaOrb beta</p>
        <h1>Sign in</h1>
        <p className="muted">Use your beta account to access cited Ask, search, and watchlists.</p>
        <form onSubmit={onSubmit}>
          <input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <p className="muted">No account yet? <Link className="source-link" href="/sign-up">Create one</Link></p>
      </section>
    </main>
  );
}
