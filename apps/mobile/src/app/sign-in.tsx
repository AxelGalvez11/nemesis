import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmailAuthSheet } from "@/components/EmailAuthSheet";
import { CloseIcon } from "@/components/icons";
import { AppleMark, GoogleMark } from "@/components/SocialMarks";
import { useAuth } from "@/auth/AuthProvider";
import type { SocialProvider } from "@/lib/oauth-deeplink";
import { nextTypewriterState, TYPEWRITER_START, type TypewriterState } from "@/lib/typewriter";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The sign-in screen (owner 2026-07-24, working from reference screens they
// sent): a black page, one big line typing itself out behind a block cursor, and
// the three ways in stacked on a card at the bottom.
//
// Apple and Google go through the web bounce page rather than a native sign-in
// sheet — see lib/oauth-deeplink.ts for the route and, more importantly, for why:
// the native modules for both are NATIVE, and adding one changes the Expo
// runtime fingerprint, which orphans every over-the-air update. Email and
// password moved into a sheet behind the third button, carrying its 18+
// attestation and legal links with it (EmailAuthSheet).
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

export default function SignIn() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { providerError, clearProviderError, signInWithProvider } = useAuth();

  const [typed, setTyped] = useState<TypewriterState>(TYPEWRITER_START);
  const [emailOpen, setEmailOpen] = useState(false);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ONE interval, cleared on unmount, and stopped while the email sheet covers
  // the screen. A timer running behind a modal is battery spent redrawing a
  // headline nobody can see.
  useEffect(() => {
    if (emailOpen) return;
    const id = setInterval(() => {
      setTyped((prev) => nextTypewriterState(prev, LINE_LENGTHS, HOLD_TICKS));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [emailOpen]);

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

  const line = HEADLINES[typed.line] ?? "";

  async function start(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    const { error: failure } = await signInWithProvider(provider);
    if (failure) {
      setError(failure);
      setPending(null);
      return;
    }
    // `pending` stays set on purpose: the browser is opening over us and the
    // session arrives later through the deep link. Clearing it here would leave
    // the button looking untouched while the phone is mid-hand-off. It resets
    // when a failure comes back, or with the screen when sign-in succeeds.
  }

  return (
    <View style={styles.screen} testID="signin-screen">
      {/* Close, top right. Sign-in is reachable from inside the app — a guest
          tapping something that needs an account — so there has to be a way out
          that isn't signing in. */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.close, { top: insets.top + space(2) }]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close"
        testID="signin-close"
      >
        <CloseIcon size={18} color="#ffffff" />
      </Pressable>

      <View style={styles.headlineWrap}>
        {/* The cursor is a View, not a text character: a block glyph varies by
            font and would sit at a different height from the letters beside it.
            accessibilityLabel carries the WHOLE line so a screen reader is never
            handed a half-typed word. */}
        <Text style={styles.headline} accessibilityLabel={line} testID="signin-headline">
          {line.slice(0, typed.chars)}
        </Text>
        <View style={styles.cursor} />
      </View>

      <View style={[styles.card, { paddingBottom: insets.bottom + space(3) }]}>
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
          onPress={() => setEmailOpen(true)}
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
      </View>

      <EmailAuthSheet visible={emailOpen} onClose={() => setEmailOpen(false)} />
    </View>
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
    close: {
      position: "absolute",
      right: space(4),
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
      zIndex: 2,
    },

    // The headline sits on the vertical centre line, where the eye lands first
    // on a page with nothing else in the middle of it.
    headlineWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: space(5),
    },
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
    error: { ...type.small, color: "#ff6b6b", textAlign: "center", marginBottom: space(1) },

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
