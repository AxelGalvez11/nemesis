import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppleMark, GoogleMark } from "@/components/SocialMarks";
import { useAuth } from "@/auth/AuthProvider";
import { AGE_TOS_ACK } from "@/lib/legal";
import type { SocialProvider } from "@/lib/oauth-deeplink";
import { nextTypewriterState, TYPEWRITER_START, type TypewriterState } from "@/lib/typewriter";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The sign-in screen (owner 2026-07-24, working from reference screens they
// sent): a black page, one big line typing itself out behind a block cursor, and
// the three ways in stacked on a card at the bottom.
//
// Apple and Google use iOS's in-app authentication sheet. The provider's secure
// web content appears as a dismissible modal over Nemesis and closes itself on
// the callback; it never hands the student off to the standalone Safari app.
// Email and password stay in the same bottom card rather than opening a modal.
// Account creation carries the same 18+ attestation and legal links as the web
// app, but keeps the black-and-white visual language of this page.
//
// TRUE BLACK AND FIXED WHITE, deliberately outside the palette. This screen is
// seen before anyone has chosen a theme, and it is the app introducing itself;
// everything past sign-in follows the palette as usual.

/** The rotating headline. Copy lives here, beside the screen that shows it; the
 *  animation that drives it lives in lib/typewriter.ts. */
const HEADLINES = ["Let's study", "Let's remember", "Let's get ahead"];

/** One tick per character. At 55ms it reads as brisk typing — much faster stops
 *  looking typed at all, much slower feels like the app is struggling. */
const TICK_MS = 55;

/** Ticks a finished line rests before erasing: about 1.8s, long enough to read. */
const HOLD_TICKS = 32;

const LINE_LENGTHS = HEADLINES.map((line) => line.length);

type EmailMode = "signin" | "signup";

export default function SignIn() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const {
    session,
    providerError,
    clearProviderError,
    signInWithProvider,
    signInEmail,
    signUpEmail,
  } = useAuth();

  const [typed, setTyped] = useState<TypewriterState>(TYPEWRITER_START);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ONE interval, cleared on unmount. Pause once the form is expanded so the
  // headline is calm while somebody is entering credentials.
  useEffect(() => {
    if (emailExpanded) return;
    const id = setInterval(() => {
      setTyped((prev) => nextTypewriterState(prev, LINE_LENGTHS, HOLD_TICKS));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [emailExpanded]);

  // A failed hand-off arrives through the deep link, so it lands on the auth
  // provider rather than in this screen's own state — possibly after a cold
  // start, when the screen that began the attempt no longer existed. Adopt it,
  // then clear it, so it cannot reappear on the next mount.
  useEffect(() => {
    if (!providerError) return;
    setError(providerError);
    setPending(null);
    clearProviderError();
  }, [providerError, clearProviderError]);

  // /sign-in is a root Stack route, not a child of the authenticated tabs
  // guard. A completed provider exchange therefore does not unmount this screen
  // by itself. Route on the session as the source of truth so direct returns,
  // cold-start callbacks, and a slightly delayed auth event all leave the
  // spinner instead of stranding the student here.
  useEffect(() => {
    if (session) router.replace("/");
  }, [session]);

  const line = HEADLINES[typed.line] ?? "";

  async function start(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    const { error: failure } = await signInWithProvider(provider);
    setPending(null);
    if (failure) {
      setError(failure);
      return;
    }
    // Do not depend solely on the session effect: navigating here makes the
    // successful direct-return path immediate, while the effect remains the
    // fallback for cold-start and delayed auth events.
    router.replace("/");
  }

  const isSignup = emailMode === "signup";
  const canSubmitEmail =
    !emailBusy &&
    email.trim().length > 3 &&
    password.length > 0 &&
    (!isSignup || acked);

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
      return;
    }
    router.replace("/");
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="signin-screen"
    >
      {/* No close button (owner 2026-07-29: "remove the x in the sign in").
          The way out is the iOS edge-swipe, which works because this screen is
          PUSHED from the six guest empty states (Study, Library, Chat, Calendar,
          Graph, Notebooks) onto a stack whose gestures are on by default.
          The button it replaced was already dead on the other two routes in:
          (tabs)/_layout.tsx redirects here and settings.tsx replaces, and after
          either of those router.back() has nothing to go back to. */}
      <View style={[styles.headlineWrap, emailExpanded && styles.headlineWrapWithForm]}>
        {/* The cursor is a View, not a text character: a block glyph varies by
            font and would sit at a different height from the letters beside it.
            accessibilityLabel carries the WHOLE line so a screen reader is never
            handed a half-typed word. */}
        <Text style={styles.headline} accessibilityLabel={line} testID="signin-headline">
          {line.slice(0, typed.chars)}
        </Text>
        <View style={styles.cursor} />
      </View>

      <View
        style={[
          styles.card,
          emailExpanded && styles.cardWithForm,
          { paddingBottom: insets.bottom + space(3) },
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
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Back to sign-in options"
                testID="email-auth-back"
              >
                <Text style={styles.backLabel}>‹ Back</Text>
              </Pressable>
              <Text style={styles.formTitle}>{isSignup ? "Create account" : "Log in"}</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                testID="email"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#8e8e93"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                testID="password"
                style={styles.input}
                placeholder={isSignup ? "Create a password" : "Enter your password"}
                placeholderTextColor="#8e8e93"
                secureTextEntry
                autoComplete={isSignup ? "new-password" : "current-password"}
                returnKeyType="done"
                onSubmitEditing={() => void submitEmail()}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {error ? (
              <Text style={styles.error} testID="signin-error">{error}</Text>
            ) : notice ? (
              <Text style={styles.notice} testID="signin-notice">{notice}</Text>
            ) : null}

            {isSignup ? (
              <>
                <Pressable
                  testID="age-ack"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acked }}
                  style={styles.ackRow}
                  onPress={() => setAcked((value) => !value)}
                >
                  <View style={[styles.checkbox, acked && styles.checkboxChecked]}>
                    {acked ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={styles.ackText}>{AGE_TOS_ACK}</Text>
                </Pressable>
                <View style={styles.legalLinks}>
                  <Link testID="link-terms" href="/profile/legal?doc=terms" style={styles.legalLink}>
                    Terms
                  </Link>
                  <Text style={styles.legalDot}>·</Text>
                  <Link testID="link-privacy" href="/profile/legal?doc=privacy" style={styles.legalLink}>
                    Privacy Policy
                  </Link>
                </View>
              </>
            ) : null}

            <Pressable
              testID="signin-submit"
              onPress={() => void submitEmail()}
              disabled={!canSubmitEmail}
              style={({ pressed }) => [
                styles.btn,
                styles.btnLight,
                pressed && canSubmitEmail && styles.pressedLight,
                !canSubmitEmail && styles.dim,
              ]}
              accessibilityRole="button"
              accessibilityState={{ busy: emailBusy, disabled: !canSubmitEmail }}
            >
              {emailBusy ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.btnLightLabel}>{isSignup ? "Create account" : "Sign in"}</Text>
              )}
            </Pressable>

            <Pressable testID="switch-mode" onPress={switchEmailMode} hitSlop={8}>
              <Text style={styles.switchText}>
                {isSignup ? "Already have an account? " : "New here? "}
                <Text style={styles.switchLink}>{isSignup ? "Sign in" : "Create account"}</Text>
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <>
            {error ? <Text style={styles.error} testID="signin-error">{error}</Text> : null}

            <ProviderButton
              label="Continue with Apple"
              mark={<AppleMark size={17} color="#000000" />}
              onPress={() => void start("apple")}
              busy={pending === "apple"}
              disabled={pending !== null}
              primary
              styles={styles}
              testID="signin-apple"
            />
            <ProviderButton
              label="Continue with Google"
              mark={<GoogleMark size={17} />}
              onPress={() => void start("google")}
              busy={pending === "google"}
              disabled={pending !== null}
              styles={styles}
              testID="signin-google"
            />
            <Pressable
              onPress={() => {
                setError(null);
                setEmailExpanded(true);
              }}
              disabled={pending !== null}
              style={({ pressed }) => [
                styles.btn,
                styles.btnDark,
                pressed && styles.pressedDark,
                pending !== null && styles.dim,
              ]}
              accessibilityRole="button"
              testID="signin-email"
            >
              <Text style={styles.btnDarkLabel}>Log in or sign up</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function ProviderButton({
  label,
  mark,
  onPress,
  busy,
  disabled,
  primary,
  styles,
  testID,
}: {
  label: string;
  mark: ReactNode;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  primary?: boolean;
  styles: ReturnType<typeof createStyles>;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary ? styles.btnLight : styles.btnDark,
        pressed && (primary ? styles.pressedLight : styles.pressedDark),
        // The one being pressed shows a spinner; the OTHER one dims, so it reads
        // as "wait" rather than "broken".
        disabled && !busy && styles.dim,
      ]}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator color={primary ? "#000000" : "#ffffff"} />
      ) : (
        <>
          {mark}
          <Text style={primary ? styles.btnLightLabel : styles.btnDarkLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const createStyles = (_c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#000000" },

    // The headline sits on the vertical centre line, where the eye lands first
    // on a page with nothing else in the middle of it.
    headlineWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: space(5),
    },
    headlineWrapWithForm: { minHeight: 116 },
    headline: { color: "#ffffff", fontSize: 38, lineHeight: 46, fontWeight: "800", letterSpacing: -1 },
    cursor: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#ffffff", marginLeft: 2 },

    card: {
      backgroundColor: "#1c1c1e",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: space(4),
      paddingTop: space(4),
      gap: space(2),
    },
    cardWithForm: { maxHeight: "72%" },
    form: { gap: space(2), paddingBottom: space(1) },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: space(1),
    },
    backLabel: { color: "#ffffff", fontSize: type.small.fontSize, fontWeight: "600" },
    formTitle: { color: "#ffffff", fontSize: type.title.fontSize, fontWeight: "700" },
    headerSpacer: { width: 42 },
    field: { gap: space(1) },
    fieldLabel: { color: "#d1d1d6", fontSize: type.micro.fontSize, fontWeight: "600" },
    input: {
      height: 54,
      borderRadius: radius.md,
      backgroundColor: "#2c2c2e",
      color: "#ffffff",
      fontSize: type.body.fontSize,
      paddingHorizontal: space(3),
    },
    error: { ...type.small, color: "#ff6b6b", textAlign: "center", marginBottom: space(1) },
    notice: { ...type.small, color: "#7ee2a8", textAlign: "center", marginBottom: space(1) },
    ackRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: "#636366",
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: { backgroundColor: "#ffffff", borderColor: "#ffffff" },
    checkmark: { color: "#000000", fontSize: type.small.fontSize, fontWeight: "800", lineHeight: 16 },
    ackText: { flex: 1, color: "#aeaeb2", fontSize: type.micro.fontSize, lineHeight: 18 },
    legalLinks: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space(2) },
    legalLink: { color: "#ffffff", fontSize: type.micro.fontSize, textDecorationLine: "underline" },
    legalDot: { color: "#636366" },
    switchText: { color: "#aeaeb2", fontSize: type.micro.fontSize, textAlign: "center" },
    switchLink: { color: "#ffffff", fontWeight: "700" },

    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: space(2),
      height: 54,
      borderRadius: radius.md,
    },
    btnLight: { backgroundColor: "#ffffff" },
    btnLightLabel: { color: "#000000", fontSize: type.body.fontSize, fontWeight: "600" },
    btnDark: { backgroundColor: "#2c2c2e" },
    btnDarkLabel: { color: "#ffffff", fontSize: type.body.fontSize, fontWeight: "600" },
    pressedLight: { backgroundColor: "#e6e6e6" },
    pressedDark: { backgroundColor: "#3a3a3c" },
    dim: { opacity: 0.5 },
  });
