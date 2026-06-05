import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/api/supabase";
import { deriveSignUpResult, type SignUpOutcome } from "./signup";

interface AuthState {
  session: Session | null;
  loading: boolean;
  // Guest = a browse-only UI state (no session). Real anonymous reads need Supabase
  // anonymous sign-in enabled (a cloud auth change) + the anon role; deferred to 6b-2.
  // For 6b-1 the guest flag only drives UI affordances ("sign in to …").
  isGuest: boolean;
  continueAsGuest: () => void;
  signInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  // Email/password sign-up. Returns needsConfirmation when Supabase requires email
  // verification (no session minted) so the screen can show "check your email".
  signUpEmail: (email: string, password: string) => Promise<SignUpOutcome>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    // Always clear loading, even if getSession rejects (a SecureStore read failure or
    // a corrupted session) — otherwise the route guards would spin forever.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setIsGuest(false); // a real session supersedes guest mode
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const continueAsGuest = useCallback(() => setIsGuest(true), []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return deriveSignUpResult(data, error);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsGuest(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, loading, isGuest, continueAsGuest, signInEmail, signUpEmail, signOut }),
    [session, loading, isGuest, continueAsGuest, signInEmail, signUpEmail, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
