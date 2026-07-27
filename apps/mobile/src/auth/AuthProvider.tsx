import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Linking } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/api/supabase";
import { identify, resetAnalyticsUser } from "@/lib/analytics";
import { generateUuidV4 } from "@/lib/chat-threads";
import { EMPTY_NOTE_NAV, noteNavHolder } from "@/lib/note-tabs";
import {
  buildProviderSignInUrl,
  AUTH_CALLBACK_URL,
  isValidAuthState,
  parseAuthCallback,
  type SocialProvider,
} from "@/lib/oauth-deeplink";
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
  /** Google / Apple. Opens an in-app ASWebAuthenticationSession sheet and
   *  resolves after its callback has been exchanged for a real session. */
  signInWithProvider: (provider: SocialProvider) => Promise<{ error: string | null }>;
  /** Set when a social sign-in came back and the hand-off failed. */
  providerError: string | null;
  clearProviderError: () => void;
  signOut: () => Promise<void>;
}

/** Where the web half of social sign-in lives. Same host the upgrade sheet
 *  already sends people to. */
const WEB_BASE_URL = "https://app.enternemesis.com";

/** How long a started sign-in stays valid. Long enough to read a consent screen
 *  and type a password; short enough that an abandoned attempt isn't sitting
 *  there hours later waiting to accept a callback. */
const SIGNIN_WINDOW_MS = 5 * 60 * 1000;

const PENDING_SIGNIN_KEY = "nemesis.pending-social-signin";

interface PendingSignIn {
  state: string;
  startedAt: number;
}

/** The in-flight sign-in, or null if there isn't one we can trust.
 *
 *  Validates the SHAPE of what comes back out, not just that something did:
 *  this is read on the path that decides whether to accept a session, and a
 *  keychain value left by an older build (or corrupted) must read as "no attempt
 *  in flight" rather than as a nonce that might accidentally compare equal. */
async function readPendingSignIn(): Promise<PendingSignIn | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_SIGNIN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { state, startedAt } = parsed as Record<string, unknown>;
    if (!isValidAuthState(state) || typeof startedAt !== "number" || !Number.isFinite(startedAt)) return null;
    return { startedAt, state: state as string };
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  // A social sign-in that came back and failed. Lives here rather than on the
  // sign-in screen because the failure arrives through a deep link, which the
  // screen never sees — and may arrive after a cold start, when the screen that
  // began the attempt no longer exists.
  const [providerError, setProviderError] = useState<string | null>(null);

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
        // Sign-out also clears the note screen's app-lifetime tab history —
        // module-scoped state would otherwise show the previous account's
        // ghost tabs to the next sign-in (review finding, 2026-07-21; content
        // itself is server-scoped per user, this is state hygiene).
        noteNavHolder.current = EMPTY_NOTE_NAV;
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

  // --- Google / Apple, via an in-app ASWebAuthenticationSession sheet.
  //
  // THE NONCE IS THE SECURITY BOUNDARY, and it is worth being explicit about
  // what it defends. Any app on this phone can open `nemesis://auth/callback?…`.
  // Without a check, one could hand us a refresh token belonging to an account
  // THEY control and quietly sign the student into it — after which everything
  // they then wrote would be sitting in someone else's library. So a callback is
  // only honoured when it echoes the exact nonce of a sign-in this app started,
  // and each nonce is consumed on first use.
  //
  // HONEST LIMIT: the nonce comes from generateUuidV4, which is Math.random —
  // Hermes has no crypto.randomUUID and a polyfill is a native module, which
  // would orphan every over-the-air update. So this is not a CSPRNG. Guessing
  // one still means hitting ~122 bits inside a five-minute window during which
  // the student happens to have a sign-in open, which is not a practical attack;
  // but it is not the guarantee a real random source would give, and the day
  // this app takes a native build anyway, expo-crypto should replace it.
  // The nonce lives in the KEYCHAIN, not just in memory. The auth sheet usually
  // returns directly to this promise, while the deep-link listener below remains
  // a cold-start/fallback path. Both consume the same single-use nonce.
  const finishProviderSignIn = useCallback(async (url: string): Promise<boolean> => {
    const callback = parseAuthCallback(url);
    if (!callback) return false;

    const pending = await readPendingSignIn();
    if (!pending || callback.state !== pending.state) return false;
    await SecureStore.deleteItemAsync(PENDING_SIGNIN_KEY).catch(() => {});
    if (Date.now() - pending.startedAt > SIGNIN_WINDOW_MS) {
      setProviderError("That sign-in expired. Please try again.");
      return true;
    }

    const { error } = await supabase.auth.refreshSession({ refresh_token: callback.refreshToken });
    if (error) setProviderError("That sign-in didn't finish. Please try again.");
    return true;
  }, []);

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    const state = generateUuidV4();
    try {
      const url = buildProviderSignInUrl(WEB_BASE_URL, provider, state);
      await SecureStore.setItemAsync(PENDING_SIGNIN_KEY, JSON.stringify({ startedAt: Date.now(), state }));
      const result = await WebBrowser.openAuthSessionAsync(url, AUTH_CALLBACK_URL);
      if (result.type === "success") {
        const handled = await finishProviderSignIn(result.url);
        if (!handled) {
          const current = await supabase.auth.getSession();
          if (!current.data.session) {
            await SecureStore.deleteItemAsync(PENDING_SIGNIN_KEY).catch(() => {});
            return { error: "That sign-in didn't finish. Please try again." };
          }
        }
        return { error: null };
      }
      await SecureStore.deleteItemAsync(PENDING_SIGNIN_KEY).catch(() => {});
      if (result.type === "cancel" || result.type === "dismiss") {
        return { error: "Sign-in was canceled." };
      }
      return { error: null };
    } catch (cause) {
      await SecureStore.deleteItemAsync(PENDING_SIGNIN_KEY).catch(() => {});
      return {
        error: cause instanceof Error ? cause.message : "Couldn't open the sign-in window.",
      };
    }
  }, [finishProviderSignIn]);

  useEffect(() => {
    // Cold-start/fallback delivery. The normal path is captured by
    // openAuthSessionAsync above and closes the in-app sheet automatically.
    void Linking.getInitialURL().then((url) => {
      if (url) void finishProviderSignIn(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      void finishProviderSignIn(url);
    });
    return () => sub.remove();
  }, [finishProviderSignIn]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsGuest(false);
  }, []);

  const clearProviderError = useCallback(() => setProviderError(null), []);

  const value = useMemo<AuthState>(
    () => ({
      clearProviderError,
      continueAsGuest,
      isGuest,
      loading,
      providerError,
      session,
      signInEmail,
      signInWithProvider,
      signOut,
      signUpEmail,
    }),
    [
      clearProviderError,
      continueAsGuest,
      isGuest,
      loading,
      providerError,
      session,
      signInEmail,
      signInWithProvider,
      signOut,
      signUpEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
