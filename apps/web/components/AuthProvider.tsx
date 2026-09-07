"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, isPreviewMode, type OAuthProviderId } from "@/lib/env";
import { isAlreadyRegisteredSignUp } from "@/lib/auth-signup";
import { DEFAULT_LANDING_PATH, resolveAuthRedirectUrl } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";
import { phCapture, phIdentify, phReset } from "@/lib/posthog";

export interface SignUpResult {
  error: string | null;
  needsEmailConfirmation: boolean;
  /** The email already has an account; the caller should route to sign-in instead. */
  alreadyRegistered: boolean;
}

/** Consent captured at signup. Recorded in auth user_metadata so we know which Terms/Disclaimer
 *  version the user accepted; the account's server-side created_at is the authoritative time. */
export interface SignUpConsent {
  tosVersion: string;
  /** Where the confirmation link should land the learner. Defaults to the front door; the pricing
   *  funnel passes `/pricing?interval=…` so checkout resumes after they confirm their email. */
  next?: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<string | null>;
  signUp: (email: string, password: string, consent?: SignUpConsent, captchaToken?: string) => Promise<SignUpResult>;
  signInWithOAuth: (provider: OAuthProviderId, next?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** localStorage prefixes that hold per-account data. Swept on sign-out so a shared
 *  browser never hands one student's cached chats, calendar, or LLM device key to
 *  the next person who signs in. Migration flags are intentionally NOT swept —
 *  they record that the pre-cloud legacy blob was already claimed and deleted. */
const ACCOUNT_LOCAL_PREFIXES = [
  "nemesis.web.sessions.v1",
  "nemesis.web.calendar.v1",
  "nemesis_device_key_v1_",
];

function sweepAccountLocalData(): void {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && ACCOUNT_LOCAL_PREFIXES.some((p) => key.startsWith(p))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage unavailable (private mode/quota) — nothing cached there to sweep.
  }
}

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
    email: "preview@enternemesis.com",
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

    if (!hasSupabaseConfig) {
      setSession(null);
      setLoading(false);
      return;
    }

    let alive = true;
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session ?? null);
        if (data.session?.user) phIdentify(data.session.user.id, { email: data.session.user.email });
      })
      .catch(() => {
        if (alive) setSession(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next?.user) phIdentify(next.user.id, { email: next.user.email });
      else if (event === "SIGNED_OUT") {
        phReset();
        sweepAccountLocalData();
      }
      setLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /**
   * 🔴🔴 A DEAD SESSION USED TO LOOK LIKE A LIVE ONE, AND THAT IS THE WHOLE OF THE OWNER'S
   * 2026-09-06 REPORT *"i currently cannot sign into nemesis webapp"*. Measured on production
   * before this existed: one tab asked Postgres for `recording_jobs` every 21 seconds for more
   * than five hours and was refused every single time ("permission denied for table
   * recording_jobs", 28-29 per 10 minutes, 16:30 to 21:57), and then `learning_canvases` and
   * `folders` were refused too.
   *
   * "permission denied for table" is not an expiry message. It is what PostgREST answers when a
   * request carried no usable user token at all and fell back to the `anon` role, which holds no
   * grant on those tables. So the refresh token was gone — revoked (the auth log records
   * `token_revoked` twice that evening) or handed to the native app by /auth/desktop, which drops
   * the browser's copy on purpose.
   *
   * supabase-js keeps the last session object in memory when a refresh fails, and emits no
   * SIGNED_OUT for it. `session` therefore stayed non-null, every auth gate passed, the workspace
   * rendered, and every request inside it was refused. Signing in again does not visibly fix that,
   * because the stale tab is what the person is looking at — which is why four Google sign-ins in
   * twenty seconds all succeeded at Supabase and none of them appeared to help.
   *
   * So: once the access token is past its expiry, ask for the session again. If it cannot be
   * renewed, drop it here. Every gate already knows what to do with a null session — send the
   * learner to /sign-in — and none of them could act while this lied to them.
   */
  useEffect(() => {
    if (isPreviewMode || !hasSupabaseConfig || !session) return;
    let alive = true;

    async function check() {
      // A little slack, so a token merely seconds from expiry is left to the
      // library's own scheduled refresh rather than raced with it.
      const expiresAt = (session?.expires_at ?? 0) * 1000;
      if (!expiresAt || expiresAt > Date.now() + 30_000) return;
      let renewed: Session | null = null;
      try {
        const { data, error } = await supabase.auth.getSession();
        renewed = error ? null : (data.session ?? null);
      } catch {
        renewed = null;
      }
      if (!alive) return;
      if (renewed && (renewed.expires_at ?? 0) * 1000 > Date.now()) return;
      // 🔴 CLEARED HERE RATHER THAN THROUGH `signOut()`. In supabase-js v2 even
      // `signOut({ scope: "local" })` POSTs /logout — pointless against a token the
      // server has already rejected, and if that call fails the dead session stays in
      // storage for the next page load to pick up again. Same reason /auth/desktop
      // clears these keys by hand.
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("sb-") && key.endsWith("-auth-token")) window.localStorage.removeItem(key);
        }
      } catch {
        // Storage unavailable; dropping the in-memory session below is still the fix.
      }
      setSession(null);
    }

    // On a timer AND when the tab comes back, because the common shape of this is a
    // workspace left open overnight: nothing runs while it is hidden, and the moment
    // it is looked at again it must not pretend to be signed in.
    const timer = window.setInterval(() => void check(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session]);

  const signIn = useCallback(async (email: string, password: string, captchaToken?: string) => {
    if (isPreviewMode) {
      setSession(previewSession);
      return null;
    }
    if (!hasSupabaseConfig) return "Identity service configuration is unavailable.";
    // captchaToken is forwarded only when present; Supabase ignores it until CAPTCHA enforcement is
    // enabled in the dashboard, so this is inert until activated.
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, consent?: SignUpConsent, captchaToken?: string) => {
    if (isPreviewMode) {
      setSession(previewSession);
      return { error: null, needsEmailConfirmation: false, alreadyRegistered: false };
    }
    if (!hasSupabaseConfig) return { error: "Identity service configuration is unavailable.", needsEmailConfirmation: false, alreadyRegistered: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // 🔴 THE FIFTH LANDING PATH, AND IT WAS URL-ENCODED — `%2Fsessions`, which a search for
        // "/sessions" cannot see. This is where someone lands when they click the link in their
        // confirmation email: their genuine first screen. Built from the constant so it cannot drift
        // away from the other four again.
        // 🔴 AND IT NOW CARRIES `next`. It was pinned to the front door, so a learner who chose a
        // plan, signed up, and confirmed their email landed on /learn with checkout forgotten.
        emailRedirectTo: resolveAuthRedirectUrl(
          `/auth/callback?next=${encodeURIComponent(consent?.next ?? DEFAULT_LANDING_PATH)}`,
        ),
        // Forwarded only when present; Supabase ignores it until CAPTCHA enforcement is enabled.
        ...(captchaToken ? { captchaToken } : {}),
        // Record the accepted Terms/Disclaimer version on the user (the signup consent gate). The
        // account's created_at is the authoritative acceptance time; we add a client stamp for context.
        ...(consent
          ? { data: { tos_version: consent.tosVersion, tos_accepted_at: new Date().toISOString() } }
          : {}),
      },
    });
    if (isAlreadyRegisteredSignUp(data?.user ?? null, error?.message ?? null)) {
      phCapture("signup_existing_email", { method: "email" });
      return { error: null, needsEmailConfirmation: false, alreadyRegistered: true };
    }
    if (error) return { error: error.message, needsEmailConfirmation: false, alreadyRegistered: false };
    phCapture("signup", { method: "email", needs_confirmation: !data.session });
    if (data.session) setSession(data.session);
    return { error: null, needsEmailConfirmation: !data.session, alreadyRegistered: false };
  }, []);

  // 🔴 THE FOURTH AUTH LANDING PATH, AND THE EASIEST TO MISS. Signing in with Google lands a
  // learner wherever this default says — it does not go through /sign-in's own redirect, so fixing
  // that one and not this one would have left OAuth users on the retired chat surface while
  // password users reached the front door. Same constant, one answer.
  const signInWithOAuth = useCallback(async (provider: OAuthProviderId, next = DEFAULT_LANDING_PATH) => {
    if (isPreviewMode) {
      setSession(previewSession);
      return null;
    }
    if (!hasSupabaseConfig) return "Identity service configuration is unavailable.";
    phCapture("oauth_start", { provider });
    // The browser leaves for the provider's consent page; the session lands back on /auth/callback.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: resolveAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
    });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    if (isPreviewMode) {
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, loading, signIn, signUp, signInWithOAuth, signOut }),
    [session, loading, signIn, signUp, signInWithOAuth, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
