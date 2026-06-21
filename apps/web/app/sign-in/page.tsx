"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { ErrorText } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { isPreviewMode } from "@/lib/env";

const cardStyle: CSSProperties = { padding: "36px 32px", textAlign: "center" };
const eyebrowStyle: CSSProperties = { marginBottom: 18 };
const titleStyle: CSSProperties = {
  fontSize: 27,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  margin: "0 0 8px",
  color: "var(--text)",
};
const subStyle: CSSProperties = { margin: "0 auto 24px", maxWidth: 360 };
const formStyle: CSSProperties = { gap: 14, textAlign: "left" };
const submitStyle: CSSProperties = { width: "100%", marginTop: 2, minHeight: 44 };
const footStyle: CSSProperties = { marginTop: 20 };

export default function SignInPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDeleted(new URLSearchParams(window.location.search).get("deleted") === "1");
  }, []);

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
      <section className="auth-card" style={cardStyle}>
        <p className="eyebrow" style={eyebrowStyle}>PharmaOrb beta</p>
        <h1 style={titleStyle}>Sign in</h1>
        <p className="muted" style={subStyle}>Use your beta account to access cited Ask, search, and monitoring.</p>
        {deleted ? <p className="success-text">Your account was deleted.</p> : null}
        {isPreviewMode ? <p className="muted" style={subStyle}>Preview mode: no account credentials required.</p> : null}
        <form onSubmit={onSubmit} style={formStyle}>
          <input type="email" autoComplete="email" required={!isPreviewMode} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" autoComplete="current-password" required={!isPreviewMode} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} type="submit" style={submitStyle}>{busy ? "Signing in…" : isPreviewMode ? "Enter preview app" : "Sign in"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <p className="muted" style={footStyle}>No account yet? <Link className="source-link" href="/sign-up">Create one</Link></p>
      </section>
    </main>
  );
}
