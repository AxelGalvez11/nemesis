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
import { identify, resetAnalyticsUser } from "@/lib/analytics";
import { registerForPush } from "@/lib/push";

interface AuthState {
  session: Session | null;
  loading: boolean;
  // Guest = a browse-only UI state (no session). Real anonymous reads need Supabase
  // anonymous sign-in enabled (a cloud auth change) + the anon role; deferred to 6b-2.
  // For 6b-1 the guest flag only drives UI affordances ("sign in to …").
  isGuest: boolean;
  continueAsGuest: () => void;
  signInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  // Reserved for a future sign-up screen (with email-confirmation handling). Not wired
  // into any screen in 6b-1, where we only drive sign-IN against seeded/known users.
  signUpEmail: (email: string, password: string) => Promise<{ error: string | null }>;
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
      .then(({ data }) => {
        setSession(data.session);
        // Associate analytics with the opaque user id (UUID). identify() ignores
        // anything email-shaped; no-op until a sink is wired.
        if (data.session) {
          identify(data.session.user.id);
          void registerForPush(); // returning user, session already on disk
        }
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next) {
        setIsGuest(false); // a real session supersedes guest mode
        // Only on an actual sign-in — not every TOKEN_REFRESHED. The returning-user
        // case is handled by getSession() above (buffered until the sink wires).
        if (event === "SIGNED_IN") {
          identify(next.user.id);
          void registerForPush(); // best-effort; never blocks sign-in (see push.ts)
        }
      } else {
        resetAnalyticsUser(); // sign-out → clear the analytics identity
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const continueAsGuest = useCallback(() => setIsGuest(true), []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
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
