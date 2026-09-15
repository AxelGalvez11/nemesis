import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchLibrary } from "@/api/cloudLibrary";
import { listCalendarEvents } from "@/api/cloudCalendar";
import { AppleMark, GoogleMark } from "@/components/SocialMarks";
import { NxIcon } from "@/components/nx/NxIcon";
import { AnimatedMark, DriftingGradient, OutlineButton, PrimaryButton } from "@/components/nx/onboarding/parts";
import { AGE_TOS_ACK } from "@/lib/legal";
import { readOnboarding } from "@/lib/onboarding";
import { decideOnboardingGate } from "@/lib/onboarding-gate";
import type { SocialProvider } from "@/lib/oauth-deeplink";
import { useNx } from "@/theme/nx";

// The Welcome screen of the 2026-09 iPhone canvas (gen.py 'Welcome.dc.html'): the cobalt gradient
// drifting behind the three-dot mark, "Nemesis" / "Your second brain", and a white sheet with the
// three ways in and the Terms line.
//
// Apple and Google use iOS's in-app authentication sheet. The provider's secure web content appears
// as a dismissible modal over Nemesis and closes itself on the callback; it never hands the student
// off to the standalone Safari app. Email and password open inline in the same sheet. Account
// creation carries the same 18+ attestation and legal links as the web app.
//
// After sign-in the student goes to first-run setup when the account has never been set up
// (lib/onboarding-gate.ts: this device's marker first, then whether the account already has
// notes or calendar events), otherwise straight into the app.

type EmailMode = "signin" | "signup";

export default function SignIn() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    session,
    providerError,
    clearProviderError,
    signInWithProvider,
    signInEmail,
    signUpEmail,
    continueAsGuest,
    isGuest,
  } = useAuth();

  // Development-only guest link: leave sign-in once guest mode has actually been set. Navigating in the
  // same tap loses the race with the state update and the shell sends the visitor straight back here.
  useEffect(() => {
    if (__DEV__ && isGuest && !session) router.replace("/");
  }, [isGuest, session]);

  const [emailExpanded, setEmailExpanded] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A failed hand-off arrives through the deep link, so it lands on the auth provider rather than in
  // this screen's own state, possibly after a cold start. Adopt it, then clear it, so it cannot
  // reappear on the next mount.
  useEffect(() => {
    if (!providerError) return;
    setError(providerError);
    setPending(null);
    clearProviderError();
  }, [providerError, clearProviderError]);

  // Leave exactly once, whichever path noticed the session first (the effect below, a direct
  // provider return, or the email form).
  const leaving = useRef(false);
  const leave = useCallback(async (uid: string | undefined) => {
    if (leaving.current) return;
    leaving.current = true;
    let target = "/";
    if (uid) {
      try {
        const stored = await readOnboarding(SecureStore);
        const decision = await decideOnboardingGate(stored, async () => {
          const [library, events] = await Promise.all([
            fetchLibrary(uid),
            listCalendarEvents(uid, { from: "2000-01-01", to: "2100-12-31" }),
          ]);
          return { hasLibrary: library.notes.length + library.folders.length > 0, hasEvents: events.length > 0 };
        });
        if (decision === "onboarding") target = "/onboarding";
      } catch {
        // The gate already treats a failed probe as "not new"; anything else lands in the app too.
      }
    }
    router.replace(target as never);
  }, []);

  // /sign-in is a root Stack route, not a child of the authenticated tabs guard, so a completed
  // provider exchange does not unmount this screen by itself. Route on the session as the source of
  // truth so direct returns, cold-start callbacks and a delayed auth event all leave the spinner.
  useEffect(() => {
    if (session) void leave(session.user?.id);
  }, [session, leave]);

  async function start(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    const { error: failure } = await signInWithProvider(provider);
    setPending(null);
    if (failure) setError(failure);
    // Success routes through the session effect above, which knows the account.
  }

  const isSignup = emailMode === "signup";
  const canSubmitEmail = !emailBusy && email.trim().length > 3 && password.length > 0 && (!isSignup || acked);

  async function submitEmail() {
    if (!canSubmitEmail) return;
    setEmailBusy(true);
    setError(null);
    setNotice(null);

    const run = isSignup ? signUpEmail : signInEmail;
    const result = await run(email.trim(), password);
    setEmailBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (isSignup) {
      setNotice("Account created. Check your email to confirm, then sign in.");
      setEmailMode("signin");
      setPassword("");
    }
    // A successful sign-in routes through the session effect.
  }

  function switchEmailMode() {
    setEmailMode((current) => (current === "signin" ? "signup" : "signin"));
    setError(null);
    setNotice(null);
  }

  function closeEmailForm() {
    setEmailExpanded(false);
    setPassword("");
    setError(null);
    setNotice(null);
    setEmailBusy(false);
  }

  const inputStyle = [styles.input, { backgroundColor: c.sunk, color: c.t1 }];
  const legal = (doc: "terms" | "privacy") => router.push(`/profile/legal?doc=${doc}` as never);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="signin-screen"
    >
      <StatusBar style="light" />
      <DriftingGradient width={width} height={height} />

      {/* No close button (owner 2026-07-29). The way out is the iOS edge-swipe, which works because this
          screen is pushed from the guest empty states onto a stack whose gestures are on by default. */}
      <View style={[styles.hero, emailExpanded && styles.heroWithForm]}>
        <AnimatedMark size={emailExpanded ? 44 : 64} color="#ffffff" />
        <Text style={styles.brand} testID="signin-headline">Nemesis</Text>
        {emailExpanded ? null : <Text style={styles.tagline}>Your second brain</Text>}
      </View>

      <View
        style={[
          styles.sheet,
          { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom - 4, 30) },
          emailExpanded && styles.sheetWithForm,
        ]}
      >
        {emailExpanded ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}
            testID="email-auth-inline"
          >
            <View style={styles.formHeader}>
              <Pressable
                onPress={closeEmailForm}
                hitSlop={6}
                style={styles.ib}
                accessibilityRole="button"
                accessibilityLabel="Back to sign-in options"
                testID="email-auth-back"
              >
                <NxIcon name="chev_l" size={22} color={c.t1} />
              </Pressable>
              <Text style={[styles.formTitle, { color: c.t1 }]}>{isSignup ? "Create account" : "Log in"}</Text>
              <View style={styles.ib} />
            </View>

            <TextInput
              testID="email"
              style={inputStyle}
              placeholder="Email"
              placeholderTextColor={c.t3}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              accessibilityLabel="Email"
            />
            <TextInput
              testID="password"
              style={inputStyle}
              placeholder={isSignup ? "Create a password" : "Password"}
              placeholderTextColor={c.t3}
              secureTextEntry
              autoComplete={isSignup ? "new-password" : "current-password"}
              returnKeyType="done"
              onSubmitEditing={() => void submitEmail()}
              value={password}
              onChangeText={setPassword}
              accessibilityLabel="Password"
            />

            {error ? (
              <Text style={[styles.message, { color: c.danger }]} testID="signin-error">{error}</Text>
            ) : notice ? (
              <Text style={[styles.message, { color: c.ok }]} testID="signin-notice">{notice}</Text>
            ) : null}

            {isSignup ? (
              <Pressable
                testID="age-ack"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acked }}
                style={styles.ackRow}
                onPress={() => setAcked((value) => !value)}
              >
                <View style={[styles.checkbox, { borderColor: acked ? c.inv : c.t3, backgroundColor: acked ? c.inv : "transparent" }]}>
                  {acked ? <NxIcon name="check" size={14} strokeWidth={2.4} color={c.onInv} /> : null}
                </View>
                <Text style={[styles.ackText, { color: c.t2 }]}>{AGE_TOS_ACK}</Text>
              </Pressable>
            ) : null}

            <PrimaryButton
              testID="signin-submit"
              label={isSignup ? "Create account" : "Sign in"}
              onPress={() => void submitEmail()}
              busy={emailBusy}
              disabled={!canSubmitEmail && !emailBusy}
            />

            <Pressable testID="switch-mode" onPress={switchEmailMode} style={styles.txt} accessibilityRole="button">
              <Text style={{ fontSize: 15, color: c.t2 }}>
                {isSignup ? "Already have an account? " : "New here? "}
                <Text style={{ color: c.t1, fontWeight: "500" }}>{isSignup ? "Sign in" : "Create account"}</Text>
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.actions}>
            {error ? <Text style={[styles.message, { color: c.danger }]} testID="signin-error">{error}</Text> : null}

            <OutlineButton
              testID="signin-apple"
              label="Continue with Apple"
              lead={<AppleMark size={18} color={c.t1} />}
              onPress={() => void start("apple")}
              busy={pending === "apple"}
              disabled={pending !== null}
            />
            <OutlineButton
              testID="signin-google"
              label="Continue with Google"
              lead={<GoogleMark size={18} />}
              onPress={() => void start("google")}
              busy={pending === "google"}
              disabled={pending !== null}
            />
            <OutlineButton
              testID="signin-email"
              label="Continue with email"
              lead={<NxIcon name="mail" size={20} color={c.t1} />}
              onPress={() => {
                setError(null);
                setEmailExpanded(true);
              }}
              disabled={pending !== null}
            />

            <Text style={[styles.terms, { color: c.t2 }]}>
              By continuing, you agree to the{" "}
              <Text testID="link-terms" style={styles.underline} onPress={() => legal("terms")} accessibilityRole="link">
                Terms
              </Text>{" "}
              and the{" "}
              <Text testID="link-privacy" style={styles.underline} onPress={() => legal("privacy")} accessibilityRole="link">
                Privacy Policy
              </Text>
              .
            </Text>

            {__DEV__ ? (
              // Development builds only: look at the app's layout without an account.
              <Pressable testID="signin-dev-guest" onPress={continueAsGuest} hitSlop={8} style={{ alignSelf: "center", paddingTop: 6 }}>
                <Text style={{ color: c.t3, fontSize: 13 }}>Continue without signing in</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#1d3fbf" },

  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  heroWithForm: { minHeight: 150, gap: 10 },
  brand: { color: "#ffffff", fontSize: 32, lineHeight: 38, fontWeight: "600", letterSpacing: -0.6, textAlign: "center" },
  tagline: { color: "rgba(255,255,255,0.92)", fontSize: 19, lineHeight: 26, textAlign: "center" },

  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 22 },
  sheetWithForm: { maxHeight: "75%" },
  actions: { paddingHorizontal: 20, gap: 8 },
  terms: { fontSize: 12, lineHeight: 17, textAlign: "center", paddingTop: 8, paddingHorizontal: 12 },
  underline: { textDecorationLine: "underline" },
  message: { fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 12 },

  form: { paddingHorizontal: 20, gap: 8 },
  formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -10, marginHorizontal: -16 },
  ib: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  formTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  input: { height: 50, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  ackRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  ackText: { flex: 1, fontSize: 13, lineHeight: 18 },
  txt: { height: 44, alignItems: "center", justifyContent: "center" },
});
