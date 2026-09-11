"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { friendlySignInError } from "@/lib/auth-errors";
import { DEFAULT_LANDING_PATH } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";

/**
 * Forgot password, step two: the recovery link lands here with a short-lived session, and the
 * learner chooses a new password.
 *
 * Supabase puts the recovery tokens in the URL hash; the shared client has `detectSessionInUrl`
 * on, so by the time `loading` clears there is either a session (link worked) or none (link
 * expired, already used, or opened in a different browser). The failure state has to say what to
 * do, because it is the end of the road for someone who genuinely cannot get in.
 */
export default function ResetPasswordPage() {
  const { loading, session } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const described = hash.get("error_description") ?? query.get("error_description");
    if (described) setLinkError(described.replace(/\+/g, " "));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Pick a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two password fields don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(friendlySignInError(updateError.message));
        return;
      }
      setDone(true);
      window.setTimeout(() => router.replace(DEFAULT_LANDING_PATH), 900);
    } catch {
      setError("Nemesis could not save the new password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <AuthFrame minimal title="Opening your reset link…" description="This only takes a moment.">{null}</AuthFrame>;
  }

  if (!session || linkError) {
    return (
      <AuthFrame
        minimal
        title="That reset link didn't work."
        description={linkError ?? "It may have expired, or it was already used. Reset links work once and for one hour."}
        footer={<p><Link className="nemesis-auth-link" href="/auth/forgot">Request a new link</Link></p>}
      >
        {null}
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame minimal title="Password updated." description="Taking you into Nemesis…">
        {null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Choose a new password."
      description={<>For <strong>{session.user.email}</strong>. At least 8 characters.</>}
    >
      <form onSubmit={onSubmit} className="nemesis-auth-form">
        <label className="nemesis-auth-sr" htmlFor="reset-password">New password</label>
        <input autoFocus id="reset-password" type="password" autoComplete="new-password" required minLength={8} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="nemesis-auth-sr" htmlFor="reset-confirm">Confirm new password</label>
        <input id="reset-confirm" type="password" autoComplete="new-password" required minLength={8} placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="nemesis-auth-submit" disabled={busy} type="submit">{busy ? "Saving…" : "Save and sign in"}</button>
      </form>
      {error ? <p className="nemesis-auth-error" role="alert">{error}</p> : null}
    </AuthFrame>
  );
}
