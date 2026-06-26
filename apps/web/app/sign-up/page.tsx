"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useState } from "react";
import { ErrorText } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { isPreviewMode } from "@/lib/env";
import { TOS_VERSION } from "@/lib/legal";

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
const subStyle: CSSProperties = { margin: "0 auto 24px", maxWidth: 380 };
const formStyle: CSSProperties = { gap: 14, textAlign: "left" };
const submitStyle: CSSProperties = { width: "100%", marginTop: 2, minHeight: 44 };
const footStyle: CSSProperties = { marginTop: 20 };
const linkActionStyle: CSSProperties = { display: "inline-block", marginTop: 8 };
const consentStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--text-2)",
  margin: "2px 0 4px",
};
const checkboxStyle: CSSProperties = { marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: "pointer" };

export default function SignUpPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Consent gate: an account is created only after the user explicitly agrees this is educational
    // research, not medical advice. The accepted version is recorded on the user (AuthProvider).
    if (!agreed && !isPreviewMode) {
      setError("Please agree to the Terms and Disclaimer to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim();
    const result = await signUp(cleanEmail, password, { tosVersion: TOS_VERSION });
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
        <section className="auth-card" style={cardStyle}>
          <p className="eyebrow" style={eyebrowStyle}>PharmaOrb beta</p>
          <h1 style={titleStyle}>Check your email</h1>
          <p className="muted" style={{ ...subStyle, marginBottom: 8 }}>We sent a confirmation link to {submittedEmail}. Open it to finish creating your account.</p>
          <p className="muted" style={subStyle}>After confirming, sign in with the same email and password.</p>
          <Link className="source-link" href="/sign-in" style={linkActionStyle}>Go to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="centered">
      <section className="auth-card" style={cardStyle}>
        <p className="eyebrow" style={eyebrowStyle}>PharmaOrb beta</p>
        <h1 style={titleStyle}>Create account</h1>
        <p className="muted" style={subStyle}>Educational information only. PharmaOrb does not diagnose, treat, prescribe, or replace a healthcare professional.</p>
        {isPreviewMode ? <p className="muted" style={subStyle}>Preview mode: no account will be created.</p> : null}
        <form onSubmit={onSubmit} style={formStyle}>
          <input type="email" autoComplete="email" required={!isPreviewMode} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" autoComplete="new-password" required={!isPreviewMode} minLength={isPreviewMode ? undefined : 8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label style={consentStyle}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={checkboxStyle} aria-label="Agree to the Terms and Disclaimer" />
            <span>I understand PharmaOrb provides educational research information, not medical advice, and I agree to the <Link className="source-link" href="/legal/terms">Terms</Link> and <Link className="source-link" href="/legal/disclaimer">Disclaimer</Link>.</span>
          </label>
          <button disabled={busy || (!agreed && !isPreviewMode)} type="submit" style={submitStyle}>{busy ? "Creating…" : isPreviewMode ? "Enter preview app" : "Create account"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <p className="muted" style={footStyle}>Already have an account? <Link className="source-link" href="/sign-in">Sign in</Link></p>
      </section>
    </main>
  );
}
