"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { appUrl, isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { phCapture, phIdentify, phReset } from "@/lib/posthog";

export interface SignUpResult {
  error: string | null;
  needsEmailConfirmation: boolean;
}

/** Consent captured at signup. Recorded in auth user_metadata so we know which Terms/Disclaimer
 *  version the user accepted; the account's server-side created_at is the authoritative time. */
export interface SignUpConsent {
  tosVersion: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, consent?: SignUpConsent) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const previewSession = {
  access_token: "preview-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "preview-refresh-token",
  user: {
    id: "00000000-0000-4000-8000-000000000000",
    aud: "authenticated",
    role: "authenticated",
    email: "preview@pharmaorb.app",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
} as Session;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPreviewMode) {
      setSession(previewSession);
      setLoading(false);
      return;
    }

    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      if (data.session?.user) phIdentify(data.session.user.id, { email: data.session.user.email });
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next?.user) phIdentify(next.user.id, { email: next.user.email });
      else if (event === "SIGNED_OUT") phReset();
      setLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isPreviewMode) {
      setSession(previewSession);
      return null;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, consent?: SignUpConsent) => {
    if (isPreviewMode) {
      setSession(previewSession);
      return { error: null, needsEmailConfirmation: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/app`,
        // Record the accepted Terms/Disclaimer version on the user (the signup consent gate). The
        // account's created_at is the authoritative acceptance time; we add a client stamp for context.
        ...(consent
          ? { data: { tos_version: consent.tosVersion, tos_accepted_at: new Date().toISOString() } }
          : {}),
      },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    phCapture("signup", { method: "email", needs_confirmation: !data.session });
    if (data.session) setSession(data.session);
    return { error: null, needsEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (isPreviewMode) {
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({ session, loading, signIn, signUp, signOut }), [session, loading, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
