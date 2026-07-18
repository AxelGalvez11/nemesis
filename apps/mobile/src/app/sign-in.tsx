import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { AGE_TOS_ACK } from "@/lib/legal";
import { placeholderColor, useCommon } from "@/theme/common";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { LogoMark } from "@/components/TopBar";

type Mode = "signin" | "signup";

// Sign-in / create-account. Email + password, toggled by `mode`. Creating an
// account (owner call 2026-07-17: accounts can be made in the app now, not only
// on the web) requires the 18+ / Terms+Privacy attestation; Supabase may email a
// confirmation link, in which case we tell the student to confirm then sign in.
export default function SignIn() {
  const { signInEmail, signUpEmail } = useAuth();
  const { colors: c } = useTheme();
  const common = useCommon();
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(false);

  const isSignup = mode === "signup";
  // Sign-in doesn't force a fresh attestation (they agreed at signup); creating an
  // account does.
  const canSubmit = !busy && email.trim().length > 3 && password.length > 0 && (!isSignup || acked);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const run = isSignup ? signUpEmail : signInEmail;
    const result = await run(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (isSignup) {
      // If email confirmation is on, there's no session yet — guide them. If it's
      // off, onAuthStateChange has already signed them in and the guard will move
      // them along; the notice is harmless in that brief window.
      setNotice("Account created. Check your email to confirm, then sign in.");
      setMode("signin");
      setPassword("");
      return;
    }
    router.replace("/");
  };

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setNotice(null);
  };

  return (
    <View style={common.center} testID="signin-screen">
      <LogoMark size={52} />
      <Text style={common.h1}>Nemesis</Text>
      <Text style={common.sub}>
        {isSignup ? "Create your account to get started." : "Send Nemesis to work. Review it from anywhere."}
      </Text>

      <TextInput
        testID="email"
        style={common.input}
        placeholder="Email"
        placeholderTextColor={placeholderColor(c)}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password"
        style={common.input}
        placeholder={isSignup ? "Create a password" : "Password"}
        placeholderTextColor={placeholderColor(c)}
        secureTextEntry
        autoComplete={isSignup ? "new-password" : "current-password"}
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <Text testID="signin-error" style={common.err}>{error}</Text>
      ) : notice ? (
        <Text testID="signin-notice" style={styles.notice}>{notice}</Text>
      ) : null}

      {isSignup ? (
        <>
          <Pressable
            testID="age-ack"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acked }}
            style={styles.ackRow}
            onPress={() => setAcked((a) => !a)}
          >
            <View style={[styles.box, acked && styles.boxOn]}>
              {acked ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.ackText}>{AGE_TOS_ACK}</Text>
          </Pressable>
          <View style={styles.links}>
            <Link testID="link-terms" href="/profile/legal?doc=terms" style={common.link}>Terms</Link>
            <Text style={styles.dot}>·</Text>
            <Link testID="link-privacy" href="/profile/legal?doc=privacy" style={common.link}>Privacy Policy</Link>
          </View>
        </>
      ) : null}

      <Pressable
        testID="signin-submit"
        style={[common.btn, styles.wide, !canSubmit && styles.disabled]}
        disabled={!canSubmit}
        onPress={submit}
      >
        <Text style={common.btnText}>
          {busy ? (isSignup ? "Creating…" : "Signing in…") : isSignup ? "Create account" : "Sign in"}
        </Text>
      </Pressable>

      <Pressable testID="switch-mode" onPress={switchMode} style={styles.switchRow} hitSlop={8}>
        <Text style={styles.switchText}>
          {isSignup ? "Already have an account? " : "New here? "}
          <Text style={styles.switchLink}>{isSignup ? "Sign in" : "Create account"}</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    notice: { fontSize: 13, lineHeight: 18, color: c.good, textAlign: "center", maxWidth: 320 },
    ackRow: { flexDirection: "row", alignItems: "center", gap: space(2.5), marginTop: space(2), maxWidth: 320 },
    box: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: c.line2,
      alignItems: "center",
      justifyContent: "center",
    },
    boxOn: { backgroundColor: c.accent, borderColor: c.accent },
    tick: { color: c.onAccent, fontSize: 14, fontWeight: "700", lineHeight: 16 },
    ackText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.text2 },
    links: { flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(1.5) },
    dot: { color: c.text3 },
    wide: { alignSelf: "stretch", maxWidth: 360, alignItems: "center", marginTop: space(2) },
    disabled: { opacity: 0.45 },
    switchRow: { marginTop: space(3) },
    switchText: { fontSize: 13.5, color: c.text3, textAlign: "center" },
    switchLink: { color: c.accent, fontWeight: "600" },
  });
